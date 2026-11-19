import { sanitizeFilename, triggerDownload } from "./export/exporter";

/**
 * Minimal message/attachment shape the markdown exporter needs. Product chat's
 * `MessageItem` satisfies it structurally, and partner conversations map into
 * it too — so both surfaces share one serializer.
 */
export interface ExportableAttachment {
  type?: string;
  filename?: string;
  mime_type?: string;
}

export interface ExportableMessage {
  role: string;
  content: string;
  /** Optional human-readable author for multi-speaker conversations. */
  speaker?: string;
  capability?: string;
  attachments?: ExportableAttachment[];
}

function roleHeading(role: string): string {
  if (role === "user") return "User";
  if (role === "assistant") return "Assistant";
  return "System";
}

function messageHeading(message: ExportableMessage): string {
  // Keep an untrusted display name on one Markdown heading line. Markdown
  // punctuation is harmless here, but line breaks could forge extra blocks.
  const speaker = message.speaker?.trim().replace(/\s+/g, " ");
  return speaker || roleHeading(message.role);
}

function formatAttachments(attachments?: ExportableAttachment[]): string {
  if (!attachments?.length) return "";
  const items = attachments
    .map((a) => {
      const name = a.filename || a.type || "attachment";
      return a.mime_type ? `\`${name}\` (${a.mime_type})` : `\`${name}\``;
    })
    .join(", ");
  return `_Attachments:_ ${items}\n\n`;
}

export interface BuildChatMarkdownOptions {
  title?: string;
  exportedAt?: Date;
}

export function buildChatMarkdown(
  messages: ExportableMessage[],
  options: BuildChatMarkdownOptions = {},
): string {
  const title = options.title?.trim() || "Chat Session";
  const exportedAt = (options.exportedAt ?? new Date()).toISOString();
  const header = `# ${title}\n\n_Exported: ${exportedAt}_\n\n---\n\n`;
  const body = messages
    .map((msg) => {
      const role = messageHeading(msg);
      const cap = msg.capability ? ` _(${msg.capability})_` : "";
      const attachments = formatAttachments(msg.attachments);
      const content = (msg.content ?? "").trim();
      return `## ${role}${cap}\n\n${attachments}${content}`.trimEnd();
    })
    .join("\n\n---\n\n");
  return header + body + "\n";
}

export function downloadChatMarkdown(
  messages: ExportableMessage[],
  options: BuildChatMarkdownOptions = {},
): void {
  if (!messages.length) return;
  const markdown = buildChatMarkdown(messages, options);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  // Delegate to the shared download helper: revoking the object URL
  // synchronously after `click()` cancels the download in WebKit and Firefox.
  triggerDownload(
    blob,
    `${sanitizeFilename(options.title || "chat")}-${new Date()
      .toISOString()
      .slice(0, 10)}.md`,
  );
}

// Re-export advanced multi-format export engines & types
export * from "./export";
