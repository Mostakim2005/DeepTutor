/**
 * Self-contained HTML conversation export builder.
 * Produces a single, offline-ready web page with responsive light/dark theme,
 * collapsible reasoning traces, tool execution cards, citations, and print styles.
 */

import katex from "katex";
import type {
  ExportFilterOptions,
  ExportMetadata,
  NormalizedExportMessage,
} from "./types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMathInHtml(text: string): string {
  // Render display math $$...$$
  let result = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => {
    try {
      return `<div class="math-display">${katex.renderToString(latex.trim(), { displayMode: true, throwOnError: false })}</div>`;
    } catch {
      return `<div class="math-display"><code>${escapeHtml(latex)}</code></div>`;
    }
  });

  // Render inline math $...$
  result = result.replace(/(^|[^\$])\$([^\$\n]+?)\$(?!\$)/g, (_, prefix, latex) => {
    try {
      return `${prefix}<span class="math-inline">${katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false })}</span>`;
    } catch {
      return `${prefix}<code>${escapeHtml(latex)}</code>`;
    }
  });

  return result;
}

function markdownToHtml(md: string): string {
  let html = escapeHtml(md);

  // Math replacement before formatting
  html = renderMathInHtml(html);

  // Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // Inline Code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Links
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // Headings
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, "<blockquote>$1</blockquote>");

  // Code Fences
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<div class="code-block"><div class="code-header">${escapeHtml(lang || "CODE")}</div><pre><code>${code}</code></pre></div>`;
  });

  // Paragraphs
  html = html
    .split(/\n\n+/)
    .map((p) => {
      p = p.trim();
      if (!p) return "";
      if (
        p.startsWith("<h") ||
        p.startsWith("<div") ||
        p.startsWith("<blockquote") ||
        p.startsWith("<table")
      ) {
        return p;
      }
      return `<p>${p.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");

  return html;
}

export async function buildHtmlBlob(
  messages: NormalizedExportMessage[],
  options: ExportFilterOptions,
  metadata: ExportMetadata,
): Promise<Blob> {
  const title = escapeHtml(metadata.title || "DeepTutor Conversation");
  const dateStr = (metadata.exportedAt ?? new Date()).toLocaleString();

  const messagesHtml: string[] = [];
  const tocLinks: string[] = [];
  let questionCount = 0;

  for (let mIdx = 0; mIdx < messages.length; mIdx++) {
    const msg = messages[mIdx];
    if (msg.role === "user" && !options.includeUserPrompts) {
      continue;
    }

    const isUser = msg.role === "user";
    const capBadge = msg.capability
      ? `<span class="badge capability">${escapeHtml(msg.capability)}</span>`
      : "";
    const roleClass = isUser ? "role-user" : "role-assistant";

    if (isUser) {
      questionCount++;
      const snippet = escapeHtml(msg.content.trim().slice(0, 75).replace(/[\r\n]+/g, " "));
      tocLinks.push(`<li><a href="#turn-${mIdx + 1}"><strong>Q${questionCount}:</strong> ${snippet}${msg.content.length > 75 ? "…" : ""}</a></li>`);
    }

    let msgContent = `<div id="turn-${mIdx + 1}" class="message ${roleClass}">`;
    if (isUser) {
      msgContent += `<div class="message-header"><span class="speaker user-pill">YOU</span></div>`;
    } else {
      const modelBadge = msg.model ? `<span class="badge model-pill">${escapeHtml(msg.model)}</span>` : "";
      msgContent += `<div class="message-header"><span class="speaker assistant-pill">DEEPTUTOR</span>${modelBadge}${capBadge}</div>`;
    }

    // Thinking
    if (options.includeThinking && msg.thinking?.trim()) {
      msgContent += `
        <details class="thinking-card" open>
          <summary>Reasoning &amp; Chain of Thought</summary>
          <div class="thinking-body">${markdownToHtml(msg.thinking.trim())}</div>
        </details>
      `;
    }

    // Tool Invocations
    if (options.includeToolCalls && msg.toolCalls?.length) {
      for (const call of msg.toolCalls) {
        msgContent += `
          <details class="tool-card">
            <summary>Tool Execution: <code>${escapeHtml(call.name)}</code></summary>
            <div class="tool-body">
              ${call.args ? `<pre><code>${escapeHtml(JSON.stringify(call.args, null, 2))}</code></pre>` : ""}
              ${
                options.includeToolResults && call.result
                  ? `<div class="tool-result-label">Result:</div><pre class="tool-result"><code>${escapeHtml(call.result.slice(0, 3000))}</code></pre>`
                  : ""
              }
            </div>
          </details>
        `;
      }
    }

    // Content
    if (msg.content?.trim()) {
      msgContent += `<div class="message-body">${markdownToHtml(msg.content)}</div>`;
    }

    // Tables
    if (options.includeTables && msg.tables?.length) {
      for (const tbl of msg.tables) {
        msgContent += `<div class="table-container">`;
        if (tbl.title) {
          msgContent += `<h4>${escapeHtml(tbl.title)}</h4>`;
        }
        msgContent += `<table><thead><tr>`;
        tbl.headers.forEach((h) => {
          msgContent += `<th>${escapeHtml(h)}</th>`;
        });
        msgContent += `</tr></thead><tbody>`;
        tbl.rows.forEach((row) => {
          msgContent += `<tr>`;
          row.forEach((cell) => {
            msgContent += `<td>${escapeHtml(cell)}</td>`;
          });
          msgContent += `</tr>`;
        });
        msgContent += `</tbody></table></div>`;
      }
    }

    // Sources & Citations
    if (options.includeSources && msg.sources?.length) {
      msgContent += `<div class="sources-list"><h5>Sources &amp; Citations</h5><ol>`;
      for (const src of msg.sources) {
        msgContent += `<li><a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.title)}</a></li>`;
      }
      msgContent += `</ol></div>`;
    }

    // Artifacts
    if (options.includeArtifacts && msg.artifacts?.length) {
      msgContent += `<div class="artifacts-list"><h5>Attached Artifacts</h5><ul>`;
      for (const art of msg.artifacts) {
        const name = escapeHtml(art.filename || art.type);
        msgContent += `<li><strong>${name}</strong>${art.mime_type ? ` <code>(${escapeHtml(art.mime_type)})</code>` : ""}`;
        if (art.content && art.content.length < 3000) {
          msgContent += `<pre><code>${escapeHtml(art.content)}</code></pre>`;
        }
        msgContent += `</li>`;
      }
      msgContent += `</ul></div>`;
    }

    msgContent += `</div>`;
    messagesHtml.push(msgContent);
  }

  const documentHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.27/dist/katex.min.css"/>
  <style>
    :root {
      --bg: #ffffff;
      --text: #1f2328;
      --muted: #656d76;
      --border: #d0d7de;
      --soft: #f6f8fa;
      --user-bg: #f0f6ff;
      --user-border: #c8d9ff;
      --user-accent: #0969da;
      --assistant-accent: #8250df;
      --code-bg: #f6f8fa;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0d1117;
        --text: #e6edf3;
        --muted: #8d96a0;
        --border: #30363d;
        --soft: #161b22;
        --user-bg: #13233a;
        --user-border: #1f3a64;
        --user-accent: #58a6ff;
        --assistant-accent: #bc8cff;
        --code-bg: #161b22;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 2rem;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
    }
    h1 { margin: 0 0 0.5rem 0; font-size: 1.8rem; }
    .meta { color: var(--muted); font-size: 0.9rem; }
    .message {
      margin-bottom: 2rem;
      padding: 1.25rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--bg);
    }
    .message.role-user {
      background: var(--user-bg);
      border-color: var(--user-border);
    }
    .message-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      font-weight: 600;
    }
    .role-user .speaker { color: var(--user-accent); }
    .role-assistant .speaker { color: var(--assistant-accent); }
    .badge {
      font-size: 0.75rem;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      background: var(--soft);
      border: 1px solid var(--border);
      color: var(--muted);
      font-weight: normal;
    }
    details {
      margin: 0.75rem 0;
      padding: 0.5rem 0.75rem;
      border-radius: 8px;
      background: var(--soft);
      border: 1px solid var(--border);
      font-size: 0.9rem;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
      color: var(--muted);
      user-select: none;
    }
    .thinking-card { border-left: 4px solid var(--assistant-accent); }
    .tool-card { border-left: 4px solid var(--user-accent); }
    .code-block {
      margin: 1rem 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      background: var(--code-bg);
    }
    .code-header {
      padding: 0.35rem 0.75rem;
      background: var(--border);
      font-size: 0.75rem;
      font-weight: bold;
      color: var(--muted);
    }
    pre {
      margin: 0;
      padding: 0.75rem;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 0.85rem;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      background: var(--soft);
      padding: 0.1rem 0.3rem;
      border-radius: 4px;
      font-size: 0.9em;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
      font-size: 0.9rem;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th, td {
      border: 1px solid var(--border);
      padding: 0.5rem 0.75rem;
      text-align: left;
    }
    th { background: var(--soft); font-weight: 600; }
    .toc-card {
      margin-bottom: 2rem;
      padding: 1rem 1.25rem;
      border-radius: 10px;
      background: var(--soft);
      border: 1px solid var(--border);
    }
    .toc-card summary { font-size: 1rem; font-weight: 600; cursor: pointer; color: var(--text); }
    .toc-list { margin: 0.75rem 0 0.25rem 0; padding-left: 1.25rem; list-style-type: decimal; }
    .toc-list li { margin-bottom: 0.35rem; font-size: 0.9rem; }
    blockquote {
      margin: 1rem 0;
      padding-left: 1rem;
      border-left: 3px solid var(--border);
      color: var(--muted);
    }
    a { color: var(--user-accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    @media print {
      body { padding: 0; background: #fff; color: #000; }
      .message { break-inside: avoid; border: 1px solid #ccc; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      details[open] summary ~ * { display: block; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${title}</h1>
      <div class="meta">${dateStr}</div>
    </header>
    <main>
      ${tocLinks.length > 0 ? `
      <details class="toc-card" open>
        <summary>Table of Contents (${tocLinks.length} questions)</summary>
        <ol class="toc-list">
          ${tocLinks.join("\n")}
        </ol>
      </details>
      ` : ""}
      ${messagesHtml.join("\n")}
    </main>
  </div>
</body>
</html>`;

  return new Blob([documentHtml], { type: "text/html;charset=utf-8" });
}
