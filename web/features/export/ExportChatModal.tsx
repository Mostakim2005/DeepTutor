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
  Layers,
  Sparkles,
  Wrench,
  Link as LinkIcon,
  Table as TableIcon,
  MessageSquare,
  Cpu,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  User,
  Bot,
  SlidersHorizontal,
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

  // Normalize messages
  const normalizedList = useMemo(() => normalizeMessages(messages), [messages]);

  // Selected message IDs (default: select all)
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(() => {
    return new Set(normalizedList.map((m) => m.id));
  });

  // Track expanded message picker section
  const [showPicker, setShowPicker] = useState(true);

  // Track full-text preview per message
  const [expandedPreviewIds, setExpandedPreviewIds] = useState<Set<string | number>>(
    new Set(),
  );

  // Anchor for Shift+Click range selection
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Selection statistics
  const stats = useMemo(() => {
    let userCount = 0;
    let assistantCount = 0;
    let selectedCount = 0;
    let selectedUserCount = 0;
    let selectedAssistantCount = 0;
    let thinkingCount = 0;
    let toolCallCount = 0;
    let tableCount = 0;
    let sourceCount = 0;
    let artifactCount = 0;

    for (const m of normalizedList) {
      const isSelected = selectedIds.has(m.id);
      if (m.role === "user") {
        userCount++;
        if (isSelected) selectedUserCount++;
      } else {
        assistantCount++;
        if (isSelected) selectedAssistantCount++;
      }

      if (isSelected) {
        selectedCount++;
        if (m.thinking) thinkingCount++;
        if (m.toolCalls) toolCallCount += m.toolCalls.length;
        if (m.tables) tableCount += m.tables.length;
        if (m.sources) sourceCount += m.sources.length;
        if (m.artifacts) artifactCount += m.artifacts.length;
      }
    }

    return {
      total: normalizedList.length,
      userCount,
      assistantCount,
      selectedCount,
      selectedUserCount,
      selectedAssistantCount,
      thinkingCount,
      toolCallCount,
      tableCount,
      sourceCount,
      artifactCount,
    };
  }, [normalizedList, selectedIds]);

  // Batch Selection Handlers
  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(normalizedList.map((m) => m.id)));
  }, [normalizedList]);

  const handleSelectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleSelectOnlyUser = useCallback(() => {
    const userIds = normalizedList
      .filter((m) => m.role === "user")
      .map((m) => m.id);
    setSelectedIds(new Set(userIds));
  }, [normalizedList]);

  const handleSelectOnlyAssistant = useCallback(() => {
    const assistantIds = normalizedList
      .filter((m) => m.role === "assistant")
      .map((m) => m.id);
    setSelectedIds(new Set(assistantIds));
  }, [normalizedList]);

  const handleInvertSelection = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set<string | number>();
      for (const m of normalizedList) {
        if (!prev.has(m.id)) {
          next.add(m.id);
        }
      }
      return next;
    });
  }, [normalizedList]);

  // Individual / Shift+Click Range Selection Handler
  const handleToggleMessage = useCallback(
    (index: number, id: string | number, event: React.MouseEvent) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);

        if (event.shiftKey && lastClickedIndex !== null) {
          // Range selection
          const start = Math.min(lastClickedIndex, index);
          const end = Math.max(lastClickedIndex, index);
          const shouldSelect = !prev.has(id);

          for (let i = start; i <= end; i++) {
            const item = normalizedList[i];
            if (item) {
              if (shouldSelect) {
                next.add(item.id);
              } else {
                next.delete(item.id);
              }
            }
          }
        } else {
          // Single toggle
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
        }

        return next;
      });

      setLastClickedIndex(index);
    },
    [lastClickedIndex, normalizedList],
  );

  const togglePreview = useCallback((id: string | number) => {
    setExpandedPreviewIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleOption = useCallback((key: keyof ExportFilterOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const getEffectiveOptions = useCallback((): ExportFilterOptions => {
    return {
      ...options,
      selectedMessageIds: Array.from(selectedIds),
    };
  }, [options, selectedIds]);

  const handleExport = async () => {
    if (selectedIds.size === 0) {
      notify(t("Please select at least one message to export"), { tone: "error" });
      return;
    }

    try {
      setExporting(true);
      const metadata = {
        title: title || "DeepTutor Conversation",
        sessionId,
        workspaceId,
        workspaceName,
        exportedAt: new Date(),
      };
      const effectiveOptions = getEffectiveOptions();
      const result = await exportSession(
        messages,
        selectedFormat,
        effectiveOptions,
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
    if (selectedIds.size === 0) {
      notify(t("Please select at least one message to copy"), { tone: "error" });
      return;
    }

    try {
      const metadata = {
        title: title || "DeepTutor Conversation",
        sessionId,
        workspaceId,
        workspaceName,
        exportedAt: new Date(),
      };
      const effectiveOptions = getEffectiveOptions();
      await copyExportToClipboard(messages, effectiveOptions, metadata);
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
        className="flex w-full max-w-2xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--popover)] p-6 text-[var(--foreground)] shadow-2xl overflow-hidden max-h-[92vh]"
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
              {t("Choose export format, select specific messages, and toggle content elements")}
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

          {/* Interactive Message Selection Panel */}
          <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card)]">
            <div
              className="flex items-center justify-between px-3.5 py-2.5 bg-[var(--muted)]/40 cursor-pointer hover:bg-[var(--muted)]/60 transition-colors select-none"
              onClick={() => setShowPicker((prev) => !prev)}
            >
              <div className="flex items-center gap-2">
                <CheckSquare size={15} className="text-blue-500" />
                <span className="text-xs font-semibold tracking-wide">
                  {t("Select Messages to Export")}
                </span>
                <span className="text-[11px] bg-blue-500/15 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                  {stats.selectedCount} / {stats.total} {t("selected")}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
                <span className="text-[11px]">
                  {showPicker ? t("Collapse") : t("Customize")}
                </span>
                {showPicker ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </div>

            {showPicker && (
              <div className="p-3 space-y-2.5 border-t border-[var(--border)]">
                {/* Batch Actions Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-[var(--border)]/60">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="px-2 py-1 rounded bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-[11px] font-medium transition-colors"
                    >
                      {t("Select All")}
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectNone}
                      className="px-2 py-1 rounded bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-[11px] font-medium transition-colors"
                    >
                      {t("Select None")}
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectOnlyUser}
                      className="px-2 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[11px] font-medium transition-colors"
                    >
                      {t("Only Questions")} ({stats.userCount})
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectOnlyAssistant}
                      className="px-2 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[11px] font-medium transition-colors"
                    >
                      {t("Only Answers")} ({stats.assistantCount})
                    </button>
                    <button
                      type="button"
                      onClick={handleInvertSelection}
                      className="px-2 py-1 rounded bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-[11px] font-medium transition-colors"
                    >
                      {t("Invert")}
                    </button>
                  </div>
                  <span className="text-[10px] text-[var(--muted-foreground)] hidden sm:inline">
                    {t("Tip: Shift+click to select range")}
                  </span>
                </div>

                {/* Message List Items */}
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 divide-y divide-[var(--border)]/30">
                  {normalizedList.map((m, index) => {
                    const isSelected = selectedIds.has(m.id);
                    const isUser = m.role === "user";
                    const isExpanded = expandedPreviewIds.has(m.id);
                    const previewText = m.content.replace(/\n+/g, " ").trim().slice(0, 110);

                    return (
                      <div
                        key={m.id}
                        className={`pt-1.5 first:pt-0 transition-colors rounded-lg p-1.5 ${
                          isSelected ? "bg-[var(--muted)]/20" : "opacity-60 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onClick={(e) => handleToggleMessage(index, m.id, e)}
                            onChange={() => {}}
                            className="mt-0.5 rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                          />

                          {/* Message Row Header */}
                          <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={(e) => handleToggleMessage(index, m.id, e)}
                          >
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-mono text-[var(--muted-foreground)]">
                                #{index + 1}
                              </span>
                              <span
                                className={`text-[11px] font-semibold flex items-center gap-1 px-1.5 py-0.2 rounded ${
                                  isUser
                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                    : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                                }`}
                              >
                                {isUser ? <User size={10} /> : <Bot size={10} />}
                                {m.speaker || (isUser ? t("User") : t("DeepTutor"))}
                              </span>
                              {m.capability && (
                                <span className="text-[10px] text-[var(--muted-foreground)] bg-[var(--muted)] px-1.5 py-0.2 rounded">
                                  {m.capability}
                                </span>
                              )}

                              {/* Traces badges */}
                              {m.thinking && (
                                <span className="text-[9px] bg-purple-500/15 text-purple-600 dark:text-purple-400 px-1 py-0.2 rounded">
                                  {t("Reasoning")}
                                </span>
                              )}
                              {m.toolCalls && m.toolCalls.length > 0 && (
                                <span className="text-[9px] bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1 py-0.2 rounded">
                                  {m.toolCalls.length} {t("tools")}
                                </span>
                              )}
                              {m.tables && m.tables.length > 0 && (
                                <span className="text-[9px] bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 px-1 py-0.2 rounded">
                                  {m.tables.length} {t("table")}
                                </span>
                              )}
                              {m.sources && m.sources.length > 0 && (
                                <span className="text-[9px] bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 px-1 py-0.2 rounded">
                                  {m.sources.length} {t("citations")}
                                </span>
                              )}
                            </div>

                            {/* Snippet Preview */}
                            <p className="text-[11px] text-[var(--muted-foreground)] mt-1 truncate">
                              {previewText || <span className="italic">{t("(Attachment/tool result only)")}</span>}
                            </p>
                          </div>

                          {/* Full Preview Toggle */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePreview(m.id);
                            }}
                            className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 rounded hover:bg-[var(--muted)] transition-colors"
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </div>

                        {/* Expanded Full Preview */}
                        {isExpanded && (
                          <div className="mt-2 p-2 rounded bg-[var(--muted)]/40 border border-[var(--border)] text-[11px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {m.content}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Granular Content Toggles */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] flex items-center gap-1.5">
                <SlidersHorizontal size={13} />
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
                  onChange={() => handleToggleOption("includeUserPrompts")}
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
                  onChange={() => handleToggleOption("includeThinking")}
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
                  onChange={() => handleToggleOption("includeToolCalls")}
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
                  onChange={() => handleToggleOption("includeToolResults")}
                  className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </label>

              {/* Web / RAG Citations */}
              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--muted)]/50 cursor-pointer text-xs">
                <div className="flex items-center gap-2">
                  <LinkIcon size={14} className="text-cyan-500" />
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
                  onChange={() => handleToggleOption("includeSources")}
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
                  onChange={() => handleToggleOption("includeTables")}
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
                  onChange={() => handleToggleOption("includeArtifacts")}
                  className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </label>
            </div>
          </div>

          {/* Conversation Summary Bar */}
          <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)] bg-[var(--muted)]/20 px-3 py-2 rounded-lg border border-[var(--border)]">
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${stats.selectedCount > 0 ? "bg-emerald-500" : "bg-red-500"}`} />
              {stats.selectedCount} / {stats.total} {t("messages selected")} (
              {stats.selectedUserCount} {t("user")}, {stats.selectedAssistantCount} {t("assistant")})
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
            disabled={selectedIds.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-[var(--muted)] disabled:opacity-40 transition-colors"
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
              disabled={exporting || selectedIds.size === 0}
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
