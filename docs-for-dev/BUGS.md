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

### BUG-006: InferX DeepSeek Flash Endpoint 429 Replica Capacity Failure
- **Symptom**: Queries sent to InferX failed with `HTTPError: 429 service failure: endpoint deepseek-v4.1-flash-1017-basic all replicas at capacity`.
- **RCA**: The catalog profile only registered the `-basic` suffix endpoint (`deepseek-v4.1-flash-1017-basic`), which is oversubscribed on InferX. Standard non-basic endpoints (`deepseek-v4.1-flash-1017`, `deepseek-v4.1-flash`, `deepseek-v4-flash-0731`) accept the exact same API key with zero capacity rejections.
- **Resolution**: Updated `model_catalog.json` to register `deepseek-v4.1-flash-1017`, `deepseek-v4.1-flash`, and `deepseek-v4-flash-0731` under provider profile `inferx`, defaulting traffic to `deepseek-v4.1-flash-1017`.

### BUG-007: Subagent Backend `NameError: name 'BackendModel' is not defined`
- **Symptom**: Enumerating subagent options via `/api/subagents/options` crashed with `NameError: name 'BackendModel' is not defined` at `deeptutor/services/subagent/models.py:260`.
- **RCA**: `_antigravity_options()` instantiated `BackendModel` instead of the imported `ModelOption` dataclass.
- **Resolution**: Replaced `BackendModel(name=name, label=label)` with `ModelOption(slug=name, display_name=label)` in `deeptutor/services/subagent/models.py`.

### BUG-008: DeepSeek Harness CLI (`dsh`) Not Discovered on Windows
- **Symptom**: DeepSeek Harness backend failed detection with `dsh CLI / Python SDK not found` despite the desktop application being installed.
- **RCA**: DeepSeek Harness installs `dsh.cmd` at `%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\cli\bin`, but the Windows installer does not add this path to user PATH by default. Furthermore, running server processes cannot read user PATH changes dynamically.
- **Resolution**: Added the DeepSeek Harness runtime binary directory to Windows User `PATH` and added fallback search paths in `deeptutor/services/subagent/process.py` (`resolve_cli_command()`) for Windows.

### BUG-009: DeepSeek Harness Headless Mode Missing Credentials & Routing
- **Symptom**: Executing `dsh --profile headless` returned `MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"`.
- **RCA**: Headless profile in DeepSeek Harness disables the local credentials extension (`@deepseek-ai/dsh-credentials-local`) by default and had an empty `cordis.patch.yml`.
- **Resolution**: Configured `~/.dsh/profiles/headless/cordis.patch.yml` to re-enable local credentials (`disabled: false`) and routed default models to `inferx` / `deepseek-v4.1-flash-1017`.

### BUG-010: Google AI Studio Quota Exhaustion & Timeouts on Gemini 4 Argon / 3.8 Flash
- **Symptom**: Calling Gemini models via Google AI Studio free tier key consistently timed out on `gemini-3.8-flash` or failed with HTTP 429 (`You exceeded your current quota`) on `gemini-4-argon`.
- **RCA**: Free tier Google AI Studio accounts allocate zero quota for `gemini-4-argon` and experience frequent server-side timeouts on `gemini-3.8-flash`, while `gemini-3.6-flash` and `gemini-3.5-flash` succeed reliably with HTTP 200.
- **Resolution**: Pruned `gemini-4-argon` and `gemini-3.8-flash` from DeepTutor's `llm-profile-gemini-main` catalog, retaining `gemini-3.6-flash` as the active default alongside `gemini-3.5-flash`.

### BUG-011: Command Code CLI Exits with Code 1 on Unminted Synthetic Session ID
- **Symptom**: Selecting Command-Code (Go Plan) in Handoff / Subagent mode failed with `cmdc exited with code 1`.
- **RCA**: DeepTutor passed an unminted synthetic session ID (`dt-...`) via `--session <id>`. Command Code (`cmdc`) strictly validates that `--session <id>` matches an existing session transcript in `~/.commandcode/projects`. If the session does not exist on disk, `cmdc` aborts with `Error: --session "<id>" is neither an existing .jsonl transcript nor a known session-id prefix`.
- **Resolution**: Added `_session_exists()` helper in `deeptutor/services/subagent/command_code.py` to inspect `~/.commandcode/projects`. Only pass `--session <id>` if the session already exists on disk; allow initial turns to start cleanly and mint valid session IDs.

### BUG-012: OpenCode v2.2.5 Route Migration (405 Method Not Allowed) and Default Paid Model (402)
- **Symptom**: Selecting OpenCode in Handoff / Subagent mode failed with `Client error '405 Method Not Allowed' for url 'http://127.0.0.1:.../session'`.
- **RCA**: OpenCode Desktop v2.2.5 moved REST endpoints under `/api/` (`/api/session`, `/api/event`, `/api/session/{sid}/prompt`), while root paths serve web UI assets. Additionally, OpenCode defaults newly minted sessions to `particle-ai/particle-1` on the `kilo` provider, which returns HTTP 402 unless the session model is explicitly configured.
- **Resolution**: Updated `deeptutor/services/subagent/opencode_family.py` to target `/api/session`, `/api/event`, and `/api/session/{sid}/prompt`. Added `_configure_session_model()` to configure the session model (e.g. `openrouter/openrouter/free`) via `POST /api/session/{sid}/model`.

### BUG-013: Command Code `Unknown effort "medium"` CLI Rejection
- **Symptom**: Selecting Command-Code in Handoff / Subagent mode failed with `cmdc exited with code 1`.
- **RCA**: DeepTutor's subagent configuration injected `"effort": "medium"`, but Command Code CLI strictly validates `--effort` and only supports `[off, low, high, max]`. When given `--effort medium`, `cmdc` printed `Unknown effort "medium". Supported: off, low, high, max.` and exited with code 1. Furthermore, `_session_exists` matched any file containing the UUID (including checkpoints and metadata) rather than an existing `.jsonl` transcript.
- **Resolution**: Added effort normalization in `command_code.py` to map `"medium"` / `"default"` to `"high"` and `"none"` / `"minimal"` to `"off"`, updated `_COMMAND_CODE_EFFORTS` in `models.py`, attached `stderr` lines to `result.error` for diagnostic transparency, and verified `.jsonl` transcript existence in `_session_exists`.

### BUG-014: Handoff Capability Ignored Knowledge Base Subagent Model & Effort Overrides
- **Symptom**: Selecting specific subagent models in the Preferences dropdown always routed to the global backend model rather than the selected option.
- **RCA**: `_subagent()` in `deeptutor/capabilities/handoff/capability.py` loaded `config = settings.backend(kind)` without overriding `model` and `effort` from the resolved KB metadata.
- **Resolution**: Updated `_subagent()` to apply `meta.get("model")` and `meta.get("effort")` onto the effective `BackendConfig`, enabled `variant` payload support in `opencode_family.py` for models supporting reasoning variants, and added dedicated KB entries for OpenCode and Command Code models.

### BUG-015: Subagent CLI/API Rejection on Models Without Reasoning Effort
- **Symptom**: Calling models without adjustable reasoning effort (e.g. `xiaomi/mimo-v2.6-pro` via Command Code or `opencode/mimo-v2.6-flash-free` via OpenCode) when effort was configured failed with exit code 1 (`MiMo V2.6 Pro has no adjustable reasoning effort.`) or HTTP 400 (`Variant unavailable`).
- **RCA**: Different providers enforce strict rejection rather than ignoring unneeded reasoning parameters: `cmdc` aborts with non-zero exit code if `--effort` is passed to models lacking adjustable reasoning, and OpenCode returns 400 when an invalid `variant` is specified.
- **Resolution**: Added universal automatic reasoning effort fallback in `command_code.py` (catching effort rejection in stderr and immediately retrying with `effort=""`) and in `opencode_family.py` (retrying session model configuration without `variant` when rejected).

### BUG-016: Conversation Export Stripped Thinking Traces, Multi-Sheet Tables, and Formats
- **Symptom**: Clicking "Export chat" in DeepTutor only exported flat Markdown via `downloadChatMarkdown()`, stripping reasoning/thinking traces, citations, artifacts, and multi-sheet table representations with zero support for Word (.docx), Excel (.xlsx), HTML, or PDF.
- **RCA**: `web/lib/chat-export.ts` was a barebones 90-line string serializer lacking an intermediate representation, AST parser, and Office Open XML / PDF document generators.
- **Resolution**: Implemented an update-resilient multi-format export framework under `web/lib/export/` (DOCX with OMML math equations, XLSX with auto-extracted table sheets, self-contained HTML with KaTeX, vector PDF via jsPDF, Markdown, JSON, Text) and an accessible React modal (`ExportChatModal`) with granular element toggles, exposed across all workspaces in both the chat header and the sidebar session list.
