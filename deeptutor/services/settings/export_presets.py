"""User-owned export presets persisted in data/user/settings/export_presets.json.

Stores named format + filter-option combinations and remembers the last-used
preset id. All mutations take a module-level lock and replace the file
atomically so concurrent tabs cannot corrupt or drop presets.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
import re
import tempfile
import threading
from typing import Any

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_FALLBACK_PRESETS_FILE = _PROJECT_ROOT / "data" / "user" / "settings" / "export_presets.json"
_WRITE_LOCK = threading.RLock()
_SCHEMA_VERSION = 1

_ALLOWED_FORMATS = {"docx", "pdf", "xlsx", "html", "markdown", "json", "txt"}
_ALLOWED_SCOPES = {"all", "answers", "questions"}
_OPTION_KEYS = (
    "includeUserPrompts",
    "includeThinking",
    "includeToolCalls",
    "includeToolResults",
    "includeSources",
    "includeArtifacts",
    "includeTables",
)
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")

DEFAULT_EXPORT_PRESETS: list[dict[str, Any]] = [
    {
        "id": "study-handout-docx",
        "name": "Study Handout (DOCX)",
        "format": "docx",
        "scope": "all",
        "builtin": True,
        "options": {
            "includeUserPrompts": True,
            "includeThinking": False,
            "includeToolCalls": False,
            "includeToolResults": False,
            "includeSources": True,
            "includeArtifacts": True,
            "includeTables": True,
        },
    },
    {
        "id": "clean-vector-pdf",
        "name": "Clean Vector PDF",
        "format": "pdf",
        "scope": "answers",
        "builtin": True,
        "options": {
            "includeUserPrompts": False,
            "includeThinking": False,
            "includeToolCalls": False,
            "includeToolResults": False,
            "includeSources": True,
            "includeArtifacts": True,
            "includeTables": True,
        },
    },
    {
        "id": "obsidian-markdown",
        "name": "Obsidian Markdown",
        "format": "markdown",
        "scope": "all",
        "builtin": True,
        "options": {
            "includeUserPrompts": True,
            "includeThinking": True,
            "includeToolCalls": False,
            "includeToolResults": False,
            "includeSources": True,
            "includeArtifacts": True,
            "includeTables": True,
        },
    },
]


def _get_presets_path() -> Path:
    from deeptutor.services.config.runtime_settings import get_runtime_settings_service

    try:
        return get_runtime_settings_service().settings_dir / "export_presets.json"
    except Exception:
        return _FALLBACK_PRESETS_FILE


def _normalize_options(raw: Any) -> dict[str, bool]:
    src = raw if isinstance(raw, dict) else {}
    return {key: bool(src.get(key, True)) for key in _OPTION_KEYS}


def _normalize_preset(preset_id: str, raw: Any) -> dict[str, Any]:
    src = raw if isinstance(raw, dict) else {}
    fmt = str(src.get("format", "docx")).strip().lower()
    if fmt not in _ALLOWED_FORMATS:
        fmt = "docx"
    scope = str(src.get("scope", "all")).strip().lower()
    if scope not in _ALLOWED_SCOPES:
        scope = "all"
    name = str(src.get("name", "")).strip() or preset_id
    return {
        "id": preset_id,
        "name": name[:80],
        "format": fmt,
        "scope": scope,
        "builtin": False,
        "options": _normalize_options(src.get("options")),
    }


def _read_raw_doc(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"schema_version": _SCHEMA_VERSION, "last_used_preset_id": None, "custom_presets": {}}
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(parsed, dict):
            return {"schema_version": _SCHEMA_VERSION, "last_used_preset_id": None, "custom_presets": {}}
    except Exception as exc:
        logger.warning("Failed to parse export_presets.json (%s); using defaults", exc)
        return {"schema_version": _SCHEMA_VERSION, "last_used_preset_id": None, "custom_presets": {}}

    raw_custom = parsed.get("custom_presets")
    custom: dict[str, dict[str, Any]] = {}
    if isinstance(raw_custom, dict):
        for pid, entry in raw_custom.items():
            if isinstance(pid, str) and _SLUG_RE.match(pid):
                custom[pid] = _normalize_preset(pid, entry)
    last_used = parsed.get("last_used_preset_id")
    if not isinstance(last_used, str) or not last_used.strip():
        last_used = None
    return {
        "schema_version": _SCHEMA_VERSION,
        "last_used_preset_id": last_used,
        "custom_presets": custom,
    }


def _write_raw_doc(path: Path, doc: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(doc, indent=2, ensure_ascii=False) + "\n"
    fd, tmp_name = tempfile.mkstemp(prefix=".export_presets_", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(serialized)
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def _build_response(doc: dict[str, Any]) -> dict[str, Any]:
    custom_map: dict[str, dict[str, Any]] = doc.get("custom_presets", {})
    presets: list[dict[str, Any]] = []
    seen: set[str] = set()
    for default_item in DEFAULT_EXPORT_PRESETS:
        pid = default_item["id"]
        if pid in custom_map:
            presets.append(custom_map[pid])
        else:
            presets.append(default_item)
        seen.add(pid)
    for pid, item in sorted(custom_map.items()):
        if pid not in seen:
            presets.append(item)
    return {
        "schema_version": _SCHEMA_VERSION,
        "last_used_preset_id": doc.get("last_used_preset_id"),
        "presets": presets,
    }


def load_export_presets() -> dict[str, Any]:
    """Return built-in + user-saved export presets and the last-used preset id."""
    with _WRITE_LOCK:
        doc = _read_raw_doc(_get_presets_path())
        return _build_response(doc)


def upsert_export_preset(preset_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Create or update a named export preset."""
    cleaned = str(preset_id or "").strip().lower()
    if not _SLUG_RE.match(cleaned):
        raise ValueError(
            "Preset id must start with a lowercase letter or digit and contain only [a-z0-9_-] (max 64 chars)."
        )
    with _WRITE_LOCK:
        path = _get_presets_path()
        doc = _read_raw_doc(path)
        doc["custom_presets"][cleaned] = _normalize_preset(cleaned, payload)
        doc["last_used_preset_id"] = cleaned
        _write_raw_doc(path, doc)
        return _build_response(doc)


def delete_export_preset(preset_id: str) -> bool:
    """Delete a user-saved export preset by id."""
    cleaned = str(preset_id or "").strip().lower()
    with _WRITE_LOCK:
        path = _get_presets_path()
        doc = _read_raw_doc(path)
        removed = doc["custom_presets"].pop(cleaned, None) is not None
        if removed:
            if doc.get("last_used_preset_id") == cleaned:
                doc["last_used_preset_id"] = None
            _write_raw_doc(path, doc)
        return removed


def set_last_used_export_preset(preset_id: str | None) -> dict[str, Any]:
    """Persist the last-used export preset id."""
    cleaned = str(preset_id).strip().lower() if isinstance(preset_id, str) and preset_id.strip() else None
    with _WRITE_LOCK:
        path = _get_presets_path()
        doc = _read_raw_doc(path)
        doc["last_used_preset_id"] = cleaned
        _write_raw_doc(path, doc)
        return _build_response(doc)
