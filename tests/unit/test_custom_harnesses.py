"""Unit tests for Bravo 5 + Delta 1 plug-and-play custom harnesses and FreeBuffBackend."""

from __future__ import annotations

from dataclasses import dataclass
import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


def _load_custom_harnesses_module():
    try:
        from deeptutor.services.subagent import custom_harnesses as ch

        return ch
    except ModuleNotFoundError:
        # Allow running in minimal Python environments without optional runtime deps (e.g. httpx).
        root = Path(__file__).resolve().parents[2]
        subagent_dir = root / "deeptutor" / "services" / "subagent"

        def _load(mod_name: str, file_path: Path):
            spec = importlib.util.spec_from_file_location(mod_name, file_path)
            assert spec is not None and spec.loader is not None
            mod = importlib.util.module_from_spec(spec)
            sys.modules[mod_name] = mod
            spec.loader.exec_module(mod)
            return mod

        for pkg in ("deeptutor", "deeptutor.services", "deeptutor.services.subagent"):
            if pkg not in sys.modules:
                stub = types.ModuleType(pkg)
                stub.__path__ = [str(subagent_dir)]  # type: ignore[attr-defined]
                sys.modules[pkg] = stub

        _load("deeptutor.services.subagent.types", subagent_dir / "types.py")

        config_stub = types.ModuleType("deeptutor.services.subagent.config")

        @dataclass
        class BackendConfig:
            model: str = ""
            reasoning_effort: str = ""

        config_stub.BackendConfig = BackendConfig  # type: ignore[attr-defined]
        sys.modules["deeptutor.services.subagent.config"] = config_stub

        _load("deeptutor.services.subagent.base", subagent_dir / "base.py")
        _load("deeptutor.services.subagent.custom_catalog", subagent_dir / "custom_catalog.py")
        _load("deeptutor.services.subagent.process", subagent_dir / "process.py")
        return _load("deeptutor.services.subagent.custom_harnesses", subagent_dir / "custom_harnesses.py")


ch = _load_custom_harnesses_module()


@dataclass
class _DummyConfig:
    model: str = ""
    reasoning_effort: str = ""


class TestCustomHarnesses(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._harnesses_path = Path(self._tmpdir.name) / "custom_harnesses.json"
        self._patcher = patch.object(
            ch, "_get_harnesses_path", return_value=self._harnesses_path
        )
        self._patcher.start()
        ch._CACHE["key"] = None
        ch._CACHE["data"] = None

    def tearDown(self) -> None:
        self._patcher.stop()
        ch._CACHE["key"] = None
        ch._CACHE["data"] = None
        self._tmpdir.cleanup()

    def test_upsert_list_and_delete_custom_harness(self) -> None:
        doc = ch.upsert_custom_harness(
            "my_agent",
            {
                "display_name": "My Local Agent",
                "command": "my-agent-cli",
                "prompt_args": ["run", "--prompt", "{prompt}"],
                "efforts": ["low", "high"],
                "models": ["gemini-4-argon", "deepseek-v4.1-flash"],
            },
        )
        self.assertIn("my_agent", doc["harnesses"])
        spec = doc["harnesses"]["my_agent"]
        self.assertEqual(spec["display_name"], "My Local Agent")
        self.assertEqual(len(spec["models"]), 2)

        dynamic = ch.build_dynamic_custom_backends({"freebuff", "antigravity"})
        self.assertIn("my_agent", dynamic)
        cmd = dynamic["my_agent"].build_command(
            "Explain eigenvalues",
            config=_DummyConfig(model="gemini-4-argon", reasoning_effort="medium"),
        )
        # "medium" safely falls back to "low" because only ("low", "high") are supported.
        self.assertEqual(
            cmd,
            [
                "my-agent-cli",
                "run",
                "--prompt",
                "Explain eigenvalues",
                "--model",
                "gemini-4-argon",
                "--effort",
                "low",
            ],
        )

        self.assertTrue(ch.delete_custom_harness("my_agent"))
        self.assertFalse(ch.delete_custom_harness("my_agent"))

    def test_freebuff_defaults_and_user_override(self) -> None:
        fb = ch.FreeBuffBackend()
        self.assertEqual(fb.kind, "freebuff")
        self.assertEqual(fb.cli_command, "freebuff")
        default_cmd = fb.build_command("Hello", config=_DummyConfig(model="sonnet-5", reasoning_effort="max"))
        self.assertEqual(
            default_cmd,
            ["freebuff", "-p", "Hello", "--model", "sonnet-5", "--effort", "max"],
        )

        # User can override FreeBuff's command and flags in custom_harnesses.json without code edits.
        ch.upsert_custom_harness(
            "freebuff",
            {
                "display_name": "FreeBuff Custom",
                "command": "C:\\Tools\\freebuff.exe",
                "prompt_args": ["ask", "{prompt}"],
                "model_flag": "-m",
                "effort_flag": "-e",
                "efforts": ["low", "medium", "high"],
            },
        )
        overridden_cmd = fb.build_command(
            "Hello",
            config=_DummyConfig(model="deepseek-v4.1-flash", reasoning_effort="ultra"),
        )
        self.assertEqual(
            overridden_cmd,
            [
                "C:\\Tools\\freebuff.exe",
                "ask",
                "Hello",
                "-m",
                "deepseek-v4.1-flash",
                "-e",
                "high",
            ],
        )


if __name__ == "__main__":
    unittest.main()
