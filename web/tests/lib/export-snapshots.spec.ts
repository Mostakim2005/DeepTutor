import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EXPORT_FILTER_OPTIONS,
  exportSession,
  type ExportFormat,
} from "../../lib/export";
import {
  EXPORT_FIXTURE_MESSAGES,
  EXPORT_FIXTURE_METADATA,
  FIXED_EXPORT_DATE,
} from "../fixtures/export/conversation.fixture";

const GOLDEN_DIR = path.resolve(__dirname, "../fixtures/export/golden");

function goldenPath(filename: string): string {
  return path.join(GOLDEN_DIR, filename);
}

function normalizeTextOutput(text: string): string {
  const lf = text.replace(/\r\n/g, "\n");
  return lf.endsWith("\n") ? lf : `${lf}\n`;
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function extractStoreZipEntries(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map<string, string>();
  let offset = 0;

  while (offset + 30 <= view.byteLength) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) {
      break;
    }
    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const filenameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + filenameLength + extraLength;
    const dataEnd = dataStart + compressedSize;

    const entryPath = decoder.decode(bytes.subarray(nameStart, nameStart + filenameLength));
    const rawSlice = bytes.subarray(dataStart, dataEnd);
    const entryBytes = compressionMethod === 8 ? inflateRawSync(rawSlice) : rawSlice;
    const entryContent = decoder.decode(entryBytes);
    entries.set(entryPath, entryContent);

    offset = dataEnd;
  }

  return entries;
}

function normalizePdfBytes(bytes: Uint8Array): Uint8Array {
  const raw = Buffer.from(bytes).toString("latin1");
  const normalized = raw
    .replace(/\/CreationDate \(D:[^)]+\)/g, "/CreationDate (D:FIXED)")
    .replace(/\/ID \[ <[0-9A-Fa-f]+> <[0-9A-Fa-f]+> \]/g, "/ID [ <FIXED> <FIXED> ]");
  return new Uint8Array(Buffer.from(normalized, "latin1"));
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const RealDate = Date;

describe("Deterministic Export Snapshots (L-09)", () => {
  beforeEach(() => {
    vi.spyOn(RealDate.prototype, "toLocaleString").mockImplementation(function (this: Date) {
      return this.toISOString();
    });
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_EXPORT_DATE);
    if (Date.prototype !== RealDate.prototype) {
      vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(function (this: Date) {
        return this.toISOString();
      });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("matches golden snapshots for markdown, txt, html, and json", async () => {
    const cases: Array<{ format: ExportFormat; filename: string }> = [
      { format: "markdown", filename: "export.md" },
      { format: "txt", filename: "export.txt" },
      { format: "html", filename: "export.html" },
      { format: "json", filename: "export.json" },
    ];

    for (const item of cases) {
      const result = await exportSession(
        EXPORT_FIXTURE_MESSAGES,
        item.format,
        DEFAULT_EXPORT_FILTER_OPTIONS,
        EXPORT_FIXTURE_METADATA,
      );
      const bytes = await readBlobBytes(result.blob);
      const text = normalizeTextOutput(new TextDecoder().decode(bytes));
      await expect(text).toMatchFileSnapshot(goldenPath(item.filename));
    }
  });

  it("matches golden hashes and structural invariants for docx, xlsx, and pdf", async () => {
    const docxResult = await exportSession(
      EXPORT_FIXTURE_MESSAGES,
      "docx",
      DEFAULT_EXPORT_FILTER_OPTIONS,
      EXPORT_FIXTURE_METADATA,
    );
    const docxBytes = await readBlobBytes(docxResult.blob);
    const docxEntries = extractStoreZipEntries(docxBytes);
    const documentXml = docxEntries.get("word/document.xml") ?? "";
    expect(documentXml).toContain("<m:acc>");
    expect(documentXml).toContain("勾股定理");
    expect(countOccurrences(documentXml, "FIXTURE_METRIC_ALPHA")).toBe(1);

    const xlsxResult = await exportSession(
      EXPORT_FIXTURE_MESSAGES,
      "xlsx",
      DEFAULT_EXPORT_FILTER_OPTIONS,
      EXPORT_FIXTURE_METADATA,
    );
    const xlsxBytes = await readBlobBytes(xlsxResult.blob);
    const xlsxEntries = extractStoreZipEntries(xlsxBytes);
    const sheet1Xml = xlsxEntries.get("xl/worksheets/sheet1.xml") ?? "";
    const sheet2Xml = xlsxEntries.get("xl/worksheets/sheet2.xml") ?? "";
    expect(sheet1Xml.length).toBeGreaterThan(0);
    expect(sheet2Xml).toContain("<v>3.14</v>");
    expect(sheet2Xml).toContain("<v>42</v>");

    const pdfResult = await exportSession(
      EXPORT_FIXTURE_MESSAGES,
      "pdf",
      DEFAULT_EXPORT_FILTER_OPTIONS,
      EXPORT_FIXTURE_METADATA,
    );
    const pdfBytes = await readBlobBytes(pdfResult.blob);
    const pdfHeader = Buffer.from(pdfBytes.subarray(0, 5)).toString("latin1");
    expect(pdfHeader).toBe("%PDF-");
    const normalizedPdfBytes = normalizePdfBytes(pdfBytes);

    const manifest = {
      docx: {
        sha256: sha256Hex(docxBytes),
        bytes: docxBytes.byteLength,
        entries: Array.from(docxEntries.keys()),
      },
      xlsx: {
        sha256: sha256Hex(xlsxBytes),
        bytes: xlsxBytes.byteLength,
        entries: Array.from(xlsxEntries.keys()),
      },
      pdf: {
        normalizedSha256: sha256Hex(normalizedPdfBytes),
        bytes: pdfBytes.byteLength,
      },
    };

    await expect(`${JSON.stringify(manifest, null, 2)}\n`).toMatchFileSnapshot(
      goldenPath("binary-hashes.json"),
    );
  });

  it("produces identical outputs across repeated exports of every format", async () => {
    const formats: ExportFormat[] = [
      "docx",
      "xlsx",
      "pdf",
      "html",
      "markdown",
      "json",
      "txt",
    ];

    for (const format of formats) {
      const first = await exportSession(
        EXPORT_FIXTURE_MESSAGES,
        format,
        DEFAULT_EXPORT_FILTER_OPTIONS,
        EXPORT_FIXTURE_METADATA,
      );
      const second = await exportSession(
        EXPORT_FIXTURE_MESSAGES,
        format,
        DEFAULT_EXPORT_FILTER_OPTIONS,
        EXPORT_FIXTURE_METADATA,
      );

      expect(first.filename).toBe(second.filename);
      expect(first.mimeType).toBe(second.mimeType);

      const firstBytes = await readBlobBytes(first.blob);
      const secondBytes = await readBlobBytes(second.blob);

      if (format === "pdf") {
        expect(sha256Hex(normalizePdfBytes(firstBytes))).toBe(
          sha256Hex(normalizePdfBytes(secondBytes)),
        );
      } else {
        expect(sha256Hex(firstBytes)).toBe(sha256Hex(secondBytes));
      }
    }
  });
});
