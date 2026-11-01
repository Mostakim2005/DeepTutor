"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  FileText,
  FileSpreadsheet,
  Globe,
  FileType,
  FileCode,
  File,
  Check,
  Copy,
  Download,
  X,
  HelpCircle,
  Layers,
  Sparkles,
  Wrench,
  Link,
  Table as TableIcon,
  MessageSquare,
  Cpu,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { notify } from "@/lib/notifications";
import {
  exportSession,
  triggerDownload,
  copyExportToClipboard,
  type ExportFormat,
  type ExportFilterOptions,
  DEFAULT_EXPORT_FILTER_OPTIONS,
} from "@/lib/export";
import { normalizeMessages, type InputMessage } from "@/lib/export/adapter";

interface ExportChatModalProps {
  open: boolean;
  onClose: () => void;
  messages: InputMessage[];
  title?: string;
  workspaceId?: string;
  workspaceName?: string;
  sessionId?: string;
}

interface FormatDescriptor {
  id: ExportFormat;
  label: string;
  ext: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
}

const FORMATS: FormatDescriptor[] = [
  {
    id: "docx",
    label: "Microsoft Word",
    ext: ".docx",
    icon: FileText,
    description: "Editable Word doc with OMML math equations, styled tables & code",
  },
  {
    id: "pdf",
    label: "PDF Document",
    ext: ".pdf",
    icon: FileType,
    description: "Formatted document with headers, page numbers & clean typography",
  },
  {
    id: "xlsx",
    label: "Excel Workbook",
    ext: ".xlsx",
    icon: FileSpreadsheet,
    description: "Timeline log + dedicated spreadsheet tab for every table",
  },
  {
    id: "html",
    label: "Web Page",
    ext: ".html",
    icon: Globe,
    description: "Offline self-contained HTML page with light/dark theme & math",
  },
  {
    id: "markdown",
    label: "Markdown Note",
    ext: ".md",
    icon: FileCode,
    description: "Obsidian/GitHub ready note with YAML frontmatter & footnotes",
  },
  {
    id: "json",
    label: "Structured JSON",
    ext: ".json",
    icon: Layers,
    description: "Machine-readable full conversation and metadata archive",
  },
  {
    id: "txt",
    label: "Plain Text",
    ext: ".txt",
    icon: File,
    description: "Clean, distraction-free text transcript",
  },
];

export default function ExportChatModal({
  open,
  onClose,
  messages,
  title = "Chat Session",
  workspaceId,
  workspaceName,
  sessionId,
}: ExportChatModalProps) {
  const { t } = useTranslation();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("docx");
  const [options, setOptions] = useState<ExportFilterOptions>(
    DEFAULT_EXPORT_FILTER_OPTIONS,
  );
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Analyze messages for metadata counters
  const stats = useMemo(() => {
    const normalized = normalizeMessages(messages);
    let userCount = 0;
    let assistantCount = 0;
    let thinkingCount = 0;
    let toolCallCount = 0;
    let tableCount = 0;
    let sourceCount = 0;
    let artifactCount = 0;

    for (const m of normalized) {
      if (m.role === "user") userCount++;
      else assistantCount++;
      if (m.thinking) thinkingCount++;
      if (m.toolCalls) toolCallCount += m.toolCalls.length;
      if (m.tables) tableCount += m.tables.length;
      if (m.sources) sourceCount += m.sources.length;
      if (m.artifacts) artifactCount += m.artifacts.length;
    }

    return {
      totalMessages: normalized.length,
      userCount,
      assistantCount,
      thinkingCount,
      toolCallCount,
      tableCount,
      sourceCount,
      artifactCount,
    };
  }, [messages]);

  const handleToggle = useCallback((key: keyof ExportFilterOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleExport = async () => {
    try {
      setExporting(true);
      const metadata = {
        title: title || "DeepTutor Conversation",
        sessionId,
        workspaceId,
        workspaceName,
        exportedAt: new Date(),
      };
      const result = await exportSession(
        messages,
        selectedFormat,
        options,
        metadata,
      );
      triggerDownload(result.blob, result.filename);
      notify(t("Export completed successfully!"), { tone: "success" });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Export failed")}: ${msg}`, { tone: "error" });
    } finally {
      setExporting(false);
    }
  };

  const handleCopy = async () => {
    try {
      const metadata = {
        title: title || "DeepTutor Conversation",
        sessionId,
        workspaceId,
        workspaceName,
        exportedAt: new Date(),
      };
      await copyExportToClipboard(messages, options, metadata);
      setCopied(true);
      notify(t("Copied to clipboard as Markdown"), { tone: "success" });
      setTimeout(() => setCopied(false), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Copy failed")}: ${msg}`, { tone: "error" });
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-2xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--popover)] p-6 text-[var(--foreground)] shadow-2xl overflow-hidden max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <Download size={18} className="text-blue-500" />
              {t("Export Conversation")}
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              {t("Save and export your dialogue with granular content toggles")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-6 pr-1">
          {/* Format Selection Grid */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2.5 block">
              {t("Select Export Format")}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {FORMATS.map((fmt) => {
                const Icon = fmt.icon;
                const isSelected = selectedFormat === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setSelectedFormat(fmt.id)}
                    className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/50 shadow-sm"
                        : "border-[var(--border)] hover:bg-[var(--muted)]/50"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <div className="flex items-center gap-2">
                        <Icon
                          size={16}
                          className={isSelected ? "text-blue-500" : "text-[var(--muted-foreground)]"}
                        />
                        <span className="text-xs font-semibold">{fmt.label}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-60">
                        {fmt.ext}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-2 leading-relaxed">
                      {fmt.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Granular Content Toggles */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                {t("Content Elements to Include")}
              </label>
              <span className="text-[11px] text-[var(--muted-foreground)]">
                {t("Toggle elements on or off")}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[var(--muted)]/30 p-3 rounded-xl border border-[var(--border)]">
              {/* User Prompts */}
              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--muted)]/50 cursor-pointer text-xs">
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-blue-500" />
                  <span>{t("User Questions / Prompts")}</span>
                </div>
                <input
                  type="checkbox"
                  checked={options.includeUserPrompts}
                  onChange={() => handleToggle("includeUserPrompts")}
                  className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </label>

              {/* Chain of Thought / Thinking */}
              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--muted)]/50 cursor-pointer text-xs">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-purple-500" />
                  <span>{t("Reasoning / Thinking Traces")}</span>
                  {stats.thinkingCount > 0 && (
                    <span className="text-[10px] bg-purple-500/20 text-purple-600 dark:text-purple-400 px-1.5 py-0.2 rounded-full">
                      {stats.thinkingCount}
                    </span>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={options.includeThinking}
                  onChange={() => handleToggle("includeThinking")}
                  className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </label>

              {/* Tool Invocations */}
              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--muted)]/50 cursor-pointer text-xs">
                <div className="flex items-center gap-2">
                  <Wrench size={14} className="text-amber-500" />
                  <span>{t("Tool Invocations")}</span>
                  {stats.toolCallCount > 0 && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.2 rounded-full">
                      {stats.toolCallCount}
                    </span>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={options.includeToolCalls}
                  onChange={() => handleToggle("includeToolCalls")}
                  className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </label>

              {/* Tool Outputs */}
              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--muted)]/50 cursor-pointer text-xs">
                <div className="flex items-center gap-2">
                  <Cpu size={14} className="text-emerald-500" />
                  <span>{t("Tool Outputs & Results")}</span>
                </div>
                <input
                  type="checkbox"
                  checked={options.includeToolResults}
                  onChange={() => handleToggle("includeToolResults")}
                  className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </label>

              {/* Web / RAG Citations */}
              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--muted)]/50 cursor-pointer text-xs">
                <div className="flex items-center gap-2">
                  <Link size={14} className="text-cyan-500" />
                  <span>{t("Web & RAG Citations")}</span>
                  {stats.sourceCount > 0 && (
                    <span className="text-[10px] bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 px-1.5 py-0.2 rounded-full">
                      {stats.sourceCount}
                    </span>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={options.includeSources}
                  onChange={() => handleToggle("includeSources")}
                  className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </label>

              {/* Data Tables */}
              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--muted)]/50 cursor-pointer text-xs">
                <div className="flex items-center gap-2">
                  <TableIcon size={14} className="text-indigo-500" />
                  <span>{t("Data Tables")}</span>
                  {stats.tableCount > 0 && (
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 rounded-full">
                      {stats.tableCount}
                    </span>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={options.includeTables}
                  onChange={() => handleToggle("includeTables")}
                  className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </label>

              {/* Artifacts & Attachments */}
              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--muted)]/50 cursor-pointer text-xs sm:col-span-2">
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-rose-500" />
                  <span>{t("Generated Artifacts & Media")}</span>
                  {stats.artifactCount > 0 && (
                    <span className="text-[10px] bg-rose-500/20 text-rose-600 dark:text-rose-400 px-1.5 py-0.2 rounded-full">
                      {stats.artifactCount}
                    </span>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={options.includeArtifacts}
                  onChange={() => handleToggle("includeArtifacts")}
                  className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </label>
            </div>
          </div>

          {/* Conversation Summary Bar */}
          <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)] bg-[var(--muted)]/20 px-3 py-2 rounded-lg border border-[var(--border)]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {stats.totalMessages} {t("messages total")} (
              {stats.userCount} {t("user")}, {stats.assistantCount} {t("assistant")})
            </span>
            {workspaceName && (
              <span className="truncate max-w-[200px]">
                {t("Workspace")}: {workspaceName}
              </span>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-4 mt-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-[var(--muted)] transition-colors"
          >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            {copied ? t("Copied!") : t("Copy Markdown")}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-[var(--muted)] transition-colors"
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || messages.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              <Download size={14} />
              {exporting ? t("Exporting...") : `${t("Export")} ${selectedFormat.toUpperCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
