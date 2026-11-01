/**
 * JSON and Plain Text conversation export builders.
 */

import type {
  ExportFilterOptions,
  ExportMetadata,
  NormalizedExportMessage,
} from "./types";

export function buildJsonString(
  messages: NormalizedExportMessage[],
  options: ExportFilterOptions,
  metadata: ExportMetadata,
): string {
  const filteredMessages = messages
    .filter((msg) => (msg.role === "user" ? options.includeUserPrompts : true))
    .map((msg) => {
      const filtered: Record<string, unknown> = {
        id: msg.id,
        role: msg.role,
        speaker: msg.speaker,
        content: msg.content,
        timestamp: msg.timestamp,
        capability: msg.capability,
        model: msg.model,
      };

      if (options.includeThinking && msg.thinking) {
        filtered.thinking = msg.thinking;
      }
      if (options.includeToolCalls && msg.toolCalls?.length) {
        filtered.toolCalls = msg.toolCalls.map((t) => ({
          name: t.name,
          args: t.args,
          ...(options.includeToolResults ? { result: t.result } : {}),
        }));
      }
      if (options.includeSources && msg.sources?.length) {
        filtered.sources = msg.sources;
      }
      if (options.includeArtifacts && msg.artifacts?.length) {
        filtered.artifacts = msg.artifacts;
      }
      if (options.includeTables && msg.tables?.length) {
        filtered.tables = msg.tables;
      }

      return filtered;
    });

  return JSON.stringify(
    {
      metadata: {
        title: metadata.title,
        exportedAt: (metadata.exportedAt ?? new Date()).toISOString(),
        workspaceId: metadata.workspaceId,
        workspaceName: metadata.workspaceName,
      },
      messages: filteredMessages,
    },
    null,
    2,
  );
}

export function buildTextString(
  messages: NormalizedExportMessage[],
  options: ExportFilterOptions,
  metadata: ExportMetadata,
): string {
  const parts: string[] = [];
  const dateStr = (metadata.exportedAt ?? new Date()).toLocaleString();

  parts.push(`=== ${metadata.title.toUpperCase()} ===`);
  parts.push(`Exported: ${dateStr}\n`);

  for (const msg of messages) {
    if (msg.role === "user" && !options.includeUserPrompts) {
      continue;
    }

    const speaker = msg.speaker || (msg.role === "user" ? "USER" : "DEEPTUTOR");
    const cap = msg.capability ? ` (${msg.capability})` : "";

    parts.push(`--- ${speaker}${cap} ---`);

    if (options.includeThinking && msg.thinking?.trim()) {
      parts.push(`[REASONING]:\n${msg.thinking.trim()}\n`);
    }

    if (options.includeToolCalls && msg.toolCalls?.length) {
      for (const call of msg.toolCalls) {
        parts.push(`[TOOL CALL]: ${call.name}`);
        if (options.includeToolResults && call.result) {
          parts.push(`[TOOL RESULT]: ${call.result.slice(0, 500)}`);
        }
      }
      parts.push("");
    }

    if (msg.content?.trim()) {
      parts.push(msg.content.trim() + "\n");
    }

    if (options.includeSources && msg.sources?.length) {
      parts.push("SOURCES:");
      for (const src of msg.sources) {
        parts.push(`  [${src.index}] ${src.title}: ${src.url}`);
      }
      parts.push("");
    }
  }

  return parts.join("\n");
}
