# DeepTutor Development Handoff Report (`docs/HANDOFF_REPORT.md`)
> **1-Line Summary:** Comprehensive status of verified workspace state, completed Wave 1 tasks, remaining work items, and exact execution plan for continuing on sync/v1.7.3.

---

> **Updated Status (Post-Batch 1–4 Patches):** Wave 1 is 100% complete (including `AGENTS.md`, `docs/VISUAL_LOG.md`, and `docs/DECISIONS_AND_TRAPS.md`). Wave 2 backend, CLI (`scripts/configure_ai.py`), and Web Settings UI (`Model & Harness Hub`, Batch 1) are complete; Wave 2 is complete with `Charlie 1` (local Paradee TTS with voice picker and silent on-demand auto-start, Batch 6) and `Delta 1` (`omniroute`) intentionally skipped by user decision. Wave 3 is complete (`SUN-03`, `L-01`, `L-03`, `OSS-01` `dolanmiu/docx`, and `OSS-02` `pdf-lib` + `@pdf-lib/fontkit`, Batches 2–4 & 7–8); run `npm install` + `npx vitest run tests/lib/export-snapshots.spec.ts --update` in CI/local to refresh lockfile and L-09 binary hashes.

## 1. Executive Summary & Workspace Verification

### [STATUS: Workspace-Verification] | Aliases: active folder, repository location, git branch
> **1-Line Summary:** Confirmed `C:\Users\kazir\Documents\Agentic Harness\DeepTutor` is the sole active project repository on branch `sync/v1.7.3`.

* **Active Local Project Folder:** `C:\Users\kazir\Documents\Agentic Harness\DeepTutor`
* **Obsolete Directory:** `C:\Users\kazir\Documents\DeepTutor` was inspected; it is an unversioned backup folder from November 7, 2026 (containing only `.freebuff` and `data`), not an active repository.
* **Git Remote Configuration:**
  * `origin`: `https://github.com/Mostakim2005/DeepTutor.git` (Active personal fork)
  * `upstream`: `https://github.com/HKUDS/DeepTutor.git` (Official upstream repo — strictly pull-only)
* **Active Working Branch:** `sync/v1.7.3` (Commit `24aa5fd7b` tracking `origin/sync/v1.7.3`)
* **Branch Guardrails:**
  * `main` remains untouched at `bc742ae37` (`v1.7.2`).
  * Never fast-forward or merge `sync/v1.7.3` into `main` without explicit confirmation.
  * Never pull `upstream/dev`.
  * Never push to `upstream`.
  * Never auto-tag or trigger releases.

---

## 2. Visual System & Progress Map

```mermaid
flowchart TD
    %% Color Definitions (Obsidian & GitHub compatible)
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef doneNode fill:#15803d,stroke:#14532d,color:#ffffff
    classDef pendingNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef waitingNode fill:#d97706,stroke:#92400e,color:#ffffff

    Start([Start: Development Brief report.md]):::startNode --> W1[Wave 1: Safety Net & Sync Gaps]:::pendingNode

    subgraph Wave1["Wave 1 Status"]
        K1[1. Add 49 missing hu/it locale keys]:::doneNode
        K2[2. L-09 Deterministic export snapshots & fixtures]:::doneNode
        K3[3. Trim AGENTS.md & replace VISUAL_GUIDE.html with VISUAL_LOG.md]:::doneNode
        K4[4. Full gate verification & commit on sync/v1.7.3]:::doneNode
    end

    W1 --> K1
    K1 --> K2
    K2 --> K3
    K3 --> K4

    K4 --> W2[Wave 2: Model & Harness Management]:::waitingNode
    K4 --> W3[Wave 3: Export Overhaul & Lateral QoL]:::pendingNode

    subgraph Wave2["Wave 2 (Pending Confirmation)"]
        B1[Bravo 1: Unified Web Settings + configure-ai CLI]:::doneNode
        B4[Bravo 4: Live model sync & custom model catalogs]:::doneNode
        B5[Bravo 5: Plug-and-play CLI/ACP harnesses]:::doneNode
        D1[Delta 1: agy, cmdc, opencode, dsh, freebuff (omniroute skipped)]:::doneNode
        C1[Charlie 1: Paradee TTS + on-demand auto-start]:::doneNode
    end

    subgraph Wave3["Wave 3 (Post-Wave 1/2)"]
        S3[SUN-03: Decompose ExportChatModal.tsx]:::doneNode
        L1[L-01: Export presets & Export this answer]:::doneNode
        L3[L-03: Anki CSV flashcard export]:::doneNode
        O1[OSS-01: dolanmiu/docx migration]:::doneNode
        O2[OSS-02: pdf-lib + fontkit Unicode PDF]:::doneNode
    end

    W2 --> B1 & B4 & B5 & D1 & C1
    W3 --> S3 & L1 & L3 & O1 & O2

    subgraph Legend["Legend (Color Guide)"]
        L_Blue([Blue = Entry Trigger / Brief]):::startNode
        L_Green([Green = Fully Completed & Verified]):::doneNode
        L_Teal[Teal = In Progress / Immediate Next Step]:::pendingNode
        L_Amber[Amber = Awaiting User Decision Gate]:::waitingNode
    end
```

---

## 3. What Was Done (Completed Work Items)

### [WORK: Locale-Key-Parity] | Aliases: hu locale, it locale, i18n audit
> **1-Line Summary:** Resolved all 49 missing fork export and model keys in Hungarian and Italian translation catalogs.

* **Files Modified:**
  * `web/locales/hu/app.json` (6,678 -> 6,727 keys)
  * `web/locales/it/app.json` (6,696 -> 6,745 keys)
* **What Changed:**
  * Added natural, context-accurate translations for all 49 fork export/model keys (including modal headings, element toggle labels, model pin/unpin/hide strings, and status messages).
* **Verification Outcome:**
  * `npm run i18n:check` (running both `i18n_parity.mjs` and `i18n_audit.mjs`) reports:
    * `hu: 4647/4647 used keys (100.0%), strict` (PASSED)
    * `it: 4647/4647 used keys (100.0%), strict` (PASSED)
    * Exit code `0`.

### [WORK: Deterministic-Export-Safety-Net] | Aliases: L-09, export snapshots, fixture, determinism
> **1-Line Summary:** Built a deterministic export baseline with multi-element fixtures, time-freezing normalizers, and golden file snapshots across all 7 formats.

* **Files Modified & Created:**
  * `web/lib/export/zip.ts`:
    * Converted `getDosDateTime` to use UTC getters (`getUTCFullYear`, `getUTCMonth`, `getUTCDate`, `getUTCHours`, `getUTCMinutes`, `getUTCSeconds`) to eliminate local timezone drift in ZIP headers.
    * Added optional `timestamp: Date = new Date()` parameter to `createZipBlob` and passed it to `getDosDateTime(timestamp)`.
  * `web/lib/export/docx-builder.ts`:
    * Passed `metadata.exportedAt` into `createZipBlob` so Word document archives have frozen timestamps during test runs.
  * `web/lib/export/xlsx-builder.ts`:
    * Passed `metadata.exportedAt` into `createZipBlob` so Excel workbooks have frozen timestamps during test runs.
  * `web/lib/export/exporter.ts`:
    * Updated filename generation date calculation to `(metadata.exportedAt ?? new Date()).toISOString().slice(0, 10)` to respect explicit metadata timestamps.
  * `web/tests/fixtures/export/conversation.fixture.ts`:
    * Created standardized multi-element test fixture:
      * Fixed export date: `2026-01-15T12:00:00.000Z`
      * Accented math: inline `$\hat{x} = \vec{v} + \tilde{\alpha}$` and display `$$\hat{H}\psi = E\psi$$`
      * Fenced code block: Python `norm_sq`
      * Markdown table: 3 columns, 2 rows with sentinel `FIXTURE_METRIC_ALPHA`
      * Multilingual CJK text: Japanese & Chinese theorem explanation
      * Tool call + result: `paper_search` with ID matching
      * RAG citations & attachments
  * `web/tests/lib/export-snapshots.spec.ts`:
    * Time-locked test harness using Vitest fake timers and `Date.prototype.toLocaleString` stubbing.
    * In-memory uncompressed STORE ZIP archive parser to inspect inner `.xml` files without external tools.
    * jsPDF byte normalizer stripping dynamic `/CreationDate` and `/ID` hashes.
    * Golden text snapshots matching `export.md`, `export.txt`, `export.html`, `export.json`.
    * Golden binary manifest matching SHA-256 hashes of DOCX, XLSX, and normalized PDF in `binary-hashes.json`.
    * Structural assertions verifying OMML accents (`<m:acc>`), CJK character preservation, single table occurrence (guarding against BUG-01 duplication), and numeric Excel cell values (`<v>3.14</v>`).
    * Repeatability test verifying identical bytes across repeated export runs.
  * `web/tests/fixtures/export/golden/*`:
    * `binary-hashes.json`
    * `export.html`
    * `export.json`
    * `export.md`
    * `export.txt`
* **Verification Outcome:**
  * `npx vitest run tests/lib/export-snapshots.spec.ts` passes consistently with 0 snapshot drift.
  * All 263 unit test suites (1,474 tests) pass with exit code `0`.
  * `.venv/Scripts/python.exe -m compileall -q deeptutor deeptutor_cli` passes with exit code `0`.

---

## 4. What Remains to Be Done

### Phase A: Complete Wave 1
1. **Trim Root `AGENTS.md`:**
   - Remove duplicated Universal Operating Protocol Sections 1–7 (which belong in the master `C:\Users\kazir\.agent-templates\AGENTS.md`).
   - Retain repository-specific facts: tech stack, remotes, Apache-2.0 license exception, mandatory verification commands, plugin architecture summary, local customizations table, and 1-line critical trap pointers to `docs/DECISIONS_AND_TRAPS.md`.
2. **Replace `docs/VISUAL_GUIDE.html` with `docs/VISUAL_LOG.md`:**
   - Remove `docs/VISUAL_GUIDE.html`.
   - Create `docs/VISUAL_LOG.md` using Obsidian-compatible color-coded Mermaid flowcharts (`classDef` color legend, labeled arrows, plain-English explanations, and symbol anchors) covering:
     * `[VISUAL: Durable-Turn-Execution-Pipeline]`
     * `[VISUAL: Multi-Format-Browser-Export-And-Snapshot-Guard]`
     * `[VISUAL: Subagent-Backends-And-Model-Preferences]`
     * `[VISUAL: Windows-Launcher-And-CLI-Apps-Runtime]`
     * `[VISUAL: Wave-1-Locale-Parity-And-Protocol-Alignment]`
3. **Record Decisions in `docs/DECISIONS_AND_TRAPS.md`:**
   - Document `[DECISION: Deterministic-Export-Snapshots-And-Markdown-Visual-Log]` with human-decision metadata and visual pivot map.
4. **Final Verification & Git Push:**
   - Run verification gate: `compileall`, `npm run typecheck`, `npm run i18n:check`, `npm run test:unit`, `npm run check:fast`.
   - Commit Wave 1 changes on `sync/v1.7.3` and push to `origin sync/v1.7.3` (`GIT_TERMINAL_PROMPT=0`). Keep `report.md` untracked.

### Phase B: Wave 2 (Update-Proof Model & Harness Manager)
*Awaiting user confirmation on **CHARLIE** (Paradee TTS) and **DELTA** (CLI tools) before modifying code:*
1. **`Bravo 1`:** Unified Web Settings UI in DeepTutor settings + upgraded `scripts/configure_ai.py` wizard to manage API keys, OAuth tokens (Codex), and local CLI harnesses. Persist customizations in user-owned JSON under `data/user/settings/`.
2. **`Bravo 4`:** Live model catalog discovery/refresh from CLI agents and user-editable model lists in `data/user/settings/`, unifying subagent, knowledge base, and model preferences.
3. **`Bravo 5`:** Plug-and-play registration of ACP-compatible and external CLI agents via configuration without Python backend code edits.
4. **`Delta 1`:** Wire up local CLI agents installed on this PC (`omniroute`, `agy`, `cmdc`, `opencode`, `dsh`).
5. **`Charlie`:** Implement confirmed Paradee TTS option (`C:\Users\kazir\Services\paradee-tts`, port 8855, OpenAI `/v1/audio/speech`).

### Phase C: Wave 3 (Export Overhaul & Lateral QoL)
*Gated by the `L-09` export snapshot tests landed in Wave 1:*
1. **`SUN-03`:** Decompose `web/features/export/ExportChatModal.tsx` (~892 lines) into modular components: `useExportSelection`, `ExportOptionsGrid`, and `ExportMessagePicker`.
2. **`L-01`:** Export Presets (persisted in `data/user/settings/`), "Export this answer" one-click action, and remember last used preset.
3. **`L-03`:** Anki-importable CSV flashcard export (`front,back,tags,source_session`) from quiz and mastery sessions.
4. **`OSS-01` / `SUN-01`:** Migrate DOCX generation (`web/lib/export/docx-builder.ts` + OMML) onto `dolanmiu/docx` (MIT).
5. **`OSS-02` / `SUN-02`:** Upgrade downloadable Unicode PDF export using `pdf-lib` + `@pdf-lib/fontkit` alongside the browser vector print path.

---

## 5. Original Execution Plan (Copied As-Is)

The plan below is copied verbatim from the confirmed execution plan for Wave 1:

```markdown
# Wave 1 Plan — DeepTutor report.md Kickoff (on sync/v1.7.3)

## Context & Verified Preconditions
- Folder Check (Resolved): C:\Users\kazir\Documents\Agentic Harness\DeepTutor IS the active local project repository on branch sync/v1.7.3 at 24aa5fd7b (matching origin/sync/v1.7.3). C:\Users\kazir\Documents\DeepTutor is an older non-git directory (Nov 7, only .freebuff and data).
- Brief File: report.md in the repo root (untracked — do NOT modify, commit, or delete report.md).
- Hard Guardrails:
  - Stay strictly on sync/v1.7.3. Do NOT touch, fast-forward, or commit to main. Do NOT pull upstream/dev. Do NOT push to upstream. Do NOT bump versions or create git tags/releases.
  - Do NOT start Wave 2 (Bravo / Delta / Charlie) in this turn — Charlie (Paradee TTS) and extra CLI agents for Delta 1 require user confirmation first. Execute Wave 1 completely, verify, commit, push to origin sync/v1.7.3, and present the Wave 1 report + Path B confirmation prompts for CHARLIE and DELTA.

---

## Step 1 — Fix 49 Missing Locale Keys in hu and it
Files: web/locales/hu/app.json, web/locales/it/app.json

npm run i18n:audit currently fails strict mode on hu and it because both lack the exact same 49 fork export/model keys present in web/locales/en/app.json. Both files use UTF-8, LF (\n) line endings, 2-space indentation, and trailing newline.

Add all 49 missing keys cleanly to web/locales/hu/app.json and web/locales/it/app.json (preserving valid JSON, existing keys, 2-space indent, and LF endings) with these exact natural translations:

| Key | Hungarian (hu/app.json) | Italian (it/app.json) |
| --- | --- | --- |
| "Export" | "Exportálás" | "Esporta" |
| "(Attachment/tool result only)" | "(Csak melléklet/eszközeredmény)" | "(Solo allegato/risultato strumento)" |
| "Choose export format, select specific messages, and toggle content elements" | "Válassza ki az exportálási formátumot, az üzeneteket és a tartalmi elemeket" | "Scegli il formato di esportazione, seleziona i messaggi specifici e attiva o disattiva gli elementi di contenuto" |
| "Content Elements to Include" | "Beleértendő tartalmi elemek" | "Elementi di contenuto da includere" |
| "Copied to clipboard as Markdown" | "Markdownként a vágólapra másolva" | "Copiato negli appunti come Markdown" |
| "Copied!" | "Másolva!" | "Copiato!" |
| "Copy failed" | "A másolás sikertelen" | "Copia non riuscita" |
| "Customize" | "Testreszabás" | "Personalizza" |
| "Data Tables" | "Adattáblázatok" | "Tabelle dati" |
| "DeepTutor" | "DeepTutor" | "DeepTutor" |
| "Export Conversation" | "Beszélgetés exportálása" | "Esporta conversazione" |
| "Export chat" | "Csevegés exportálása" | "Esporta chat" |
| "Export completed successfully!" | "Az exportálás sikeresen befejeződött!" | "Esportazione completata con successo!" |
| "Export failed" | "Az exportálás sikertelen" | "Esportazione non riuscita" |
| "Exporting..." | "Exportálás..." | "Esportazione in corso..." |
| "Failed to load conversation for export" | "Nem sikerült betölteni a beszélgetést az exportáláshoz" | "Impossibile caricare la conversazione per l'esportazione" |
| "Generated Artifacts & Media" | "Generált elemek és média" | "Artefatti e contenuti multimediali generati" |
| "Hidden models" | "Rejtett modellek" | "Modelli nascosti" |
| "Hide hidden models" | "Rejtett modellek elrejtése" | "Nascondi modelli nascosti" |
| "Hide model" | "Modell elrejtése" | "Nascondi modello" |
| "Invert" | "Megfordítás" | "Inverti" |
| "Only Answers" | "Csak válaszok" | "Solo risposte" |
| "Only Questions" | "Csak kérdések" | "Solo domande" |
| "Opening publication-grade print & vector PDF dialog..." | "Kiadványminőségű nyomtatási és vektoros PDF-ablak megnyitása..." | "Apertura della finestra di stampa e PDF vettoriale di qualità editoriale..." |
| "Pin model" | "Modell rögzítése" | "Fissa modello" |
| "Please select at least one message to copy" | "Kérjük, válasszon ki legalább egy üzenetet a másoláshoz" | "Seleziona almeno un messaggio da copiare" |
| "Please select at least one message to export" | "Kérjük, válasszon ki legalább egy üzenetet az exportáláshoz" | "Seleziona almeno un messaggio da esportare" |
| "Print / Save Vector PDF" | "Nyomtatás / Vektoros PDF mentése" | "Stampa / Salva PDF vettoriale" |
| "Print failed" | "A nyomtatás sikertelen" | "Stampa non riuscita" |
| "Reasoning / Thinking Traces" | "Gondolkodási / következtetési nyomok" | "Tracce di ragionamento / pensiero" |
| "Save as publication-grade vector PDF with vector KaTeX math and native Unicode fonts (matching Claude export)" | "Mentés kiadványminőségű vektoros PDF-ként vektoros KaTeX-képletekkel és natív Unicode betűtípusokkal (a Claude-exportáláshoz hasonlóan)" | "Salva come PDF vettoriale di qualità editoriale con formule KaTeX vettoriali e font Unicode nativi (come l'esportazione Claude)" |
| "Select Export Format" | "Exportálási formátum kiválasztása" | "Seleziona formato di esportazione" |
| "Select Messages to Export" | "Exportálandó üzenetek kiválasztása" | "Seleziona i messaggi da esportare" |
| "Select None" | "Kijelölés törlése" | "Deseleziona tutto" |
| "Show model" | "Modell megjelenítése" | "Mostra modello" |
| "This chat has no messages to export" | "Ez a csevegés nem tartalmaz exportálható üzeneteket" | "Questa chat non ha messaggi da esportare" |
| "Tip: Shift+click to select range" | "Tipp: Shift+kattintással tartományt jelölhet ki" | "Suggerimento: Maiusc+clic per selezionare un intervallo" |
| "Toggle elements on or off" | "Elemek be- és kikapcsolása" | "Attiva o disattiva gli elementi" |
| "Tool Invocations" | "Eszközhívások" | "Chiamate agli strumenti" |
| "Tool Outputs & Results" | "Eszközkimenetek és eredmények" | "Output e risultati degli strumenti" |
| "Unpin model" | "Modell rögzítésének feloldása" | "Rimuovi modello dai fissati" |
| "User Questions / Prompts" | "Felhasználói kérdések / utasítások" | "Domande / prompt dell'utente" |
| "Web & RAG Citations" | "Webes és RAG-hivatkozások" | "Citazioni Web e RAG" |
| "assistant" | "asszisztens" | "assistente" |
| "citations" | "hivatkozás" | "citazioni" |
| "messages selected" | "üzenet kiválasztva" | "messaggi selezionati" |
| "table" | "táblázat" | "tabella" |
| "tools" | "eszközök" | "strumenti" |
| "user" | "felhasználó" | "utente" |

Verify with cd web && npm run i18n:check — both hu and it must report 4647/4647 used keys (100.0%), strict and exit 0.

---

## Step 2 — Deterministic Export Snapshot Tests (L-09)

### 2A. Small Determinism Fixes in Export Builders (Backwards-Compatible)
1. web/lib/export/zip.ts (getDosDateTime, createZipBlob):
   - Update getDosDateTime(date: Date) to use UTC getters (getUTCFullYear, getUTCMonth, getUTCDate, getUTCHours, getUTCMinutes, getUTCSeconds) so ZIP headers are identical across timezones.
   - Add optional 3rd parameter timestamp: Date = new Date() to createZipBlob(entries: ZipEntry[], mimeType = "application/zip", timestamp: Date = new Date()): Blob, passing timestamp to getDosDateTime(timestamp).
2. web/lib/export/docx-builder.ts (buildDocxBlob):
   - Pass metadata.exportedAt as the 3rd argument to createZipBlob(entries, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", metadata.exportedAt).
3. web/lib/export/xlsx-builder.ts (buildXlsxBlob):
   - Pass metadata.exportedAt as the 3rd argument to createZipBlob(entries, XLSX_MIME_TYPE, metadata.exportedAt).
4. web/lib/export/exporter.ts (exportSession):
   - Change line const dateStr = new Date().toISOString().slice(0, 10); to const dateStr = (metadata.exportedAt ?? new Date()).toISOString().slice(0, 10); so filenames respect metadata.exportedAt when provided.

### 2B. Fixed Multi-Element Fixture
Create web/tests/fixtures/export/conversation.fixture.ts exporting:
- FIXED_EXPORT_DATE = new Date("2026-01-15T12:00:00.000Z")
- EXPORT_FIXTURE_METADATA: ExportMetadata (title: "Deterministic Export Fixture", sessionId: "fixture-session-01", workspaceId: "ws-stem", workspaceName: "STEM Workspace", capability: "deep_solve", exportedAt: FIXED_EXPORT_DATE)
- EXPORT_FIXTURE_MESSAGES: InputMessage[] containing:
  1. User turn (id: "u1", fixed timestamp 1768478100000) asking to compare operators, show code, and summarize in Japanese/Chinese.
  2. Assistant turn (id: "a1", capability: "deep_solve", model: "deepseek-r1", fixed timestamp 1768478200000) containing ALL required L-09 elements:
     - Reasoning trace: thinking StreamEvent ("Verify the operator notation, accent symbols, and table formatting.")
     - One equation with accents: inline $\hat{x} = \vec{v} + \tilde{\alpha}$ and display $$\hat{H}\psi = E\psi$$
     - One fenced code block: Python snippet (```python\ndef norm_sq(a: float, b: float) -> float:\n    return a * a + b * b\n```)
     - One Markdown table: 3 columns, 2 rows with a unique cell sentinel (FIXTURE_METRIC_ALPHA and numeric values 3.14, 42) so tests can assert the table appears exactly once (guarding BUG-01) and numeric parsing works in XLSX
     - One CJK answer paragraph: Japanese & Chinese text (勾股定理（ピタゴラスの定理）：直角三角形の斜辺の二乗は他の二辺の二乗の和に等しい。)
     - One tool call + tool result: tool_call (call_id: "c1", tool_name: "paper_search", args: { query: "spectral operator" }) + matching tool_result (call_id: "c1", content "Found 1 canonical reference.")
     - One citation: sources event with { title: "Spectral Theory Reference", url: "https://example.org/spectral-theory", snippet: "Core operator identities." }
     - One attachment/artifact: { type: "note", filename: "proof-notes.txt", mime_type: "text/plain", extracted_text: "Lemma 1: Self-adjoint operators have real eigenvalues." }

### 2C. Deterministic Snapshot Test Suite
Create web/tests/lib/export-snapshots.spec.ts:
- In beforeEach, lock timers (vi.useFakeTimers(); vi.setSystemTime(FIXED_EXPORT_DATE);) and spy on Date.prototype.toLocaleString to return this.toISOString() so every format's date rendering is 100% OS/locale/timezone-independent. In afterEach, call vi.useRealTimers() (and setup/rendered.ts restores mocks).
- Helper readBlobBytes(blob: Blob): Promise<Uint8Array> using blob.arrayBuffer() (with FileReader or Response fallback only if needed, check jsdom Blob.prototype.arrayBuffer — note chat-export-suite.spec.ts already uses blob.text(), verify blob.arrayBuffer() works in jsdom; if arrayBuffer is missing on jsdom Blob, use new Uint8Array(await new Response(blob).arrayBuffer())).
- Helper extractStoreZipEntries(bytes: Uint8Array): Map<string, string> parsing local file headers (0x04034b50) of uncompressed STORE ZIP archives to extract entry paths and UTF-8 contents cleanly.
- Helper normalizePdfBytes(bytes: Uint8Array): Uint8Array decoding latin1, replacing:
  - /\/CreationDate \(D:[^)]+\)/g -> /CreationDate (D:FIXED)
  - /\/ID \[ <[0-9A-Fa-f]+> <[0-9A-Fa-f]+> \]/g -> /ID [ <FIXED> <FIXED> ]
  and re-encoding as latin1 Uint8Array before SHA-256 hashing.
- Helper sha256Hex(bytes: Uint8Array): string using node:crypto createHash("sha256").
- Tests:
  1. Text golden snapshots using Vitest's native await expect(normalizedText).toMatchFileSnapshot(...) (regenerated only when --update / -u is passed!):
     - markdown -> ../fixtures/export/golden/export.md
     - txt -> ../fixtures/export/golden/export.txt
     - html -> ../fixtures/export/golden/export.html
     - json -> ../fixtures/export/golden/export.json
     (Normalize \r\n -> \n and ensure trailing \n for clean cross-OS diffs.)
  2. Binary golden hash manifest (../fixtures/export/golden/binary-hashes.json) using toMatchFileSnapshot:
     - Exports docx, xlsx, and pdf on the fixture.
     - Records { docx: { sha256, bytes, entries }, xlsx: { sha256, bytes, entries }, pdf: { normalizedSha256, bytes } }.
     - Asserts key structural invariants right in the test:
       - DOCX word/document.xml contains <m:acc> (OMML accent), contains 勾股定理 (CJK intact), and contains FIXTURE_METRIC_ALPHA exactly once (guards BUG-01 table duplication).
       - XLSX contains xl/worksheets/sheet1.xml and xl/worksheets/sheet2.xml with numeric cell <v>3.14</v> and <v>42</v>.
       - PDF starts with %PDF- and has deterministic normalized hash.
  3. Repeatability check: Running exportSession twice for docx, xlsx, pdf, html, markdown, json, txt yields identical bytes/hashes on both runs.

### 2D. Generate & Verify Golden Files
1. Run cd web && npx vitest run tests/lib/export-snapshots.spec.ts --update once to generate web/tests/fixtures/export/golden/{export.md,export.txt,export.html,export.json,binary-hashes.json}.
2. Inspect the generated golden files to confirm content quality (OMML accents, single table, CJK preserved, clean HTML/MD/TXT/JSON, valid hashes).
3. Run cd web && npx vitest run tests/lib/export-snapshots.spec.ts twice without --update to confirm zero drift and 100% pass.

---

## Step 3 — Trim Root AGENTS.md & Replace docs/VISUAL_GUIDE.html with docs/VISUAL_LOG.md

### 3A. Trim Root AGENTS.md (Repo-Specific Facts Only)
Rewrite AGENTS.md following C:\Users\kazir\.agent-templates\DOC_BLUEPRINTS.md Section 3:
- Remove duplicated Universal Operating Protocol Sections 1–7 completely.
- Start with # Project Operating Instructions (`AGENTS.md`) and the inheritance notice pointing to the global master AGENTS.md.
- Keep ALL repository-specific facts:
  - Tech stack & environment (DeepTutor personal fork v1.7.3, Python 3.12–3.14 .venv, FastAPI + Typer + Next.js 16 / React 19 web/, Electron apps/desktop/, Windows x64).
  - Remotes, branching guardrail (origin = Mostakim2005/DeepTutor, upstream = HKUDS/DeepTutor, never push to upstream, sync via sync/vX.Y.Z), and Apache-2.0 Licensing Exception (LICENSE stays Apache-2.0, preserve THIRD_PARTY_NOTICES.md & CITATION.cff).
  - Mandatory verification commands (compileall, npm run typecheck, npm run test:unit, npm run i18n:check, npm run check:fast, plus optional pytest/ruff when dev extras are installed).
  - Architecture in One Paragraph, Two Plugin Layers, Repository Directory Layout (docs/ with PRODUCT.md, ARCHITECTURE.md, DECISIONS_AND_TRAPS.md, VISUAL_LOG.md, DEFECT_LOG.md; root preview/ for on-demand HTML previews only), and the Local Customizations table.
  - Critical Trap Pointers (1-line warnings pointing to docs/DECISIONS_AND_TRAPS.md slugs — NO line numbers anywhere).

### 3B. Replace docs/VISUAL_GUIDE.html with docs/VISUAL_LOG.md
1. Delete docs/VISUAL_GUIDE.html.
2. Create docs/VISUAL_LOG.md strictly matching C:\Users\kazir\.agent-templates\VISUAL _LOG.md and DOC_BLUEPRINTS.md rules:
   - # Visual Feature & Change Log (`VISUAL_LOG.md`) + > **1-Line Summary:** ...
   - Typed slug headers (### [VISUAL: ...] | Aliases: ...) with > **1-Line Summary:** immediately on the next line (no blank line).
   - Every Mermaid diagram MUST be Obsidian & GitHub compatible (flowchart TD / flowchart LR), define classDef colors (startNode, processNode, outputNode, trapNode), include a subgraph Legend["Legend (Color Guide)"] box, have labeled directional arrows, plain-English walkthroughs, and file+symbol code anchors (NO line numbers).
   - Cover:
     1. [VISUAL: Durable-Turn-Execution-Pipeline] (core architecture migrated from VISUAL_GUIDE.html)
     2. [VISUAL: Multi-Format-Browser-Export-And-Snapshot-Guard] (export pipeline + L-09 golden snapshot safety net)
     3. [VISUAL: Subagent-Backends-And-Model-Preferences] (model catalog + model_preferences.json pin/hide + subagent handoff)
     4. [VISUAL: Windows-Launcher-And-CLI-Apps-Runtime] (detached CREATE_NO_WINDOW fallback + unified _env_bin_dir + Windows npm .cmd root shims)
     5. [VISUAL: Wave-1-Locale-Parity-And-Protocol-Alignment] (Wave 1 changes: hu/it 49-key parity, repo-only AGENTS.md, Markdown-native VISUAL_LOG.md)
3. Check docs/PRODUCT.md, docs/ARCHITECTURE.md, and docs/DECISIONS_AND_TRAPS.md:
   - Remove any stale references to VISUAL_GUIDE.html if any exist.
   - Add a concise [DECISION: Deterministic-Export-Snapshots-And-Markdown-Visual-Log] entry in docs/DECISIONS_AND_TRAPS.md (with ### [DECISION: ...] | Aliases: ..., > **1-Line Summary:**, [DECIDED BY: HUMAN], Obsidian-compatible color-coded Mermaid diagram + Legend, and symbol anchors) recording the switch from VISUAL_GUIDE.html to VISUAL_LOG.md and establishing L-09 golden snapshot tests before Wave 3 export library migrations.

---

## Step 4 — Verification Gate (All Must Pass Before Commit)
Run every command and verify exit code 0:
1. .venv/Scripts/python.exe -m compileall -q deeptutor deeptutor_cli
2. cd web && npm run typecheck
3. cd web && npm run i18n:check (confirm hu and it show 4647/4647 used keys (100.0%), strict)
4. cd web && npm run test:unit (confirm tests/lib/chat-export-suite.spec.ts, tests/lib/export-snapshots.spec.ts, and all existing specs pass)
5. cd web && npm run lint and cd web && npm run architecture:check and cd web && npm run contracts:check (or cd web && npm run check:fast — confirm everything passes cleanly!)

---

## Step 5 — Commit & Push on sync/v1.7.3 + Final Report & Wave 2 Confirmation Gate
1. Check git status -sb — verify report.md is untouched/untracked and NOT staged.
2. Stage ONLY the Wave 1 files:
   - web/locales/hu/app.json, web/locales/it/app.json
   - web/lib/export/zip.ts, web/lib/export/docx-builder.ts, web/lib/export/xlsx-builder.ts, web/lib/export/exporter.ts
   - web/tests/fixtures/export/conversation.fixture.ts, web/tests/fixtures/export/golden/*, web/tests/lib/export-snapshots.spec.ts
   - AGENTS.md, docs/VISUAL_LOG.md, docs/DECISIONS_AND_TRAPS.md, and deletion of docs/VISUAL_GUIDE.html (plus docs/PRODUCT.md/docs/ARCHITECTURE.md if touched)
3. Commit with a clear message on sync/v1.7.3 and push with GIT_TERMINAL_PROMPT=0 git push origin sync/v1.7.3. Verify main is still at bc742ae37.
4. Reply to the user with:
   - Folder check confirmation: Confirm C:\Users\kazir\Documents\Agentic Harness\DeepTutor IS the active local project repo (sync/v1.7.3, synced with origin/sync/v1.7.3), while C:\Users\kazir\Documents\DeepTutor is an older Nov 7 non-git folder.
   - Wave 1 Executive Report following the global AGENTS.md Post-Change Report template (commit hash, branch, checks passed, topic-by-topic plain-English summary + rationale, docs updated; no raw code diffs or file/function anchor dumps).
   - Wave 2 Pending Confirmations in the exact NATO Path B template (CHARLIE for Paradee TTS options Charlie 1 (recommended) / Charlie 2 / Charlie 3 noting C:\Users\kazir\Services\paradee-tts was found on this PC, and DELTA confirming whether any other CLI harnesses beyond omniroute + existing agy, cmdc, opencode, dsh should be wired up before starting Wave 2).

---

## Pitfalls Noted
- jsPDF non-determinism: jsPDF injects local-timezone /CreationDate (D:...+<offset>) and a random /ID [ <hex> <hex> ] on every call; normalize both in export-snapshots.spec.ts before hashing.
- Locale/timezone date drift: docx-builder.ts, html-builder.ts, pdf-builder.ts, and text-builder.ts call .toLocaleString(); stub Date.prototype.toLocaleString in export-snapshots.spec.ts and use UTC in zip.ts getDosDateTime.
- jsdom Blob.prototype.arrayBuffer: If jsdom's Blob lacks .arrayBuffer(), fall back cleanly (new Response(blob).arrayBuffer() or FileReader).
- ESLint rules in web/tests/: Avoid any, unused variables, or non-null assertions that violate the repo's ESLint config.
- Line endings: Keep hu/app.json, it/app.json, and golden text snapshots on LF (\n) so diffs stay clean across OSes.

## Re-plan if:
- npm run i18n:check reports unexpected missing keys or placeholder mismatches in locales other than hu and it.
- npm run check:fast / npm run test:unit exposes a pre-existing failure unrelated to Wave 1 that cannot be resolved cleanly within Wave 1 scope.
- git push origin sync/v1.7.3 hits an authentication or remote-divergence error (abort and report immediately per non-interactive git rules).
- docx or xlsx output varies across consecutive runs even after UTC createZipBlob timestamp and toLocaleString stubbing.
```

---

## 6. Original Development Brief (`report.md`) (Copied As-Is)

The content below is copied verbatim from `report.md` in the project root:

```markdown
# DeepTutor Development Brief & Confirmed Feedback (`report.md`)

- **Date:** 2026-11-19
- **Repository:** `C:\Users\kazir\Documents\Agentic Harness\DeepTutor`
- **Active Branch:** `sync/v1.7.3` (`24aa5fd7b` — all 309 upstream `v1.7.3` commits merged cleanly; `compileall` and `npm run typecheck` pass)
- **Branch Guardrail:** Keep `main` (`v1.7.2` / `bc742ae37`) untouched and do **NOT** pull `upstream/dev`. All work below happens on `sync/v1.7.3` (or feature branches off it).

---

## Baseline Status (Already Complete on `sync/v1.7.3`)

- **Upstream `v1.7.3` (`4c1e000d8`):** Fully merged (`0` missing commits on `upstream/main`).
- **Audit Addendum A (`DeepTutor-audit-fork-bugs-and-ui.md`):** All 25 bugs and 7 UI contrast/a11y defects are already fixed (`48d8b2daa`).
- **Audit Addendum B (`DeepTutor-audit-fork-architecture-and-pruning.md`):** `PAR-01`..`PAR-09` and minor cleanups (`SUN-04`..`SUN-07`, `SUN-10`, `SUN-11`) are already fixed; defect log lives in `docs/DEFECT_LOG.md`.

---

## Confirmed Decisions to Implement

### ALPHA — `Alpha 3` Only (Explicitly Exclude `Alpha 4` and `Alpha 5`)
- **Explicit Exclusions:**
  - Do **NOT** promote/fast-forward `sync/v1.7.3` into `main` (`Alpha 4` declined).
  - Do **NOT** pull `upstream/dev` (`Alpha 5` declined).
- **1. Sync & Protocol Gaps:**
  - Add the 49 missing fork export/model translation keys to `web/locales/hu/app.json` and `web/locales/it/app.json` so they match `web/locales/en/app.json`.
  - Trim root `AGENTS.md` to repository-specific facts only (no duplicated master protocol) and replace `docs/VISUAL_GUIDE.html` with `docs/VISUAL_LOG.md` using Obsidian-compatible color-coded Mermaid diagrams.
- **2. High-Value Audit Quality-of-Life Features (`DeepTutor-audit-fork-oss-and-lateral.md`):**
  - **`L-09` (Prerequisite first):** Deterministic export snapshot tests over a fixed multi-element fixture before starting library migrations.
  - **`L-01`:** Export Presets (persisted in `data/user/settings/` with atomic locking), one-click "Export this answer", and remember last used preset.
  - **`L-06`:** Model preference portability (export/import) and stale/orphaned preference detection + one-click prune.
  - **`L-03`:** Anki-importable CSV flashcard export (`front,back,tags,source_session`) from quiz and mastery sessions.
- **3. Structural Export Overhaul (`DeepTutor-audit-fork-architecture-and-pruning.md` + Addendum C):**
  - **`OSS-01` / `SUN-01`:** Migrate DOCX generation (`web/lib/export/docx-builder.ts` + OMML) onto `dolanmiu/docx` (MIT).
  - **`OSS-02` / `SUN-02`:** Upgrade downloadable Unicode PDF export using `pdf-lib` + `@pdf-lib/fontkit` (subsetted Unicode font embedding) alongside the browser vector print path.
  - **`SUN-03`:** Decompose `web/features/export/ExportChatModal.tsx` (~892 lines) into `useExportSelection`, `ExportOptionsGrid`, and `ExportMessagePicker`.

### BRAVO — `Bravo 1` + `Bravo 4` + `Bravo 5` (Update-Proof Model & Harness Manager)
- **`Bravo 1` — Unified Web Settings UI + Upgraded `configure-ai` CLI:**
  - Provide both a browser UI inside DeepTutor Settings and an upgraded `scripts/configure_ai.py` wizard to add, edit, and remove API providers/models, subscription/OAuth accounts (e.g. Codex), and CLI harnesses.
  - Persist all user model/harness customizations in user-owned JSON under `data/user/settings/` so future upstream updates never cause merge conflicts or overwrite user setup.
- **`Bravo 4` — Live Model Sync & Custom Model Lists per Harness:**
  - Eliminate hardcoded fast-changing model catalogs in Python (`deeptutor/services/subagent/models.py`) by supporting live CLI model discovery/refresh + user-editable JSON lists and one-click removal/pruning of retired models (unifying the current split across `subagent.json`, `kb_config.json`, and `model_preferences.json`).
- **`Bravo 5` — Plug-and-Play Custom CLI & ACP Harnesses:**
  - Allow registering, configuring, and removing external CLI agents and ACP-compatible harnesses (`deeptutor/services/subagent/acp.py`) purely through user config and UI without modifying Python backend code.

### DELTA — `Delta 1` (Additional External CLI Harnesses)
- Wire up additional local CLI harnesses installed on this PC — specifically inspect and support globally installed **`omniroute`** alongside **`agy`** (Antigravity), **`cmdc`** (Command Code), **`opencode`**, and **`dsh`** (DeepSeek Harness), plus any other CLI agents the user names at kickoff.

### CHARLIE — Pending Confirmation (Local TTS: Paradee TTS)
- **Not yet selected in user feedback.** Before building TTS integration, confirm with the user which option they want for their downloaded **Paradee TTS** (`C:\Users\kazir\Services\paradee-tts`, port `8855`, OpenAI-compatible `/v1/audio/speech`, voices: `af_heart`, `am_puck`, `bf_isabella`, `bm_fable`):
  - **Charlie 1 *(recommended)*:** Full integration + voice picker + silent auto-start with DeepTutor.
  - **Charlie 2:** Settings-only OpenAI-compatible config (user starts Paradee manually).
  - **Charlie 3:** A different local TTS tool on the PC.

---

## Suggested Execution Sequence (When Starting in This Repo)

1. **Quick confirmation:** Confirm **Charlie** (Paradee TTS option) and whether any extra CLI tools beyond `omniroute` should be added under **Delta 1**.
2. **Wave 1 (Fast Wins & Safety Net):** Fix `hu`/`it` 49 missing locale keys, align `AGENTS.md` + `docs/VISUAL_LOG.md`, and add deterministic export snapshot tests (`L-09`).
3. **Wave 2 (Update-Proof Model & Harness System):** Implement `Bravo 1` + `Bravo 4` + `Bravo 5` + `Delta 1` (`L-06` stale preference pruning integrates naturally here), plus `Charlie` once confirmed.
4. **Wave 3 (Export Overhaul & QoL):** Decompose `ExportChatModal.tsx` (`SUN-03`), add Export Presets (`L-01`) and Anki CSV (`L-03`), then land `OSS-01` (DOCX) and `OSS-02` (PDF) as separate verified commits gated by `L-09`.

## Verification Gates
- `.venv/Scripts/python.exe -m compileall -q deeptutor deeptutor_cli`
- `cd web && npm run typecheck`
- `cd web && npm run test:unit` (including `tests/lib/chat-export-suite.spec.ts`)
```
