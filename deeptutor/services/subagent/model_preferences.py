"""Model preferences service: human-editable display names, pinned and hidden lists.

The file is user-editable by design, so every read is defensive: a malformed
value must degrade to "no preferences" rather than silently changing semantics
(a string in ``pinned`` used to turn membership into substring matching).
Writes are serialised and atomic so two open tabs cannot lose each other's
changes.
"""

from __future__ import annotations

import datetime
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

_BUNDLE_SCHEMA_VERSION = 1


def _empty_preferences() -> dict[str, Any]:
    return {
        "display_names": {},
        "pinned": [],
        "hidden": [],
        "unavailable": {},
    }


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
        return _empty_preferences()

    def _str_map(value: Any) -> dict[str, str]:
        if not isinstance(value, dict):
            return {}
        out: dict[str, str] = {}
        for k, v in value.items():
            if isinstance(k, str) and k.strip() and isinstance(v, str):
                out[k.strip()] = v.strip()
        return out

    def _names(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        seen: list[str] = []
        for item in value:
            if isinstance(item, str):
                cleaned = item.strip()
                if cleaned and cleaned not in seen:
                    seen.append(cleaned)
        return seen

    return {
        "display_names": _str_map(raw.get("display_names")),
        "pinned": _names(raw.get("pinned")),
        "hidden": _names(raw.get("hidden")),
        "unavailable": _str_map(raw.get("unavailable")),
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
        return _empty_preferences()
    if _CACHE["key"] == stamp:
        return _CACHE["data"]

    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = _coerce(json.load(handle))
    except Exception as exc:
        logger.warning("Could not read model preferences from %s: %s", path, exc)
        return _empty_preferences()

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


def is_unavailable(model_or_kb_name: str) -> bool:
    return model_or_kb_name in load_model_preferences()["unavailable"]


def get_unavailable_reason(model_or_kb_name: str) -> str:
    return load_model_preferences()["unavailable"].get(model_or_kb_name, "")


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


def mark_unavailable(model_or_kb_name: str, reason: str = "Unavailable on current plan") -> dict[str, Any]:
    """Flag a model as unavailable (e.g., plan/permission rejection)."""
    cleaned_name = str(model_or_kb_name or "").strip()
    cleaned_reason = str(reason or "").strip() or "Unavailable on current plan"
    if not cleaned_name:
        return load_model_preferences()
    with _WRITE_LOCK:
        prefs = load_model_preferences()
        unavailable = dict(prefs["unavailable"])
        unavailable[cleaned_name] = cleaned_reason
        prefs["unavailable"] = unavailable
        save_model_preferences(prefs)
        return load_model_preferences()


def clear_unavailable(model_or_kb_name: str) -> bool:
    """Clear an unavailable flag from a model. Returns True if a flag existed."""
    cleaned_name = str(model_or_kb_name or "").strip()
    if not cleaned_name:
        return False
    with _WRITE_LOCK:
        prefs = load_model_preferences()
        unavailable = dict(prefs["unavailable"])
        if cleaned_name not in unavailable:
            return False
        unavailable.pop(cleaned_name, None)
        prefs["unavailable"] = unavailable
        save_model_preferences(prefs)
        return True


def find_stale_preferences(known_names: set[str]) -> dict[str, list[str]]:
    """Return preference entries that no longer match any known model or subagent."""
    prefs = load_model_preferences()
    return {
        "pinned": [n for n in prefs["pinned"] if n not in known_names],
        "hidden": [n for n in prefs["hidden"] if n not in known_names],
        "display_names": [n for n in prefs["display_names"] if n not in known_names],
        "unavailable": [n for n in prefs["unavailable"] if n not in known_names],
    }


def prune_unknown(known_names: set[str]) -> dict[str, int]:
    """Drop pins/hides/display names/unavailable flags that no longer exist in the catalog."""
    with _WRITE_LOCK:
        prefs = load_model_preferences()
        removed = find_stale_preferences(known_names)
        if not any(removed.values()):
            return {"pinned": 0, "hidden": 0, "display_names": 0, "unavailable": 0}
        prefs["pinned"] = [n for n in prefs["pinned"] if n in known_names]
        prefs["hidden"] = [n for n in prefs["hidden"] if n in known_names]
        prefs["display_names"] = {
            n: v for n, v in prefs["display_names"].items() if n in known_names
        }
        prefs["unavailable"] = {
            n: v for n, v in prefs["unavailable"].items() if n in known_names
        }
        save_model_preferences(prefs)
    return {key: len(value) for key, value in removed.items()}


def collect_known_model_names() -> set[str]:
    """Gather all currently known LLM model IDs/names and subagent backend/connection names."""
    known: set[str] = set()

    try:
        from deeptutor.services.config import get_model_catalog_service

        catalog = get_model_catalog_service().load()
        services = catalog.get("services", {}) if isinstance(catalog, dict) else {}
        for service_cfg in services.values():
            if not isinstance(service_cfg, dict):
                continue
            for profile in service_cfg.get("profiles", []) or []:
                if not isinstance(profile, dict):
                    continue
                for key in ("id", "name", "binding"):
                    val = str(profile.get(key) or "").strip()
                    if val:
                        known.add(val)
                for model_entry in profile.get("models", []) or []:
                    if not isinstance(model_entry, dict):
                        continue
                    for key in ("id", "model", "name", "display_name"):
                        val = str(model_entry.get(key) or "").strip()
                        if val:
                            known.add(val)
    except Exception as exc:
        logger.debug("Could not inspect model catalog for known names: %s", exc)

    try:
        from deeptutor.services.subagent.registry import list_backend_kinds

        for kind in list_backend_kinds():
            if kind:
                known.add(kind)
    except Exception as exc:
        logger.debug("Could not inspect subagent registry for known names: %s", exc)

    try:
        from deeptutor.services.subagent.config import load_config

        cfg = load_config()
        connections = getattr(cfg, "connections", None) or []
        for conn in connections:
            for attr in ("id", "name", "kind", "model"):
                val = str(getattr(conn, attr, "") or "").strip()
                if val:
                    known.add(val)
    except Exception as exc:
        logger.debug("Could not inspect subagent config for known names: %s", exc)

    return known


def export_preferences_bundle() -> dict[str, Any]:
    """Return a versioned, portable JSON bundle of user model preferences."""
    return {
        "schema_version": _BUNDLE_SCHEMA_VERSION,
        "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "preferences": load_model_preferences(),
    }


def import_preferences_bundle(raw: Any, *, merge: bool = True) -> dict[str, Any]:
    """Import a versioned bundle or raw preferences object atomically."""
    if not isinstance(raw, dict):
        raise ValueError("Preferences import payload must be a JSON object")

    source = raw.get("preferences") if isinstance(raw.get("preferences"), dict) else raw
    incoming = _coerce(source)

    with _WRITE_LOCK:
        if not merge:
            save_model_preferences(incoming)
            return load_model_preferences()

        current = load_model_preferences()
        merged_display = {**current["display_names"], **incoming["display_names"]}
        merged_unavailable = {**current["unavailable"], **incoming["unavailable"]}
        merged_pinned = list(dict.fromkeys([*current["pinned"], *incoming["pinned"]]))
        merged_hidden = list(dict.fromkeys([*current["hidden"], *incoming["hidden"]]))

        save_model_preferences(
            {
                "display_names": merged_display,
                "pinned": merged_pinned,
                "hidden": merged_hidden,
                "unavailable": merged_unavailable,
            }
        )
        return load_model_preferences()


__all__ = [
    "clear_unavailable",
    "collect_known_model_names",
    "export_preferences_bundle",
    "find_stale_preferences",
    "get_display_name",
    "get_unavailable_reason",
    "import_preferences_bundle",
    "is_hidden",
    "is_pinned",
    "is_unavailable",
    "load_model_preferences",
    "mark_unavailable",
    "prune_unknown",
    "save_model_preferences",
    "toggle_hide",
    "toggle_pin",
]
