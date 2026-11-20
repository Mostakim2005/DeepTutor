# Project Operating Instructions (`AGENTS.md`)

> **1-Line Summary:** Repository-specific instructions for the DeepTutor personal fork (`v1.7.3`); inherits all universal workflow, confirmation-gate, documentation, and reporting rules from the global master `AGENTS.md` (`C:\Users\kazir\.agent-templates\AGENTS.md` / `https://github.com/Mostakim2005/.agent-templates`).

---

## 1. Project Identity, Tech Stack & Environment

- **Project:** DeepTutor Personal Fork (`v1.7.3`) — agent-native tutoring app where CLI, WebSocket, and SDK requests share one durable turn service; this fork adds a browser export engine, extra subagent backends, model pinning/hiding, and Windows launcher/CLI-app fixes.
- **Tech Stack:**
  - **Backend / CLI:** Python 3.12–3.14 (`.venv`), FastAPI (`deeptutor/api/`), Typer (`deeptutor_cli/`).
  - **Frontend:** Next.js 16 / React 19 / TypeScript (`web/`), Vitest unit tests, Playwright E2E.
  - **Desktop Wrapper:** Electron (`apps/desktop/`), Windows x64 primary target.
- **Runtime Configuration:** Runtime settings live in user-owned JSON under `data/user/settings/`; project-root `.env` files are intentionally ignored.

---

## 2. Remotes, Branching Guardrails & Licensing Exception

- **Git Remotes:**
  - `origin`: `https://github.com/Mostakim2005/DeepTutor` (personal fork — push here).
  - `upstream`: `https://github.com/HKUDS/DeepTutor` (official upstream — strictly pull-only; **never** push to `upstream`).
- **Upstream Sync Workflow:** Merge official release tags onto a dedicated `sync/vX.Y.Z` branch, verify all gates, and only fast-forward `main` when explicitly confirmed by the user. Never pull `upstream/dev` unless explicitly instructed.
- **Licensing & Attribution (Deliberate Exception to Default PolyForm Rule):** DeepTutor is a fork of Apache-2.0 upstream code, so `LICENSE` **must remain Apache-2.0** (a fork cannot relicense upstream Apache-2.0 code as PolyForm Noncommercial). Preserve upstream credits in `THIRD_PARTY_NOTICES.md` and keep the upstream citation in `CITATION.cff`.

---

## 3. Architecture in One Paragraph & Two Plugin Layers

Entry points (`deeptutor_cli/main.py`, `deeptutor/api/routers/unified_ws.py`, `deeptutor/app/`) submit to `TurnApplicationService` in `deeptutor/app/service.py`. It persists the turn, then `TurnEngine` routes a `UnifiedContext` through `ChatOrchestrator` to one capability in `deeptutor/capabilities/`. Capabilities mount authorized tools from `deeptutor/runtime/registry/`, emit events on a per-turn `StreamBus`, and return through `emit_capability_result`.

- **Tools (Level 1):** Single operations the model selects. `USER_TOGGLEABLE_TOOL_NAMES` in `deeptutor/tools/builtin/__init__.py` is the authoritative toggle list. Context-gated tools are declared by `CONFIGURABLE_BUILTIN_TOOL_NAMES` and mounted through `ToolMountFlags` in `deeptutor/agents/_shared/tool_composition.py`.
- **Capabilities (Level 2):** Turn-owning pipelines: `chat`, `ask_questions`, `deep_solve`, `deep_question`, `deep_research`, `visualize`, `math_animator`, `mastery_path`, `immersive_reading`, `video_lesson`.

---

## 4. Repository Directory Layout

- `deeptutor/` — Python backend, turn engine, capabilities, runtime launcher, subagent backends, and CLI-app manager.
- `deeptutor_cli/` — Typer CLI entry points.
- `web/` — Next.js 16 / React 19 frontend, locales (`web/locales/`), browser export engine (`web/lib/export/`, `web/features/export/`), and Vitest/Playwright suites (`web/tests/`).
- `apps/desktop/` — Electron desktop shell.
- `docs/` — Search-first project documentation suite (no `INDEX.md`):
  - `docs/PRODUCT.md` — User intentions, feature checklist, and merge wishlist.
  - `docs/ARCHITECTURE.md` — Subsystem diagrams, tech-stack rationale, and extension recipes.
  - `docs/DECISIONS_AND_TRAPS.md` — Architectural pivots (`[DECIDED BY: HUMAN|AGENT]`) and engineering landmines.
  - `docs/VISUAL_LOG.md` — Obsidian- & GitHub-compatible color-coded Mermaid flowcharts for features and changes.
  - `docs/DEFECT_LOG.md` — Migrated fork audit defect history.
- `preview/` — On-demand temporary HTML visual previews only (never treated as permanent documentation).

---

## 5. Local Customizations (Do Not Regress)

| Area | Where | Why it exists |
| --- | --- | --- |
| Export engine & snapshot guard | `web/lib/export/`, `web/features/export/ExportChatModal.tsx`, `web/tests/lib/export-snapshots.spec.ts` | Seven formats with element toggles, OMML equations, vector PDF, deterministic golden snapshot suite (`L-09`), and update resilience. |
| LaTeX normalisation patches | `web/lib/latex-normalize.ts` (`wrapBareEnvironments`), `web/lib/latex.ts` (`findDisplayClose`), `web/lib/markdown-display.ts` (`PROTECTED_SPAN_REGEX`) | Targeted fixes on top of the upstream pipeline: never re-wrap an environment already inside a math block, tolerate blank lines in display math while bailing on prose, and protect inline math from the markdown pass. |
| Model preferences | `data/user/settings/model_preferences.json`, `deeptutor/services/subagent/model_preferences.py`, `deeptutor/api/routers/settings.py` | Friendly names, star pinning, hidden-model drawer, locked atomic writes. |
| Subagents | `deeptutor/services/subagent/` | Command Code, OpenCode, Antigravity, DeepSeek Harness, and per-connection model/effort overrides. |
| Windows launcher | `deeptutor/runtime/launcher.py` | Detached start without console leaks; `CREATE_NO_WINDOW` fallback; `close_fds=True`. |
| CLI apps | `deeptutor/services/cli_apps/` | `uv`/`venv` install parity via shared `_env_bin_dir()`, per-app environments, Windows `.cmd`/`.bat` prefix-root resolution. |
| Workspaces & skills | `deeptutor/services/workspace/`, `data/user/workspaces/*/skills/` | STEM & Engineering and Polymath & Cognitive, Zettelkasten/LightRAG, and personas under `data/user/workspace/personas/` (`layman` carries the Feynman-style explanation contract). |

---

## 6. Mandatory Verification Commands

- **Python syntax:** `.venv/Scripts/python.exe -m compileall -q deeptutor deeptutor_cli` (or `python3 -m compileall -q deeptutor deeptutor_cli` on Linux/macOS)
- **Frontend types:** `cd web && npm run typecheck`
- **Frontend i18n parity & audit:** `cd web && npm run i18n:check`
- **Frontend unit & export snapshot tests:** `cd web && npm run test:unit`
- **Frontend full fast gate:** `cd web && npm run check:fast`
- **Optional (when `dev` extras are installed):** `.venv/Scripts/python.exe -m pytest -q`, `ruff check .`, `ruff format --check .`

---

## 7. Critical Trap Pointers (`docs/DECISIONS_AND_TRAPS.md`)

- **Never take upstream wholesale in custom subsystems** (`web/lib/export/`, `web/features/export/`, `deeptutor/services/subagent/`, model-preference routes) — see `[TRAP: Taking Upstream Wholesale in Custom Subsystems]`.
- **Never collapse Windows Node resolution to `<prefix>/bin`** — Windows npm shims live at the prefix root as `.cmd`/`.bat` — see `[TRAP: Windows npm Shims Live at the Prefix Root]`.
- **Never inline venv interpreter path math** — `interpreter_path()` and `bin_dir()` must share `_env_bin_dir()` — see `[TRAP: Duplicate Interpreter Path Math]`.
- **Never add `.env` loading as a configuration source** — runtime settings live in `data/user/settings/` — see `[TRAP: Treating .env as Application Configuration]`.
- **Never re-wrap already-normalized LaTeX** — keep `wrapBareEnvironments` idempotent — see `[TRAP: Re-Wrapping Already-Normalized LaTeX]`.
- **Never remove the `CREATE_NO_WINDOW` fallback** — keep `getattr(subprocess, "CREATE_NO_WINDOW", ...)` in `launcher.py` — see `[TRAP: Assuming CREATE_NO_WINDOW Exists]`.
- **Never use line numbers as documentation anchors** — always cite file paths paired with function, class, or variable names — see `[TRAP: Line Numbers as Documentation Anchors]`.
