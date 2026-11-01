/**
 * Pure TypeScript Excel (.xlsx) generator.
 * Builds structured multi-sheet workbooks:
 *   - "Conversation Log": Step-by-step audit of roles, models, content, thinking traces, tools, and citations.
 *   - "Table 1", "Table 2", ...: Dedicated sheets for every markdown table in the conversation,
 *     with frozen headers, auto-filters, and real numeric cells.
 */

import { createZipBlob, type ZipEntry } from "./zip";
import type {
  ExportFilterOptions,
  ExportMetadata,
  NormalizedExportMessage,
  ExportTable,
} from "./types";

export const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type CellValue = string | number | null;

interface Sheet {
  name: string;
  rows: CellValue[][];
}

const MAX_CELL_LENGTH = 32767;

const INVALID_XML =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDFFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function columnName(index: number): string {
  let name = "";
  let rest = index + 1;
  while (rest > 0) {
    const digit = (rest - 1) % 26;
    name = String.fromCharCode(65 + digit) + name;
    rest = Math.floor((rest - 1) / 26);
  }
  return name;
}

export function parseNumber(text: string): number | null {
  const plain = text.trim();
  if (
    !/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(plain) ||
    /^-?0\d/.test(plain)
  ) {
    return null;
  }
  const num = Number(plain.replace(/,/g, ""));
  return Number.isFinite(num) && Math.abs(num) < 1e15 ? num : null;
}

function cellXml(cell: CellValue, reference: string, isHeader: boolean): string {
  if (cell === null || cell === "") return "";

  if (typeof cell === "number") {
    return `<c r="${reference}"><v>${cell}</v></c>`;
  }

  const text = escapeXml(String(cell).slice(0, MAX_CELL_LENGTH));
  const styleAttr = isHeader ? ' s="1"' : ' s="2"';
  return `<c r="${reference}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${text}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const width = Math.max(1, ...sheet.rows.map((r) => r.length));
  const rowsXml = sheet.rows
    .map((row, rowIndex) => {
      const isHeader = rowIndex === 0;
      const cells = row
        .map((cell, colIndex) =>
          cellXml(cell, `${columnName(colIndex)}${rowIndex + 1}`, isHeader),
        )
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  const range = `A1:${columnName(width - 1)}${Math.max(1, sheet.rows.length)}`;

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="18"/>' +
    `<sheetData>${rowsXml}</sheetData>` +
    (sheet.rows.length > 1 ? `<autoFilter ref="${range}"/>` : "") +
    "</worksheet>"
  );
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2">' +
  '<font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
  "</fonts>" +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1F5BC7"/></patternFill></fill>' +
  "</fills>" +
  '<borders count="2">' +
  '<border><left/><right/><top/><bottom/></border>' +
  '<border><left style="thin"><color rgb="FFD0D7DE"/></left><right style="thin"><color rgb="FFD0D7DE"/></right><top style="thin"><color rgb="FFD0D7DE"/></top><bottom style="thin"><color rgb="FFD0D7DE"/></bottom></border>' +
  "</borders>" +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
  "</cellXfs>" +
  "</styleSheet>";

export async function buildXlsxBlob(
  messages: NormalizedExportMessage[],
  options: ExportFilterOptions,
  metadata: ExportMetadata,
): Promise<Blob> {
  const sheets: Sheet[] = [];

  // Sheet 1: Conversation Log
  const logHeaders: string[] = [
    "Step",
    "Timestamp",
    "Role",
    "Model / Capability",
    "Content",
  ];

  if (options.includeThinking) logHeaders.push("Reasoning / Thinking");
  if (options.includeToolCalls) logHeaders.push("Tool Invocations");
  if (options.includeToolResults) logHeaders.push("Tool Outputs");
  if (options.includeSources) logHeaders.push("Sources & Citations");
  if (options.includeArtifacts) logHeaders.push("Artifacts");

  const logRows: CellValue[][] = [logHeaders];

  let stepNumber = 1;
  const allTables: ExportTable[] = [];

  for (const msg of messages) {
    if (msg.role === "user" && !options.includeUserPrompts) {
      continue;
    }

    const timeStr = msg.timestamp
      ? new Date(msg.timestamp).toISOString().replace("T", " ").slice(0, 19)
      : "";

    const roleName = msg.speaker || (msg.role === "user" ? "User" : "DeepTutor");
    const modelCap = [msg.model, msg.capability].filter(Boolean).join(" / ");

    const row: CellValue[] = [
      stepNumber++,
      timeStr,
      roleName,
      modelCap,
      msg.content || "",
    ];

    if (options.includeThinking) {
      row.push(msg.thinking || "");
    }

    if (options.includeToolCalls) {
      const callsStr = msg.toolCalls?.length
        ? msg.toolCalls
            .map((c) => `${c.name}(${JSON.stringify(c.args || {})})`)
            .join("\n---\n")
        : "";
      row.push(callsStr);
    }

    if (options.includeToolResults) {
      const resultsStr = msg.toolCalls?.length
        ? msg.toolCalls
            .filter((c) => c.result)
            .map((c) => `[${c.name}] => ${c.result}`)
            .join("\n---\n")
        : "";
      row.push(resultsStr);
    }

    if (options.includeSources) {
      const sourcesStr = msg.sources?.length
        ? msg.sources.map((s) => `[${s.index}] ${s.title}: ${s.url}`).join("\n")
        : "";
      row.push(sourcesStr);
    }

    if (options.includeArtifacts) {
      const artifactsStr = msg.artifacts?.length
        ? msg.artifacts.map((a) => a.filename || a.type).join(", ")
        : "";
      row.push(artifactsStr);
    }

    logRows.push(row);

    if (options.includeTables && msg.tables?.length) {
      allTables.push(...msg.tables);
    }
  }

  sheets.push({
    name: "Conversation Log",
    rows: logRows,
  });

  // Dedicated sheets for extracted tables
  if (options.includeTables && allTables.length > 0) {
    allTables.forEach((table, index) => {
      const sheetName =
        (table.title?.slice(0, 25).trim() || `Table ${index + 1}`).replace(
          /[:\/?*\[\]\\]/g,
          "_",
        ) || `Table ${index + 1}`;

      const tRows: CellValue[][] = [table.headers];
      for (const r of table.rows) {
        tRows.push(
          r.map((val) => {
            const num = parseNumber(val);
            return num !== null ? num : val;
          }),
        );
      }

      sheets.push({
        name: sheetName,
        rows: tRows,
      });
    });
  }

  // XML Manifest Assembly
  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${sheets
      .map(
        (s, i) =>
          `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 2}"/>`,
      )
      .join("")}</sheets>` +
    "</workbook>";

  const workbookRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    "</Relationships>";

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("") +
    "</Types>";

  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [
    { path: "[Content_Types].xml", bytes: encoder.encode(contentTypesXml) },
    { path: "_rels/.rels", bytes: encoder.encode(rootRelsXml) },
    { path: "xl/_rels/workbook.xml.rels", bytes: encoder.encode(workbookRelsXml) },
    { path: "xl/styles.xml", bytes: encoder.encode(STYLES_XML) },
    { path: "xl/workbook.xml", bytes: encoder.encode(workbookXml) },
  ];

  sheets.forEach((sheet, i) => {
    entries.push({
      path: `xl/worksheets/sheet${i + 1}.xml`,
      bytes: encoder.encode(sheetXml(sheet)),
    });
  });

  return createZipBlob(entries, XLSX_MIME_TYPE);
}
