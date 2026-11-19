"""Model preferences service: human-editable display names, pinned and hidden lists.

The file is user-editable by design, so every read is defensive: a malformed
value must degrade to "no preferences" rather than silently changing semantics
(a string in ``pinned`` used to turn membership into substring matching).
Writes are serialised and atomic so two open tabs cannot lose each other's
changes.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
import tempfile
import threading
from typing import Any

logger = logging.getLogger(__name__)

# Derived from the package root, never from the process working directory: a
# launcher started elsewhere must not write preferences into an unrelated tree.
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_FALLBACK_SETTINGS_FILE = _PROJECT_ROOT / "data" / "user" / "settings" / "model_preferences.json"

# Serialises read-modify-write cycles across threads. The service stays
# synchronous; async callers should wrap mutations in ``asyncio.to_thread``.
_WRITE_LOCK = threading.RLock()

# Parsed-document cache keyed on the file's identity stamp, so predicate
# helpers do not re-parse JSON once per model in a list response.
_CACHE: dict[str, Any] = {"key": None, "data": None}

_EMPTY: dict[str, Any] = {"display_names": {}, "pinned": [], "hidden": []}


def _get_settings_path() -> Path:
    from deeptutor.services.config.runtime_settings import get_runtime_settings_service

    try:
        settings_dir = get_runtime_settings_service().settings_dir
        return settings_dir / "model_preferences.json"
    except Exception:
        return _FALLBACK_SETTINGS_FILE


def _coerce(raw: Any) -> dict[str, Any]:
    """Return a shape-safe preferences document from arbitrary JSON."""
    if not isinstance(raw, dict):
        logger.warning("Model preferences file is not an object; ignoring it")
        return {"display_names": {}, "pinned": [], "hidden": []}

    names = raw.get("display_names")
    display_names = (
        {str(k): str(v) for k, v in names.items() if isinstance(k, str) and isinstance(v, str)}
        if isinstance(names, dict)
        else {}
    )

    def _names(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        seen: list[str] = []
        for item in value:
            if isinstance(item, str) and item and item not in seen:
                seen.append(item)
        return seen

    return {
        "display_names": display_names,
        "pinned": _names(raw.get("pinned")),
        "hidden": _names(raw.get("hidden")),
    }


def _stamp(path: Path) -> tuple[str, int, int] | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    return (str(path), stat.st_mtime_ns, stat.st_size)


def load_model_preferences() -> dict[str, Any]:
    path = _get_settings_path()
    stamp = _stamp(path)
    if stamp is None:
        return {"display_names": {}, "pinned": [], "hidden": []}
    if _CACHE["key"] == stamp:
        return _CACHE["data"]

    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = _coerce(json.load(handle))
    except Exception as exc:
        logger.warning("Could not read model preferences from %s: %s", path, exc)
        return {"display_names": {}, "pinned": [], "hidden": []}

    _CACHE["key"] = stamp
    _CACHE["data"] = data
    return data


def save_model_preferences(data: dict[str, Any]) -> None:
    """Atomically replace the preferences document."""
    path = _get_settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = _coerce(data)

    with _WRITE_LOCK:
        handle, tmp_name = tempfile.mkstemp(
            dir=str(path.parent), prefix=".model_preferences-", suffix=".tmp"
        )
        try:
            with os.fdopen(handle, "w", encoding="utf-8") as handle_obj:
                json.dump(payload, handle_obj, indent=2, ensure_ascii=False)
                handle_obj.write("\n")
            os.replace(tmp_name, path)
        except Exception:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise
        _CACHE["key"] = None
        _CACHE["data"] = None


def get_display_name(model_or_kb_name: str) -> str:
    prefs = load_model_preferences()
    return prefs["display_names"].get(model_or_kb_name, model_or_kb_name)


def is_pinned(model_or_kb_name: str) -> bool:
    return model_or_kb_name in load_model_preferences()["pinned"]


def is_hidden(model_or_kb_name: str) -> bool:
    return model_or_kb_name in load_model_preferences()["hidden"]


def _toggle(key: str, model_or_kb_name: str) -> bool:
    with _WRITE_LOCK:
        # Re-read inside the lock: another writer may have committed since the
        # caller last looked, and a stale copy would drop their change.
        prefs = load_model_preferences()
        values = list(prefs[key])
        if model_or_kb_name in values:
            values.remove(model_or_kb_name)
            active = False
        else:
            values.append(model_or_kb_name)
            active = True
        prefs[key] = values
        save_model_preferences(prefs)
    return active


def toggle_pin(model_or_kb_name: str) -> bool:
    return _toggle("pinned", model_or_kb_name)


def toggle_hide(model_or_kb_name: str) -> bool:
    return _toggle("hidden", model_or_kb_name)


def prune_unknown(known_names: set[str]) -> dict[str, int]:
    """Drop pins/hides/display names that no longer exist in the catalog."""
    with _WRITE_LOCK:
        prefs = load_model_preferences()
        removed = {
            "pinned": [n for n in prefs["pinned"] if n not in known_names],
            "hidden": [n for n in prefs["hidden"] if n not in known_names],
            "display_names": [n for n in prefs["display_names"] if n not in known_names],
        }
        if not any(removed.values()):
            return {"pinned": 0, "hidden": 0, "display_names": 0}
        prefs["pinned"] = [n for n in prefs["pinned"] if n in known_names]
        prefs["hidden"] = [n for n in prefs["hidden"] if n in known_names]
        prefs["display_names"] = {
            n: v for n, v in prefs["display_names"].items() if n in known_names
        }
        save_model_preferences(prefs)
    return {key: len(value) for key, value in removed.items()}


__all__ = [
    "get_display_name",
    "is_hidden",
    "is_pinned",
    "load_model_preferences",
    "prune_unknown",
    "save_model_preferences",
    "toggle_hide",
    "toggle_pin",
]
