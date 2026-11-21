/**
 * Downloadable PDF generator built on `pdf-lib` + `@pdf-lib/fontkit` (OSS-02 / SUN-02).
 *
 * Supports subsetted Unicode font embedding via `metadata.unicodeFontBytes`
 * (using `@pdf-lib/fontkit`), deterministic creation/modification timestamps
 * for L-09 snapshot stability, multi-page wrapping for prose, code blocks, and
 * tables with repeating headers, plus graceful fallback to StandardFonts when
 * no custom font bytes are provided.
 */

import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import {
  EXPORT_LIMITS,
  type ExportFilterOptions,
  type ExportMetadata,
  type ExportTable,
  type NormalizedExportMessage,
} from "./types";

const PAGE_WIDTH = 595.28; // A4 portrait in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_HEIGHT = 24;

function sanitizeForFont(text: string, isUnicodeFont: boolean): string {
  const normalized = (text || "").replace(/\r\n/g, "\n").replace(/\t/g, "  ");
  if (isUnicodeFont) return normalized;
  // StandardFonts only support WinAnsi (Latin-1 printable range).
  return normalized.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
}

function wrapLine(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  if (!text) return [""];
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let current = "";

  for (const part of words) {
    const candidate = current + part;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current.trimEnd()) {
        lines.push(current.trimEnd());
        current = part.trimStart();
      } else {
        // Hard-break a single overlong token (e.g., URL or long identifier)
        let chunk = "";
        for (const ch of part) {
          if (font.widthOfTextAtSize(chunk + ch, fontSize) <= maxWidth) {
            chunk += ch;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      }
    }
  }
  if (current || lines.length === 0) {
    lines.push(current.trimEnd());
  }
  return lines;
}

export async function buildPdfBlob(
  messages: NormalizedExportMessage[],
  options: ExportFilterOptions,
  metadata: ExportMetadata,
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const exportedAt = metadata.exportedAt ?? new Date();
  const title = metadata.title || "DeepTutor Conversation";

  pdfDoc.setTitle(title);
  pdfDoc.setCreator("DeepTutor");
  pdfDoc.setProducer("DeepTutor (pdf-lib + fontkit)");
  pdfDoc.setCreationDate(exportedAt);
  pdfDoc.setModificationDate(exportedAt);

  let isUnicode = false;
  let regularFont: PDFFont;
  let boldFont: PDFFont;
  let monoFont: PDFFont;

  if (metadata.unicodeFontBytes && metadata.unicodeFontBytes.byteLength > 0) {
    pdfDoc.registerFontkit(fontkit);
    regularFont = await pdfDoc.embedFont(metadata.unicodeFontBytes, { subset: true });
    boldFont = regularFont;
    monoFont = regularFont;
    isUnicode = true;
  } else {
    regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    monoFont = await pdfDoc.embedFont(StandardFonts.Courier);
  }

  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < MARGIN + FOOTER_HEIGHT) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cursorY = PAGE_HEIGHT - MARGIN;
    }
  };

  const drawWrapped = (
    rawText: string,
    opts: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      lineGap?: number;
      bgFill?: ReturnType<typeof rgb>;
      leftAccent?: ReturnType<typeof rgb>;
    } = {},
  ) => {
    const font = opts.font ?? regularFont;
    const size = opts.size ?? 10;
    const color = opts.color ?? rgb(0.12, 0.14, 0.16);
    const indent = opts.indent ?? 0;
    const lineHeight = size + (opts.lineGap ?? 4);
    const maxWidth = CONTENT_WIDTH - indent;
    const safe = sanitizeForFont(rawText, isUnicode);

    for (const rawLine of safe.split("\n")) {
      const wrapped = wrapLine(rawLine, font, size, maxWidth);
      for (const line of wrapped) {
        ensureSpace(lineHeight + 2);
        if (opts.bgFill) {
          page.drawRectangle({
            x: MARGIN + indent - 4,
            y: cursorY - lineHeight + 3,
            width: maxWidth + 8,
            height: lineHeight,
            color: opts.bgFill,
          });
        }
        if (opts.leftAccent) {
          page.drawRectangle({
            x: MARGIN + indent - 4,
            y: cursorY - lineHeight + 3,
            width: 2.5,
            height: lineHeight,
            color: opts.leftAccent,
          });
        }
        if (line) {
          page.drawText(line, {
            x: MARGIN + indent,
            y: cursorY - size,
            size,
            font,
            color,
          });
        }
        cursorY -= lineHeight;
      }
    }
  };

  const drawTable = (tbl: ExportTable) => {
    const colCount = Math.max(tbl.headers.length, ...tbl.rows.map((r) => r.length), 1);
    const colWidth = CONTENT_WIDTH / colCount;
    const cellFontSize = 8.5;
    const cellLineHeight = 11.5;
    const cellPad = 4;

    const renderRow = (cells: string[], isHeader: boolean, rowIndex: number) => {
      const wrappedCells = Array.from({ length: colCount }, (_, cIdx) => {
        const safe = sanitizeForFont(cells[cIdx] ?? "", isUnicode);
        return wrapLine(safe, isHeader ? boldFont : regularFont, cellFontSize, colWidth - cellPad * 2);
      });
      const maxLines = Math.max(...wrappedCells.map((lines) => lines.length), 1);
      const rowHeight = maxLines * cellLineHeight + cellPad * 2;

      if (cursorY - rowHeight < MARGIN + FOOTER_HEIGHT) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        cursorY = PAGE_HEIGHT - MARGIN;
        if (!isHeader) {
          renderRow(tbl.headers, true, -1);
        }
      }

      const bgColor = isHeader
        ? rgb(0.94, 0.96, 1.0)
        : rowIndex % 2 === 1
          ? rgb(0.98, 0.98, 0.99)
          : rgb(1, 1, 1);

      page.drawRectangle({
        x: MARGIN,
        y: cursorY - rowHeight,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: bgColor,
        borderColor: rgb(0.82, 0.84, 0.87),
        borderWidth: 0.5,
      });

      for (let c = 0; c < colCount; c++) {
        const cellX = MARGIN + c * colWidth;
        if (c > 0) {
          page.drawLine({
            start: { x: cellX, y: cursorY },
            end: { x: cellX, y: cursorY - rowHeight },
            thickness: 0.5,
            color: rgb(0.86, 0.88, 0.9),
          });
        }
        const lines = wrappedCells[c] ?? [];
        lines.forEach((line, lIdx) => {
          page.drawText(line, {
            x: cellX + cellPad,
            y: cursorY - cellPad - cellFontSize - lIdx * cellLineHeight,
            size: cellFontSize,
            font: isHeader ? boldFont : regularFont,
            color: rgb(0.12, 0.14, 0.16),
          });
        });
      }
      cursorY -= rowHeight;
    };

    if (tbl.title) {
      drawWrapped(tbl.title, { font: boldFont, size: 9.5, lineGap: 4 });
    }
    renderRow(tbl.headers, true, -1);
    tbl.rows.forEach((row, rIdx) => renderRow(row, false, rIdx));
    cursorY -= 8;
  };

  // Document Title & Metadata
  drawWrapped(title, { font: boldFont, size: 18, lineGap: 6, color: rgb(0.12, 0.14, 0.16) });
  const metaParts = [`Exported: ${exportedAt.toLocaleString()}`];
  if (metadata.workspaceName) metaParts.push(`Workspace: ${metadata.workspaceName}`);
  if (metadata.capability) metaParts.push(`Capability: ${metadata.capability}`);
  drawWrapped(metaParts.join("  |  "), {
    font: regularFont,
    size: 8.5,
    color: rgb(0.4, 0.43, 0.46),
    lineGap: 6,
  });

  ensureSpace(10);
  page.drawLine({
    start: { x: MARGIN, y: cursorY },
    end: { x: PAGE_WIDTH - MARGIN, y: cursorY },
    thickness: 0.75,
    color: rgb(0.82, 0.84, 0.87),
  });
  cursorY -= 14;

  for (const msg of messages) {
    const isUser = msg.role === "user";
    if (isUser && !options.includeUserPrompts) continue;

    const speaker = isUser ? "YOU" : `DEEPTUTOR${msg.model ? ` [${msg.model}]` : ""}`;
    ensureSpace(24);
    drawWrapped(speaker, {
      font: boldFont,
      size: 10,
      color: isUser ? rgb(0.04, 0.41, 0.85) : rgb(0.43, 0.25, 0.79),
      bgFill: isUser ? rgb(0.94, 0.96, 1.0) : undefined,
      leftAccent: isUser ? rgb(0.04, 0.41, 0.85) : undefined,
      indent: isUser ? 6 : 0,
      lineGap: 5,
    });

    if (options.includeThinking && msg.thinking) {
      drawWrapped(`Reasoning: ${msg.thinking}`, {
        font: regularFont,
        size: 9,
        color: rgb(0.35, 0.38, 0.42),
        indent: 10,
        bgFill: rgb(0.96, 0.94, 1.0),
        leftAccent: rgb(0.51, 0.31, 0.87),
        lineGap: 3.5,
      });
      cursorY -= 4;
    }

    // Parse fenced code blocks vs prose
    const lines = msg.content.replace(/\r\n/g, "\n").split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i] ?? "";
      const trimmed = line.trim();
      if (trimmed.startsWith("```")) {
        const lang = trimmed.slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
          codeLines.push(lines[i] ?? "");
          i++;
        }
        i++;
        if (lang) {
          drawWrapped(lang.toUpperCase(), {
            font: boldFont,
            size: 8,
            color: rgb(0.34, 0.38, 0.42),
            indent: 8,
            bgFill: rgb(0.92, 0.93, 0.95),
            lineGap: 3,
          });
        }
        drawWrapped(codeLines.join("\n"), {
          font: monoFont,
          size: 8.5,
          color: rgb(0.14, 0.16, 0.18),
          indent: 8,
          bgFill: rgb(0.96, 0.97, 0.98),
          leftAccent: rgb(0.82, 0.84, 0.87),
          lineGap: 3,
        });
        cursorY -= 4;
        continue;
      }

      if (trimmed.length > 0) {
        drawWrapped(line, { font: regularFont, size: 10, lineGap: 4 });
      } else {
        cursorY -= 4;
      }
      i++;
    }

    if (options.includeTables && msg.tables && msg.tables.length > 0) {
      cursorY -= 4;
      for (const tbl of msg.tables) {
        drawTable(tbl);
      }
    }

    if (options.includeToolCalls && msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        const args = tc.args ? ` ${JSON.stringify(tc.args)}` : "";
        drawWrapped(`Tool: ${tc.name}${args}`, {
          font: monoFont,
          size: 8.5,
          color: rgb(0.45, 0.32, 0.02),
          indent: 8,
          bgFill: rgb(1.0, 0.97, 0.77),
          lineGap: 3,
        });
        if (options.includeToolResults && tc.result) {
          drawWrapped(tc.result.slice(0, EXPORT_LIMITS.toolResult), {
            font: monoFont,
            size: 8,
            color: rgb(0.34, 0.38, 0.42),
            indent: 14,
            lineGap: 3,
          });
        }
      }
    }

    if (options.includeSources && msg.sources && msg.sources.length > 0) {
      drawWrapped("Sources & Citations", {
        font: boldFont,
        size: 9.5,
        color: rgb(0.04, 0.41, 0.85),
        lineGap: 3,
      });
      for (const src of msg.sources) {
        const snippet = src.snippet ? ` — ${src.snippet.slice(0, EXPORT_LIMITS.sourceSnippet)}` : "";
        drawWrapped(`• ${src.title || src.url} (${src.url})${snippet}`, {
          font: regularFont,
          size: 8.5,
          color: rgb(0.34, 0.38, 0.42),
          indent: 8,
          lineGap: 3,
        });
      }
    }

    if (options.includeArtifacts && msg.artifacts && msg.artifacts.length > 0) {
      for (const art of msg.artifacts) {
        const body = art.content ? `\n${art.content.slice(0, EXPORT_LIMITS.artifactText)}` : "";
        drawWrapped(`Artifact: ${art.filename || art.type}${body}`, {
          font: monoFont,
          size: 8.5,
          color: rgb(0.25, 0.28, 0.32),
          indent: 8,
          bgFill: rgb(0.96, 0.97, 0.98),
          lineGap: 3,
        });
      }
    }

    cursorY -= 10;
  }

  // Page numbers footer
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  pages.forEach((p, idx) => {
    const label = `Page ${idx + 1} / ${totalPages}`;
    const width = regularFont.widthOfTextAtSize(label, 8);
    p.drawText(label, {
      x: PAGE_WIDTH - MARGIN - width,
      y: MARGIN / 2,
      size: 8,
      font: regularFont,
      color: rgb(0.45, 0.48, 0.52),
    });
  });

  const pdfBytes = await pdfDoc.save();
  const copy = new Uint8Array(pdfBytes.byteLength);
  copy.set(pdfBytes);
  return new Blob([copy], { type: "application/pdf" });
}
