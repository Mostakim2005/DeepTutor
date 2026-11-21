"""Local Paradee TTS adapter (Charlie 1) with lightweight on-demand silent auto-start.

Paradee TTS exposes an OpenAI-compatible ``/v1/audio/speech`` endpoint on
``http://127.0.0.1:8855/v1`` (voices: ``af_heart``, ``am_puck``, ``bf_isabella``,
``bm_fable``). Rather than spawning Paradee at DeepTutor startup (which would
reserve RAM even when voice is unused), this adapter starts it silently on
first synthesis/discovery request when the local service directory is present
and port 8855 is not yet listening.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit

import httpx

from deeptutor.services.voice.adapters.openai_compat import OpenAICompatTTSAdapter
from deeptutor.services.voice.base import VoiceProviderError
from deeptutor.services.voice.config import TTSConfig

logger = logging.getLogger(__name__)

DEFAULT_PARADEE_BASE_URL = "http://127.0.0.1:8855/v1"
DEFAULT_PARADEE_PORT = 8855
DEFAULT_PARADEE_MODEL = "paradee-tts"
DEFAULT_PARADEE_VOICE = "af_heart"

PARADEE_VOICES: tuple[dict[str, str], ...] = (
    {"id": "af_heart", "label": "Heart (US Female)", "locale": "en-US"},
    {"id": "am_puck", "label": "Puck (US Male)", "locale": "en-US"},
    {"id": "bf_isabella", "label": "Isabella (UK Female)", "locale": "en-GB"},
    {"id": "bm_fable", "label": "Fable (UK Male)", "locale": "en-GB"},
)

_START_LOCK = threading.Lock()
_LAUNCHED_PROC: subprocess.Popen[bytes] | None = None


def _resolve_paradee_dir() -> Path | None:
    """Locate the local Paradee TTS installation directory without requiring .env."""
    candidates: list[Path] = []
    env_dir = os.environ.get("PARADEE_TTS_DIR", "").strip()
    if env_dir:
        candidates.append(Path(env_dir))
    home = Path.home()
    candidates.append(home / "Services" / "paradee-tts")
    candidates.append(Path(r"C:\Users\kazir\Services\paradee-tts"))
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    return None


def _resolve_paradee_command(service_dir: Path) -> list[str] | None:
    """Find the best silent launch command inside the Paradee TTS directory."""
    if sys.platform == "win32":
        for name in ("paradee-tts.exe", "paradee.exe"):
            exe = service_dir / name
            if exe.is_file():
                return [str(exe)]
        venv_py = service_dir / ".venv" / "Scripts" / "python.exe"
        for script in ("server.py", "app.py", "main.py"):
            target = service_dir / script
            if target.is_file():
                py = str(venv_py) if venv_py.is_file() else sys.executable
                return [py, str(target)]
        for bat in ("start.bat", "run.bat"):
            target = service_dir / bat
            if target.is_file():
                return ["cmd.exe", "/c", str(target)]
    else:
        venv_py = service_dir / ".venv" / "bin" / "python"
        for script in ("server.py", "app.py", "main.py"):
            target = service_dir / script
            if target.is_file():
                py = str(venv_py) if venv_py.is_file() else sys.executable
                return [py, str(target)]
    return None


def _is_port_open(host: str, port: int, timeout: float = 0.25) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def ensure_paradee_running(
    base_url: str = DEFAULT_PARADEE_BASE_URL,
    wait_seconds: float = 8.0,
) -> bool:
    """Silently start local Paradee TTS on demand if targeting localhost and not yet up."""
    global _LAUNCHED_PROC
    parsed = urlsplit(base_url or DEFAULT_PARADEE_BASE_URL)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or DEFAULT_PARADEE_PORT

    if _is_port_open(host, port):
        return True

    # Only auto-start when pointing at loopback; never spawn for remote hosts.
    if host not in {"127.0.0.1", "localhost", "::1"}:
        return False

    with _START_LOCK:
        if _is_port_open(host, port):
            return True

        service_dir = _resolve_paradee_dir()
        if service_dir is None:
            return False

        cmd = _resolve_paradee_command(service_dir)
        if not cmd:
            logger.warning("Paradee TTS directory found at %s, but no runnable entry point.", service_dir)
            return False

        creationflags = 0
        if sys.platform == "win32":
            create_no_window = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
            create_new_group = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
            creationflags = create_no_window | create_new_group

        try:
            _LAUNCHED_PROC = subprocess.Popen(
                cmd,
                cwd=str(service_dir),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True,
                creationflags=creationflags,
            )
        except OSError as exc:
            logger.warning("Failed to auto-start Paradee TTS (%s): %s", cmd, exc)
            return False

        deadline = time.monotonic() + max(0.5, wait_seconds)
        while time.monotonic() < deadline:
            if _is_port_open(host, port):
                return True
            if _LAUNCHED_PROC.poll() is not None:
                return False
            time.sleep(0.2)
        return _is_port_open(host, port)


async def list_paradee_voices(base_url: str = DEFAULT_PARADEE_BASE_URL) -> list[dict[str, str]]:
    """Query live Paradee TTS voices when reachable, falling back to its built-in voices."""
    target_base = (base_url or DEFAULT_PARADEE_BASE_URL).rstrip("/")
    parsed = urlsplit(target_base)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or DEFAULT_PARADEE_PORT

    if _is_port_open(host, port):
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{target_base}/audio/voices")
                if resp.status_code == 200:
                    payload = resp.json()
                    raw = payload.get("voices", payload) if isinstance(payload, dict) else payload
                    if isinstance(raw, list) and raw:
                        out: list[dict[str, str]] = []
                        for item in raw:
                            if isinstance(item, str) and item.strip():
                                out.append({"id": item.strip(), "label": item.strip()})
                            elif isinstance(item, dict) and item.get("id"):
                                vid = str(item["id"]).strip()
                                out.append({"id": vid, "label": str(item.get("label") or vid)})
                        if out:
                            return out
        except Exception:
            pass
    return [dict(v) for v in PARADEE_VOICES]


class ParadeeTTSAdapter(OpenAICompatTTSAdapter):
    """Local OpenAI-compatible Paradee TTS adapter with silent on-demand auto-start."""

    async def synthesize(self, text: str, config: TTSConfig) -> tuple[bytes, str]:
        effective = TTSConfig(
            model=config.model or DEFAULT_PARADEE_MODEL,
            provider_name="paradee",
            adapter="paradee",
            auth_style=config.auth_style,
            api_key=config.api_key or "paradee-local",
            base_url=config.base_url or DEFAULT_PARADEE_BASE_URL,
            extra_headers=dict(config.extra_headers),
            voice=config.voice or DEFAULT_PARADEE_VOICE,
            response_format=config.response_format or "wav",
            speed=config.speed,
            language=config.language,
            sample_rate=config.sample_rate,
            instructions=config.instructions,
            max_input_chars=config.max_input_chars,
            request_timeout=config.request_timeout,
        )
        ready = await asyncio.to_thread(ensure_paradee_running, effective.base_url)
        if not ready:
            raise VoiceProviderError(
                f"Paradee TTS is not reachable at {effective.base_url}. "
                "Ensure Paradee TTS is installed under Services/paradee-tts or running on port 8855."
            )
        return await super().synthesize(text, effective)
