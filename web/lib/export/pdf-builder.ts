/**
 * PDF generator for DeepTutor conversations using jsPDF.
 */

import { jsPDF } from "jspdf";
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
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }

  // Document Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(31, 35, 40);
  const title = metadata.title || "DeepTutor Conversation";
  const titleLines = doc.splitTextToSize(title, contentWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 8 + 2;

  // Metadata
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(101, 109, 118);
  const dateStr = (metadata.exportedAt ?? new Date()).toLocaleString();
  const metaText = `Exported: ${dateStr}${metadata.workspaceName ? ` | Workspace: ${metadata.workspaceName}` : ""}`;
  doc.text(metaText, margin, y);
  y += 6;

  // Horizontal divider
  doc.setDrawColor(208, 215, 222);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  for (const msg of messages) {
    if (msg.role === "user" && !options.includeUserPrompts) {
      continue;
    }

    const isUser = msg.role === "user";
    const speaker = msg.speaker || (isUser ? "User" : "DeepTutor");
    const capBadge = msg.capability ? ` (${msg.capability})` : "";

    checkPageBreak(15);

    // Speaker Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    if (isUser) {
      doc.setTextColor(31, 91, 199); // Blue
    } else {
      doc.setTextColor(130, 80, 223); // Purple
    }
    doc.text(`${speaker}${capBadge}`, margin, y);
    y += 6;

    // Thinking / Chain of Thought
    if (options.includeThinking && msg.thinking?.trim()) {
      checkPageBreak(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(101, 109, 118);
      doc.text("REASONING & THINKING PROCESS", margin + 3, y);
      y += 4;

      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(87, 96, 106);
      const thinkingLines = doc.splitTextToSize(
        msg.thinking.trim(),
        contentWidth - 6,
      );
      for (const line of thinkingLines) {
        checkPageBreak(5);
        // Draw left bar
        doc.setDrawColor(130, 80, 223);
        doc.setLineWidth(0.6);
        doc.line(margin + 1, y - 3, margin + 1, y + 1);

        doc.text(line, margin + 4, y);
        y += 4;
      }
      y += 2;
    }

    // Tool Invocations
    if (options.includeToolCalls && msg.toolCalls?.length) {
      for (const call of msg.toolCalls) {
        checkPageBreak(12);
        doc.setFont("courier", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(9, 105, 218);
        doc.text(`Tool Call: ${call.name}`, margin + 3, y);
        y += 4.5;

        if (call.args && Object.keys(call.args).length > 0) {
          doc.setFont("courier", "normal");
          doc.setFontSize(8);
          doc.setTextColor(36, 41, 47);
          const argsText = JSON.stringify(call.args);
          const argLines = doc.splitTextToSize(argsText, contentWidth - 6);
          for (const line of argLines.slice(0, 5)) {
            checkPageBreak(4);
            doc.text(line, margin + 3, y);
            y += 4;
          }
        }

        if (options.includeToolResults && call.result) {
          checkPageBreak(8);
          doc.setFont("courier", "italic");
          doc.setFontSize(7.5);
          doc.setTextColor(100, 100, 100);
          const resLines = doc.splitTextToSize(
            `Result: ${call.result.slice(0, 300)}...`,
            contentWidth - 6,
          );
          for (const line of resLines.slice(0, 3)) {
            checkPageBreak(3.5);
            doc.text(line, margin + 3, y);
            y += 3.5;
          }
        }
        y += 2;
      }
    }

    // Message Content
    if (msg.content?.trim()) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(31, 35, 40);

      // Clean markdown symbols for raw PDF rendering
      const cleanContent = msg.content
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1");

      const lines = doc.splitTextToSize(cleanContent, contentWidth);
      for (const line of lines) {
        checkPageBreak(4.8);
        doc.text(line, margin, y);
        y += 4.8;
      }
    }

    // Tables
    if (options.includeTables && msg.tables?.length) {
      for (const tbl of msg.tables) {
        checkPageBreak(15);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(50, 50, 50);
        if (tbl.title) {
          doc.text(tbl.title, margin, y);
          y += 4;
        }

        // Table Header
        const colWidth = Math.min(35, contentWidth / Math.max(1, tbl.headers.length));
        tbl.headers.forEach((h, i) => {
          doc.text(h.slice(0, 15), margin + i * colWidth, y);
        });
        y += 4;

        // Table Rows
        doc.setFont("helvetica", "normal");
        for (const row of tbl.rows.slice(0, 10)) {
          checkPageBreak(4);
          row.forEach((c, i) => {
            doc.text(String(c).slice(0, 15), margin + i * colWidth, y);
          });
          y += 4;
        }
        y += 2;
      }
    }

    // Sources
    if (options.includeSources && msg.sources?.length) {
      checkPageBreak(10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(101, 109, 118);
      doc.text("SOURCES:", margin, y);
      y += 3.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(9, 105, 218);
      for (const src of msg.sources) {
        checkPageBreak(3.5);
        doc.text(`[${src.index}] ${src.title} - ${src.url}`, margin + 3, y);
        y += 3.5;
      }
    }

    // Divider between messages
    y += 4;
    checkPageBreak(5);
    doc.setDrawColor(235, 238, 242);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  }

  // Add Page Numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" },
    );
  }

  return doc.output("blob");
}
