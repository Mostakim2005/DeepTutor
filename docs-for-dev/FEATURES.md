# DeepTutor Feature Map (Level 2-3)

| Feature | Description | Relevant Source File(s) | Anchors |
| :--- | :--- | :--- | :--- |
| **Windows Desktop Scripts** | Single-click start, stop, and configure AI scripts with fallback path detection | `start.bat`, `stop.bat`, `configure-ai.bat` | Root & Desktop shortcuts |
| **Model Catalog Configuration** | Service slot routing for LLM, Task, Embedding, Search, TTS, STT, Imagegen | `scripts/configure_ai.py`, `data/user/settings/model_catalog.json` | `configure_ai()` |
| **Windows Detached Process Launcher** | Spawns background server workers on Windows without console handle leaks | `deeptutor/runtime/launcher.py` | `_python_interpreter()`, lines 45-65 |
| **Gemini Thinking Parameter Handling** | Normalizes reasoning effort across Gemini models to avoid HTTP 400 on newer releases | `deeptutor/services/llm/reasoning_params.py` | `_MINIMAL_NOT_OFF_PATTERNS`, lines 47-50 |
| **STEM & EE Capability Tuning** | Tuned Deep Solve iteration rounds (16) and temperature (0.2) for engineering circuit analysis | `data/user/settings/main.yaml`, `data/user/settings/agents.yaml` | `capabilities.solve` |
| **Subagent Model & Effort Overrides** | Enables per-connection model and reasoning-effort bindings for instant one-click switching in the chat composer | `deeptutor/capabilities/subagent/binding.py`, `deeptutor/capabilities/subagent/capability.py` | `connection_for_turn()`, `_effective_config()` |
| **Antigravity CLI Subagent Model Catalog** | Exposes live Antigravity CLI models (Argon, Opus, Sonnet, Flash) with their respective effort tiers | `deeptutor/services/subagent/models.py` | `_ANTIGRAVITY_MODELS`, lines 60-75 |
| **ModelSelector Friendly Name & Reasoning Badges** | Renders human-friendly model labels and pill badges for reasoning effort (`high`, `medium`, `low`) in chat composer | `web/components/chat/home/ModelSelector.tsx` | `ModelOptionRow()`, lines 43, 78-82 |
