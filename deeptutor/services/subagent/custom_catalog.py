"""User-owned per-harness model catalog overrides and effort-level fallback (Bravo 4).

Stores user-added and user-retired model lists in ``data/user/settings/custom_model_catalogs.json``
so new models can be added and retired models removed purely through JSON or the
Settings UI without editing Python backend code or causing merge conflicts on
upstream updates.
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

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_FALLBACK_CATALOG_FILE = _PROJECT_ROOT / "data" / "user" / "settings" / "custom_model_catalogs.json"

_WRITE_LOCK = threading.RLock()
_CACHE: dict[str, Any] = {"key": None, "data": None}

# Canonical effort ladder ordered from lowest to highest reasoning intensity.
EFFORT_LADDER: tuple[str, ...] = (
    "none",
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
    "ultra",
)

_EFFORT_RANK: dict[str, int] = {
    "none": 0,
    "off": 0,
    "minimal": 1,
    "low": 2,
    "medium": 3,
    "high": 4,
    "xhigh": 5,
    "max": 6,
    "ultra": 7,
}


def _get_catalog_path() -> Path:
    from deeptutor.services.config.runtime_settings import get_runtime_settings_service

    try:
        settings_dir = get_runtime_settings_service().settings_dir
        return settings_dir / "custom_model_catalogs.json"
    except Exception:
        return _FALLBACK_CATALOG_FILE


def _empty_catalog() -> dict[str, Any]:
    return {"backends": {}}


def _coerce_model_entry(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    slug = str(raw.get("slug") or "").strip()
    if not slug:
        return None
    display_name = str(raw.get("display_name") or "").strip() or slug
    default_effort = str(raw.get("default_effort") or "").strip().lower()
    raw_efforts = raw.get("efforts")
    efforts: list[str] = []
    if isinstance(raw_efforts, list):
        for item in raw_efforts:
            if isinstance(item, str):
                cleaned = item.strip().lower()
                if cleaned and cleaned not in efforts:
                    efforts.append(cleaned)
    return {
        "slug": slug,
        "display_name": display_name,
        "default_effort": default_effort,
        "efforts": efforts,
    }


def _coerce(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return _empty_catalog()
    raw_backends = raw.get("backends")
    if not isinstance(raw_backends, dict):
        return _empty_catalog()

    backends: dict[str, dict[str, Any]] = {}
    for kind, entry in raw_backends.items():
        if not isinstance(kind, str) or not kind.strip() or not isinstance(entry, dict):
            continue
        cleaned_kind = kind.strip()
        added_raw = entry.get("added_models")
        added_by_slug: dict[str, dict[str, Any]] = {}
        if isinstance(added_raw, list):
            for item in added_raw:
                coerced = _coerce_model_entry(item)
                if coerced:
                    added_by_slug[coerced["slug"]] = coerced

        removed_raw = entry.get("removed_models")
        removed: list[str] = []
        if isinstance(removed_raw, list):
            for item in removed_raw:
                if isinstance(item, str):
                    slug = item.strip()
                    if slug and slug not in removed:
                        removed.append(slug)

        default_effort = str(entry.get("default_effort") or "").strip().lower()
        backends[cleaned_kind] = {
            "added_models": list(added_by_slug.values()),
            "removed_models": removed,
            "default_effort": default_effort,
        }

    return {"backends": backends}


def _stamp(path: Path) -> tuple[str, int, int] | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    return (str(path), stat.st_mtime_ns, stat.st_size)


def load_custom_catalogs() -> dict[str, Any]:
    path = _get_catalog_path()
    stamp = _stamp(path)
    if stamp is None:
        return _empty_catalog()
    if _CACHE["key"] == stamp:
        return _CACHE["data"]

    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = _coerce(json.load(handle))
    except Exception as exc:
        logger.warning("Could not read custom model catalogs from %s: %s", path, exc)
        return _empty_catalog()

    _CACHE["key"] = stamp
    _CACHE["data"] = data
    return data


def save_custom_catalogs(data: dict[str, Any]) -> None:
    path = _get_catalog_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = _coerce(data)

    with _WRITE_LOCK:
        handle, tmp_name = tempfile.mkstemp(
            dir=str(path.parent), prefix=".custom_model_catalogs-", suffix=".tmp"
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


def add_custom_model(
    kind: str,
    slug: str,
    display_name: str = "",
    *,
    default_effort: str = "",
    efforts: list[str] | None = None,
) -> dict[str, Any]:
    """Add or update a user model entry for ``kind`` and un-retire it if previously removed."""
    cleaned_kind = str(kind or "").strip()
    cleaned_slug = str(slug or "").strip()
    if not cleaned_kind or not cleaned_slug:
        raise ValueError("kind and slug must be non-empty")

    entry = _coerce_model_entry(
        {
            "slug": cleaned_slug,
            "display_name": display_name or cleaned_slug,
            "default_effort": default_effort,
            "efforts": list(efforts or []),
        }
    )
    assert entry is not None

    with _WRITE_LOCK:
        doc = load_custom_catalogs()
        backends = dict(doc["backends"])
        current = dict(
            backends.get(
                cleaned_kind,
                {"added_models": [], "removed_models": [], "default_effort": ""},
            )
        )
        added = [m for m in current["added_models"] if m["slug"] != cleaned_slug]
        added.append(entry)
        removed = [s for s in current["removed_models"] if s != cleaned_slug]
        current["added_models"] = added
        current["removed_models"] = removed
        backends[cleaned_kind] = current
        save_custom_catalogs({"backends": backends})
        return load_custom_catalogs()


def remove_custom_model(kind: str, slug: str) -> dict[str, Any]:
    """Remove a custom model and mark ``slug`` as retired for ``kind``."""
    cleaned_kind = str(kind or "").strip()
    cleaned_slug = str(slug or "").strip()
    if not cleaned_kind or not cleaned_slug:
        raise ValueError("kind and slug must be non-empty")

    with _WRITE_LOCK:
        doc = load_custom_catalogs()
        backends = dict(doc["backends"])
        current = dict(
            backends.get(
                cleaned_kind,
                {"added_models": [], "removed_models": [], "default_effort": ""},
            )
        )
        current["added_models"] = [
            m for m in current["added_models"] if m["slug"] != cleaned_slug
        ]
        removed = list(current["removed_models"])
        if cleaned_slug not in removed:
            removed.append(cleaned_slug)
        current["removed_models"] = removed
        backends[cleaned_kind] = current
        save_custom_catalogs({"backends": backends})
        return load_custom_catalogs()


def restore_removed_model(kind: str, slug: str) -> dict[str, Any]:
    """Un-retire a previously removed model slug for ``kind``."""
    cleaned_kind = str(kind or "").strip()
    cleaned_slug = str(slug or "").strip()
    if not cleaned_kind or not cleaned_slug:
        raise ValueError("kind and slug must be non-empty")

    with _WRITE_LOCK:
        doc = load_custom_catalogs()
        backends = dict(doc["backends"])
        if cleaned_kind in backends:
            current = dict(backends[cleaned_kind])
            current["removed_models"] = [
                s for s in current["removed_models"] if s != cleaned_slug
            ]
            backends[cleaned_kind] = current
            save_custom_catalogs({"backends": backends})
        return load_custom_catalogs()


def resolve_effort_with_fallback(
    requested: str,
    supported: list[str] | tuple[str, ...],
    *,
    default: str = "",
) -> str:
    """Map a requested reasoning effort to the closest supported level without failing.

    Examples:
    - ``"none"`` on a harness supporting ``("off", "low", "high")`` -> ``"off"``
    - ``"medium"`` on ``("low", "high", "max")`` -> ``"low"`` (nearest lower tier)
    - ``"ultra"`` on ``("low", "medium", "high")`` -> ``"high"`` (highest available)
    """
    normalized_supported = [str(s).strip().lower() for s in supported if str(s).strip()]
    if not normalized_supported:
        return str(requested or default or "").strip().lower()

    req = str(requested or "").strip().lower()
    if not req:
        fallback_default = str(default or "").strip().lower()
        if fallback_default in normalized_supported:
            return fallback_default
        return ""

    if req in normalized_supported:
        return req

    # Handle none <-> off equivalence directly.
    if req == "none" and "off" in normalized_supported:
        return "off"
    if req == "off" and "none" in normalized_supported:
        return "none"

    req_rank = _EFFORT_RANK.get(req)
    if req_rank is None:
        fallback_default = str(default or "").strip().lower()
        if fallback_default in normalized_supported:
            return fallback_default
        return normalized_supported[0]

    ranked_supported = [
        (abs(_EFFORT_RANK[item] - req_rank), _EFFORT_RANK[item] > req_rank, item)
        for item in normalized_supported
        if item in _EFFORT_RANK
    ]
    if not ranked_supported:
        return normalized_supported[0]

    # Prefer smallest distance; on ties, prefer the safer lower tier (False < True).
    ranked_supported.sort(key=lambda pair: (pair[0], pair[1]))
    return ranked_supported[0][2]


def merge_backend_model_options(
    kind: str,
    base_models: list[dict[str, Any]],
    base_efforts: list[str] | tuple[str, ...],
) -> list[dict[str, Any]]:
    """Apply user-owned added/removed model overrides to a backend's discovered list."""
    doc = load_custom_catalogs()
    override = doc["backends"].get(kind)
    if not override:
        return list(base_models)

    removed_set = set(override.get("removed_models", []))
    merged_by_slug: dict[str, dict[str, Any]] = {}
    order: list[str] = []

    for item in base_models:
        slug = str(item.get("slug") or "").strip()
        if not slug or slug in removed_set:
            continue
        merged_by_slug[slug] = dict(item)
        order.append(slug)

    default_efforts = [str(e).strip().lower() for e in base_efforts if str(e).strip()]
    for added in override.get("added_models", []):
        slug = added["slug"]
        efforts = list(added["efforts"]) if added["efforts"] else list(default_efforts)
        resolved_default = resolve_effort_with_fallback(
            added.get("default_effort", ""), efforts
        )
        entry = {
            "slug": slug,
            "display_name": added["display_name"],
            "default_effort": resolved_default,
            "efforts": efforts,
        }
        if slug not in merged_by_slug:
            order.append(slug)
        merged_by_slug[slug] = entry

    return [merged_by_slug[slug] for slug in order]


__all__ = [
    "EFFORT_LADDER",
    "add_custom_model",
    "load_custom_catalogs",
    "merge_backend_model_options",
    "remove_custom_model",
    "resolve_effort_with_fallback",
    "restore_removed_model",
    "save_custom_catalogs",
]
