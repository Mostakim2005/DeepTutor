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
    base64?: string;
    url?: string;
    extracted_text?: string;
  }>;
  timestamp?: number;
  created_at?: number;
  model?: string;
}

/** Parses markdown tables from a block of text */
export function extractMarkdownTables(text: string): {
  tables: ExportTable[];
  cleanedText: string;
} {
  const tables: ExportTable[] = [];
  const lines = text.split("\n");
  const nonTableLines: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    // Check if line looks like a table row: starts and ends with '|'
    if (line.startsWith("|") && line.endsWith("|")) {
      const nextLine = (lines[i + 1] || "").trim();
      // Check if next line is table separator: e.g. |---|---| or | :--- | :---: |
      if (
        nextLine.startsWith("|") &&
        nextLine.endsWith("|") &&
        /^\|(?:\s*:?-+:?\s*\|)+$/.test(nextLine)
      ) {
        const headers = line
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());
        const rows: string[][] = [];

        i += 2; // skip header and separator
        while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
          const rowCells = lines[i]
            .trim()
            .slice(1, -1)
            .split("|")
            .map((c) => c.trim());
          rows.push(rowCells);
          i += 1;
        }

        tables.push({ headers, rows });
        continue;
      }
    }

    nonTableLines.push(lines[i]);
    i += 1;
  }

  return { tables, cleanedText: text };
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
            // Match last tool call without result
            const last = Array.from(toolCallsMap.values())
              .reverse()
              .find((c) => !c.result);
            if (last) {
              last.result = event.content;
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

    // 3. Extract Tables
    const { tables } = extractMarkdownTables(content);

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
      content,
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
