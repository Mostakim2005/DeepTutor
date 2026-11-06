# Product Intent & Feature Map (`PRODUCT.md`)
> **1-Line Summary:** The permanent source of truth for what this DeepTutor fork must do and feel like, independent of how the code currently implements it.

## 1. Core Vision & User Experience Intent

* **What This App Does (Plain English):** DeepTutor is a lifelong, personalized tutoring companion. It answers questions, solves problems, researches topics, reads documents and media with the learner, builds mastery paths, and produces lessons, visualizations, and study artifacts — all inside durable workspaces that remember the learner.
* **How It Must Feel to Use:** Fast and calm on a local Windows machine. Every turn survives a restart. The interface stays readable in light and dark themes, with clear hierarchy and no contrast inversions. Nothing the learner installed or configured may disappear because upstream shipped an update.
* **Non-Negotiable Constraint:** This is a long-lived personal fork of `HKUDS/DeepTutor`. Upstream features are welcome; local customizations are never sacrificed to obtain them.

## 2. Active Features (Do Not Break)

### [FEATURE: Agent-Native Turn Pipeline] | Aliases: durable turns, replay, session recovery, turn engine, application service
> **1-Line Summary:** CLI, WebSocket, and SDK requests all pass through one durable service that persists, replays, and recovers every turn.
* **User Intention (Non-Negotiable):** A reply must not vanish because a browser tab closed or a process restarted. Reconnecting resumes the same turn instead of starting a new one.
* **Visual / UI Behavior:** Streaming text, tool activity, and status events appear incrementally; reconnecting replays the same events without duplication.
* **Code Anchors (Grep Targets):**
  * `deeptutor/app/service.py` -> `TurnApplicationService`
  * `deeptutor/runtime/turn_engine.py` -> `TurnEngine`
  * `deeptutor/runtime/orchestrator.py` -> `ChatOrchestrator`
  * `deeptutor/runtime/stream_bus.py` -> `StreamBus`
  * `deeptutor/core/context.py` -> `UnifiedContext`

### [FEATURE: Capability Suite] | Aliases: chat, deep solve, deep research, visualize, mastery path, reading, video lesson, math animator
> **1-Line Summary:** Ten turn-owning capabilities cover conversation, questioning, solving, research, visuals, mastery learning, immersive reading, and narrated video lessons.
* **User Intention (Non-Negotiable):** Each capability keeps its own multi-stage behavior and emits the common result envelope, including cost data.
* **Visual / UI Behavior:** The composer selects a capability; its stage progress is shown in the chat timeline, and results render in the matching workspace.
* **Code Anchors (Grep Targets):**
  * `deeptutor/capabilities/solve/capability.py` -> `SolveCapability`
  * `deeptutor/capabilities/mastery/capability.py` -> `MasteryCapability`
  * `deeptutor/capabilities/reading/capability.py` -> `ReadingCapability`
  * `deeptutor/agents/_shared/capability_result.py` -> `emit_capability_result`

### [FEATURE: Tool Registry & Context Gating] | Aliases: tools, web search, paper search, reason, brainstorm, image generation
> **1-Line Summary:** The model may call eight user-toggleable tools, while sensitive or workspace tools mount only when the context authorizes them.
* **User Intention (Non-Negotiable):** Turning a tool off in settings must actually remove it. A capability must not gain a tool it was not granted.
* **Visual / UI Behavior:** `/settings/tools` lists the toggleable tools; unavailable tools stay out of the composer and out of model prompts.
* **Code Anchors (Grep Targets):**
  * `deeptutor/tools/builtin/__init__.py` -> `USER_TOGGLEABLE_TOOL_NAMES`, `CONFIGURABLE_BUILTIN_TOOL_NAMES`
  * `deeptutor/agents/_shared/tool_composition.py` -> `ToolMountFlags`

### [FEATURE: Multi-Format Export Engine] | Aliases: export, download chat, Word, Excel, PDF, HTML, Markdown, JSON, text
> **1-Line Summary:** Any conversation can be exported to seven formats with per-element and per-message selection, entirely in the browser.
* **User Intention (Non-Negotiable):** Export must survive upstream updates, include native equations and real tables, and never require a server round trip or an API key.
* **Visual / UI Behavior:** The Export action opens a modal with message range, role filters, element toggles, and a live preview; the same action is available from the chat header and the session list.
* **Code Anchors (Grep Targets):**
  * `web/features/export/ExportChatModal.tsx` -> `ExportChatModal`
  * `web/lib/export/exporter.ts` -> `exportSession`
  * `web/lib/export/docx-builder.ts` -> `buildDocx`, `wordTable`
  * `web/lib/export/xlsx-builder.ts` -> Excel workbook builder
  * `web/lib/export/html-builder.ts` -> `buildPublicationHtml`
  * `web/lib/export/pdf-builder.ts` -> `buildPdf`
  * `web/lib/export/markdown-builder.ts` -> `buildMarkdown`

### [FEATURE: Publication Vector PDF & LaTeX Hardening] | Aliases: print PDF, vector export, KaTeX errors, matrix formulas, equation systems
> **1-Line Summary:** A browser print engine produces paginated, searchable vector PDFs, and a delimiter-safe normalizer stops cascading KaTeX failures on matrices and multi-line equations.
* **User Intention (Non-Negotiable):** Exported math must look correct. A malformed delimiter must not swallow every following formula in the message.
* **Visual / UI Behavior:** PDF export offers true pagination, page numbers, and selectable Unicode text instead of a screenshot.
* **Code Anchors (Grep Targets):**
  * `web/lib/export/exporter.ts` -> `printPublicationPdf`
  * `web/lib/latex-normalize.ts` -> `wrapBareEnvironments`
  * `web/lib/latex.ts` -> LaTeX rendering entry

### [FEATURE: Model Preferences, Pinning & Hiding] | Aliases: star model, hide model, model catalog, friendly names, model picker
> **1-Line Summary:** The model picker shows human-friendly names, lets the learner star favorites to the top, and hides unused models in a collapsible drawer.
* **User Intention (Non-Negotiable):** Preferences are human-editable, persist across restarts and upstream updates, and never require editing source code.
* **Visual / UI Behavior:** A glowing star pins a model; an eye toggle hides it; hidden models remain reachable under a "hidden" drawer.
* **Code Anchors (Grep Targets):**
  * `data/user/settings/model_preferences.json` -> preference source of truth
  * `deeptutor/services/subagent/model_preferences.py` -> `load_model_preferences`
  * `deeptutor/api/routers/settings.py` -> `/model-preferences`, `/toggle-pin`, `/toggle-hide`
  * `web/components/chat/home/AnswerModeMenu.tsx` -> `ModelPreferenceActions`

### [FEATURE: Subagent Backends] | Aliases: Command Code, OpenCode, Antigravity, DeepSeek Harness, Codex, Claude Code, Kimi, Grok
> **1-Line Summary:** External coding agents run as first-class subagents with per-connection model and reasoning-effort overrides.
* **User Intention (Non-Negotiable):** Each backend keeps its own transport and session rules; model and effort choices made in the composer must reach the backend exactly.
* **Visual / UI Behavior:** The composer lists available subagents and their model tiers; a run streams its transcript into the chat.
* **Code Anchors (Grep Targets):**
  * `deeptutor/services/subagent/registry.py` -> backend registration
  * `deeptutor/services/subagent/command_code.py` -> `CommandCodeBackend`
  * `deeptutor/services/subagent/opencode_family.py` -> `OpencodeFamilyBackend`
  * `deeptutor/services/subagent/deepseek_harness.py` -> DeepSeek Harness backend
  * `deeptutor/capabilities/subagent/binding.py` -> `connection_for_turn`

### [FEATURE: Windows Detached Launcher] | Aliases: start server, background worker, hidden console, CREATE_NO_WINDOW, launcher
> **1-Line Summary:** The Windows launcher starts backend and frontend as detached processes without leaking or flashing console windows.
* **User Intention (Non-Negotiable):** Starting the app must not leave a visible console, and the detached worker must be stoppable through its recorded state.
* **Visual / UI Behavior:** The desktop/CLI start command returns immediately; logs are written to the runtime home and the app opens in the browser or Electron shell.
* **Code Anchors (Grep Targets):**
  * `deeptutor/runtime/launcher.py` -> `_launch_detached`, `_spawn`, `DETACHED_WORKER_ENV`
  * `deeptutor/runtime/launcher.py` -> `CREATE_NO_WINDOW` fallback

### [FEATURE: CLI Apps Runtime] | Aliases: Blender, Calibre, ChromaDB, local tools, uv, venv, npm prefix
> **1-Line Summary:** Catalogued command-line apps install into isolated per-app environments and are executed by the sandbox with the correct Windows paths.
* **User Intention (Non-Negotiable):** An app installed with `uv` or with the stdlib `venv` must resolve to the same interpreter and entry point. Windows `.cmd` shims must be found.
* **Visual / UI Behavior:** Settings shows install progress and logs; installed apps appear as callable tools.
* **Code Anchors (Grep Targets):**
  * `deeptutor/services/cli_apps/installer.py` -> `_steps`
  * `deeptutor/services/cli_apps/paths.py` -> `interpreter_path`, `bin_dir`, `executable_path`

### [FEATURE: Dual Learning Workspaces] | Aliases: STEM and Engineering, Polymath and Cognitive, Zettelkasten, LightRAG, knowledge graph
> **1-Line Summary:** Two purpose-built workspaces share settings, subagents, skills, and an Obsidian vault, with local LightRAG graph retrieval available to both.
* **User Intention (Non-Negotiable):** Workspace-specific skills and knowledge stay scoped to their workspace; the shared vault remains readable through wikilinks.
* **Visual / UI Behavior:** The workspace switcher lists both environments; each shows its own skills, knowledge bases, and recent sessions.
* **Code Anchors (Grep Targets):**
  * `deeptutor/services/workspace/catalog.py` -> workspace catalog
  * `deeptutor/services/workspace/resources.py` -> workspace resources
  * `deeptutor/capabilities/obsidian/capability.py` -> Obsidian capability

### [FEATURE: Learning Skills & Personas] | Aliases: EduHub, Khan tutor, Feynman, layman persona, study planner, quiz generator
> **1-Line Summary:** Imported STEM and active-learning skills plus a Feynman-style layman persona shape how the tutor explains and tests understanding.
* **User Intention (Non-Negotiable):** Skills are plain files the learner can inspect, edit, and move between workspaces.
* **Visual / UI Behavior:** Skills appear in the workspace skill list; the layman persona is selectable wherever personas are offered.
* **Code Anchors (Grep Targets):**
  * `data/user/workspaces/*/skills/` -> installed skill files
  * `data/user/workspace/personas/layman/PERSONA.md` -> layman persona definition

### [FEATURE: Upstream Sync Without Regression] | Aliases: fork, merge upstream, v1.7.2, origin, upstream remote
> **1-Line Summary:** The fork keeps a clean `upstream` remote and merges official releases on a dedicated branch so local commits remain intact and reviewable.
* **User Intention (Non-Negotiable):** A future upstream release must be installable with a merge, not a re-implementation. Local behavior wins every collision until the human decides otherwise.
* **Visual / UI Behavior:** Not user-facing; it protects every feature above across releases.
* **Code Anchors (Grep Targets):**
  * `.git/config` -> `origin` (fork), `upstream` (HKUDS)
  * `deeptutor/runtime/launcher.py` -> Windows conflict hotspot
  * `deeptutor/services/cli_apps/paths.py` -> Windows path conflict hotspot

## 3. Planned Features & App-Merge Wishlist

### [WISHLIST: Guided Upstream Intake] | Aliases: update assistant, release diff, feature picker, merge helper
> **1-Line Summary:** A repeatable checklist that diffs a new upstream tag, classifies commits by subsystem, and flags likely collisions before merging.
* **User Intention:** Make each future DeepTutor release a predictable, reviewable operation instead of a manual archaeology exercise.
* **Target Integration Point:** `docs/ARCHITECTURE.md` recipes and the `upstream` remote workflow.

### [WISHLIST: Export Presets] | Aliases: export templates, saved export settings, publication profile
> **1-Line Summary:** Save named combinations of format, element toggles, and message scope for recurring export styles.
* **User Intention:** Avoid re-selecting the same export options for every study document.
* **Target Integration Point:** `web/features/export/ExportChatModal.tsx` and `web/lib/export/types.ts`.

### [WISHLIST: Release Automation] | Aliases: portable exe, tagged builds, CI release
> **1-Line Summary:** Tag-triggered builds that attach portable Windows and macOS artifacts instead of storing binaries in the repository.
* **User Intention:** Ship the fork's desktop build without committing build outputs.
* **Target Integration Point:** `.github/workflows/` and `apps/desktop/`.
