/**
 * Unified Exporter Coordinator.
 * Coordinates normalization, filtering, format generation, and file downloading.
 */

import { normalizeMessages, type InputMessage } from "./adapter";
import { buildDocxBlob } from "./docx-builder";
import { buildXlsxBlob } from "./xlsx-builder";
import { buildHtmlBlob, buildPublicationHtml } from "./html-builder";
import { buildPdfBlob } from "./pdf-builder";
import { buildMarkdownString } from "./markdown-builder";
import { buildJsonString, buildTextString } from "./text-builder";
import type {
  ExportFilterOptions,
  ExportFormat,
  ExportMetadata,
  ExportResult,
  NormalizedExportMessage,
} from "./types";
import { MAX_EXPORT_CHARS } from "./types";

export function sanitizeFilename(input: string): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|\n\r\t]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return cleaned || "deeptutor-chat";
}

/**
 * Refuses an export large enough to exhaust the tab. Several full copies of the
 * document coexist while a builder runs, so the ceiling is deliberately well
 * below the memory a browser will grant.
 */
function assertExportSize(messages: NormalizedExportMessage[]): void {
  let total = 0;
  for (const message of messages) {
    total += message.content.length + (message.thinking?.length ?? 0);
  }
  if (total > MAX_EXPORT_CHARS) {
    throw new Error(
      `This export is too large (${Math.round(total / 1_000_000)}M characters). ` +
        "Select fewer messages or turn off reasoning traces.",
    );
  }
}

export async function exportSession(
  rawMessages: InputMessage[],
  format: ExportFormat,
  options: ExportFilterOptions,
  metadata: ExportMetadata,
): Promise<ExportResult> {
  let messages = normalizeMessages(rawMessages);
  if (options.selectedMessageIds && options.selectedMessageIds.length > 0) {
    const selectedSet = new Set(options.selectedMessageIds.map(String));
    messages = messages.filter((m) => selectedSet.has(String(m.id)));
  }
  assertExportSize(messages);
  const baseName = sanitizeFilename(metadata.title || "conversation");
  const dateStr = (metadata.exportedAt ?? new Date()).toISOString().slice(0, 10);

  switch (format) {
    case "docx": {
      const blob = await buildDocxBlob(messages, options, metadata);
      return {
        blob,
        filename: `${baseName}-${dateStr}.docx`,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }
    case "xlsx": {
      const blob = await buildXlsxBlob(messages, options, metadata);
      return {
        blob,
        filename: `${baseName}-${dateStr}.xlsx`,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    }
    case "html": {
      const blob = await buildHtmlBlob(messages, options, metadata);
      return {
        blob,
        filename: `${baseName}-${dateStr}.html`,
        mimeType: "text/html;charset=utf-8",
      };
    }
    case "pdf": {
      const blob = await buildPdfBlob(messages, options, metadata);
      return {
        blob,
        filename: `${baseName}-${dateStr}.pdf`,
        mimeType: "application/pdf",
      };
    }
    case "markdown": {
      const md = buildMarkdownString(messages, options, metadata);
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      return {
        blob,
        filename: `${baseName}-${dateStr}.md`,
        mimeType: "text/markdown;charset=utf-8",
      };
    }
    case "json": {
      const json = buildJsonString(messages, options, metadata);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      return {
        blob,
        filename: `${baseName}-${dateStr}.json`,
        mimeType: "application/json;charset=utf-8",
      };
    }
    case "txt": {
      const txt = buildTextString(messages, options, metadata);
      const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
      return {
        blob,
        filename: `${baseName}-${dateStr}.txt`,
        mimeType: "text/plain;charset=utf-8",
      };
    }
  }

  // Exhaustiveness guard: adding an ExportFormat member without a builder now
  // fails the typecheck instead of surfacing as a runtime export error.
  const unsupported: never = format;
  throw new Error(`Unsupported export format: ${String(unsupported)}`);
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export async function copyExportToClipboard(
  rawMessages: InputMessage[],
  options: ExportFilterOptions,
  metadata: ExportMetadata,
): Promise<void> {
  let messages = normalizeMessages(rawMessages);
  if (options.selectedMessageIds && options.selectedMessageIds.length > 0) {
    const selectedSet = new Set(options.selectedMessageIds.map(String));
    messages = messages.filter((m) => selectedSet.has(String(m.id)));
  }
  assertExportSize(messages);
  const md = buildMarkdownString(messages, options, metadata);
  await navigator.clipboard.writeText(md);
}

/**
 * Triggers high-fidelity browser vector print / PDF generation via a publication-styled
 * offscreen iframe with KaTeX vector math, syntax highlighting, and CSS Paged Media.
 */
export function printPublicationPdf(
  rawMessages: InputMessage[],
  options: ExportFilterOptions,
  metadata: ExportMetadata,
): void {
  let messages = normalizeMessages(rawMessages);
  if (options.selectedMessageIds && options.selectedMessageIds.length > 0) {
    const selectedSet = new Set(options.selectedMessageIds.map(String));
    messages = messages.filter((m) => selectedSet.has(String(m.id)));
  }
  assertExportSize(messages);
  const html = buildPublicationHtml(messages, options, metadata);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.zIndex = "-999";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDoc = frameWindow?.document;
  if (!frameWindow || !frameDoc) {
    // Remove the frame before bailing out: an early return used to leak it.
    iframe.remove();
    return;
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  let removed = false;
  const removeFrame = () => {
    if (removed) return;
    removed = true;
    iframe.remove();
  };

  // A fixed delay both printed unrendered math on slow machines and removed
  // the frame mid-dialog on slow readers. Wait for fonts, then remove on
  // `afterprint` with a generous absolute backstop.
  frameWindow.addEventListener("afterprint", removeFrame, { once: true });

  const printWhenReady = () => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } catch (error) {
      console.error("Print invocation error:", error);
      removeFrame();
    }
  };

  const fontsReady = frameDoc.fonts?.ready ?? Promise.resolve();
  Promise.race([
    fontsReady,
    new Promise((resolve) => window.setTimeout(resolve, 5000)),
  ]).then(() => window.setTimeout(printWhenReady, 50));

  // Never leak the frame if `afterprint` never fires.
  window.setTimeout(removeFrame, 600000);
}
