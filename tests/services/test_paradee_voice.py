from __future__ import annotations

import asyncio

from deeptutor.services.config.provider_runtime import TTS_PROVIDERS
from deeptutor.services.voice.adapters import get_tts_adapter
from deeptutor.services.voice.adapters import paradee as paradee_mod
from deeptutor.services.voice.config import TTSConfig
from deeptutor.services.voice.options import speech_options


def test_paradee_provider_and_adapter_registered() -> None:
    assert "paradee" in TTS_PROVIDERS
    spec = TTS_PROVIDERS["paradee"]
    assert spec.adapter == "paradee"
    assert spec.default_voice == "af_heart"
    assert spec.is_local is True
    assert isinstance(get_tts_adapter("paradee"), paradee_mod.ParadeeTTSAdapter)


def test_paradee_speech_options_include_defaults() -> None:
    opts = speech_options("tts", "paradee")
    assert opts["models"]
    model = opts["models"][0]
    assert model["id"] == "paradee-tts"
    voice_ids = [v["id"] for v in model["voices"]]
    assert {"af_heart", "am_puck", "bf_isabella", "bm_fable"}.issubset(set(voice_ids))


def test_paradee_ensure_running_fast_path_when_port_open(monkeypatch) -> None:
    monkeypatch.setattr(paradee_mod, "_is_port_open", lambda host, port, timeout=0.25: True)
    assert paradee_mod.ensure_paradee_running("http://127.0.0.1:8855/v1") is True


def test_paradee_list_voices_fallback_offline(monkeypatch) -> None:
    monkeypatch.setattr(paradee_mod, "_is_port_open", lambda host, port, timeout=0.25: False)
    voices = asyncio.run(paradee_mod.list_paradee_voices("http://127.0.0.1:8855/v1"))
    assert [v["id"] for v in voices] == ["af_heart", "am_puck", "bf_isabella", "bm_fable"]


def test_paradee_adapter_synthesizes_when_ready(monkeypatch) -> None:
    monkeypatch.setattr(paradee_mod, "ensure_paradee_running", lambda base_url, wait_seconds=8.0: True)

    async def fake_super_synthesize(self, text: str, config: TTSConfig) -> tuple[bytes, str]:
        assert config.base_url == paradee_mod.DEFAULT_PARADEE_BASE_URL
        assert config.voice == "af_heart"
        return b"RIFF....WAVE", "audio/wav"

    monkeypatch.setattr(paradee_mod.OpenAICompatTTSAdapter, "synthesize", fake_super_synthesize)
    adapter = paradee_mod.ParadeeTTSAdapter()
    audio, mime = asyncio.run(adapter.synthesize("Hello world", TTSConfig(model="paradee-tts", provider_name="paradee")))
    assert audio.startswith(b"RIFF")
    assert mime == "audio/wav"
