# Visual Feature & Change Log (`VISUAL_LOG.md`)
> **1-Line Summary:** Obsidian- and GitHub-compatible color-coded Mermaid flowcharts documenting DeepTutor's core architecture, custom fork subsystems, and Wave 1 safety-net upgrades.

---

### [VISUAL: Durable-Turn-Execution-Pipeline] | Aliases: turn engine, chat orchestrator, capabilities, stream bus, core architecture
> **1-Line Summary:** Shows how CLI, WebSocket, and SDK requests flow through one durable turn service, route to a single capability, mount tools, and stream results back.

```mermaid
flowchart TD
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef processNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef outputNode fill:#15803d,stroke:#14532d,color:#ffffff
    classDef trapNode fill:#b91c1c,stroke:#7f1d1d,color:#ffffff

    Entry["Entry Points: CLI, WebSocket, or SDK"]:::startNode -->|"Submit request"| TurnSvc["TurnApplicationService (Persist Turn)"]:::processNode
    TurnSvc -->|"Build UnifiedContext"| TurnEngine["TurnEngine"]:::processNode
    TurnEngine -->|"Route turn"| Orch["ChatOrchestrator"]:::processNode
    Orch -->|"Select 1 of 10 pipelines"| Cap["Capability (chat, deep_solve, deep_research, ...)"]:::processNode
    Cap -->|"Mount authorized tools"| Reg["Tool Registry & ToolMountFlags"]:::processNode
    Cap -->|"Publish live events"| Bus["Per-Turn StreamBus"]:::processNode
    Bus -->|"Finalize turn"| Emit["emit_capability_result -> UI / CLI Output"]:::outputNode
    Settings["data/user/settings/ (User JSON)"]:::outputNode -.->|"Runtime config"| TurnSvc
    DotEnv["Project-root .env (Ignored at Runtime)"]:::trapNode -.->|"Never depend on .env"| TurnSvc

    subgraph Legend["Legend (Color Guide)"]
        L1["Blue = Entry Point / Trigger"]:::startNode
        L2["Teal = Core Processing / Routing"]:::processNode
        L3["Green = Durable Output / User Config"]:::outputNode
        L4["Red = Engineering Trap / Forbidden Path"]:::trapNode
    end
```

* **Plain-English Walkthrough:** Whether a learner starts a turn from the web UI, the CLI, or the SDK, the request lands in `TurnApplicationService`, which saves the turn before execution begins. `TurnEngine` hands a `UnifiedContext` to `ChatOrchestrator`, which picks one turn-owning capability. That capability mounts only the tools allowed by user toggles and context flags, streams progress over `StreamBus`, and closes the turn through `emit_capability_result`. All runtime configuration is read from `data/user/settings/` rather than a project-root `.env` file.
* **Code Anchors (Grep Targets):**
  * `deeptutor_cli/main.py` -> CLI entry points
  * `deeptutor/api/routers/unified_ws.py` -> WebSocket turn entry
  * `deeptutor/app/service.py` -> `TurnApplicationService`
  * `deeptutor/agents/_shared/tool_composition.py` -> `ToolMountFlags`
  * `deeptutor/tools/builtin/__init__.py` -> `USER_TOGGLEABLE_TOOL_NAMES`, `CONFIGURABLE_BUILTIN_TOOL_NAMES`
  * `deeptutor/services/config/runtime_settings.py` -> runtime settings loader

---

### [VISUAL: Multi-Format-Browser-Export-And-Snapshot-Guard] | Aliases: export engine, docx, xlsx, pdf, omml, L-09, export snapshots, deterministic tests
> **1-Line Summary:** Traces browser-side seven-format conversation export and the L-09 deterministic golden snapshot harness that guards future library migrations.

```mermaid
flowchart LR
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef processNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef outputNode fill:#15803d,stroke:#14532d,color:#ffffff
    classDef trapNode fill:#b91c1c,stroke:#7f1d1d,color:#ffffff

    Modal["ExportChatModal (Format, Message & Element Toggles)"]:::startNode -->|"Normalize messages & tables"| Adapter["adapter.ts (normalizeMessages, extractMarkdownTables)"]:::processNode
    Adapter -->|"Dispatch format"| Dispatcher["exporter.ts (exportSession / printPublicationPdf)"]:::processNode
    Dispatcher -->|"Text formats"| TextOut["MD / TXT / HTML / JSON Builders"]:::outputNode
    Dispatcher -->|"Office formats"| OfficeOut["DOCX (OMML + UTC ZIP) & XLSX (UTC ZIP)"]:::outputNode
    Dispatcher -->|"PDF paths"| PdfOut["jsPDF Download (Latin) & Browser Vector Print (All Scripts)"]:::outputNode

    Fixture["L-09 Fixed Fixture (Accents, Code, Table, CJK, Tools, Citations)"]:::startNode -->|"Frozen UTC clock & stubbed locale"| SnapSuite["export-snapshots.spec.ts"]:::processNode
    SnapSuite -->|"Compare text & SHA-256 hashes"| Golden["Golden Snapshots & binary-hashes.json"]:::outputNode
    Drift["Timezone / CreationDate / Table Duplication Drift"]:::trapNode -.->|"Blocked by UTC ZIP & PDF normalizer"| SnapSuite

    subgraph Legend["Legend (Color Guide)"]
        L1["Blue = User Trigger / Test Fixture"]:::startNode
        L2["Teal = Normalization & Verification"]:::processNode
        L3["Green = Verified Export Outputs & Goldens"]:::outputNode
        L4["Red = Non-Determinism / Regression Trap"]:::trapNode
    end
```

* **Plain-English Walkthrough:** Everything exports locally in the browser with no backend document service. `ExportChatModal` passes selected messages and element toggles into `adapter.ts`, which extracts Markdown tables once (preventing duplicate tables) and hands normalized messages to `exporter.ts`. The L-09 snapshot suite runs all seven formats against a fixed multi-element fixture with frozen UTC timestamps, verifying exact text goldens, OMML math accents, CJK preservation, numeric Excel cells, and stable SHA-256 binary hashes before any Wave 3 library migration begins.
* **Code Anchors (Grep Targets):**
  * `web/features/export/ExportChatModal.tsx` -> `ExportChatModal`, `NON_LATIN_SCRIPT`
  * `web/lib/export/adapter.ts` -> `normalizeMessages`, `extractMarkdownTables`
  * `web/lib/export/exporter.ts` -> `exportSession`, `printPublicationPdf`, `assertExportSize`
  * `web/lib/export/zip.ts` -> `getDosDateTime`, `createZipBlob`
  * `web/lib/export/docx-builder.ts` -> `buildDocxBlob`
  * `web/lib/export/xlsx-builder.ts` -> `buildXlsxBlob`
  * `web/lib/export/omml.ts` -> OMML accent and stacked-limit conversion
  * `web/tests/fixtures/export/conversation.fixture.ts` -> `FIXED_EXPORT_DATE`, `EXPORT_FIXTURE_MESSAGES`
  * `web/tests/lib/export-snapshots.spec.ts` -> deterministic golden snapshot assertions

---

### [VISUAL: Subagent-Backends-And-Model-Preferences] | Aliases: subagent, command code, opencode, antigravity, deepseek harness, pin model, hide model
> **1-Line Summary:** Shows how user-owned model preferences customize the picker while subagent backends dispatch turns to external CLI harnesses safely.

```mermaid
flowchart TD
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef processNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef outputNode fill:#15803d,stroke:#14532d,color:#ffffff
    classDef trapNode fill:#b91c1c,stroke:#7f1d1d,color:#ffffff

    Picker["AnswerModeMenu (Pin, Hide, Rename Model)"]:::startNode -->|"POST toggle-pin / toggle-hide"| Router["settings.py REST Routes"]:::processNode
    Router -->|"Locked atomic write + _coerce"| Prefs["model_preferences.py -> data/user/settings/model_preferences.json"]:::outputNode
    Prefs -->|"Enrich catalog order & visibility"| Picker

    Turn["Subagent Consultation Request"]:::startNode -->|"Lookup backend"| SubReg["subagent/registry.py"]:::processNode
    SubReg -->|"Dispatch with model & effort"| Backends["Command Code, OpenCode, Antigravity, DeepSeek Harness, ACP"]:::processNode
    Backends -->|"Non-zero exit -> success=False"| Result["Validated Subagent Result"]:::outputNode
    MergeTrap["Taking Upstream Wholesale in subagent/ or settings.py"]:::trapNode -.->|"Never git checkout --theirs"| SubReg

    subgraph Legend["Legend (Color Guide)"]
        L1["Blue = UI Action / Consultation Trigger"]:::startNode
        L2["Teal = Locked Persistence & Backend Routing"]:::processNode
        L3["Green = Update-Safe User Data & Validated Output"]:::outputNode
        L4["Red = Upstream Merge Regression Trap"]:::trapNode
    end
```

* **Plain-English Walkthrough:** Learners customize model display names, star-pinned favorites, and hidden models directly from `AnswerModeMenu`. Mutations pass through FastAPI routes into `model_preferences.py`, which uses a write lock, shape validation (`_coerce`), and unique temp files to update `data/user/settings/model_preferences.json` safely across upstream updates. Separately, `subagent/registry.py` routes external CLI consultations to Command Code, OpenCode, Antigravity, DeepSeek Harness, or ACP backends and guarantees that non-zero exit codes are always surfaced as failures.
* **Code Anchors (Grep Targets):**
  * `deeptutor/services/subagent/model_preferences.py` -> `load_model_preferences`, `_coerce`, `_WRITE_LOCK`
  * `deeptutor/api/routers/settings.py` -> model-preference toggle endpoints
  * `web/components/chat/home/AnswerModeMenu.tsx` -> `ModelPreferenceActions`
  * `deeptutor/services/subagent/registry.py` -> subagent backend registry
  * `deeptutor/services/subagent/command_code.py` -> `consult`, `_EFFORT_ALIASES`

---

### [VISUAL: Windows-Launcher-And-CLI-Apps-Runtime] | Aliases: windows launcher, CREATE_NO_WINDOW, cli apps, uv, venv, npm cmd, _env_bin_dir
> **1-Line Summary:** Explains how DeepTutor launches detached workers on Windows without console flashes and resolves Python and Node CLI app executables consistently.

```mermaid
flowchart LR
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef processNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef outputNode fill:#15803d,stroke:#14532d,color:#ffffff
    classDef trapNode fill:#b91c1c,stroke:#7f1d1d,color:#ffffff

    Launch["Start DeepTutor Worker"]:::startNode -->|"Use getattr CREATE_NO_WINDOW fallback + close_fds=True"| Launcher["launcher.py (_launch_detached)"]:::processNode
    Launcher -->|"No console flash & no leaked port"| Worker["Clean Detached Background Service"]:::outputNode

    CliInstall["Install / Run Local CLI App"]:::startNode -->|"Resolve Python env"| SharedPath["paths.py (_env_bin_dir -> interpreter_path & bin_dir)"]:::processNode
    SharedPath -->|"uv fast path or stdlib venv"| Installer["installer.py (_steps)"]:::processNode
    CliInstall -->|"Windows Node app"| WinNpm["paths.py (Prefix Root .cmd / .bat Probing)"]:::processNode
    Installer -->|"Install & runtime agree"| RunApp["Executable Found at Runtime"]:::outputNode
    WinNpm -->|"Locate Windows shim"| RunApp

    PathTrap["Inlining venv Scripts/ or Assuming Node bin/ on Windows"]:::trapNode -.->|"Never duplicate path math"| SharedPath

    subgraph Legend["Legend (Color Guide)"]
        L1["Blue = Launch / Install Trigger"]:::startNode
        L2["Teal = Unified Cross-Platform Path & Process Logic"]:::processNode
        L3["Green = Reliable Windows Runtime"]:::outputNode
        L4["Red = Windows Path / Subprocess Landmine"]:::trapNode
    end
```

* **Plain-English Walkthrough:** On Windows, spawning background workers can flash empty terminal windows or leak listening ports if file descriptors stay open, and stripped Python builds can lack `subprocess.CREATE_NO_WINDOW`. `launcher.py` uses a safe `getattr` fallback with `close_fds=True`. For local CLI apps, both Python installation (`installer.py`) and runtime lookup (`paths.py`) share `_env_bin_dir()`, while Windows Node packages probe the npm prefix root for `.cmd` and `.bat` shims instead of POSIX `bin/`.
* **Code Anchors (Grep Targets):**
  * `deeptutor/runtime/launcher.py` -> `_launch_detached`
  * `deeptutor/services/cli_apps/paths.py` -> `_env_bin_dir`, `interpreter_path`, `bin_dir`, `executable_path`
  * `deeptutor/services/cli_apps/installer.py` -> `_steps`

---

### [VISUAL: Wave-1-Locale-Parity-And-Protocol-Alignment] | Aliases: wave 1, hu locale, it locale, i18n check, agents trim, visual log migration
> **1-Line Summary:** Summarizes the Wave 1 sync and protocol cleanup that closed all 49 Hungarian/Italian i18n gaps, established L-09 export goldens, trimmed `AGENTS.md`, and migrated visual docs to Markdown.

```mermaid
flowchart TD
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef processNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef outputNode fill:#15803d,stroke:#14532d,color:#ffffff
    classDef trapNode fill:#b91c1c,stroke:#7f1d1d,color:#ffffff

    W1["Wave 1 Scope on sync/v1.7.3"]:::startNode -->|"Add 49 missing fork keys"| Locales["hu/app.json & it/app.json (100% strict parity)"]:::processNode
    W1 -->|"Freeze ZIP & PDF metadata"| Snap["L-09 Export Snapshot Suite (7 formats)"]:::processNode
    W1 -->|"Strip duplicated global protocol"| Agents["Trimmed Repo-Only AGENTS.md"]:::processNode
    W1 -->|"Replace static HTML guide"| VisLog["docs/VISUAL_LOG.md + DECISIONS_AND_TRAPS.md"]:::processNode

    Locales -->|"Verify"| Gate["Verification Gate: compileall, typecheck, i18n:check, test:unit, check:fast"]:::processNode
    Snap -->|"Verify"| Gate
    Agents -->|"Verify"| Gate
    VisLog -->|"Verify"| Gate
    Gate -->|"All green"| Push["Clean Push to origin sync/v1.7.3 (main untouched)"]:::outputNode
    Guard["Touching main or Pulling upstream/dev"]:::trapNode -.->|"Strictly blocked"| Push

    subgraph Legend["Legend (Color Guide)"]
        L1["Blue = Wave 1 Kickoff"]:::startNode
        L2["Teal = Completed Wave 1 Deliverables & Gates"]:::processNode
        L3["Green = Verified Safe Checkpoint"]:::outputNode
        L4["Red = Branch Guardrail Violation"]:::trapNode
    end
```

* **Plain-English Walkthrough:** Wave 1 establishes a verified safety net on `sync/v1.7.3` before larger Wave 2 (Model & Harness Manager) and Wave 3 (Export Overhaul) refactors begin. Hungarian and Italian catalogs now match English 100% in strict audit mode, all seven export formats have deterministic golden snapshots, root `AGENTS.md` contains only DeepTutor-specific facts, and `docs/VISUAL_GUIDE.html` has been retired in favor of this Markdown-native `docs/VISUAL_LOG.md`.
* **Code Anchors (Grep Targets):**
  * `web/locales/hu/app.json` -> Hungarian fork export and model preference translations
  * `web/locales/it/app.json` -> Italian fork export and model preference translations
  * `web/tests/lib/export-snapshots.spec.ts` -> L-09 snapshot suite
  * `AGENTS.md` -> trimmed repository-specific instructions
  * `docs/VISUAL_LOG.md` -> Markdown-native visual feature and change log
  * `docs/DECISIONS_AND_TRAPS.md` -> `[DECISION: Deterministic-Export-Snapshots-And-Markdown-Visual-Log]`
