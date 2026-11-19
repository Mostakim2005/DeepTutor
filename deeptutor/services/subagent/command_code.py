"""Command Code CLI backend — drive Command Code in headless print mode."""

from __future__ import annotations

import asyncio
from dataclasses import replace
import json
import logging
import os
from pathlib import Path
import time
from typing import Any

from deeptutor.services.subagent.base import OnEvent, SubagentBackend
from deeptutor.services.subagent.config import BackendConfig
from deeptutor.services.subagent.process import (
    probe_version,
    stream_process_lines,
)
from deeptutor.services.subagent.types import (
    EVENT_ERROR,
    EVENT_LOG,
    EVENT_REASONING,
    EVENT_TEXT,
    EVENT_TOOL,
    EVENT_TOOL_RESULT,
    ConsultResult,
    DetectResult,
    SubagentEvent,
)

logger = logging.getLogger(__name__)

# Windows caps a command line near 32K characters; leave room for the flags we
# append and refuse the call with a readable message instead of an OS error.
_MAX_PROMPT_CHARS = 24_000

# ``--session`` is only valid for a session that already exists on disk. The
# probe is a filesystem scan, so memoise it briefly instead of walking the
# project tree on every consult.
_SESSION_CACHE: dict[str, tuple[float, bool]] = {}
_SESSION_CACHE_TTL = 30.0
_MAX_SESSION_FILES = 400

# Bound the stderr we retain: a looping CLI must not grow this list forever.
_MAX_STDERR_LINES = 200

# The UI offers a wider effort scale than the CLI accepts. Aliases are explicit
# and logged, never silent, so a promoted value is visible in the log.
_EFFORT_ALIASES = {
    "medium": "high",
    "default": "high",
    "none": "off",
    "minimal": "off",
}
_EFFORT_SUPPORTED = ("off", "low", "high", "max")


class CommandCodeBackend(SubagentBackend):
    kind = "command_code"
    display_name = "Command Code"
    cli_command = "cmdc"

    async def detect(self) -> DetectResult:
        ok, text = await probe_version([self.cli_command, "--version"])
        return DetectResult(
            kind=self.kind,
            display_name=self.display_name,
            available=ok,
            version=text if ok else "",
            detail="" if ok else (text or "cmdc CLI not found on PATH"),
        )

    def _scan_session_exists(self, sid: str) -> bool:
        base = Path.home() / ".commandcode" / "projects"
        if not base.exists():
            return False
        scanned = 0
        try:
            projects = list(base.iterdir())
        except OSError:
            return False
        for proj in projects:
            try:
                if not proj.is_dir():
                    continue
                if (proj / f"{sid}.jsonl").exists():
                    return True
                for f in proj.glob("*.jsonl"):
                    scanned += 1
                    if scanned > _MAX_SESSION_FILES:
                        return False
                    if not f.name.endswith(".checkpoints.jsonl") and f.name.startswith(sid):
                        return True
            except OSError:
                # A locked or permission-denied directory must not abort the consult.
                continue
        return False

    async def _session_exists(self, sid: str) -> bool:
        if not sid:
            return False
        now = time.monotonic()
        cached = _SESSION_CACHE.get(sid)
        if cached and now - cached[0] < _SESSION_CACHE_TTL:
            return cached[1]
        exists = await asyncio.to_thread(self._scan_session_exists, sid)
        _SESSION_CACHE[sid] = (now, exists)
        return exists

    async def _build_command(
        self,
        question: str,
        *,
        session_id: str | None,
        config: BackendConfig,
    ) -> list[str]:
        cmd = [
            self.cli_command,
            "-p",
            question,
            "--output-format",
            "json",
        ]
        if session_id and await self._session_exists(session_id):
            cmd += ["--session", session_id]

        if config.auto_approve:
            cmd.append("--yolo")
        if config.model:
            cmd += ["--model", config.model]
        if config.effort:
            requested = config.effort.lower().strip()
            effort = _EFFORT_ALIASES.get(requested, requested)
            if effort in _EFFORT_SUPPORTED:
                if effort != requested:
                    logger.info(
                        "Command-Code effort '%s' mapped to '%s' for the CLI",
                        requested,
                        effort,
                    )
                cmd += ["--effort", effort]
        cmd += list(config.extra_args)
        return cmd

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
        config = config or BackendConfig()
        result = ConsultResult(session_id=session_id)

        async def emit(
            kind: str, text: str, raw: dict[str, Any], meta: dict[str, Any] | None = None
        ) -> None:
            result.event_count += 1
            await on_event(SubagentEvent(kind=kind, text=text, raw=raw, meta=meta or {}))

        if os.name == "nt" and len(question) > _MAX_PROMPT_CHARS:
            result.success = False
            result.error = (
                f"The question is too long for the Windows command line "
                f"({len(question)} characters, limit {_MAX_PROMPT_CHARS}). "
                f"Shorten the message or split it into parts."
            )
            await emit(EVENT_ERROR, result.error, {"reason": "prompt_too_long"})
            return result

        cmd = await self._build_command(question, session_id=session_id, config=config)

        stderr_lines: list[str] = []
        try:
            async for channel, line in stream_process_lines(cmd, cwd=cwd):
                if channel == "exit":
                    if line != "0":
                        err_detail = " ".join(stderr_lines).strip()
                        # A model that rejects the requested reasoning effort is
                        # recoverable: retry once at the model default.
                        if config.effort and any(
                            phrase in err_detail.lower()
                            for phrase in ("no adjustable reasoning", "unknown effort", "reasoning effort")
                        ):
                            logger.info(
                                "Command-Code effort '%s' rejected for %s (%s). Falling back to model default...",
                                config.effort,
                                config.model,
                                err_detail,
                            )
                            fallback_config = replace(config, effort="")
                            return await self.consult(
                                question,
                                on_event=on_event,
                                cwd=cwd,
                                session_id=session_id,
                                config=fallback_config,
                                images=images,
                                partner_id=partner_id,
                            )
                        # Every non-zero exit is a failure, even when the CLI
                        # streamed partial text or already reported its own
                        # error: leaving ``success`` true hides the failure.
                        result.success = False
                        if not result.error:
                            result.error = (
                                f"cmdc exited with code {line}: {err_detail}"
                                if err_detail
                                else f"cmdc exited with code {line}"
                            )
                        await emit(
                            EVENT_ERROR,
                            result.error,
                            {"returncode": line, "stderr": err_detail},
                        )
                    continue
                if channel == "stderr":
                    if line.strip():
                        stderr_lines.append(line.strip())
                        if len(stderr_lines) > _MAX_STDERR_LINES:
                            del stderr_lines[: len(stderr_lines) - _MAX_STDERR_LINES]
                        await emit(EVENT_LOG, line, {"stream": "stderr"})
                    continue

                line_str = line.strip()
                if not line_str:
                    continue

                try:
                    payload = json.loads(line_str)
                except Exception:
                    await emit(EVENT_LOG, line, {"stream": "stdout"})
                    continue

                p_type = payload.get("type")
                if p_type == "event":
                    ev = payload.get("event") or {}
                    ev_type = ev.get("type")
                    if ev_type == "text_delta":
                        delta = ev.get("delta", "")
                        result.final_text += delta
                        await emit(EVENT_TEXT, delta, ev)
                    elif ev_type in ("thought_delta", "reasoning_delta", "thinking_delta"):
                        delta = ev.get("delta", "")
                        await emit(EVENT_REASONING, delta, ev)
                    elif ev_type in ("tool_start", "tool_call"):
                        name = ev.get("toolName") or ev.get("name") or "tool"
                        await emit(EVENT_TOOL, name, ev)
                    elif ev_type in ("tool_end", "tool_result"):
                        await emit(EVENT_TOOL_RESULT, str(ev.get("result") or ""), ev)
                elif p_type == "result":
                    if payload.get("sessionId"):
                        result.session_id = payload.get("sessionId")
                    if payload.get("finalText"):
                        result.final_text = payload.get("finalText")
                    result.success = (payload.get("subtype") == "success")
        except Exception as exc:
            logger.warning("command_code consult failed: %s", exc, exc_info=True)
            result.success = False
            result.error = str(exc)
            await emit(EVENT_ERROR, str(exc), {})

        return result
