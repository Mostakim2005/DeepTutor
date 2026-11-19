/**
 * Normalizes DeepTutor chat messages (from ChatStateAdapter or SessionDetail)
 * into standard NormalizedExportMessage objects.
 */

import type { StreamEvent } from "@/features/chat/model/protocol";
import type {
  ExportArtifact,
  ExportSource,
  ExportTable,
  ExportToolCall,
  NormalizedExportMessage,
} from "./types";

export interface InputMessage {
  id?: string | number;
  role: string;
  content: string;
  rawContent?: string;
  speaker?: string;
  capability?: string;
  events?: StreamEvent[];
  attachments?: Array<{
    type?: string;
    filename?: string;
    mime_type?: string;
    url?: string;
    extracted_text?: string;
  }>;
  timestamp?: number;
  created_at?: number;
  model?: string;
}

/** Matches a fenced-code delimiter so tables inside code blocks are ignored. */
const FENCE_DELIMITER = /^(`{3,}|~{3,})/;

const TABLE_SEPARATOR = /^\|(?:\s*:?-+:?\s*\|)+$/;

/**
 * Splits one table row on unescaped pipes only, so `a \| b` stays one cell.
 */
function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";

  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i];
    if (char === "\\" && inner[i + 1] === "|") {
      current += "|";
      i += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

/**
 * Parses markdown tables out of a block of text and returns the text without
 * them. Callers render `tables` natively, so `cleanedText` — not the original
 * string — is what belongs in the message body; returning the original here
 * duplicated every table in DOCX/PDF output.
 */
export function extractMarkdownTables(text: string): {
  tables: ExportTable[];
  cleanedText: string;
} {
  const lines = text.split("\n");
  const tables: ExportTable[] = [];
  const kept: string[] = [];
  let fence: string | null = null;

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    const fenceMatch = line.match(FENCE_DELIMITER);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      kept.push(raw);
      i += 1;
      continue;
    }

    // A table may only start outside a fenced code block.
    if (fence === null && line.length > 1 && line.startsWith("|") && line.endsWith("|")) {
      const nextLine = (lines[i + 1] || "").trim();
      if (
        nextLine.startsWith("|") &&
        nextLine.endsWith("|") &&
        TABLE_SEPARATOR.test(nextLine)
      ) {
        const headers = splitTableRow(line);
        const rows: string[][] = [];

        i += 2; // skip header and separator
        while (i < lines.length) {
          const rowLine = lines[i].trim();
          if (rowLine.length < 2 || !rowLine.startsWith("|") || !rowLine.endsWith("|")) {
            break;
          }
          rows.push(splitTableRow(rowLine));
          i += 1;
        }

        tables.push({ headers, rows });
        continue;
      }
    }

    kept.push(raw);
    i += 1;
  }

  return { tables, cleanedText: kept.join("\n") };
}

/** Extracts <think>...</think> blocks from content (DeepSeek-R1 style) */
export function extractThinkTags(text: string): {
  thinking: string;
  content: string;
} {
  const thinkMatches: string[] = [];
  const cleaned = text.replace(/<think>([\s\S]*?)<\/think>/gi, (_, body) => {
    thinkMatches.push(body.trim());
    return "";
  });

  return {
    thinking: thinkMatches.join("\n\n").trim(),
    content: cleaned.trim(),
  };
}

export function normalizeMessages(
  input: InputMessage[],
): NormalizedExportMessage[] {
  return input.map((msg, index) => {
    let content = msg.content || "";
    let thinking = "";
    const toolCallsMap = new Map<string, ExportToolCall>();
    const sources: ExportSource[] = [];
    const artifacts: ExportArtifact[] = [];

    // 1. Check for <think>...</think> in content
    const thinkResult = extractThinkTags(content);
    if (thinkResult.thinking) {
      thinking = thinkResult.thinking;
      content = thinkResult.content;
    }

    // 2. Process StreamEvents if present
    if (msg.events && Array.isArray(msg.events)) {
      for (const event of msg.events) {
        if (event.type === "thinking" && event.content) {
          thinking = thinking
            ? `${thinking}\n\n${event.content}`
            : event.content;
        } else if (event.type === "tool_call") {
          const meta = (event.metadata || {}) as Record<string, unknown>;
          const callId = String(
            meta.call_id || meta.id || `call_${toolCallsMap.size + 1}`,
          );
          const toolName = String(
            meta.tool_name || meta.name || event.content || "unknown_tool",
          );
          const args = (meta.args || meta.arguments || {}) as Record<
            string,
            unknown
          >;

          toolCallsMap.set(callId, {
            id: callId,
            name: toolName,
            args,
            stage: event.stage,
            timestamp: event.timestamp,
          });
        } else if (event.type === "tool_result") {
          const meta = (event.metadata || {}) as Record<string, unknown>;
          const callId = String(meta.call_id || meta.id || "");
          if (callId && toolCallsMap.has(callId)) {
            const entry = toolCallsMap.get(callId)!;
            entry.result = event.content;
          } else {
            // Never guess: with parallel or out-of-order tool events a
            // positional heuristic attaches a result to the wrong call. Keep
            // it as its own unattributed observation instead.
            const observationId = callId || `observation_${toolCallsMap.size + 1}`;
            if (!toolCallsMap.has(observationId)) {
              toolCallsMap.set(observationId, {
                id: observationId,
                name: "result",
                stage: event.stage,
                timestamp: event.timestamp,
                result: event.content,
              });
            }
          }
        } else if (event.type === "sources") {
          const meta = (event.metadata || {}) as Record<string, unknown>;
          const rawSources = (meta.sources || meta.items) as
            | Array<{ title?: string; url?: string; snippet?: string }>
            | undefined;

          if (Array.isArray(rawSources)) {
            for (const s of rawSources) {
              if (s.url) {
                sources.push({
                  index: sources.length + 1,
                  title: s.title || s.url,
                  url: s.url,
                  snippet: s.snippet,
                });
              }
            }
          }
        }
      }
    }

    // 3. Extract Tables (the body must not keep the source markdown as well)
    const { tables, cleanedText } = extractMarkdownTables(content);

    // 4. Process Attachments
    if (msg.attachments && Array.isArray(msg.attachments)) {
      for (const att of msg.attachments) {
        artifacts.push({
          type: att.type || "file",
          filename: att.filename,
          mime_type: att.mime_type,
          content: att.extracted_text,
          url: att.url,
        });
      }
    }

    return {
      id: msg.id ?? `msg_${index + 1}`,
      role: (msg.role === "user" ? "user" : "assistant") as
        | "user"
        | "assistant",
      speaker: msg.speaker,
      content: cleanedText,
      capability: msg.capability,
      model: msg.model,
      timestamp: msg.timestamp || msg.created_at,
      thinking: thinking || undefined,
      toolCalls: toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : undefined,
      sources: sources.length > 0 ? sources : undefined,
      artifacts: artifacts.length > 0 ? artifacts : undefined,
      tables: tables.length > 0 ? tables : undefined,
    };
  });
}
