# DeepTutor — Fork Audit Addendum C: External Leverage & Lateral Features

**Scope:** ONLY the fork's own additions versus upstream `v1.7.3`.
**Delta basis:** `git diff v1.7.3..HEAD` — 78 files, ~8,050 insertions.
**Audited at:** commit `a9d8af3d3` (branch `sync/v1.7.3`).
**Audit date:** 2026-11-19.

> **STATUS (2026-11-19):** nothing in this file was implemented in the remediation pass. Part 1's two migrations (OSS-01, OSS-02) are deferred by design; the remaining items were evaluated and rejected for now. Part 2 (L-01..L-10) remains a proposal list — no lateral feature has been built.

> **For the implementing agent:** Part 1 lists external projects that can replace fork code. Part 2 lists features worth building. Nothing here is a bug — the defects are in `DeepTutor-audit-fork-bugs-and-ui.md`. Do not start a migration while its corresponding bug fixes are still open; land the fix first so the replacement has a working baseline to preserve.
>
> **Licence rule for this repo:** `LICENSE` stays Apache-2.0 (fork of Apache-2.0 upstream). Every dependency below is MIT or Apache-2.0, which is compatible. Do not introduce a copyleft dependency into a path that ships in the browser bundle.

---

## Part 1 — External Leverage / OSS Reuse

### OSS-01 — `dolanmiu/docx` for DOCX generation (High impact)
- **Replaces:** `web/lib/export/docx-builder.ts` (458 lines), `web/lib/export/zip.ts` (145), most of `web/lib/export/omml.ts` (210) — ~800 lines.
- **Why:** MIT, ~6M weekly npm downloads, TypeScript-first, works in the browser and Node. Ships a first-class `Math*` API (`MathRun`, `MathFraction`, `MathRadical`, `MathSum`, `MathSubScript`, `MathSuperScript`, `MathFunction`, …) that emits OMML directly — i.e. it solves BUG-16 (`ACCENTS` dead code, missing `mover`/`munderover`) by construction, and removes BUG-17 (recursion) and the ZIP/CRC32 surface entirely.
- **Integration spec:**
  1. Keep `adapter.ts` + `types.ts` as the normalised input contract — do not touch them.
  2. Rewrite `buildDocxBlob(messages, options, metadata)` to map `NormalizedExportMessage` → `Document` sections: heading per turn, `Paragraph`/`TextRun` for prose, `Table`/`TableRow`/`TableCell` for `msg.tables`, `Math` blocks for display equations, `Packer.toBlob(doc)` for the result.
  3. Replace `mathMlToOmml` with a MathML → `Math*` translator (keep `omml.ts`'s tree walk; change only the emitter).
  4. Delete `zip.ts` only after confirming nothing else imports it (see L-06, which wants it back for ZIP-of-workspace).
- **Risk:** bundle size. The modal is already `dynamic(() => import("@/features/export/ExportChatModal"), { ssr: false })`, so the cost lands only when the user opens export. Verify the route bundle growth before merging.

### OSS-02 — `pdf-lib` + `@pdf-lib/fontkit` for real Unicode PDF (High impact)
- **Replaces / fixes:** `web/lib/export/pdf-builder.ts` (375) and BUG-03 (CJK tofu), BUG-04 (clipping), UI-07 (table placement).
- **Why:** MIT, mature, browser-friendly; `fontkit` enables **subsetted** TrueType/OpenType embedding, so you ship/load one font and embed only the glyphs actually used. This is the difference between "works for English" and "works for zh/ja/ko/ru", which matters because the fork ships 11 locales.
- **Alternative considered:** `pdfmake` (MIT, ~2.3M weekly) — declarative JSON-to-PDF with a built-in table engine that repeats headers, which would replace the `jspdf-autotable` usage directly. Choose `pdfmake` if you want a drop-in table story; choose `pdf-lib` if you want the smallest dependency and full control.
- **Integration spec:** load the font lazily on export (`fetch` from `public/fonts/`), register with `doc.registerFontkit(fontkit)`, `doc.embedFont(bytes, { subset: true })`, then use `font.encodeText()` for width measurement instead of `splitTextToSize`. Implement page-breaking by measuring line heights against the remaining space — the algorithm in BUG-04's fix spec transfers unchanged.
- **Cheaper alternative worth measuring first:** promote the existing browser-print path to be the only PDF export (see SUN-02). It is already Unicode-correct and vector. Only build a byte-stream PDF if users need a file without going through the print dialog.

### OSS-03 — `reamkit` as a reference implementation for browser typography (Medium)
- **Why:** MIT, pure TypeScript, browser/Node/edge, reads and writes DOCX/XLSX/PDF from the ECMA-376 and ISO 32000 specs with no headless Office. Notable for exactly the capabilities this fork lacks: **Type0 + CIDFontType2 embedding with subsetting**, Knuth–Plass line breaking, Liang hyphenation, BiDi and Arabic joining, CJK faces.
- **How to use it:** primary value is **patterns**, not necessarily a dependency — a compact, readable reference for correct PDF font embedding and line breaking. It can also convert DOCX→HTML/Markdown, which is the backbone of L-02.
- **Caveat:** newer project with a small maintainer base. Do not put it on the critical export path until you have exercised it against the repo's own fixtures; use it behind a flag first.

### OSS-04 — `officeParser` for the inverse direction (Medium)
- **Why:** parses `docx`/`pptx`/`xlsx`/`pdf`/`rtf` into a structured AST and can emit Markdown/HTML; normalises equations from every format to LaTeX (including `m:oMath` and MathML). MIT.
- **Use for:** L-02 (import a document into a workspace) and for building export fixtures from real Word documents instead of hand-written strings.

### OSS-05 — MathJax as the canonical TeX → MathML source (Low-Medium)
- **Why:** if the fork keeps a hand-written OMML emitter (i.e. declines OSS-01), MathJax's TeX→MathML output is semantically richer than KaTeX's presentational markup — it uses `mover`/`munderover`/`semantics` with an `annotation` carrying the original TeX, which gives the converter a clean fallback path (emit the TeX as plain text when a structure is unsupported).
- **Use for:** a converter-side improvement only. Do not replace KaTeX for on-screen rendering — that is upstream's display pipeline.

### OSS-06 — `exceljs` for XLSX (Low-Medium)
- **Replaces:** `web/lib/export/xlsx-builder.ts` (313) + the ZIP writer.
- **Why:** MIT, ~12.4M weekly downloads, styled sheets, column widths, freeze panes, streaming writes.
- **When:** only if XLSX grows past "one sheet per table + a timeline sheet". At current scope the hand-rolled builder is adequate and SUN-01's `zip.ts` reuse is worth more. **Do not migrate now.**

### OSS-07 — Deliberately NOT recommended
- **`cjk-pdf`** — solves the tofu problem with `html2canvas` + jsPDF, i.e. it *rasterises* the page. That destroys vector text and selectable/searchable PDFs, which contradicts the fork's "publication-grade vector PDF" claim. Cite it as documentation of the jsPDF trap (its README states the problem precisely), not as a dependency.
- **`file-saver`** — unnecessary. `triggerDownload` in `exporter.ts` is correct once BUG-07's early-revoke pattern is applied everywhere.
- **A headless-Chrome PDF service** — out of scope for a local-first desktop app, and it would add a server dependency the product does not have.

### OSS-08 — Evaluation harness suggestion
- **Why:** the fork has no golden-file tests, so fidelity regressions (BUG-01 class) are invisible.
- **Use:** `officeParser` (OSS-04) or `python-docx` in a throwaway script to extract text/tables from generated DOCX/PDF fixtures and assert on content. Store fixtures under `web/tests/fixtures/export/`. This is the single cheapest way to make OSS-01 safe to land.

---

## Part 2 — Lateral Features & Quality of Life

Ordered by value per unit of work. Each pairs with a capability the fork already has, so none of these require new architecture.

### L-01 — Export presets and "export last answer" (High value / low cost)
- **Pairs with:** the export engine.
- **What:** save named presets (format + element toggles + selection policy) and expose a one-click "Export this answer" in the per-message menu, plus a "reuse last preset" default so the modal opens on the user's habitual setup instead of always DOCX/all-on.
- **Why:** the modal currently resets to defaults every open; a tutoring user exporting notes daily re-clicks the same seven toggles. This is the highest-ratio QoL change in the feature.
- **Spec:** persist presets in the same `data/user/settings/` JSON pattern as `model_preferences.json` (reuse the service's new locking from BUG-08). Add `GET/PUT /export-presets`. Default preset is applied on modal open.

### L-02 — Import a document into a workspace (High value)
- **Pairs with:** workspaces, knowledge bases, RAG.
- **What:** drop a DOCX/PDF/Markdown file → parse to Markdown → create a knowledge source in the current workspace.
- **Why:** the fork already ingests sources and has a strong skills/workspace model; the missing half is "my lecture notes are a Word file".
- **Spec:** client-side parse with `officeParser` or `reamkit` (OSS-03/04), then reuse the existing knowledge-source creation route. Keep it client-side so no new server dependency appears.

### L-03 — Flashcard / Anki export from quiz and mastery sessions (High value)
- **Pairs with:** `deep_question`, `mastery_path`, learning records.
- **What:** export generated Q/A pairs as CSV (Anki-importable) alongside the existing seven formats.
- **Why:** the app already generates exactly the artifact a spaced-repetition user needs, then throws it away. This is the most obvious "lateral" feature for a tutoring product.
- **Spec:** new `ExportFormat` member `"csv"` (or `"anki"`), rows `front,back,tags,source_session`. Source from the quiz/mastery result structures already persisted; no new generation. Deliberately simple: no `.apkg` packaging.

### L-04 — Bulk workspace export as a ZIP (Medium-High)
- **Pairs with:** `zip.ts` (already written), sessions, workspaces.
- **What:** "Export workspace" → one ZIP containing every session as Markdown + one JSON manifest + attached artifacts.
- **Why:** this is the archival/backup story the product lacks, and `zip.ts` already exists — so the marginal cost is mostly UI and a session-enumeration loop.
- **Spec:** reuse `createZipBlob`; stream session list from the existing store; cap at N sessions with a progress indicator (see SUN-06).

### L-05 — Print stylesheet parity for the in-app transcript (Medium)
- **Pairs with:** the publication HTML builder.
- **What:** `@media print` rules so Ctrl+P in the app produces the same document as "Print / Save Vector PDF", including page numbers and hidden chrome.
- **Why:** users press Ctrl+P. Today that produces the app UI, not the conversation — a jarring mismatch next to a button labelled "Print / Save Vector PDF".
- **Spec:** extract the publication CSS into a shared module consumed by both `buildPublicationHtml` and a global `print.css`; add `@page` margins and `break-inside: avoid` on message cards.

### L-06 — Model preference portability and orphan handling (Medium)
- **Pairs with:** model preferences, subagent connections.
- **What:** export/import `model_preferences.json`; and when a pinned/hidden/renamed model no longer exists in the catalog, show it in a "stale preferences" section with a one-click prune.
- **Why:** display names and pins are keyed by raw model id. When a provider renames or drops a model (frequent), the preference silently orphans and the user sees a pin that does nothing.
- **Spec:** add a `prune_unknown(known_ids)` helper called from the model-list route; surface a count badge in the hidden/pinned drawer.

### L-07 — Subagent trace sidecar export (Medium)
- **Pairs with:** the CommandCode/other backends and the export engine.
- **What:** when exporting a session that included subagent consults, optionally emit a sidecar `-trace.json` (tool calls, reasoning, timings) next to the document.
- **Why:** the backends already capture rich traces (`SubagentEvent` with `raw` + `meta.merge_id`), but the export only surfaces a truncated tool list. A sidecar preserves the full audit trail without bloating the human-facing document.

### L-08 — Accessible document metadata on every export (Low-Medium)
- **Pairs with:** all seven formats.
- **What:** set document language, title, and author metadata; tag headings properly; add alt text for artifacts.
- **Why:** exported HTML/PDF currently carry no `lang`, so screen readers mispronounce non-English content, and search/archival tools cannot index by language. Cheap to add, and it is the difference between "a file" and "a document" for accessibility review.

### L-09 — Deterministic export snapshot tests (Medium, enabling)
- **What:** golden-file tests per format over a fixed conversation fixture (one table, one code block, one equation with an accent, one CJK answer, one tool call, one citation).
- **Why:** this fixture would have caught BUG-01, BUG-03, BUG-16, and PAR-07 immediately. It is the prerequisite for safely landing OSS-01/OSS-02.
- **Spec:** store expected outputs as hashes for binary formats and as text for md/txt/html/json; regenerate behind an explicit `--update` flag only.

### L-10 — "Explain this export" trust surface (Low)
- **What:** a one-line summary in the modal footer stating exactly what will be included ("42 messages · 3 tables · 2 equations · 1 tool trace") derived from the existing `stats` object.
- **Why:** `stats` is already computed but only shown as counts in badges. A single sentence removes the "did it include my reasoning?" uncertainty that the seven toggles create.

---

## Suggested sequence

1. **L-09** first — it makes everything else verifiable.
2. **L-01** — highest QoL per line of code.
3. **PAR-05/06/07 + BUG-01** (see Addendum B/A) — collapse duplicates so later features have one code path.
4. **OSS-02 or SUN-02** — decide the PDF strategy (this blocks BUG-03/04).
5. **OSS-01** — DOCX migration, gated by L-09.
6. **L-03 → L-04 → L-02** — the three "lateral" features with the clearest user pull.
7. **L-05 → L-06 → L-07 → L-08 → L-10** — polish.

## Verification gates for any dependency migration

```bash
cd web && npm ls <package>                 # single version, no peer conflicts
cd web && npm run typecheck                # exit 0
cd web && npm run build                    # confirm the export chunk is code-split
cd web && npx vitest run tests/lib/chat-export-suite.spec.ts
```
Also confirm the export bundle delta before/after (`next build` route sizes) — every library here is client-side.
