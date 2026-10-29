# DeepTutor Feature Map (Level 2-3)

| Feature | Description | Relevant Source File(s) | Anchors |
| :--- | :--- | :--- | :--- |
| **Windows Desktop Scripts** | Single-click start, stop, and configure AI scripts with fallback path detection | `start.bat`, `stop.bat`, `configure-ai.bat` | Root & Desktop shortcuts |
| **Model Catalog Configuration** | Service slot routing for LLM, Task, Embedding, Search, TTS, STT, Imagegen | `scripts/configure_ai.py`, `data/user/settings/model_catalog.json` | `configure_ai()` |
| **Windows Detached Process Launcher** | Spawns background server workers on Windows without console handle leaks | `deeptutor/runtime/launcher.py` | `_python_interpreter()`, lines 45-65 |
| **Gemini Thinking Parameter Handling** | Normalizes reasoning effort across Gemini models to avoid HTTP 400 on newer releases | `deeptutor/services/llm/reasoning_params.py` | `_MINIMAL_NOT_OFF_PATTERNS`, lines 47-50 |
