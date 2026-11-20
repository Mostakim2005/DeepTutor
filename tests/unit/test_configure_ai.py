"""Unit tests for upgraded scripts/configure_ai.py helpers (Bravo 1)."""

from __future__ import annotations

import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

_SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "configure_ai.py"
_SPEC = importlib.util.spec_from_file_location("configure_ai", _SCRIPT_PATH)
assert _SPEC is not None and _SPEC.loader is not None
configure_ai = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(configure_ai)


class _FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False


class TestConfigureAiHelpers(unittest.TestCase):
    def test_parse_model_list_deduplicates_and_uses_fallback(self) -> None:
        self.assertEqual(
            configure_ai.parse_model_list("gemini-3.8-flash, gemini-4-argon, gemini-3.8-flash"),
            ["gemini-3.8-flash", "gemini-4-argon"],
        )
        self.assertEqual(
            configure_ai.parse_model_list("   ", fallback="deepseek-v4.1-flash"),
            ["deepseek-v4.1-flash"],
        )

    def test_build_profile_id(self) -> None:
        self.assertEqual(configure_ai.build_profile_id("openrouter", dedicated=False), "llm-profile-agent-setup")
        self.assertEqual(configure_ai.build_profile_id("My Custom API!", dedicated=True), "llm-profile-my-custom-api")

    def test_discover_openai_compatible_models(self) -> None:
        payload = json.dumps(
            {
                "data": [
                    {"id": "qwen/qwen3.8-max"},
                    {"id": "deepseek/deepseek-v4.1-flash"},
                    {"id": "qwen/qwen3.8-max"},
                ]
            }
        ).encode("utf-8")

        with patch.object(
            configure_ai.urllib.request,
            "urlopen",
            return_value=_FakeResponse(payload),
        ):
            models = configure_ai.discover_openai_compatible_models(
                "https://api.example.com/v1",
                "sk-test",
            )
        self.assertEqual(models, ["deepseek/deepseek-v4.1-flash", "qwen/qwen3.8-max"])


if __name__ == "__main__":
    unittest.main()
