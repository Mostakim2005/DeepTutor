/**
 * Pure TypeScript Word (.docx) generator.
 * Builds valid Office Open XML (WordprocessingML) directly with OMML math support,
 * native Word tables, syntax-colored code, and thinking/tool callouts.
 */

import katex from "katex";
import { createZipBlob, type ZipEntry } from "./zip";
import { mathMlToOmml, OMML_NAMESPACE } from "./omml";
import type {
  ExportFilterOptions,
  ExportMetadata,
  NormalizedExportMessage,
} from "./types";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const INVALID_XML_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML_RE, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderLatexToOmml(latex: string): string | null {
  try {
    const mathMl = katex.renderToString(latex, {
      output: "mathml",
      throwOnError: false,
    });
    return mathMlToOmml(mathMl);
  } catch {
    return null;
  }
}

/** Converts inline markdown (bold, italic, code, links, inline math) to Word runs */
function parseInlineToWord(text: string): string {
  const runs: string[] = [];
  // Tokenize inline markdown & LaTeX: $...$, **bold**, *italic*, `code`, [text](url)
  const pattern =
    /(\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$|(?:\*\*|__)(.*?)(?:\*\*|__)|(?:\*|_)(.*?)(?:\*|_)|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      runs.push(`<w:r><w:t xml:space="preserve">${escapeXml(plain)}</w:t></w:r>`);
    }

    const token = match[0];
    if (token.startsWith("$$") && token.endsWith("$$")) {
      const latex = token.slice(2, -2).trim();
      const omml = renderLatexToOmml(latex);
      if (omml) {
        runs.push(`<m:oMathPara>${omml}</m:oMathPara>`);
      } else {
        runs.push(`<w:r><w:t xml:space="preserve">${escapeXml(token)}</w:t></w:r>`);
      }
    } else if (token.startsWith("$") && token.endsWith("$") && !token.includes("$$")) {
      const latex = token.slice(1, -1).trim();
      const omml = renderLatexToOmml(latex);
      if (omml) {
        runs.push(omml);
      } else {
        runs.push(`<w:r><w:t xml:space="preserve">${escapeXml(token)}</w:t></w:r>`);
      }
    } else if (match[2]) {
      // Bold
      runs.push(
        `<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">${escapeXml(match[2])}</w:t></w:r>`,
      );
    } else if (match[3]) {
      // Italic
      runs.push(
        `<w:r><w:rPr><w:i/><w:iCs/></w:rPr><w:t xml:space="preserve">${escapeXml(match[3])}</w:t></w:r>`,
      );
    } else if (match[4]) {
      // Inline code
      runs.push(
        `<w:r><w:rPr><w:rStyle w:val="CodeChar"/></w:rPr><w:t xml:space="preserve">${escapeXml(match[4])}</w:t></w:r>`,
      );
    } else if (match[5] && match[6]) {
      // Link
      runs.push(
        `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t xml:space="preserve">${escapeXml(match[5])}</w:t></w:r>`,
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    const plain = text.slice(lastIndex);
    runs.push(`<w:r><w:t xml:space="preserve">${escapeXml(plain)}</w:t></w:r>`);
  }

  return runs.join("");
}

function paragraph(content: string, style?: string): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${pPr}${content}</w:p>`;
}

function codeBlock(code: string, language?: string): string {
  const lines = code.split("\n");
  const paragraphs = lines.map((line) => {
    return (
      `<w:p><w:pPr><w:pStyle w:val="Code"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
      `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr>` +
      `<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`
    );
  });
  const header = language
    ? `<w:p><w:pPr><w:pStyle w:val="CodeHeader"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas"/><w:b/><w:sz w:val="17"/><w:color w:val="57606A"/></w:rPr><w:t>${escapeXml(language.toUpperCase())}</w:t></w:r></w:p>`
    : "";
  return header + paragraphs.join("");
}

function wordTable(headers: string[], rows: string[][]): string {
  const BORDER = '<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/><w:left w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/><w:right w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/></w:tcBorders>';
  const CELL_MAR = '<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>';

  const headerXml = headers.length
    ? `<w:tr><w:trPr><w:tblHeader/></w:trPr>${headers
        .map(
          (h) =>
            `<w:tc><w:tcPr>${BORDER}<w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/>${CELL_MAR}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(h)}</w:t></w:r></w:p></w:tc>`,
        )
        .join("")}</w:tr>`
    : "";

  const rowsXml = rows
    .map(
      (row) =>
        `<w:tr>${row
          .map(
            (c) =>
              `<w:tc><w:tcPr>${BORDER}${CELL_MAR}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:t>${escapeXml(c)}</w:t></w:r></w:p></w:tc>`,
          )
          .join("")}</w:tr>`,
    )
    .join("");

  return (
    '<w:tbl><w:tblPr><w:tblStyle w:val="TableNormal"/><w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0"/></w:tblPr>' +
    headerXml +
    rowsXml +
    "</w:tbl>" +
    paragraph("")
  );
}

export async function buildDocxBlob(
  messages: NormalizedExportMessage[],
  options: ExportFilterOptions,
  metadata: ExportMetadata,
): Promise<Blob> {
  const bodyXml: string[] = [];

  // Document Title
  bodyXml.push(
    `<w:p><w:pPr><w:pStyle w:val="Title"/><w:spacing w:before="0" w:after="160"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="48"/></w:rPr><w:t>${escapeXml(metadata.title || "DeepTutor Conversation")}</w:t></w:r></w:p>`,
  );

  // Document Subtitle / Metadata
  const dateStr = (metadata.exportedAt ?? new Date()).toLocaleString();
  const subMeta = [
    `Exported: ${dateStr}`,
    metadata.workspaceName ? `Workspace: ${metadata.workspaceName}` : null,
    metadata.capability ? `Capability: ${metadata.capability}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  bodyXml.push(
    `<w:p><w:pPr><w:pStyle w:val="Subtitle"/><w:spacing w:after="320"/></w:pPr><w:r><w:rPr><w:color w:val="656D76"/><w:sz w:val="20"/></w:rPr><w:t>${escapeXml(subMeta)}</w:t></w:r></w:p>`,
  );

  // Divider
  bodyXml.push(
    '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="D0D7DE"/></w:pBdr><w:spacing w:after="240"/></w:pPr></w:p>',
  );

  for (const msg of messages) {
    if (msg.role === "user" && !options.includeUserPrompts) {
      continue;
    }

    const isUser = msg.role === "user";
    const speakerLabel = msg.speaker || (isUser ? "User" : "DeepTutor");
    const capBadge = msg.capability ? ` (${msg.capability})` : "";
    const roleColor = isUser ? "1F5BC7" : "8250DF";

    // Role Header
    bodyXml.push(
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:before="240" w:after="100"/></w:pPr>` +
        `<w:r><w:rPr><w:b/><w:color w:val="${roleColor}"/><w:sz w:val="26"/></w:rPr><w:t>${escapeXml(speakerLabel + capBadge)}</w:t></w:r></w:p>`,
    );

    // Chain-of-thought / Thinking
    if (options.includeThinking && msg.thinking?.trim()) {
      bodyXml.push(
        `<w:p><w:pPr><w:pStyle w:val="ThinkingLabel"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="8250DF"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/><w:spacing w:before="120" w:after="40"/></w:pPr>` +
          `<w:r><w:rPr><w:b/><w:color w:val="656D76"/><w:sz w:val="18"/></w:rPr><w:t>THINKING &amp; REASONING PROCESS</w:t></w:r></w:p>`,
      );

      const thinkingLines = msg.thinking.trim().split("\n");
      for (const line of thinkingLines) {
        if (!line.trim()) continue;
        bodyXml.push(
          `<w:p><w:pPr><w:pStyle w:val="Thinking"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="8250DF"/></w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/><w:ind w:left="240"/><w:spacing w:after="60"/></w:pPr>` +
            parseInlineToWord(line) +
            `</w:p>`,
        );
      }
    }

    // Tool Invocations
    if (options.includeToolCalls && msg.toolCalls?.length) {
      for (const call of msg.toolCalls) {
        const argStr = call.args ? JSON.stringify(call.args, null, 2) : "";
        bodyXml.push(
          `<w:p><w:pPr><w:pStyle w:val="ToolCall"/><w:pBdr><w:left w:val="single" w:sz="14" w:space="8" w:color="0969DA"/><w:top w:val="single" w:sz="4" w:space="4" w:color="D0D7DE"/><w:right w:val="single" w:sz="4" w:space="4" w:color="D0D7DE"/><w:bottom w:val="single" w:sz="4" w:space="4" w:color="D0D7DE"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F0F6FF"/><w:spacing w:before="100" w:after="40"/></w:pPr>` +
            `<w:r><w:rPr><w:b/><w:rFonts w:ascii="Consolas"/><w:color w:val="0969DA"/><w:sz w:val="18"/></w:rPr><w:t>TOOL CALL: ${escapeXml(call.name)}</w:t></w:r></w:p>`,
        );

        if (argStr && argStr !== "{}") {
          bodyXml.push(codeBlock(argStr, "json"));
        }

        // Tool Results
        if (options.includeToolResults && call.result?.trim()) {
          bodyXml.push(
            `<w:p><w:pPr><w:spacing w:before="60" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="16"/><w:color w:val="57606A"/></w:rPr><w:t>Tool Result:</w:t></w:r></w:p>`,
          );
          bodyXml.push(codeBlock(call.result.slice(0, 3000)));
        }
      }
    }

    // Message Content
    if (msg.content?.trim()) {
      // Split into paragraphs / code fences
      const parts = msg.content.split(/(```[\s\S]*?```)/g);
      for (const part of parts) {
        if (part.startsWith("```") && part.endsWith("```")) {
          const firstLineEnd = part.indexOf("\n");
          const lang = part.slice(3, firstLineEnd).trim();
          const code = part.slice(firstLineEnd + 1, -3);
          bodyXml.push(codeBlock(code, lang));
        } else {
          const lines = part.split("\n\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            // Check if heading
            if (trimmed.startsWith("### ")) {
              bodyXml.push(
                paragraph(
                  parseInlineToWord(trimmed.slice(4)),
                  "Heading3",
                ),
              );
            } else if (trimmed.startsWith("## ")) {
              bodyXml.push(
                paragraph(
                  parseInlineToWord(trimmed.slice(3)),
                  "Heading2",
                ),
              );
            } else if (trimmed.startsWith("# ")) {
              bodyXml.push(
                paragraph(
                  parseInlineToWord(trimmed.slice(2)),
                  "Heading1",
                ),
              );
            } else if (trimmed.startsWith("> ")) {
              bodyXml.push(
                paragraph(
                  parseInlineToWord(trimmed.slice(2)),
                  "Quote",
                ),
              );
            } else {
              bodyXml.push(paragraph(parseInlineToWord(trimmed)));
            }
          }
        }
      }
    }

    // Tables
    if (options.includeTables && msg.tables?.length) {
      for (const tbl of msg.tables) {
        if (tbl.title) {
          bodyXml.push(paragraph(escapeXml(tbl.title), "Heading3"));
        }
        bodyXml.push(wordTable(tbl.headers, tbl.rows));
      }
    }

    // Citations & Sources
    if (options.includeSources && msg.sources?.length) {
      bodyXml.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading4"/><w:spacing w:before="120" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="57606A"/><w:sz w:val="18"/></w:rPr><w:t>SOURCES &amp; CITATIONS</w:t></w:r></w:p>`,
      );
      for (const src of msg.sources) {
        bodyXml.push(
          `<w:p><w:pPr><w:pStyle w:val="SourceItem"/><w:ind w:left="480"/><w:spacing w:after="40"/></w:pPr>` +
            `<w:r><w:rPr><w:b/><w:color w:val="0969DA"/></w:rPr><w:t>[${src.index}] </w:t></w:r>` +
            `<w:r><w:t xml:space="preserve">${escapeXml(src.title)} - </w:t></w:r>` +
            `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>${escapeXml(src.url)}</w:t></w:r></w:p>`,
        );
      }
    }

    // Artifacts
    if (options.includeArtifacts && msg.artifacts?.length) {
      bodyXml.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading4"/><w:spacing w:before="120" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="57606A"/><w:sz w:val="18"/></w:rPr><w:t>ATTACHED ARTIFACTS</w:t></w:r></w:p>`,
      );
      for (const art of msg.artifacts) {
        const name = art.filename || art.type;
        bodyXml.push(
          `<w:p><w:pPr><w:ind w:left="480"/><w:spacing w:after="40"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>• ${escapeXml(name)}</w:t></w:r>${art.mime_type ? `<w:r><w:t xml:space="preserve"> (${escapeXml(art.mime_type)})</w:t></w:r>` : ""}</w:p>`,
        );
        if (art.content && art.content.length < 5000) {
          bodyXml.push(codeBlock(art.content));
        }
      }
    }

    // Message separator
    bodyXml.push(
      '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="E1E4E8"/></w:pBdr><w:spacing w:before="160" w:after="160"/></w:pPr></w:p>',
    );
  }

  const documentXml =
    XML_HEADER +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">` +
    `<w:body>${bodyXml.join("")}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>` +
    `</w:body></w:document>`;

  const contentTypesXml =
    XML_HEADER +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    "</Types>";

  const rootRelsXml =
    XML_HEADER +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";

  const documentRelsXml =
    XML_HEADER +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    "</Relationships>";

  const stylesXml =
    XML_HEADER +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:style>' +
    '<w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Inline Code"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/><w:shd w:val="clear" w:color="auto" w:fill="EFF1F3"/></w:rPr></w:style>' +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0969DA"/><w:u w:val="single"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="D0D7DE"/></w:pBdr><w:ind w:left="240"/><w:spacing w:after="120"/></w:pPr><w:rPr><w:color w:val="57606A"/><w:i/></w:rPr></w:style>' +
    "</w:styles>";

  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [
    { path: "[Content_Types].xml", bytes: encoder.encode(contentTypesXml) },
    { path: "_rels/.rels", bytes: encoder.encode(rootRelsXml) },
    { path: "word/_rels/document.xml.rels", bytes: encoder.encode(documentRelsXml) },
    { path: "word/styles.xml", bytes: encoder.encode(stylesXml) },
    { path: "word/document.xml", bytes: encoder.encode(documentXml) },
  ];

  return createZipBlob(
    entries,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
}
