"""Plug-and-play custom CLI/ACP harness store and FreeBuff backend (Bravo 5 + Delta 1).

Persists user-registered external CLI and ACP harnesses in
``data/user/settings/custom_harnesses.json`` so new harnesses (and custom flags
for built-in ones like FreeBuff) can be added, edited, or removed purely
through Settings or JSON without modifying Python backend code.
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

from deeptutor.services.subagent.base import OnEvent, SubagentBackend
from deeptutor.services.subagent.config import BackendConfig
from deeptutor.services.subagent.custom_catalog import resolve_effort_with_fallback
from deeptutor.services.subagent.process import (
    not_found_detail,
    probe_version,
    stream_process_lines,
)
from deeptutor.services.subagent.types import (
    EVENT_ERROR,
    EVENT_LOG,
    EVENT_TEXT,
    ConsultResult,
    DetectResult,
    SubagentEvent,
)

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_FALLBACK_HARNESSES_FILE = _PROJECT_ROOT / "data" / "user" / "settings" / "custom_harnesses.json"

_WRITE_LOCK = threading.RLock()
_CACHE: dict[str, Any] = {"key": None, "data": None}

_KIND_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
_MAX_PROMPT_CHARS = 24_000
_MAX_STDERR_LINES = 200

_DEFAULT_FREEBUFF_SPEC: dict[str, Any] = {
    "kind": "freebuff",
    "display_name": "FreeBuff",
    "protocol": "cli",
    "command": "freebuff",
    "version_args": ["--version"],
    "prompt_args": ["-p", "{prompt}"],
    "model_flag": "--model",
    "effort_flag": "--effort",
    "efforts": ["low", "medium", "high", "max"],
    "default_model": "",
    "models": [],
    "env": {},
    "enabled": True,
}


def _get_harnesses_path() -> Path:
    from deeptutor.services.config.runtime_settings import get_runtime_settings_service

    try:
        settings_dir = get_runtime_settings_service().settings_dir
        return settings_dir / "custom_harnesses.json"
    except Exception:
        return _FALLBACK_HARNESSES_FILE


def _empty_doc() -> dict[str, Any]:
    return {"harnesses": {}}


def _coerce_str_list(raw: Any, default: list[str]) -> list[str]:
    if not isinstance(raw, list):
        return list(default)
    out = [str(item).strip() for item in raw if isinstance(item, str) and str(item).strip()]
    return out if out else list(default)


def _coerce_harness(kind: str, raw: Any) -> dict[str, Any] | None:
    cleaned_kind = str(kind or "").strip().lower()
    if not _KIND_RE.match(cleaned_kind) or not isinstance(raw, dict):
        return None
    command = str(raw.get("command") or "").strip()
    if not command:
        return None
    protocol = str(raw.get("protocol") or "cli").strip().lower()
    if protocol not in ("cli", "acp"):
        protocol = "cli"
    display_name = str(raw.get("display_name") or "").strip() or cleaned_kind
    version_args = _coerce_str_list(raw.get("version_args"), ["--version"])
    prompt_args = _coerce_str_list(raw.get("prompt_args"), ["-p", "{prompt}"])
    model_flag = str(raw.get("model_flag") if raw.get("model_flag") is not None else "--model").strip()
    effort_flag = str(raw.get("effort_flag") if raw.get("effort_flag") is not None else "--effort").strip()
    efforts = _coerce_str_list(raw.get("efforts"), ["low", "medium", "high", "max"])
    default_model = str(raw.get("default_model") or "").strip()

    models: list[dict[str, Any]] = []
    if isinstance(raw.get("models"), list):
        for item in raw["models"]:
            if isinstance(item, str) and item.strip():
                slug = item.strip()
                models.append(
                    {
                        "slug": slug,
                        "display_name": slug,
                        "default_effort": "",
                        "efforts": list(efforts),
                    }
                )
            elif isinstance(item, dict) and str(item.get("slug") or "").strip():
                slug = str(item["slug"]).strip()
                models.append(
                    {
                        "slug": slug,
                        "display_name": str(item.get("display_name") or "").strip() or slug,
                        "default_effort": str(item.get("default_effort") or "").strip().lower(),
                        "efforts": _coerce_str_list(item.get("efforts"), efforts),
                    }
                )

    env_raw = raw.get("env")
    env = (
        {
            str(k).strip(): str(v)
            for k, v in env_raw.items()
            if isinstance(k, str) and k.strip() and isinstance(v, str)
        }
        if isinstance(env_raw, dict)
        else {}
    )

    enabled = bool(raw.get("enabled", True))
    return {
        "kind": cleaned_kind,
        "display_name": display_name,
        "protocol": protocol,
        "command": command,
        "version_args": version_args,
        "prompt_args": prompt_args,
        "model_flag": model_flag,
        "effort_flag": effort_flag,
        "efforts": efforts,
        "default_model": default_model,
        "models": models,
        "env": env,
        "enabled": enabled,
    }


def _coerce(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return _empty_doc()
    raw_harnesses = raw.get("harnesses")
    if not isinstance(raw_harnesses, dict):
        return _empty_doc()
    harnesses: dict[str, dict[str, Any]] = {}
    for kind, entry in raw_harnesses.items():
        coerced = _coerce_harness(kind, entry)
        if coerced:
            harnesses[coerced["kind"]] = coerced
    return {"harnesses": harnesses}


def _stamp(path: Path) -> tuple[str, int, int] | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    return (str(path), stat.st_mtime_ns, stat.st_size)


def load_custom_harnesses() -> dict[str, Any]:
    path = _get_harnesses_path()
    stamp = _stamp(path)
    if stamp is None:
        return _empty_doc()
    if _CACHE["key"] == stamp:
        return _CACHE["data"]

    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = _coerce(json.load(handle))
    except Exception as exc:
        logger.warning("Could not read custom harnesses from %s: %s", path, exc)
        return _empty_doc()

    _CACHE["key"] = stamp
    _CACHE["data"] = data
    return data


def save_custom_harnesses(data: dict[str, Any]) -> None:
    path = _get_harnesses_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = _coerce(data)

    with _WRITE_LOCK:
        handle, tmp_name = tempfile.mkstemp(
            dir=str(path.parent), prefix=".custom_harnesses-", suffix=".tmp"
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


def upsert_custom_harness(kind: str, spec: dict[str, Any]) -> dict[str, Any]:
    """Create or update a plug-and-play CLI/ACP harness specification."""
    coerced = _coerce_harness(kind, spec)
    if coerced is None:
        raise ValueError("Invalid harness kind or missing command")

    with _WRITE_LOCK:
        doc = load_custom_harnesses()
        harnesses = dict(doc["harnesses"])
        harnesses[coerced["kind"]] = coerced
        save_custom_harnesses({"harnesses": harnesses})
        return load_custom_harnesses()


def delete_custom_harness(kind: str) -> bool:
    """Remove a user-registered custom harness. Returns True if removed."""
    cleaned_kind = str(kind or "").strip().lower()
    with _WRITE_LOCK:
        doc = load_custom_harnesses()
        harnesses = dict(doc["harnesses"])
        if cleaned_kind not in harnesses:
            return False
        harnesses.pop(cleaned_kind, None)
        save_custom_harnesses({"harnesses": harnesses})
        return True


def get_effective_harness_spec(kind: str, fallback: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Return user-configured harness spec if present, else ``fallback``."""
    cleaned_kind = str(kind or "").strip().lower()
    user_spec = load_custom_harnesses()["harnesses"].get(cleaned_kind)
    if user_spec is not None:
        return dict(user_spec)
    return dict(fallback) if fallback is not None else None


class ConfigurableCliBackend(SubagentBackend):
    """Generic SubagentBackend driven by a user-owned harness spec."""

    def __init__(self, spec: dict[str, Any]) -> None:
        self._spec = dict(spec)
        self.kind = self._spec["kind"]
        self.display_name = self._spec["display_name"]
        self.cli_command = self._spec["command"]

    def _current_spec(self) -> dict[str, Any]:
        return get_effective_harness_spec(self.kind, self._spec) or self._spec

    def build_command(self, question: str, config: BackendConfig | None = None) -> list[str]:
        spec = self._current_spec()
        cmd = [spec["command"]]
        has_prompt_placeholder = False
        for token in spec.get("prompt_args", ["-p", "{prompt}"]):
            if "{prompt}" in token:
                cmd.append(token.replace("{prompt}", question))
                has_prompt_placeholder = True
            else:
                cmd.append(token)
        if not has_prompt_placeholder:
            cmd.append(question)

        model = (config.model if config and config.model else spec.get("default_model", "")).strip()
        if model and spec.get("model_flag"):
            cmd.extend([spec["model_flag"], model])

        requested_effort = (config.reasoning_effort if config and config.reasoning_effort else "").strip()
        if requested_effort and spec.get("effort_flag"):
            resolved = resolve_effort_with_fallback(requested_effort, spec.get("efforts", []))
            if resolved:
                cmd.extend([spec["effort_flag"], resolved])
        return cmd

    async def detect(self) -> DetectResult:
        spec = self._current_spec()
        probe_cmd = [spec["command"], *spec.get("version_args", ["--version"])]
        ok, text = await probe_version(probe_cmd)
        return DetectResult(
            kind=self.kind,
            display_name=spec["display_name"],
            available=ok,
            version=text if ok else "",
            detail="" if ok else not_found_detail(text, f"{spec['command']} CLI not found on PATH"),
        )

    async def consult(
        self,
        question: str,
        *,
        on_event: OnEvent,
        cwd: str | None = None,
        session_id: str | None = None,
        config: BackendConfig | None = None,
        images: list[str] | None = None,
        partner_id: str | None = None,
    ) -> ConsultResult:
        del session_id, images, partner_id
        spec = self._current_spec()
        if len(question) > _MAX_PROMPT_CHARS:
            msg = (
                f"Prompt length ({len(question)} chars) exceeds safe CLI limit "
                f"({_MAX_PROMPT_CHARS} chars) for {spec['display_name']}."
            )
            await on_event(SubagentEvent(kind=EVENT_ERROR, text=msg))
            return ConsultResult(final_text="", success=False, error=msg, event_count=1)

        cmd = self.build_command(question, config=config)
        env = {**os.environ, **spec.get("env", {})} if spec.get("env") else None
        text_chunks: list[str] = []
        stderr_lines: list[str] = []
        event_count = 0

        async def _on_stdout(line: str) -> None:
            nonlocal event_count
            stripped = line.strip()
            if not stripped:
                return
            # Support optional JSON-lines output cleanly, falling back to plain text.
            if stripped.startswith("{") and stripped.endswith("}"):
                try:
                    parsed = json.loads(stripped)
                    if isinstance(parsed, dict):
                        content = str(
                            parsed.get("text")
                            or parsed.get("content")
                            or parsed.get("delta")
                            or ""
                        )
                        if content:
                            text_chunks.append(content)
                            event_count += 1
                            await on_event(SubagentEvent(kind=EVENT_TEXT, text=content, raw=parsed))
                            return
                except json.JSONDecodeError:
                    pass
            text_chunks.append(line)
            event_count += 1
            await on_event(SubagentEvent(kind=EVENT_TEXT, text=line))

        async def _on_stderr(line: str) -> None:
            nonlocal event_count
            if len(stderr_lines) < _MAX_STDERR_LINES:
                stderr_lines.append(line)
            event_count += 1
            await on_event(SubagentEvent(kind=EVENT_LOG, text=line))

        rc = await stream_process_lines(
            cmd,
            cwd=cwd,
            env=env,
            on_stdout=_on_stdout,
            on_stderr=_on_stderr,
        )
        final_text = "\n".join(text_chunks).strip()
        if rc != 0:
            err = "\n".join(stderr_lines).strip() or f"{spec['command']} exited with status {rc}"
            await on_event(SubagentEvent(kind=EVENT_ERROR, text=err))
            return ConsultResult(
                final_text=final_text,
                success=False,
                error=err,
                event_count=event_count + 1,
            )
        return ConsultResult(
            final_text=final_text,
            success=True,
            error="",
            event_count=event_count,
        )


class FreeBuffBackend(ConfigurableCliBackend):
    """Built-in FreeBuff CLI backend with user-overridable command and flags."""

    kind = "freebuff"
    display_name = "FreeBuff"
    cli_command = "freebuff"

    def __init__(self) -> None:
        super().__init__(_DEFAULT_FREEBUFF_SPEC)


def build_dynamic_custom_backends(builtin_kinds: set[str]) -> dict[str, SubagentBackend]:
    """Instantiate enabled user-defined CLI harnesses not already registered as built-ins."""
    doc = load_custom_harnesses()
    backends: dict[str, SubagentBackend] = {}
    for kind, spec in doc["harnesses"].items():
        if kind in builtin_kinds or not spec.get("enabled", True):
            continue
        if spec.get("protocol", "cli") == "cli":
            backends[kind] = ConfigurableCliBackend(spec)
    return backends


__all__ = [
    "ConfigurableCliBackend",
    "FreeBuffBackend",
    "build_dynamic_custom_backends",
    "delete_custom_harness",
    "get_effective_harness_spec",
    "load_custom_harnesses",
    "save_custom_harnesses",
    "upsert_custom_harness",
]
