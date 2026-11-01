/**
 * Publication-grade PDF generator for DeepTutor conversations.
 * Includes jspdf-autotable for multi-page tables with repeated headers,
 * PDF outline bookmarks for reader navigation, styled dialogue cards,
 * and page numbering.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  ExportFilterOptions,
  ExportMetadata,
  NormalizedExportMessage,
} from "./types";

export async function buildPdfBlob(
  messages: NormalizedExportMessage[],
  options: ExportFilterOptions,
  metadata: ExportMetadata,
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;

  let y = margin;

  function checkPageBreak(neededHeight: number) {
    if (y + neededHeight > pageHeight - margin - 10) {
      doc.addPage();
      y = margin;
    }
  }

  // Document Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(31, 35, 40);
  const title = metadata.title || "DeepTutor Conversation";
  const titleLines = doc.splitTextToSize(title, contentWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 8 + 2;

  // Metadata Line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(101, 109, 118);
  const dateStr = (metadata.exportedAt ?? new Date()).toLocaleString();
  const metaText = `Exported: ${dateStr}${metadata.workspaceName ? ` | Workspace: ${metadata.workspaceName}` : ""}${metadata.capability ? ` | Capability: ${metadata.capability}` : ""}`;
  doc.text(metaText, margin, y);
  y += 6;

  // Horizontal Divider
  doc.setDrawColor(208, 215, 222);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Root Bookmark in PDF Reader Outline
  const rootOutline = doc.outline?.add(null, title, { pageNumber: 1 });

  let questionIndex = 0;

  for (let mIdx = 0; mIdx < messages.length; mIdx++) {
    const msg = messages[mIdx];
    if (msg.role === "user" && !options.includeUserPrompts) {
      continue;
    }

    const isUser = msg.role === "user";
    const capBadge = msg.capability ? ` (${msg.capability})` : "";

    if (isUser) {
      questionIndex++;
      const snippet = msg.content.trim().slice(0, 60).replace(/[\r\n]+/g, " ");
      const bookmarkTitle = `Q${questionIndex}: ${snippet}${msg.content.length > 60 ? "…" : ""}`;

      // Add PDF Bookmark for this question turn
      const currentPage = doc.getNumberOfPages();
      if (doc.outline) {
        doc.outline.add(rootOutline, bookmarkTitle, { pageNumber: currentPage });
      }

      // User Message Callout Card (Light blue tinted box with accent line)
      const promptLines = doc.splitTextToSize(msg.content.trim(), contentWidth - 10);
      const cardHeight = promptLines.length * 4.2 + 9;
      checkPageBreak(cardHeight + 4);

      // Card background fill
      doc.setFillColor(240, 246, 255);
      doc.roundedRect(margin, y, contentWidth, cardHeight, 1.5, 1.5, "F");

      // Left blue accent border
      doc.setDrawColor(9, 105, 218);
      doc.setLineWidth(1.2);
      doc.line(margin, y, margin, y + cardHeight);

      // "YOU" Label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(9, 105, 218);
      doc.text("YOU", margin + 5, y + 4.5);

      // User Prompt Text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(31, 35, 40);
      doc.text(promptLines, margin + 5, y + 9);
      y += cardHeight + 6;
    } else {
      // Assistant Response Header
      checkPageBreak(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(36, 41, 47);
      doc.text("DEEPTUTOR", margin, y);

      const assistantBadge = msg.model ? ` · ${msg.model}` : capBadge;
      if (assistantBadge) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(101, 109, 118);
        doc.text(`[${assistantBadge.trim()}]`, margin + 24, y);
      }
      y += 5;
    }

    // Thinking / Chain of Thought
    if (options.includeThinking && msg.thinking?.trim()) {
      checkPageBreak(16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(101, 109, 118);
      doc.text("REASONING & THINKING PROCESS", margin + 4, y);
      y += 4;

      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(87, 96, 106);
      const thinkingLines = doc.splitTextToSize(
        msg.thinking.trim(),
        contentWidth - 8,
      );

      for (const line of thinkingLines) {
        checkPageBreak(4);
        // Purple left bar
        doc.setDrawColor(130, 80, 223);
        doc.setLineWidth(0.8);
        doc.line(margin + 1, y - 2.8, margin + 1, y + 1.2);

        doc.text(line, margin + 5, y);
        y += 3.8;
      }
      y += 3;
    }

    // Tool Invocations
    if (options.includeToolCalls && msg.toolCalls?.length) {
      for (const call of msg.toolCalls) {
        checkPageBreak(10);
        doc.setFont("courier", "bold");
        doc.setFontSize(8);
        doc.setTextColor(9, 105, 218);
        doc.text(`Tool: ${call.name}`, margin + 3, y);
        y += 4;

        if (call.args && Object.keys(call.args).length > 0) {
          const argText = JSON.stringify(call.args, null, 2);
          const argLines = doc.splitTextToSize(argText, contentWidth - 8);
          doc.setFont("courier", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(87, 96, 106);
          for (const line of argLines.slice(0, 8)) {
            checkPageBreak(3.5);
            doc.text(line, margin + 5, y);
            y += 3.5;
          }
        }

        // Tool Results
        if (options.includeToolResults && call.result?.trim()) {
          checkPageBreak(8);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(101, 109, 118);
          doc.text("Result:", margin + 3, y);
          y += 3.5;

          const resLines = doc.splitTextToSize(
            call.result.slice(0, 600),
            contentWidth - 8,
          );
          doc.setFont("courier", "normal");
          doc.setFontSize(7);
          doc.setTextColor(36, 41, 47);
          for (const line of resLines.slice(0, 6)) {
            checkPageBreak(3.2);
            doc.text(line, margin + 5, y);
            y += 3.2;
          }
        }
        y += 2;
      }
    }

    // Assistant Message Content (Parsed for code fences vs prose)
    if (!isUser && msg.content?.trim()) {
      const parts = msg.content.split(/(```[\s\S]*?```)/g);

      for (const part of parts) {
        if (part.startsWith("```") && part.endsWith("```")) {
          // Code Block
          const firstLineEnd = part.indexOf("\n");
          const lang = part.slice(3, firstLineEnd).trim();
          const code = part.slice(firstLineEnd + 1, -3);

          const codeLines = doc.splitTextToSize(code, contentWidth - 10);
          const blockHeight = codeLines.length * 3.6 + 8;
          checkPageBreak(blockHeight + 4);

          // Card Background
          doc.setFillColor(246, 248, 250);
          doc.setDrawColor(208, 215, 222);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, y, contentWidth, blockHeight, 1.5, 1.5, "FD");

          if (lang) {
            doc.setFont("courier", "bold");
            doc.setFontSize(7.5);
            doc.setTextColor(87, 96, 106);
            doc.text(lang.toUpperCase(), margin + 4, y + 4.5);
          }

          doc.setFont("courier", "normal");
          doc.setFontSize(7.8);
          doc.setTextColor(36, 41, 47);
          doc.text(codeLines, margin + 4, y + (lang ? 8.5 : 5.5));
          y += blockHeight + 4;
        } else if (part.trim()) {
          // Clean text paragraphs
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(36, 41, 47);

          const cleanContent = part
            .replace(/`([^`]+)`/g, "$1")
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/\*([^*]+)\*/g, "$1");

          const lines = doc.splitTextToSize(cleanContent.trim(), contentWidth);
          for (const line of lines) {
            checkPageBreak(4.5);
            doc.text(line, margin, y);
            y += 4.5;
          }
          y += 2;
        }
      }
    }

    // Tables using jspdf-autotable (Repeats column headers on every page!)
    if (options.includeTables && msg.tables?.length) {
      for (const tbl of msg.tables) {
        checkPageBreak(18);
        if (tbl.title) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8.5);
          doc.setTextColor(31, 35, 40);
          doc.text(tbl.title, margin, y);
          y += 4.5;
        }

        autoTable(doc, {
          startY: y,
          head: [tbl.headers],
          body: tbl.rows,
          margin: { left: margin, right: margin },
          theme: "striped",
          showHead: "everyPage", // Automatically repeats header across pages!
          headStyles: {
            fillColor: [31, 35, 40],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 8,
            cellPadding: 2.2,
          },
          bodyStyles: {
            fontSize: 7.8,
            textColor: [36, 41, 47],
            cellPadding: 2,
            overflow: "linebreak",
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
        });

        y = ((doc as any).lastAutoTable?.finalY ?? y) + 6;
      }
    }

    // Citations & Sources
    if (options.includeSources && msg.sources?.length) {
      checkPageBreak(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(101, 109, 118);
      doc.text("SOURCES & CITATIONS", margin, y);
      y += 4;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(9, 105, 218);
      for (const src of msg.sources) {
        checkPageBreak(4);
        const srcText = `[${src.index}] ${src.title} - ${src.url}`;
        const srcLines = doc.splitTextToSize(srcText, contentWidth - 4);
        doc.text(srcLines, margin + 2, y);
        y += srcLines.length * 3.5;
      }
      y += 3;
    }

    // Artifacts
    if (options.includeArtifacts && msg.artifacts?.length) {
      checkPageBreak(10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(101, 109, 118);
      doc.text("ATTACHED ARTIFACTS", margin, y);
      y += 4;

      for (const art of msg.artifacts) {
        checkPageBreak(4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(36, 41, 47);
        doc.text(`• ${art.filename || art.type}${art.mime_type ? ` (${art.mime_type})` : ""}`, margin + 3, y);
        y += 4;
      }
      y += 3;
    }

    // Turn separator
    checkPageBreak(6);
    doc.setDrawColor(234, 238, 242);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  }

  // Footer: Add Page Numbers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 149, 159);
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" },
    );
  }

  return doc.output("blob");
}
