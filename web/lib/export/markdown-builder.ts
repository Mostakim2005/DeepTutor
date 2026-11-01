/**
 * Markdown conversation export builder.
 * Generates formatted Markdown with YAML frontmatter,
 * folded <details> for reasoning traces and tool calls,
 * and markdown footnotes for web/RAG citations.
 */

import type {
  ExportFilterOptions,
  ExportMetadata,
  NormalizedExportMessage,
} from "./types";

export function buildMarkdownString(
  messages: NormalizedExportMessage[],
  options: ExportFilterOptions,
  metadata: ExportMetadata,
): string {
  const parts: string[] = [];

  // Frontmatter
  const exportedIso = (metadata.exportedAt ?? new Date()).toISOString();
  parts.push("---");
  parts.push(`title: "${metadata.title.replace(/"/g, '\\"')}"`);
  parts.push(`exported: ${exportedIso}`);
  if (metadata.workspaceName) {
    parts.push(`workspace: "${metadata.workspaceName.replace(/"/g, '\\"')}"`);
  }
  if (metadata.capability) {
    parts.push(`capability: ${metadata.capability}`);
  }
  parts.push(`message_count: ${messages.length}`);
  parts.push("---\n");

  parts.push(`# ${metadata.title}\n`);
  parts.push(`_Exported: ${exportedIso}_\n\n---\n`);

  for (const msg of messages) {
    if (msg.role === "user" && !options.includeUserPrompts) {
      continue;
    }

    const isUser = msg.role === "user";
    const speaker = msg.speaker || (isUser ? "User" : "DeepTutor");
    const cap = msg.capability ? ` _(${msg.capability})_` : "";

    parts.push(`## ${speaker}${cap}\n`);

    // Thinking
    if (options.includeThinking && msg.thinking?.trim()) {
      parts.push("<details>");
      parts.push("<summary><strong>Reasoning Process</strong></summary>\n");
      parts.push(msg.thinking.trim());
      parts.push("\n</details>\n");
    }

    // Tool Invocations
    if (options.includeToolCalls && msg.toolCalls?.length) {
      for (const call of msg.toolCalls) {
        parts.push("<details>");
        parts.push(`<summary><code>Tool: ${call.name}</code></summary>\n`);
        if (call.args && Object.keys(call.args).length > 0) {
          parts.push("```json");
          parts.push(JSON.stringify(call.args, null, 2));
          parts.push("```");
        }
        if (options.includeToolResults && call.result) {
          parts.push("\n**Result:**");
          parts.push("```text");
          parts.push(call.result.slice(0, 4000));
          parts.push("```");
        }
        parts.push("\n</details>\n");
      }
    }

    // Content
    if (msg.content?.trim()) {
      parts.push(msg.content.trim() + "\n");
    }

    // Tables
    if (options.includeTables && msg.tables?.length) {
      for (const tbl of msg.tables) {
        if (tbl.title) {
          parts.push(`\n### ${tbl.title}\n`);
        }
        parts.push(`| ${tbl.headers.join(" | ")} |`);
        parts.push(`| ${tbl.headers.map(() => "---").join(" | ")} |`);
        for (const row of tbl.rows) {
          parts.push(`| ${row.join(" | ")} |`);
        }
        parts.push("\n");
      }
    }

    // Sources
    if (options.includeSources && msg.sources?.length) {
      parts.push("\n**Sources:**\n");
      for (const src of msg.sources) {
        parts.push(`- [^${src.index}]: [${src.title}](${src.url})`);
      }
      parts.push("\n");
    }

    // Artifacts
    if (options.includeArtifacts && msg.artifacts?.length) {
      parts.push("\n**Artifacts:**\n");
      for (const art of msg.artifacts) {
        const name = art.filename || art.type;
        parts.push(`- **${name}**${art.mime_type ? ` (\`${art.mime_type}\`)` : ""}`);
        if (art.content && art.content.length < 3000) {
          parts.push("```text");
          parts.push(art.content);
          parts.push("```");
        }
      }
      parts.push("\n");
    }

    parts.push("\n---\n");
  }

  return parts.join("\n");
}
