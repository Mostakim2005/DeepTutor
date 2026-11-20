"""Unit tests for L-06 model preferences portability, stale pruning, and unavailable flags."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

try:
    from deeptutor.services.subagent import model_preferences as mp
except ModuleNotFoundError:
    _MOD_PATH = (
        Path(__file__).resolve().parents[2]
        / "deeptutor"
        / "services"
        / "subagent"
        / "model_preferences.py"
    )
    _SPEC = importlib.util.spec_from_file_location("model_preferences", _MOD_PATH)
    assert _SPEC is not None and _SPEC.loader is not None
    mp = importlib.util.module_from_spec(_SPEC)
    _SPEC.loader.exec_module(mp)


class TestModelPreferencesPortability(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._prefs_path = Path(self._tmpdir.name) / "model_preferences.json"
        self._patcher = patch.object(mp, "_get_settings_path", return_value=self._prefs_path)
        self._patcher.start()
        mp._CACHE["key"] = None
        mp._CACHE["data"] = None

    def tearDown(self) -> None:
        self._patcher.stop()
        mp._CACHE["key"] = None
        mp._CACHE["data"] = None
        self._tmpdir.cleanup()

    def test_backwards_compatible_load_adds_unavailable_map(self) -> None:
        self._prefs_path.write_text(
            json.dumps(
                {
                    "display_names": {"gemini-3.8-flash": "Gemini 3.8 Flash"},
                    "pinned": ["gemini-3.8-flash"],
                    "hidden": ["old-model"],
                }
            ),
            encoding="utf-8",
        )
        loaded = mp.load_model_preferences()
        self.assertEqual(loaded["display_names"], {"gemini-3.8-flash": "Gemini 3.8 Flash"})
        self.assertEqual(loaded["pinned"], ["gemini-3.8-flash"])
        self.assertEqual(loaded["hidden"], ["old-model"])
        self.assertEqual(loaded["unavailable"], {})

    def test_mark_and_clear_unavailable(self) -> None:
        mp.mark_unavailable("gpt-6-solasta", "Requires Pro plan")
        self.assertTrue(mp.is_unavailable("gpt-6-solasta"))
        self.assertEqual(mp.get_unavailable_reason("gpt-6-solasta"), "Requires Pro plan")

        cleared = mp.clear_unavailable("gpt-6-solasta")
        self.assertTrue(cleared)
        self.assertFalse(mp.is_unavailable("gpt-6-solasta"))
        self.assertFalse(mp.clear_unavailable("gpt-6-solasta"))

    def test_find_stale_and_prune_unknown(self) -> None:
        mp.save_model_preferences(
            {
                "display_names": {
                    "gemini-3.8-flash": "Gemini 3.8",
                    "retired-model": "Old Model",
                },
                "pinned": ["gemini-3.8-flash", "retired-pin"],
                "hidden": ["retired-hidden"],
                "unavailable": {
                    "gemini-3.8-flash": "Quota",
                    "retired-unavail": "Plan error",
                },
            }
        )
        known = {"gemini-3.8-flash"}

        stale = mp.find_stale_preferences(known)
        self.assertEqual(stale["pinned"], ["retired-pin"])
        self.assertEqual(stale["hidden"], ["retired-hidden"])
        self.assertEqual(stale["display_names"], ["retired-model"])
        self.assertEqual(stale["unavailable"], ["retired-unavail"])

        removed = mp.prune_unknown(known)
        self.assertEqual(
            removed,
            {"pinned": 1, "hidden": 1, "display_names": 1, "unavailable": 1},
        )
        after = mp.load_model_preferences()
        self.assertEqual(after["pinned"], ["gemini-3.8-flash"])
        self.assertEqual(after["hidden"], [])
        self.assertEqual(after["display_names"], {"gemini-3.8-flash": "Gemini 3.8"})
        self.assertEqual(after["unavailable"], {"gemini-3.8-flash": "Quota"})

    def test_export_and_import_merge_and_replace(self) -> None:
        mp.save_model_preferences(
            {
                "display_names": {"m1": "Model 1"},
                "pinned": ["m1"],
                "hidden": ["h1"],
                "unavailable": {"u1": "Not on plan"},
            }
        )
        bundle = mp.export_preferences_bundle()
        self.assertEqual(bundle["schema_version"], 1)
        self.assertIn("exported_at", bundle)
        self.assertEqual(bundle["preferences"]["pinned"], ["m1"])

        merged = mp.import_preferences_bundle(
            {
                "schema_version": 1,
                "preferences": {
                    "display_names": {"m2": "Model 2"},
                    "pinned": ["m2"],
                    "hidden": [],
                    "unavailable": {},
                },
            },
            merge=True,
        )
        self.assertEqual(merged["pinned"], ["m1", "m2"])
        self.assertEqual(merged["display_names"], {"m1": "Model 1", "m2": "Model 2"})

        replaced = mp.import_preferences_bundle(
            {
                "display_names": {"only": "Only Model"},
                "pinned": ["only"],
                "hidden": [],
                "unavailable": {},
            },
            merge=False,
        )
        self.assertEqual(replaced["pinned"], ["only"])
        self.assertEqual(replaced["display_names"], {"only": "Only Model"})
        self.assertEqual(replaced["hidden"], [])
        self.assertEqual(replaced["unavailable"], {})


if __name__ == "__main__":
    unittest.main()
