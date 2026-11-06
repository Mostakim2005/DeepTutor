# Universal Operating Protocol (`AGENTS.md`)
**MANDATORY FOR ALL AI CODING AGENTS**

## 1. User Profile, Agency & Voice-Dictation Decoder

- **Non-Coder Product Architect:** The user is the architect and decision-maker, not a programmer. Never display raw code diffs or code blocks when explaining plans, previews, or options. Communicate using plain English, Mermaid diagrams, tables, or visual HTML/SVG previews.
- **High-Level Agency:** Operate with autonomous engineering judgment. Rely on high-level intent, architecture, and desired outcomes rather than waiting for micromanaged step-by-step CLI instructions.
- **South Asian Voice-Dictation Input:** Prompts are voice-typed by a South Asian English speaker. Expect phonetic mishearings, nasalized sound substitutions, repeated words, fillers, and fragmented phrasing. Silently ignore fillers and auto-correct likely mishearings from project context.

## 2. Instruction Triage & Numbered Confirmation Gate

Before modifying files, triage the prompt into one of three paths:

- **Path A: Fast Path (Direct Execution):** For small tweaks, clear bug fixes, routine operations, or continuing an approved plan. State a 1-line assumption of intent and execute immediately.
- **Path B: Intent Confirmation Gate (New, Complex, or Ambiguous Tasks):** For new features, multi-step changes, architectural shifts, or ambiguous dictation where a wrong guess wastes work. Do NOT write code yet. Output ONLY a structured Intent Rephrase using numbered/lettered tags so the user can reply easily by voice (e.g., *"1 is yes, for 2 pick B"*):
  - **`[1] Core Goal:`** 1–2 sentences on the intended outcome.
  - **`[2] Clarifications / Options (if needed):`** Concrete choices labeled `[2A]`, `[2B]`, `[2C]` with brief plain-English trade-offs.
  - **`[3] Planned Impact:`** Bullet list of user-visible features or files affected.
  - **Wait:** Stop and wait for approval before executing.
- **Path C: Visual Preview Path (On Request):** When the user asks for an example, preview, or how a change will look. Never preview raw code:
  - **UI/UX Changes:** Generate a self-contained HTML/SVG visual mock or wireframe showing Before vs. After.
  - **Logic/Flow Changes:** Render a Mermaid flowchart of the user or data flow.
  - **File/System Operations:** Present a Before -> After Action Table (Target | Action | Outcome).

## 3. Progressive Search-First Documentation & Visual Dashboard

- **Search-First Discovery (Protect Context):** Never bulk-read the entire documentation folder on startup and never create an `INDEX.md` file. Every documentation section must use a descriptive slug header with natural-language aliases (`### [TYPE: Descriptive-Slug] | Aliases: ...`) followed immediately by a single-line `> **1-Line Summary:**`. Scan headers and 1-line summaries first; read full sections only when relevant to the active task.
- **Function/Symbol Anchors Only:** Never use line numbers as code anchors. Reference file paths paired with exact function, class, or variable names.
- **Template Resolution (GitHub vs. Local Fallback):** Load documentation blueprints from the master `.agent-templates` repository on `https://github.com/Mostakim2005` or the local fallback directory `C:\Users\kazir\.agent-templates\` — always checking both and using whichever exists or has the latest modifications.
- **Core Documentation Suite (`docs/`):**
  - `docs/PRODUCT.md` — Permanent source of truth for user intentions, active feature checklist, and merge wishlist.
  - `docs/ARCHITECTURE.md` — Visual Mermaid diagrams, tech-stack rationale, subsystem mechanics, and extension recipes.
  - `docs/DECISIONS_AND_TRAPS.md` — Architectural pivots (what failed, why we switched, and whether `[DECIDED BY: HUMAN]` or `[DECIDED BY: AGENT]`) plus non-obvious engineering landmines. Never log trivial syntax/type fixes or routine setup steps.
  - `docs/VISUAL_GUIDE.html` — Self-contained interactive browser dashboard rendering project intentions, Mermaid-equivalent diagrams, decisions, and landmines visually.

## 4. Latest-State Sync, GitHub (`Mostakim2005`), Builds & Licensing

- **Latest-State Verification (Local PC vs. GitHub):** The user may make local edits and forget to push, or update GitHub from another session. Before starting work or syncing, always compare the local project workspace (and `C:\Users\kazir\.agent-templates\`) against `https://github.com/Mostakim2005`, treat whichever has the newest changes as the active truth, and reconcile them without overwriting newer local work.
- **This Project's Remotes:** `origin` is the personal fork `https://github.com/Mostakim2005/DeepTutor`; `upstream` is `https://github.com/HKUDS/DeepTutor`. Never push to `upstream`. Sync official releases by merging an upstream tag on a `sync/vX.Y.Z` branch, then fast-forward `main` and push to `origin`.
- **Clean Modular Source Only:** Keep source files modular and single-responsibility. Enforce strict `.gitignore` rules to block dependencies, build outputs, binaries, and secret environment files — never commit heavy binaries or credentials.
- **Tag-Triggered Cloud Builds:** Package desktop builds as **portable artifacts by default** unless an installer is explicitly requested. Use GitHub Actions workflows triggered by version tags to compile and attach releases in the cloud rather than storing builds locally.
- **Licensing & Third-Party Attribution (Project-Specific Exception):** DeepTutor is a fork of Apache-2.0 upstream code, so `LICENSE` **must remain Apache-2.0**; a fork cannot relicense it as PolyForm Noncommercial. Preserve upstream credits in `THIRD_PARTY_NOTICES.md` and keep the upstream citation in `CITATION.cff`. This is the one deliberate exception to the default PolyForm rule.
- **UI/UX & Accessibility:** Maintain clean visual hierarchy, proportional spacing, calibrated color scales, and strict WCAG AA/AAA contrast across both Light and Dark themes without text-contrast inversions.

## 5. Mandatory Post-Change Protocol

After completing any feature, architectural change, or significant fix:

1. **Verify:** Run the project's automated build, type, lint, and verification checks. At minimum: `.venv/Scripts/python.exe -m compileall -q deeptutor deeptutor_cli` and `cd web && npm run typecheck`.
2. **Sync Docs:** Update `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS_AND_TRAPS.md`, and `docs/VISUAL_GUIDE.html` whenever intent, architecture, or traps change.
3. **Commit & Push:** Commit clean source and documentation changes, then push to `origin` (`https://github.com/Mostakim2005/DeepTutor`). Never push to `upstream`.
4. **Report:** Summarize the commit hash/status, plain-English rationale, modified file/function anchors, and verification results.

## 6. Live Preference Capture & Master Sync Protocol

- **Auto-Capture:** Whenever the user states a new recurring workflow rule, preference, or design constraint, append it to **Section 7** below as:
  `- [PREF: Descriptive-Slug | YYYY-MM-DD | Category] Plain-English rule.`
- **Cross-Project Sync & Consolidation:** When instructed, sync new Section 7 entries from local project workspaces back into both `C:\Users\kazir\.agent-templates\AGENTS.md` and the master `.agent-templates` repository on `https://github.com/Mostakim2005`, or deduplicate and promote accumulated Section 7 entries into Sections 1–5.

## 7. Live User Preferences (Auto-Captured)

*(All preferences up to 2026-11-06 have been consolidated into Sections 1–6. Append newly discovered preferences below.)*

---

# Project Context: DeepTutor (v1.7.2)

> **1-Line Summary:** Agent-native tutoring app where CLI, WebSocket, and SDK requests share one durable turn service; this fork adds a browser export engine, extra subagent backends, model pinning, and Windows fixes.

## Architecture in One Paragraph

Entry points (`deeptutor_cli/main.py`, `deeptutor/api/routers/unified_ws.py`, `deeptutor/app/`) submit to `TurnApplicationService` in `deeptutor/app/service.py`. It persists the turn, then `TurnEngine` routes a `UnifiedContext` through `ChatOrchestrator` to one capability in `deeptutor/capabilities/`. Capabilities mount authorized tools from `deeptutor/runtime/registry/`, emit events on a per-turn `StreamBus`, and return through `emit_capability_result`. Runtime settings live in `data/user/settings/`; project-root `.env` files are intentionally ignored.

## Two Plugin Layers

- **Tools (Level 1):** single operations the model selects. `USER_TOGGLEABLE_TOOL_NAMES` in `deeptutor/tools/builtin/__init__.py` is the authoritative toggle list. Context-gated tools are declared by `CONFIGURABLE_BUILTIN_TOOL_NAMES` and mounted through `ToolMountFlags` in `deeptutor/agents/_shared/tool_composition.py`.
- **Capabilities (Level 2):** turn-owning pipelines: `chat`, `ask_questions`, `deep_solve`, `deep_question`, `deep_research`, `visualize`, `math_animator`, `mastery_path`, `immersive_reading`, `video_lesson`.

## Local Customizations (Do Not Regress)

| Area | Where | Why it exists |
| --- | --- | --- |
| Export engine | `web/lib/export/`, `web/features/export/ExportChatModal.tsx` | Seven formats with element toggles, OMML equations, vector PDF, and update resilience. |
| KaTeX hardening | `web/lib/latex-normalize.ts` | Stops cascading parse failures on matrices and multi-line equations. |
| Model preferences | `data/user/settings/model_preferences.json`, `deeptutor/services/subagent/model_preferences.py`, `deeptutor/api/routers/settings.py` | Friendly names, star pinning, hidden-model drawer. |
| Subagents | `deeptutor/services/subagent/` | Command Code, OpenCode, Antigravity, DeepSeek Harness, and per-connection model/effort overrides. |
| Windows launcher | `deeptutor/runtime/launcher.py` | Detached start without console leaks; `CREATE_NO_WINDOW` fallback. |
| CLI apps | `deeptutor/services/cli_apps/` | uv/venv install parity, per-app environments, Windows `.cmd` resolution. |
| Workspaces & skills | `deeptutor/services/workspace/`, `data/user/workspaces/*/skills/` | STEM & Engineering and Polymath & Cognitive, Zettelkasten/LightRAG, Feynman persona. |

## Verification

- Python syntax: `.venv/Scripts/python.exe -m compileall -q deeptutor deeptutor_cli`
- Frontend types: `cd web && npm run typecheck`
- Frontend full gate: `cd web && npm run check:fast`
- Python tests: `.venv/Scripts/python.exe -m pytest -q` (requires `dev` extras; not installed in this checkout)
- Lint: `ruff check .` and `ruff format --check .` (requires `dev` extras)

## Non-Obvious Rules

1. Never resolve a merge by taking upstream wholesale in `web/lib/export/`, `deeptutor/services/subagent/`, or the model-preference routes.
2. `interpreter_path()` and `bin_dir()` must share `_env_bin_dir()`; never inline a venv path again.
3. Windows npm shims live at the prefix root with `.cmd`/`.bat`, not under `bin/`.
4. Never add `.env` loading as a configuration source.
5. Keep `wrapBareEnvironments` idempotent.
6. Keep `LICENSE` as Apache-2.0.
