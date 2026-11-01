/**
 * Publication-Grade HTML & Vector Print Export Builder.
 * Produces an offline-ready, standalone HTML document with embedded KaTeX vector math,
 * syntax-highlighted code blocks, inline tables with repeated headers, and CSS Paged Media
 * matching the publication standard seen in reference Claude exports.
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

function parseMarkdownTable(lines: string[]): string {
  if (lines.length < 2) return lines.join("\n");

  const headerLine = lines[0].trim();
  const sepLine = lines[1].trim();

  const parseCells = (line: string): string[] => {
    return line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  };

  const headers = parseCells(headerLine);
  const sepCells = parseCells(sepLine);

  if (headers.length === 0 || sepCells.length !== headers.length) {
    return lines.join("\n");
  }

  // Parse alignments (:--- = left, :---: = center, ---: = right)
  const alignments = sepCells.map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });

  let html = '<div class="table-container"><table><thead><tr>';
  headers.forEach((h, idx) => {
    const align = alignments[idx] || "left";
    html += `<th style="text-align: ${align}">${parseInlineMarkdown(h)}</th>`;
  });
  html += "</tr></thead><tbody>";

  for (let i = 2; i < lines.length; i++) {
    const rowLine = lines[i].trim();
    if (!rowLine.includes("|")) continue;
    const rowCells = parseCells(rowLine);
    html += "<tr>";
    headers.forEach((_, idx) => {
      const cell = rowCells[idx] ?? "";
      const align = alignments[idx] || "left";
      html += `<td style="text-align: ${align}">${parseInlineMarkdown(cell)}</td>`;
    });
    html += "</tr>";
  }

  html += "</tbody></table></div>";
  return html;
}

function parseInlineMarkdown(text: string): string {
  let res = escapeHtml(text);
  // Bold & Italic
  res = res.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>");
  res = res.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  res = res.replace(/\*(.*?)\*/g, "<em>$1</em>");
  // Strikethrough
  res = res.replace(/~~(.*?)~~/g, "<del>$1</del>");
  // Links
  res = res.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  // Keyboard tags and sub/sup
  res = res.replace(/&lt;kbd&gt;(.*?)&lt;\/kbd&gt;/gi, "<kbd>$1</kbd>");
  res = res.replace(/&lt;sub&gt;(.*?)&lt;\/sub&gt;/gi, "<sub>$1</sub>");
  res = res.replace(/&lt;sup&gt;(.*?)&lt;\/sup&gt;/gi, "<sup>$1</sup>");
  res = res.replace(/&lt;mark&gt;(.*?)&lt;\/mark&gt;/gi, "<mark>$1</mark>");
  return res;
}

export function markdownToHtml(md: string): string {
  if (!md) return "";

  const masks: string[] = [];
  const mask = (snippet: string): string => {
    masks.push(snippet);
    return `\u0000MASK_${masks.length - 1}\u0000`;
  };

  let content = md.replace(/\r\n/g, "\n");

  // Step 1: Mask and render Fenced Code Blocks
  content = content.replace(
    /^```([a-zA-Z0-9_-]*)\n([\s\S]*?)\n```$/gm,
    (_, lang, code) => {
      const safeCode = escapeHtml(code);
      const languageBadge = (lang || "CODE").toUpperCase();
      const codeHtml = `<div class="code-block"><div class="code-header">${escapeHtml(languageBadge)}</div><pre><code>${safeCode}</code></pre></div>`;
      return mask(codeHtml);
    },
  );

  // Step 2: Mask and render Display Math $$...$$
  content = content.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => {
    try {
      const mathHtml = `<div class="math-display">${katex.renderToString(latex.trim(), {
        displayMode: true,
        throwOnError: false,
      })}</div>`;
      return mask(mathHtml);
    } catch {
      return mask(`<div class="math-display"><code>${escapeHtml(latex.trim())}</code></div>`);
    }
  });

  // Step 3: Mask and render Inline Math $...$
  content = content.replace(
    /(^|[^\\])\$([^\$\n]+?)\$(?!\$)/g,
    (_, prefix, latex) => {
      try {
        const mathHtml = `<span class="math-inline">${katex.renderToString(latex.trim(), {
          displayMode: false,
          throwOnError: false,
        })}</span>`;
        return `${prefix}${mask(mathHtml)}`;
      } catch {
        return `${prefix}${mask(`<code>${escapeHtml(latex.trim())}</code>`)}`;
      }
    },
  );

  // Step 4: Mask Inline Code `...`
  content = content.replace(/`([^`\n]+)`/g, (_, code) => {
    return mask(`<code>${escapeHtml(code)}</code>`);
  });

  // Step 5: Process lines for Tables, Lists, Headings, and Paragraphs
  const rawLines = content.split("\n");
  const processedBlocks: string[] = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Markdown Table Start
    if (
      trimmed.startsWith("|") &&
      i + 1 < rawLines.length &&
      rawLines[i + 1].trim().startsWith("|") &&
      rawLines[i + 1].includes("---")
    ) {
      const tableLines: string[] = [];
      while (i < rawLines.length && rawLines[i].trim().startsWith("|")) {
        tableLines.push(rawLines[i]);
        i++;
      }
      processedBlocks.push(parseMarkdownTable(tableLines));
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = parseInlineMarkdown(headingMatch[2].trim());
      const slug = headingMatch[2]
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
      processedBlocks.push(`<h${level} id="${slug}">${text}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      processedBlocks.push("<hr/>");
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < rawLines.length && rawLines[i].trim().startsWith(">")) {
        quoteLines.push(rawLines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      const quoteBody = markdownToHtml(quoteLines.join("\n"));
      processedBlocks.push(`<blockquote>${quoteBody}</blockquote>`);
      continue;
    }

    // Lists (unordered / ordered / task lists)
    if (/^(\*|-|\+|\d+\.)\s/.test(trimmed)) {
      const isOrdered = /^\d+\.\s/.test(trimmed);
      const listTag = isOrdered ? "ol" : "ul";
      let listHtml = `<${listTag}>`;

      while (i < rawLines.length && /^(\*|-|\+|\d+\.)\s/.test(rawLines[i].trim())) {
        const itemLine = rawLines[i].trim().replace(/^(\*|-|\+|\d+\.)\s+/, "");
        // Check for task checkbox
        const taskCheckMatch = /^\[([ xX])\]\s+(.*)$/.exec(itemLine);
        if (taskCheckMatch) {
          const checked = taskCheckMatch[1].toLowerCase() === "x";
          const taskText = parseInlineMarkdown(taskCheckMatch[2]);
          listHtml += `<li class="task-item"><input type="checkbox" ${checked ? "checked" : ""} disabled/> ${taskText}</li>`;
        } else {
          listHtml += `<li>${parseInlineMarkdown(itemLine)}</li>`;
        }
        i++;
      }
      listHtml += `</${listTag}>`;
      processedBlocks.push(listHtml);
      continue;
    }

    // Plain Paragraph
    const paraLines: string[] = [];
    while (
      i < rawLines.length &&
      rawLines[i].trim() &&
      !rawLines[i].trim().startsWith("#") &&
      !rawLines[i].trim().startsWith("|") &&
      !rawLines[i].trim().startsWith(">") &&
      !/^(\*|-|\+|\d+\.)\s/.test(rawLines[i].trim()) &&
      !/^(\*{3,}|-{3,}|_{3,})$/.test(rawLines[i].trim())
    ) {
      paraLines.push(rawLines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      const paraText = paraLines.map(parseInlineMarkdown).join("<br/>");
      processedBlocks.push(`<p>${paraText}</p>`);
    }
  }

  // Restore all masked blocks
  let result = processedBlocks.join("\n");
  for (let idx = 0; idx < masks.length; idx++) {
    result = result.replace(`\u0000MASK_${idx}\u0000`, () => masks[idx]);
  }

  return result;
}

export function buildPublicationHtml(
  messages: NormalizedExportMessage[],
  options: ExportFilterOptions,
  metadata: ExportMetadata,
): string {
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
      tocLinks.push(
        `<li><a href="#turn-${mIdx + 1}"><strong>Q${questionCount}:</strong> ${snippet}${msg.content.length > 75 ? "…" : ""}</a></li>`,
      );
    }

    let msgContent = `<div id="turn-${mIdx + 1}" class="message ${roleClass}">`;
    if (isUser) {
      msgContent += `<div class="message-header"><span class="speaker user-pill">YOU</span></div>`;
    } else {
      const modelBadge = msg.model
        ? `<span class="badge model-pill">${escapeHtml(msg.model)}</span>`
        : "";
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

  return `<!DOCTYPE html>
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
      --muted: #57606a;
      --border: #d0d7de;
      --soft: #f6f8fa;
      --user-bg: #f0f6ff;
      --user-border: #c8d9ff;
      --user-accent: #0969da;
      --assistant-accent: #1f2328;
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
        --assistant-accent: #e6edf3;
        --code-bg: #161b22;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 2.5rem 2rem;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", "Noto Sans CJK SC", "Noto Sans Devanagari", "Noto Sans Bengali", Helvetica, Arial, sans-serif;
      font-size: 14.5px;
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 2rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--border);
    }
    h1.doc-title { margin: 0 0 0.5rem 0; font-size: 2rem; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
    .meta { color: var(--muted); font-size: 0.85rem; }
    
    .message {
      margin-bottom: 2.5rem;
      padding: 1.25rem 1.5rem;
      border-radius: 12px;
      background: var(--bg);
    }
    .message.role-user {
      background: var(--user-bg);
      border-left: 4px solid var(--user-accent);
      border-radius: 4px 12px 12px 4px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 2rem;
    }
    .message.role-assistant {
      background: transparent;
      padding: 0.5rem 0 2rem 0;
      border-bottom: 1px solid var(--border);
      border-radius: 0;
    }
    .message-header {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-bottom: 1rem;
      font-weight: 700;
      font-size: 0.85rem;
      letter-spacing: 0.05em;
    }
    .role-user .speaker { color: var(--user-accent); font-weight: 800; }
    .role-assistant .speaker { color: var(--assistant-accent); font-weight: 800; }
    
    .badge {
      font-size: 0.72rem;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      background: var(--soft);
      border: 1px solid var(--border);
      color: var(--muted);
      font-weight: 500;
      letter-spacing: normal;
    }
    details {
      margin: 1rem 0;
      padding: 0.6rem 0.9rem;
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
    .thinking-card { border-left: 3px solid #8250df; }
    .tool-card { border-left: 3px solid var(--user-accent); }
    
    .code-block {
      margin: 1.25rem 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      background: var(--code-bg);
      break-inside: avoid;
    }
    .code-header {
      padding: 0.35rem 0.75rem;
      background: #eaeef2;
      font-size: 0.75rem;
      font-weight: 700;
      color: #57606a;
      border-bottom: 1px solid var(--border);
    }
    @media (prefers-color-scheme: dark) {
      .code-header { background: #21262d; color: #8b949e; }
    }
    pre {
      margin: 0;
      padding: 0.9rem 1rem;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 0.86rem;
      line-height: 1.5;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      background: var(--soft);
      padding: 0.15rem 0.35rem;
      border-radius: 4px;
      font-size: 0.88em;
    }
    pre code {
      background: transparent;
      padding: 0;
      border-radius: 0;
    }
    
    .math-display {
      margin: 1.25rem 0;
      overflow-x: auto;
      padding: 0.5rem 0;
      text-align: center;
      break-inside: avoid;
    }
    .math-inline {
      padding: 0 0.15em;
    }
    
    .table-container {
      margin: 1.25rem 0;
      overflow-x: auto;
      break-inside: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
      line-height: 1.5;
    }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td {
      border: 1px solid var(--border);
      padding: 0.55rem 0.85rem;
    }
    th {
      background: var(--soft);
      font-weight: 600;
      color: var(--text);
    }
    tbody tr:nth-child(even) {
      background: rgba(0, 0, 0, 0.015);
    }
    
    h1, h2, h3, h4, h5, h6 {
      color: var(--text);
      font-weight: 600;
      margin-top: 1.75rem;
      margin-bottom: 0.75rem;
      line-height: 1.3;
      break-after: avoid;
    }
    h1 { font-size: 1.6rem; }
    h2 { font-size: 1.35rem; border-bottom: 1px solid var(--border); padding-bottom: 0.35rem; }
    h3 { font-size: 1.15rem; }
    h4 { font-size: 1rem; }
    
    p { margin: 0.85rem 0; }
    ul, ol { margin: 0.85rem 0; padding-left: 1.6rem; }
    li { margin: 0.3rem 0; }
    li.task-item { list-style-type: none; margin-left: -1.2rem; }
    
    blockquote {
      margin: 1.25rem 0;
      padding: 0.5rem 1rem;
      border-left: 3.5px solid #0969da;
      background: var(--soft);
      color: var(--muted);
      border-radius: 0 6px 6px 0;
    }
    a { color: #0969da; text-decoration: none; }
    a:hover { text-decoration: underline; }
    
    .toc-card {
      margin-bottom: 2rem;
      padding: 1rem 1.25rem;
      border-radius: 10px;
      background: var(--soft);
      border: 1px solid var(--border);
    }
    .toc-card summary { font-size: 1rem; font-weight: 600; cursor: pointer; color: var(--text); }
    .toc-list { margin: 0.75rem 0 0.25rem 0; padding-left: 1.25rem; list-style-type: decimal; }
    .toc-list li { margin-bottom: 0.35rem; font-size: 0.88rem; }
    
    /* Publication Paged Media Styles */
    @page {
      size: A4;
      margin: 16mm 14mm 18mm 14mm;
      @bottom-right {
        content: counter(page) " / " counter(pages);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 8.5pt;
        color: #656d76;
      }
    }
    @media print {
      body {
        padding: 0;
        background: #ffffff !important;
        color: #1f2328 !important;
        font-size: 10pt;
      }
      .container { max-width: 100%; }
      header { margin-bottom: 1.25rem; padding-bottom: 0.75rem; }
      .message.role-user {
        background: #f0f6ff !important;
        border-left: 4px solid #0969da !important;
        padding: 10pt 12pt;
        break-inside: avoid;
      }
      .message.role-assistant {
        background: transparent !important;
        border-bottom: 1px solid #d0d7de !important;
        padding: 6pt 0 16pt 0;
      }
      thead { display: table-header-group !important; }
      tr { break-inside: avoid !important; }
      pre, .code-block, .math-display, blockquote, .toc-card {
        break-inside: avoid !important;
      }
      h1, h2, h3, h4 { break-after: avoid !important; }
      details { border: 1px solid #d0d7de !important; }
      details[open] summary ~ * { display: block !important; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1 class="doc-title">${title}</h1>
      <div class="meta">${dateStr}</div>
    </header>
    <main>
      ${
        tocLinks.length > 0
          ? `
      <details class="toc-card" open>
        <summary>Table of Contents (${tocLinks.length} questions)</summary>
        <ol class="toc-list">
          ${tocLinks.join("\n")}
        </ol>
      </details>
      `
          : ""
      }
      ${messagesHtml.join("\n")}
    </main>
  </div>
</body>
</html>`;
}

export async function buildHtmlBlob(
  messages: NormalizedExportMessage[],
  options: ExportFilterOptions,
  metadata: ExportMetadata,
): Promise<Blob> {
  const documentHtml = buildPublicationHtml(messages, options, metadata);
  return new Blob([documentHtml], { type: "text/html;charset=utf-8" });
}
