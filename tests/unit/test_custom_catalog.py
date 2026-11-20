"""Unit tests for Bravo 4 user-owned per-harness model catalogs and effort fallback."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

try:
    from deeptutor.services.subagent import custom_catalog as cc
except ModuleNotFoundError:
    _MOD_PATH = (
        Path(__file__).resolve().parents[2]
        / "deeptutor"
        / "services"
        / "subagent"
        / "custom_catalog.py"
    )
    _SPEC = importlib.util.spec_from_file_location("custom_catalog", _MOD_PATH)
    assert _SPEC is not None and _SPEC.loader is not None
    cc = importlib.util.module_from_spec(_SPEC)
    _SPEC.loader.exec_module(cc)


class TestCustomCatalog(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._catalog_path = Path(self._tmpdir.name) / "custom_model_catalogs.json"
        self._patcher = patch.object(cc, "_get_catalog_path", return_value=self._catalog_path)
        self._patcher.start()
        cc._CACHE["key"] = None
        cc._CACHE["data"] = None

    def tearDown(self) -> None:
        self._patcher.stop()
        cc._CACHE["key"] = None
        cc._CACHE["data"] = None
        self._tmpdir.cleanup()

    def test_add_remove_restore_and_merge(self) -> None:
        base = [
            {"slug": "gemini-4-argon-high", "display_name": "Gemini 4 Argon (High)", "default_effort": "", "efforts": ["low", "medium", "high"]},
            {"slug": "old-retired-model", "display_name": "Old Model", "default_effort": "", "efforts": ["low", "medium", "high"]},
        ]
        cc.add_custom_model(
            "antigravity",
            "gpt-6-solasta",
            "GPT-6 Solasta",
            default_effort="ultra",
            efforts=["low", "medium", "high"],
        )
        cc.remove_custom_model("antigravity", "old-retired-model")

        merged = cc.merge_backend_model_options("antigravity", base, ["low", "medium", "high"])
        slugs = [m["slug"] for m in merged]
        self.assertEqual(slugs, ["gemini-4-argon-high", "gpt-6-solasta"])
        # Default effort "ultra" falls back safely to "high".
        self.assertEqual(merged[1]["default_effort"], "high")

        # Restoring brings the retired built-in model back.
        cc.restore_removed_model("antigravity", "old-retired-model")
        merged_after = cc.merge_backend_model_options("antigravity", base, ["low", "medium", "high"])
        self.assertIn("old-retired-model", [m["slug"] for m in merged_after])

    def test_effort_fallback_ladder(self) -> None:
        self.assertEqual(cc.resolve_effort_with_fallback("none", ("off", "low", "high")), "off")
        self.assertEqual(cc.resolve_effort_with_fallback("off", ("none", "low", "high")), "none")
        # Tie between low (rank 2) and high (rank 4) for medium (rank 3) -> safer lower tier ("low")
        self.assertEqual(cc.resolve_effort_with_fallback("medium", ("low", "high", "max")), "low")
        # Higher than supported -> clamps to highest supported
        self.assertEqual(cc.resolve_effort_with_fallback("max", ("low", "medium", "high")), "high")
        # Exact match preserved
        self.assertEqual(cc.resolve_effort_with_fallback("high", ("low", "medium", "high")), "high")
        # Unknown level falls back to default when valid
        self.assertEqual(
            cc.resolve_effort_with_fallback("turbo", ("low", "medium", "high"), default="medium"),
            "medium",
        )


if __name__ == "__main__":
    unittest.main()
