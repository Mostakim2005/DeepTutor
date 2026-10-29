# DeepTutor Defect & Resolution Log (Level 2-3)

### BUG-001: Windows Pip Entrypoint Stub `deeptutor.exe -m`
- **Symptom**: `deeptutor start` spawned `[sys.executable, "-m", "deeptutor_cli.main", "serve"]`, throwing `Error: No such option: -m`.
- **RCA**: On Windows, when installed in a virtualenv, `sys.executable` points to `deeptutor.exe`, which does not accept python flag `-m`.
- **Resolution**: Added `_python_interpreter()` helper in `deeptutor/runtime/launcher.py` to resolve the actual `python.exe` binary in the virtualenv.

### BUG-002: Windows Detached Process File Handle Inheritance
- **Symptom**: `subprocess.Popen` in `launcher.py` failed with handle inheritance error when backgrounding worker processes with `DETACHED_PROCESS` and `close_fds=True`.
- **RCA**: Windows does not allow `close_fds=True` alongside handle redirection to log files in detached process mode.
- **Resolution**: Set `close_fds = sys.platform != "win32"` and used `CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW` flags on Windows.

### BUG-003: Gemini 3.8 Flash Rejected `reasoning_effort="minimal"` with HTTP 400
- **Symptom**: `deeptutor doctor --online` and chat messages returned `[gemini] Error code: 400 - Thinking level MINIMAL is not supported for this model. Please retry with other thinking level.`
- **RCA**: `_MINIMAL_NOT_OFF_PATTERNS` in `deeptutor/services/llm/reasoning_params.py` and `supported_reasoning_efforts` in `deeptutor/services/model_selection/reasoning.py` injected `"minimal"` as the primary default choice for `gemini-3` models. Modern Gemini 3.8 Flash rejects `minimal` with HTTP 400.
- **Resolution**:
  1. Updated `supported_reasoning_efforts` in `reasoning.py` so `gemini-3` exposes `["none", "low", "medium", "high"]` rather than `minimal`.
  2. Added normalization in `reasoning_params.py` to automatically coerce any incoming `minimal` / `minimum` request to `none` on the Gemini wire.

### BUG-004: Stale Unauthenticated `gpt-4o` Entry in Codex Catalog
- **Symptom**: Attempting to use `gpt-4o` under Codex failed because OpenAI Codex OAuth only provides access to `GPT-5.6-Terra`, `GPT-5.6-Luna`, and `GPT-6-Luna`.
- **RCA**: A placeholder `llm-profile-agent-setup` profile generated during non-interactive init remained in `model_catalog.json`.
- **Resolution**: Removed the obsolete profile from `model_catalog.json`.

### BUG-005: Windows CLI App Venv Creation & `_clean_env` Environment Stripping
- **Symptom**: Installing CLI apps from the catalog on Windows failed with `ensurepip` error and `error: Git operation failed. cause: Git executable not found`.
- **RCA**: `_steps` in `installer.py` hardcoded `bin/python` (which is `Scripts/python.exe` on Windows), and `_clean_env` stripped `SystemRoot`, `PATHEXT`, and `COMSPEC`, breaking Windows subprocess invocation of `git.exe`.
- **Resolution**: Updated `_steps` and `bin_dir`/`executable_path` to handle Windows `Scripts` and file extensions, preserved Windows system environment variables, and enabled `uv` acceleration for rapid venv creation and package installation.
