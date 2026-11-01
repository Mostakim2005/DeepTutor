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
} from "./types";

export function sanitizeFilename(input: string): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|\n\r\t]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return cleaned || "deeptutor-chat";
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
  const baseName = sanitizeFilename(metadata.title || "conversation");
  const dateStr = new Date().toISOString().slice(0, 10);

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
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
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

  const frameDoc = iframe.contentWindow?.document;
  if (!frameDoc) return;

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  // Allow KaTeX fonts, CSS stylesheets, and images to settle before triggering print
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error("Print invocation error:", e);
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      }, 60000);
    }
  }, 450);
}
