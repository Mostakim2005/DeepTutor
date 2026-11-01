"""Command Code CLI backend — drive Command Code in headless print mode."""

from __future__ import annotations

import json
import logging
from pathlib import Path
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

    def _build_command(
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
        if session_id:
            cmd += ["--session", session_id]
        else:
            cmd.append("--no-session")

        if config.auto_approve:
            cmd.append("--yolo")
        if config.model:
            cmd += ["--model", config.model]
        if config.effort:
            cmd += ["--effort", config.effort]
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
        cmd = self._build_command(question, session_id=session_id, config=config)
        result = ConsultResult(session_id=session_id)

        async def emit(
            kind: str, text: str, raw: dict[str, Any], meta: dict[str, Any] | None = None
        ) -> None:
            result.event_count += 1
            await on_event(SubagentEvent(kind=kind, text=text, raw=raw, meta=meta or {}))

        try:
            async for channel, line in stream_process_lines(cmd, cwd=cwd):
                if channel == "exit":
                    if line != "0" and result.success and not result.final_text:
                        result.success = False
                        result.error = f"cmdc exited with code {line}"
                        await emit(EVENT_ERROR, result.error, {"returncode": line})
                    continue
                if channel == "stderr":
                    if line.strip():
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
