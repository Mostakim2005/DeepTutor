/**
 * Word (.docx) generator built on `dolanmiu/docx` (OSS-01 / SUN-01).
 *
 * Replaces the hand-rolled OOXML/ZIP serializer while preserving OMML math
 * equations (via KaTeX MathML -> `omml.ts` -> `ImportedXmlComponent`),
 * native Word tables with repeating headers, styled dialogue cards, code
 * blocks, and shared `EXPORT_LIMITS`.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImportedXmlComponent,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import katex from "katex";
import { mathMlToOmml, OMML_NAMESPACE } from "./omml";
import {
  EXPORT_LIMITS,
  type ExportFilterOptions,
  type ExportMetadata,
  type ExportTable,
  type NormalizedExportMessage,
} from "./types";

const INVALID_XML_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function cleanText(text: string): string {
  return (text || "").replace(INVALID_XML_RE, "");
}

function renderLatexToOmmlComponent(latex: string): ImportedXmlComponent | null {
  try {
    const mathMl = katex.renderToString(latex, {
      output: "mathml",
      throwOnError: false,
    });
    const omml = mathMlToOmml(mathMl);
    if (!omml) return null;
    const withNs = omml.includes("xmlns:m=")
      ? omml
      : omml.replace("<m:oMath>", `<m:oMath xmlns:m="${OMML_NAMESPACE}">`);
    return ImportedXmlComponent.fromXmlString(withNs);
  } catch {
    return null;
  }
}

function safeUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") {
      return parsed.href;
    }
  } catch {
    /* ignore invalid URLs */
  }
  return null;
}

function parseInlineToChildren(text: string): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  const pattern =
    /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|(?:\*\*|__)(.*?)(?:\*\*|__)|(?:\*|_)(.*?)(?:\*|_)|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      children.push(new TextRun({ text: cleanText(text.slice(lastIndex, match.index)) }));
    }

    const token = match[0];
    if (token.startsWith("$$") && token.endsWith("$$")) {
      const latex = token.slice(2, -2).trim();
      const ommlComp = renderLatexToOmmlComponent(latex);
      if (ommlComp) {
        children.push(ommlComp as unknown as ParagraphChild);
      } else {
        children.push(new TextRun({ text: cleanText(latex), font: "Cambria Math", italics: true }));
      }
    } else if (token.startsWith("$") && token.endsWith("$")) {
      const latex = token.slice(1, -1).trim();
      const ommlComp = renderLatexToOmmlComponent(latex);
      if (ommlComp) {
        children.push(ommlComp as unknown as ParagraphChild);
      } else {
        children.push(new TextRun({ text: cleanText(latex), font: "Cambria Math", italics: true }));
      }
    } else if (match[2] !== undefined) {
      children.push(new TextRun({ text: cleanText(match[2]), bold: true }));
    } else if (match[3] !== undefined) {
      children.push(new TextRun({ text: cleanText(match[3]), italics: true }));
    } else if (match[4] !== undefined) {
      children.push(
        new TextRun({
          text: cleanText(match[4]),
          font: "Consolas",
          size: 19,
          shading: { type: ShadingType.CLEAR, color: "auto", fill: "EFF1F3" },
        }),
      );
    } else if (match[5] !== undefined && match[6] !== undefined) {
      const href = safeUrl(match[6]);
      if (href) {
        children.push(
          new ExternalHyperlink({
            link: href,
            children: [
              new TextRun({
                text: cleanText(match[5]),
                style: "Hyperlink",
                color: "0969DA",
                underline: {},
              }),
            ],
          }),
        );
      } else {
        children.push(new TextRun({ text: cleanText(match[5]) }));
      }
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    children.push(new TextRun({ text: cleanText(text.slice(lastIndex)) }));
  }
  if (children.length === 0) {
    children.push(new TextRun({ text: "" }));
  }
  return children;
}

function buildWordTable(tbl: ExportTable): Table {
  const colCount = Math.max(
    tbl.headers.length,
    ...tbl.rows.map((r) => r.length),
    1,
  );
  const colPct = Math.floor(100 / colCount);

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: Array.from({ length: colCount }, (_, idx) => {
      const cellText = cleanText(tbl.headers[idx] ?? "");
      return new TableCell({
        width: { size: colPct, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "F0F6FF" },
        children: [
          new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({ text: cellText, bold: true, size: 20, color: "1F2328" })],
          }),
        ],
      });
    }),
  });

  const bodyRows = tbl.rows.map(
    (row, rIdx) =>
      new TableRow({
        cantSplit: true,
        children: Array.from({ length: colCount }, (_, idx) => {
          const cellText = cleanText(row[idx] ?? "");
          return new TableCell({
            width: { size: colPct, type: WidthType.PERCENTAGE },
            shading:
              rIdx % 2 === 1
                ? { type: ShadingType.CLEAR, color: "auto", fill: "F9FAFB" }
                : undefined,
            children: [
              new Paragraph({
                spacing: { before: 50, after: 50 },
                children: parseInlineToChildren(cellText),
              }),
            ],
          });
        }),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
    },
    rows: [headerRow, ...bodyRows],
  });
}

function buildCodeBlockParagraphs(lang: string, codeLines: string[]): Paragraph[] {
  const blocks: Paragraph[] = [];
  if (lang) {
    blocks.push(
      new Paragraph({
        spacing: { before: 120, after: 20 },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "EAEEF2" },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: "57606A" } },
        indent: { left: 140 },
        children: [
          new TextRun({
            text: cleanText(lang.toUpperCase()),
            font: "Consolas",
            size: 16,
            bold: true,
            color: "57606A",
          }),
        ],
      }),
    );
  }
  const codeText = cleanText(codeLines.join("\n"));
  blocks.push(
    new Paragraph({
      spacing: { before: lang ? 0 : 100, after: 120 },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: "F6F8FA" },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: "D0D7DE" } },
      indent: { left: 140 },
      children: codeText.split("\n").map(
        (line, idx) =>
          new TextRun({
            text: line,
            font: "Consolas",
            size: 18,
            color: "24292F",
            break: idx > 0 ? 1 : 0,
          }),
      ),
    }),
  );
  return blocks;
}

function markdownBodyToBlocks(content: string): Array<Paragraph | Table> {
  const blocks: Array<Paragraph | Table> = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
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
      i++; // consume closing fence
      blocks.push(...buildCodeBlockParagraphs(lang, codeLines));
      continue;
    }

    if (trimmed.startsWith("$$") && !trimmed.slice(2).includes("$$")) {
      const mathLines: string[] = [trimmed.slice(2)];
      i++;
      while (i < lines.length && !(lines[i] ?? "").trim().endsWith("$$")) {
        mathLines.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) {
        mathLines.push((lines[i] ?? "").trim().replace(/\$\$$/, ""));
        i++;
      }
      const latex = mathLines.join("\n").trim();
      const ommlComp = renderLatexToOmmlComponent(latex);
      blocks.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 120 },
          children: ommlComp
            ? [ommlComp as unknown as ParagraphChild]
            : [new TextRun({ text: cleanText(latex), font: "Cambria Math", italics: true })],
        }),
      );
      continue;
    }

    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingMap = [
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4,
      ];
      blocks.push(
        new Paragraph({
          heading: headingMap[level - 1] ?? HeadingLevel.HEADING_4,
          spacing: { before: 160, after: 80 },
          children: parseInlineToChildren(headingMatch[2]),
        }),
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      blocks.push(
        new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: 260 },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: "D0D7DE" } },
          children: parseInlineToChildren(trimmed.slice(2)),
        }),
      );
      i++;
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      blocks.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 40, after: 40 },
          children: parseInlineToChildren(trimmed.replace(/^[-*+]\s+/, "")),
        }),
      );
      i++;
      continue;
    }

    if (trimmed.length > 0) {
      blocks.push(
        new Paragraph({
          spacing: { before: 60, after: 80 },
          children: parseInlineToChildren(line),
        }),
      );
    }
    i++;
  }

  return blocks;
}

export async function buildDocxBlob(
  messages: NormalizedExportMessage[],
  options: ExportFilterOptions,
  metadata: ExportMetadata,
): Promise<Blob> {
  const children: Array<Paragraph | Table> = [];
  const docTitle = cleanText(metadata.title || "DeepTutor Conversation");
  const exportedAt = metadata.exportedAt ?? new Date();

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 80 },
      children: [new TextRun({ text: docTitle, bold: true, size: 36, color: "1F2328" })],
    }),
  );

  const metaParts = [`Exported: ${exportedAt.toLocaleString()}`];
  if (metadata.workspaceName) metaParts.push(`Workspace: ${metadata.workspaceName}`);
  if (metadata.capability) metaParts.push(`Capability: ${metadata.capability}`);
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D0D7DE" } },
      children: [
        new TextRun({
          text: cleanText(metaParts.join("  |  ")),
          size: 18,
          color: "656D76",
        }),
      ],
    }),
  );

  for (const msg of messages) {
    const isUser = msg.role === "user";
    if (isUser && !options.includeUserPrompts) continue;

    const speakerLabel = isUser
      ? "YOU"
      : `DEEPTUTOR${msg.model ? ` [${msg.model}]` : ""}`;

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 220, after: 80 },
        shading: isUser
          ? { type: ShadingType.CLEAR, color: "auto", fill: "F0F6FF" }
          : undefined,
        border: isUser
          ? { left: { style: BorderStyle.SINGLE, size: 24, color: "0969DA" } }
          : undefined,
        indent: isUser ? { left: 140 } : undefined,
        children: [
          new TextRun({
            text: cleanText(speakerLabel),
            bold: true,
            size: 20,
            color: isUser ? "0969DA" : "6E40C9",
          }),
        ],
      }),
    );

    if (options.includeThinking && msg.thinking) {
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 80 },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: "F5F0FF" },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: "8250DF" } },
          indent: { left: 160 },
          children: [
            new TextRun({ text: "Reasoning: ", bold: true, size: 18, color: "6E40C9" }),
            new TextRun({ text: cleanText(msg.thinking), italics: true, size: 18, color: "57606A" }),
          ],
        }),
      );
    }

    if (msg.content.trim()) {
      children.push(...markdownBodyToBlocks(msg.content));
    }

    if (options.includeTables && msg.tables && msg.tables.length > 0) {
      for (const tbl of msg.tables) {
        if (tbl.title) {
          children.push(
            new Paragraph({
              spacing: { before: 120, after: 40 },
              children: [new TextRun({ text: cleanText(tbl.title), bold: true, size: 20 })],
            }),
          );
        }
        children.push(buildWordTable(tbl));
        children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      }
    }

    if (options.includeToolCalls && msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        const argText = tc.args ? JSON.stringify(tc.args) : "";
        children.push(
          new Paragraph({
            spacing: { before: 60, after: 40 },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: "FFF8C5" },
            indent: { left: 140 },
            children: [
              new TextRun({ text: `Tool: ${cleanText(tc.name)}`, bold: true, font: "Consolas", size: 18 }),
              ...(argText
                ? [new TextRun({ text: `  ${cleanText(argText)}`, font: "Consolas", size: 17, color: "57606A" })]
                : []),
            ],
          }),
        );
        if (options.includeToolResults && tc.result) {
          const clipped = cleanText(tc.result).slice(0, EXPORT_LIMITS.toolResult);
          children.push(
            new Paragraph({
              spacing: { before: 20, after: 80 },
              indent: { left: 220 },
              children: [new TextRun({ text: clipped, font: "Consolas", size: 17, color: "57606A" })],
            }),
          );
        }
      }
    }

    if (options.includeSources && msg.sources && msg.sources.length > 0) {
      children.push(
        new Paragraph({
          spacing: { before: 100, after: 40 },
          children: [new TextRun({ text: "Sources & Citations", bold: true, size: 19, color: "0969DA" })],
        }),
      );
      for (const src of msg.sources) {
        const snippet = src.snippet ? ` — ${cleanText(src.snippet).slice(0, EXPORT_LIMITS.sourceSnippet)}` : "";
        const href = safeUrl(src.url);
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { before: 20, after: 20 },
            children: [
              ...(href
                ? [
                    new ExternalHyperlink({
                      link: href,
                      children: [
                        new TextRun({
                          text: cleanText(src.title || src.url),
                          style: "Hyperlink",
                          color: "0969DA",
                          underline: {},
                          size: 18,
                        }),
                      ],
                    }),
                  ]
                : [new TextRun({ text: cleanText(src.title || src.url), size: 18 })]),
              ...(snippet ? [new TextRun({ text: snippet, size: 18, color: "57606A" })] : []),
            ],
          }),
        );
      }
    }

    if (options.includeArtifacts && msg.artifacts && msg.artifacts.length > 0) {
      for (const art of msg.artifacts) {
        const body = art.content ? cleanText(art.content).slice(0, EXPORT_LIMITS.artifactText) : "";
        children.push(
          new Paragraph({
            spacing: { before: 80, after: 60 },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: "F6F8FA" },
            indent: { left: 140 },
            children: [
              new TextRun({
                text: `Artifact: ${cleanText(art.filename || art.type)}`,
                bold: true,
                size: 18,
              }),
              ...(body ? [new TextRun({ text: `\n${body}`, font: "Consolas", size: 17, break: 1 })] : []),
            ],
          }),
        );
      }
    }
  }

  const doc = new Document({
    title: docTitle,
    creator: "DeepTutor",
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}
