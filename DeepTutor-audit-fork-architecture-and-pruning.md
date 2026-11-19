# DeepTutor — Fork Audit Addendum B: Feature Parity, Architecture & Pruning

**Scope:** ONLY the fork's own additions versus upstream `v1.7.3`.
**Delta basis:** `git diff v1.7.3..HEAD` — 78 files, ~8,050 insertions.
**Audited at:** commit `a9d8af3d3` (branch `sync/v1.7.3`).
**Audit date:** 2026-11-19.

> **STATUS (2026-11-19):** PAR-01..PAR-09 and SUN-04..SUN-07, SUN-10, SUN-11 are fixed. Deferred by design: SUN-01 (DOCX library migration), SUN-02 (PDF byte-stream rewrite), SUN-03 (modal decomposition), SUN-08 (constant folding), SUN-09 (launcher consolidation). PAR-06 is **partial**: `adapter.ts` is the canonical structured extractor; `html-builder.ts` keeps its private parser as a fallback for prose that still contains a table.

> **For the implementing agent:** this file covers what the documentation *claims* versus what the code *does*, and what should be deleted rather than maintained. Deletions here reduce future merge cost — every fork-owned file inside an upstream directory is a permanent conflict source. Coordinate with `DeepTutor-audit-fork-bugs-and-ui.md` (defects) before pruning, so a file is not deleted while a fix is landing in it.

---

## Part 1 — Feature & Documentation Parity

### PAR-01 — Fork documentation was written inside upstream's directory tree
- **Severity:** High (permanent merge-conflict source)
- **Files & symbols:**
  - **Added:** `docs-for-dev/INDEX.md`, `docs-for-dev/BUGS.md` (103 lines), `docs-for-dev/FEATURES.md` (24 lines)
  - **Modified:** `docs-for-dev/ARCHITECTURE.md`
- **Root cause:** `docs-for-dev/` is upstream's developer documentation set (30 files: `CONTAINERIZATION.md`, `MODULES.md`, `I18N.md`, `AGENT_SETUP.md`, …) and is linked from every localized README in `assets/README/`. The fork added its own three files into that directory instead of `docs/`, which the fork owns.
- **Impact:** every future upstream sync will collide on `ARCHITECTURE.md`; the added files masquerade as upstream docs, so a reader cannot tell which documentation is authoritative.
- **Fix spec:** delete `docs-for-dev/INDEX.md`, `docs-for-dev/BUGS.md`, `docs-for-dev/FEATURES.md`; `git checkout v1.7.3 -- docs-for-dev/ARCHITECTURE.md` to restore upstream's version. Migrate anything still true into `docs/PRODUCT.md` / `docs/ARCHITECTURE.md` / `docs/DECISIONS_AND_TRAPS.md`. Re-run the sync afterwards to confirm `git diff v1.7.3..HEAD -- docs-for-dev/` is empty.

### PAR-02 — `docs-for-dev/INDEX.md` is broken and violates the project's own rule
- **Severity:** High (dead on arrival)
- **Files & symbols:** `docs-for-dev/INDEX.md`
- **Root cause:** all six links are absolute and machine-specific — `file:///c:/Users/kazir/Documents/DeepTutor/docs-for-dev/ARCHITECTURE.md` — but the repository lives at `C:\Users\kazir\Documents\Agentic Harness\DeepTutor`. Every link 404s, and the paths are useless on any other machine. It also directly contradicts `AGENTS.md` §3: *"never create an `INDEX.md` file"*.
- **Fix spec:** delete the file. Do not replace it — the protocol mandates header/summary scanning instead.

### PAR-03 — Orphaned 247-line bootstrap script
- **Severity:** Medium (dead weight, misleading)
- **Files & symbols:** `scripts/install_stem_skills.py` → `STEM_SKILLS`, the module-level install loop
- **Root cause:** zero references anywhere — not imported, not called from `start.ps1`/`start.bat`, not mentioned in `docs/`, `.github/`, or the launchers. Its outputs *do* exist (`data/user/workspaces/ws_433aaf5f…/skills/{khan-tutor,bode-plot-frequency-response,grill-me,…}`), so it was run once by hand and then abandoned. It hardcodes the skill list at module scope with no CLI, no `--dry-run`, no idempotency guard.
- **Fix spec:** delete it, **or** promote it to a documented opt-in: `python scripts/install_stem_skills.py --workspace <id>` with a `--dry-run`, idempotent copy, and a mention in `docs/PRODUCT.md` under the Workspaces feature. Do not leave it in its current state.

### PAR-04 — Documentation overstates three features
- **Severity:** Medium (misleads both the user and future agents)
- **Files & symbols:** `AGENTS.md` (project context table), `docs/PRODUCT.md` → `[FEATURE: Publication Vector PDF & LaTeX Hardening]`, `[FEATURE: Learning Skills & Personas]`
- **Root cause:** three claims do not match the code:
  1. **"KaTeX hardening — `web/lib/latex-normalize.ts` stops cascading parse failures on matrices and multi-line equations."** The fork's delta in that 665-line file is **5 lines** (a mask around `wrapBareEnvironments`); `web/lib/latex.ts` gets **12 lines**; `web/lib/markdown-display.ts` gets **3 lines**. The files are upstream's. The feature is real but is a targeted tweak, not a subsystem.
  2. **"OMML equations."** Accents and over/under structures are silently dropped (`omml.ts` → `ACCENTS` is dead code; `mover`/`munderover` unhandled — see BUG-16). Word export is correct for fractions/roots/scripts/matrices but not for `\hat`, `\bar`, `\overline`, or stacked limits.
  3. **"Feynman persona."** There is no `feynman` persona; `data/user/workspace/personas/` contains `layman`, `peer`, `research-assistant`, `teacher`. The layman persona is presumably the intended one.
- **Fix spec:** restate precisely — e.g. "targeted LaTeX normalisation patches on top of the upstream pipeline (`wrapBareEnvironments` re-wrap guard, display-close tolerance, inline-math protection)"; "OMML for fractions, roots, scripts, matrices, delimiters — accents and stacked limits fall back to child order"; rename the persona claim to `layman`. Keep the claims in `AGENTS.md` and `docs/PRODUCT.md` in sync.

### PAR-05 — Two parallel chat exporters, one of them buggy
- **Severity:** Medium (duplicate maintenance, divergent behaviour)
- **Files & symbols:** `web/lib/chat-export.ts` (`buildChatMarkdown`, `downloadChatMarkdown`, re-exports `./export` at the bottom) vs `web/lib/export/*` (2,939 lines)
- **Root cause:** the new engine was added alongside the old serializer instead of replacing it. `chat-export.ts` keeps its own `sanitizeFilename` (different fallback), its own markdown shape (no YAML frontmatter, no thinking/tool/source sections), and the broken synchronous `revokeObjectURL` (BUG-07). The file's own `export * from "./export"` shows the intent to unify but the old functions were never removed.
- **Fix spec:** grep for `buildChatMarkdown` / `downloadChatMarkdown` callers. If every caller can accept `exportSession(..., "markdown", ...)`, delete both functions and keep only the type re-exports. If one caller genuinely needs the minimal shape, keep `buildChatMarkdown` and delete `downloadChatMarkdown` + `sanitizeFilename`, delegating to `triggerDownload`.

### PAR-06 — Two independent markdown-table parsers
- **Severity:** Medium
- **Files & symbols:** `web/lib/export/adapter.ts` → `extractMarkdownTables`; `web/lib/export/html-builder.ts` → `parseMarkdownTable`
- **Root cause:** the HTML builder re-implements header/separator detection instead of consuming `msg.tables`. The two disagree on escaping (BUG-18), and the duplicate is why `includeTables` behaves differently per format (PAR-07).
- **Fix spec:** export the adapter's tokenizer, delete `parseMarkdownTable`, and have the HTML builder render `msg.tables` (respecting `options.includeTables`) while `markdownToHtml` renders the now-table-free `msg.content`.

### PAR-07 — The "Data Tables" toggle is a no-op in HTML export
- **Severity:** Medium (control lies to the user)
- **Files & symbols:** `web/lib/export/html-builder.ts` (`options.includeTables` is referenced **zero** times), vs `docx-builder.ts` (1), `pdf-builder.ts` (1), `markdown-builder.ts` (1), `text-builder.ts` (1), `xlsx-builder.ts` (2)
- **Root cause:** HTML renders tables as a side effect of `markdownToHtml(msg.content)`, so turning "Data Tables" off changes nothing; the table still appears.
- **Fix spec:** after PAR-06, gate the table render on `options.includeTables`. When disabled, emit the table's source markdown as a `<pre>` block (so data is not silently lost) or omit it entirely — pick one and document it. Add a per-format parity test asserting each of the seven builders honours every one of the seven toggles.

### PAR-08 — `InputMessage.base64` is declared and never used
- **Severity:** Low-Medium (dead field; a promised capability that does not exist)
- **Files & symbols:** `web/lib/export/adapter.ts` → `InputMessage.attachments[].base64`; `ExportArtifact` in `types.ts` has no binary field
- **Root cause:** the adapter reads `type`, `filename`, `mime_type`, `extracted_text`, `url` — never `base64`. Consequently the "Generated Artifacts & Media" toggle (`includeArtifacts`) only ever lists filenames; images and generated media are never embedded in DOCX/HTML/PDF.
- **Fix spec:** decide and execute. Either (a) implement embedding — `<img src="data:…">` in HTML, `ImageRun` in DOCX, `addImage` in PDF, guarded by a size cap — or (b) delete the field and reword the toggle to "Artifact list (names only)". Do not leave the field implying a capability that is absent.

### PAR-09 — `ExportFormat` union has no compile-time exhaustiveness guard
- **Severity:** Low (future defect trap)
- **Files & symbols:** `web/lib/export/exporter.ts` → `exportSession` switch, `default: throw new Error(...)`
- **Root cause:** adding a member to `ExportFormat` compiles fine and only fails at runtime, despite `FORMATS` in the modal also needing an entry.
- **Fix spec:** after the switch, `const _exhaustive: never = format;` (or a `satisfies Record<ExportFormat, …>` map of builders). That turns PAR-09-class omissions into typecheck failures.

---

## Part 2 — Simplification & Pruning

### SUN-01 — The hand-rolled OOXML/ZIP stack is ~800 lines of replaceable code
- **Severity:** Medium (maintenance burden with a mature MIT alternative)
- **Files & symbols:** `web/lib/export/docx-builder.ts` (458), `web/lib/export/zip.ts` (145), most of `web/lib/export/omml.ts` (210) — plus the bugs in BUG-16/17/18
- **Root cause:** the fork implements ECMA-376 packaging, CRC32, central directories, and an OMML emitter by hand. It works for the common cases but every fidelity gap becomes bespoke work.
- **Fix spec:** before rewriting, measure the current output against `dolanmiu/docx` (MIT, ~6M weekly downloads, browser + Node, first-class `Math*` OMML classes). Migration plan: `buildDocxBlob` → construct a `Document` with `Packer.toBlob()`; delete `zip.ts` entirely (the library packs internally); delete the `omml.ts` surface that the library's `Math` API covers, keeping only MathML→`Math` translation if needed. Keep `zip.ts` only if SUN-04's workspace-ZIP feature lands first (it can be reused for that).
- **Constraint:** do not do this and BUG-01/BUG-04 in the same change. Land the bug fixes on the current stack first so the diff stays reviewable.

### SUN-02 — The jsPDF PDF path duplicates what browser print already does better
- **Severity:** Medium (two PDF implementations, one of them script-incapable — BUG-03)
- **Files & symbols:** `web/lib/export/pdf-builder.ts` (375) vs `printPublicationPdf` + `buildPublicationHtml` in `web/lib/export/exporter.ts` / `html-builder.ts`
- **Root cause:** the fork ships two PDF routes. The browser-print route typesets with real fonts and KaTeX (correct for all scripts and all math); the jsPDF route reimplements layout in millimetres and cannot render non-Latin text at all.
- **Fix spec:** make print-to-PDF the primary action and demote or delete `pdf-builder.ts`. If a downloadable `.pdf` byte-stream is genuinely required, replace jsPDF with `pdf-lib` + `@pdf-lib/fontkit` (subsetted Unicode embedding) rather than patching jsPDF's encoding limits. Deleting `buildPdfBlob` removes ~375 lines and BUG-03 + BUG-04 + UI-07 in one move.

### SUN-03 — `ExportChatModal.tsx` is 825 lines doing five jobs
- **Severity:** Medium (any UI change touches a monolith)
- **Files & symbols:** `web/features/export/ExportChatModal.tsx` — `FORMATS`, selection state (`selectedIds`, `lastClickedIndex`, `expandedPreviewIds`), stats aggregation, the picker list, the toggle grid, and the footer
- **Root cause:** all rendering and all state live in one component, so BUG-06 (selection resync) and UI-04 (a11y) each require edits in the same 800-line file.
- **Fix spec:** extract `useExportSelection(messages, open)` (selection set, range select, batch actions, stats) and `ExportOptionsGrid` / `ExportMessagePicker` as separate components. Target ≤200 lines for the shell. This is a refactor with no behaviour change — do it *after* BUG-06 so the fix is not rewritten twice.

### SUN-04 — Effort values are silently remapped instead of translated
- **Severity:** Medium (user intent is not preserved; billing surprise)
- **Files & symbols:** `deeptutor/services/subagent/command_code.py` → `_build_command`, the `effort in ("medium","default") → "high"` / `("none","minimal") → "off"` block
- **Root cause:** the fork's UI exposes `none/minimal/low/medium/high/max`; the CLI supports `off/low/high/max`. `medium` is silently promoted to `high` — so a user selecting "medium" pays for "high" reasoning with no indication.
- **Fix spec:** either (a) surface the CLI's real scale in the UI for this backend (capability-driven options), or (b) keep the mapping but return it to the client so the UI can show "medium → high" inline, and log at INFO. Never map silently in the request path.

### SUN-05 — Per-call JSON re-parsing in the preference service
- **Severity:** Low-Medium (unnecessary I/O on hot paths)
- **Files & symbols:** `deeptutor/services/subagent/model_preferences.py` → `is_pinned`, `is_hidden`, `get_display_name` (each calls `load_model_preferences()`)
- **Root cause:** every predicate re-opens and re-parses the file. `knowledge.py` batches correctly (loads once, builds sets), but `capabilities/handoff/capability.py` → `get_display_name` runs per connection.
- **Fix spec:** cache the parsed document keyed on `(path, st_mtime_ns, st_size)` and invalidate in `save_model_preferences`. Expose a `preferences_snapshot()` for callers that need several predicates. Do not use an unbounded `lru_cache` on the file contents without the mtime key.

### SUN-06 — No export size guard
- **Severity:** Medium (tab crash on a long research session)
- **Files & symbols:** `web/lib/export/exporter.ts` → `exportSession`; `normalizeMessages` materialises the whole conversation; each builder then builds a full in-memory Blob
- **Root cause:** nothing caps message count, total characters, or generated artifact text. A `deep_research` session with long tool outputs can reach tens of MB; combined with a DOCX/PDF rebuild this can exhaust the tab.
- **Fix spec:** add a pre-flight in `exportSession`: estimate `sum(content.length)`; above ~2 MB of text, show an explicit confirm ("This export is large (~N MB) and may take a while") and cap included tool-result length per call (the builders already truncate some fields inconsistently — centralise the caps in `types.ts`).

### SUN-07 — Inconsistent truncation limits across builders
- **Severity:** Low
- **Files & symbols:** `pdf-builder.ts` (`call.result.slice(0, 600)`, `argLines.slice(0, 8)`, `resLines.slice(0, 6)`), `html-builder.ts` `call.result.slice(0, 3000)`, `adapter.ts` (none)
- **Root cause:** each builder invented its own caps, so the same conversation exports different amounts depending on format.
- **Fix spec:** define `EXPORT_LIMITS = { toolResult: n, toolArgs: n, artifactText: n }` in `types.ts` and use it everywhere.

### SUN-08 — `OMML_NAMESPACE` is exported for a single internal use
- **Severity:** Low
- **Files & symbols:** `web/lib/export/omml.ts` → `OMML_NAMESPACE`; consumed once in `docx-builder.ts`
- **Fix spec:** fold into `mathMlToOmml` and drop the export (unless SUN-01 replaces the module entirely, in which case delete with it).

### SUN-09 — Fork-owned files that should not exist at all
- **Severity:** Low (cleanup)
- **Files & symbols:** `configure-ai.bat`, `configure-ai.ps1`, `start.bat`, `start.ps1`, `stop.bat`, `stop.ps1` (root), `scripts/configure_ai.py`, `scripts/install_stem_skills.py`
- **Root cause:** six launcher shims plus two scripts. `configure-ai.*` are thin wrappers around `scripts/configure_ai.py` (289 lines, sets `DEEPTUTOR_HOME`, writes provider keys). The `.bat`/`.ps1` pairs duplicate each other.
- **Fix spec:** verify each is referenced from `docs/PRODUCT.md` or the README. Keep `start.ps1`/`stop.ps1` + `configure-ai.ps1` (Windows is the target platform) and delete the `.bat` duplicates *only if* nothing in the docs instructs users to run them. `install_stem_skills.py` → see PAR-03. Do not delete `scripts/configure_ai.py` — it is the real implementation behind the wrappers.

### SUN-10 — Stray artifact in the local workspace tree
- **Severity:** Low
- **Files & symbols:** `data/user/workspaces/ws_433aaf5f…/skills/grill-me/新建 文本文档.md`
- **Root cause:** an accidental "New text document" saved into a skill directory. `data/user/` is untracked (`git ls-files data/user/` → 0), so it will not reach GitHub, but it ships in any local profile backup and shows up in skill listings.
- **Fix spec:** delete it; make the skill loader ignore files not named `SKILL.md` / `skill-card.md` / `EDUHUB_SOURCE.md` so stray files cannot pollute a skill.

### SUN-11 — Duplicated `sanitizeFilename` (see BUG-22)
- **Severity:** Low
- **Fix spec:** single implementation in `exporter.ts`.

---

## Priority order for this file

1. **PAR-01 + PAR-02** — delete the three `docs-for-dev` additions and restore upstream's `ARCHITECTURE.md`. Highest leverage: removes a permanent conflict source and a broken file in one commit.
2. **PAR-04** — correct the three overstated claims. Cheap, prevents future agents from "fixing" non-problems.
3. **PAR-05 + PAR-06 + PAR-07** — collapse the duplicate exporters/parsers and make `includeTables` honest in HTML. Do together, one commit.
4. **SUN-04** — stop silently promoting `medium` to `high`.
5. **SUN-06 + SUN-07** — centralise limits and add a size pre-flight.
6. **SUN-01 / SUN-02** — the two library migrations. Land only after the bug-fix file is closed, and land each separately.
7. **SUN-03** — modal split. After BUG-06.
8. Remaining low-severity cleanups.

## Verification gates

```bash
.venv/Scripts/python.exe -m compileall -q deeptutor deeptutor_cli
cd web && npm run typecheck
cd web && npm run test:unit -- tests/lib/chat-export-suite.spec.ts
git diff v1.7.3..HEAD -- docs-for-dev/    # must be empty after PAR-01
```
