/**
 * Unified types for the DeepTutor conversation export system.
 */

export type ExportFormat =
  | "docx"
  | "pdf"
  | "xlsx"
  | "html"
  | "markdown"
  | "json"
  | "txt";

export interface ExportFilterOptions {
  /** Include user prompts/questions */
  includeUserPrompts: boolean;
  /** Include chain-of-thought / reasoning traces */
  includeThinking: boolean;
  /** Include tool invocations (tool names & arguments) */
  includeToolCalls: boolean;
  /** Include tool outputs & observation results */
  includeToolResults: boolean;
  /** Include web, paper, or RAG search citations */
  includeSources: boolean;
  /** Include generated code, SVGs, charts, and media artifacts */
  includeArtifacts: boolean;
  /** Include data tables (rendered as native tables, and as separate sheets in Excel) */
  includeTables: boolean;
  /** Explicit list of message IDs to export. If undefined or empty, all messages are eligible. */
  selectedMessageIds?: Array<string | number>;
}

export const DEFAULT_EXPORT_FILTER_OPTIONS: ExportFilterOptions = {
  includeUserPrompts: true,
  includeThinking: true,
  includeToolCalls: true,
  includeToolResults: true,
  includeSources: true,
  includeArtifacts: true,
  includeTables: true,
};

export interface ExportToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  result?: string;
  stage?: string;
  timestamp?: number;
}

export interface ExportSource {
  index: number;
  title: string;
  url: string;
  snippet?: string;
}

export interface ExportArtifact {
  type: string;
  filename?: string;
  mime_type?: string;
  content?: string;
  url?: string;
  size_bytes?: number;
}

export interface ExportTable {
  title?: string;
  headers: string[];
  rows: string[][];
}

export interface NormalizedExportMessage {
  id: string | number;
  role: "user" | "assistant" | "system";
  content: string;
  speaker?: string;
  capability?: string;
  model?: string;
  timestamp?: number;
  /** Model reasoning trace (from thinking events or <think> tags) */
  thinking?: string;
  /** List of tool calls and outputs for this turn */
  toolCalls?: ExportToolCall[];
  /** Citations / web search / RAG references */
  sources?: ExportSource[];
  /** Artifact attachments */
  artifacts?: ExportArtifact[];
  /** Structured data tables extracted from content */
  tables?: ExportTable[];
}

export interface ExportMetadata {
  title: string;
  sessionId?: string;
  workspaceId?: string;
  workspaceName?: string;
  exportedAt?: Date;
  modelName?: string;
  capability?: string;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
}
