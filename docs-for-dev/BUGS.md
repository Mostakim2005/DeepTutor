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
- **Symptom**: `deeptutor doctor --online` returned `[gemini] Error: Thinking level MINIMAL is not supported for this model. Please retry with other thinking level.`
- **RCA**: `_MINIMAL_NOT_OFF_PATTERNS` in `deeptutor/services/llm/reasoning_params.py` matched all `gemini-3` models and forced `minimal`. While older Gemini previews accepted `minimal`, `gemini-3.8-flash` supports standard `none`/`low`/`medium`/`high` levels and rejects `minimal`.
- **Resolution**: Scoped `_MINIMAL_NOT_OFF_PATTERNS["gemini"]` to `("gemini-2.5-pro",)` so `gemini-3.8-flash` sends standard `reasoning_effort="none"` without error.
