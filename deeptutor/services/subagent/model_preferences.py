"""Model preferences service: human-editable display names, pinned and hidden lists."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_SETTINGS_FILE = Path("data/user/settings/model_preferences.json")


def _get_settings_path() -> Path:
    from deeptutor.services.config.runtime_settings import get_runtime_settings_service

    try:
        settings_dir = get_runtime_settings_service().settings_dir
        return settings_dir / "model_preferences.json"
    except Exception:
        return _SETTINGS_FILE


def load_model_preferences() -> dict[str, Any]:
    path = _get_settings_path()
    if not path.exists():
        return {"display_names": {}, "pinned": [], "hidden": []}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        logger.warning("Could not read model preferences from %s: %s", path, exc)
        return {"display_names": {}, "pinned": [], "hidden": []}


def save_model_preferences(data: dict[str, Any]) -> None:
    path = _get_settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    tmp_path.replace(path)


def get_display_name(model_or_kb_name: str) -> str:
    prefs = load_model_preferences()
    return prefs.get("display_names", {}).get(model_or_kb_name, model_or_kb_name)


def is_pinned(model_or_kb_name: str) -> bool:
    prefs = load_model_preferences()
    return model_or_kb_name in prefs.get("pinned", [])


def is_hidden(model_or_kb_name: str) -> bool:
    prefs = load_model_preferences()
    return model_or_kb_name in prefs.get("hidden", [])


def toggle_pin(model_or_kb_name: str) -> bool:
    prefs = load_model_preferences()
    pinned = list(prefs.get("pinned", []))
    if model_or_kb_name in pinned:
        pinned.remove(model_or_kb_name)
        active = False
    else:
        pinned.append(model_or_kb_name)
        active = True
    prefs["pinned"] = pinned
    save_model_preferences(prefs)
    return active


def toggle_hide(model_or_kb_name: str) -> bool:
    prefs = load_model_preferences()
    hidden = list(prefs.get("hidden", []))
    if model_or_kb_name in hidden:
        hidden.remove(model_or_kb_name)
        active = False
    else:
        hidden.append(model_or_kb_name)
        active = True
    prefs["hidden"] = hidden
    save_model_preferences(prefs)
    return active
