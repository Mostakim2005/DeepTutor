"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
  Printer,
  Bookmark,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { notify } from "@/lib/notifications";
import Tooltip from "@/shared/ui/Tooltip";
import {
  exportSession,
  triggerDownload,
  copyExportToClipboard,
  printPublicationPdf,
  type ExportFormat,
  type ExportFilterOptions,
  DEFAULT_EXPORT_FILTER_OPTIONS,
} from "@/lib/export";
import { normalizeMessages, type InputMessage } from "@/lib/export/adapter";
import {
  getExportPresets,
  saveExportPreset,
  deleteExportPreset,
  setLastUsedExportPreset,
  type ExportPreset,
} from "@/lib/export/presets-api";
import { useExportSelection } from "./useExportSelection";
import { ExportMessagePicker } from "./ExportMessagePicker";
import { ExportOptionsGrid } from "./ExportOptionsGrid";

export interface ExportChatModalProps {
  open: boolean;
  onClose: () => void;
  messages: InputMessage[];
  title?: string;
  workspaceId?: string;
  workspaceName?: string;
  sessionId?: string;
  initialSelectedIds?: Array<string | number>;
}

/**
 * Scripts the jsPDF path cannot encode (its built-in fonts are Latin-1).
 * Those exports fall back to the vector print path, which typesets with real
 * fonts and stays searchable — better than a document full of tofu boxes.
 */
const NON_LATIN_SCRIPT =
  /[\u0400-\u04FF\u0530-\u058F\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;

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
  initialSelectedIds,
}: ExportChatModalProps) {
  const { t } = useTranslation();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("docx");
  const [options, setOptions] = useState<ExportFilterOptions>(
    DEFAULT_EXPORT_FILTER_OPTIONS,
  );
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPicker, setShowPicker] = useState(true);
  const [presets, setPresets] = useState<ExportPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const normalizedList = useMemo(() => normalizeMessages(messages), [messages]);
  const focusDialog = useCallback(() => {
    dialogRef.current?.focus();
  }, []);

  const {
    selectedIds,
    expandedPreviewIds,
    stats,
    handleSelectAll,
    handleSelectNone,
    handleSelectOnlyUser,
    handleSelectOnlyAssistant,
    handleInvertSelection,
    handleToggleMessage,
    togglePreview,
  } = useExportSelection(normalizedList, open, focusDialog, initialSelectedIds);

  const applyPreset = useCallback(
    (preset: ExportPreset, applyScope = true) => {
      setSelectedFormat(preset.format);
      setOptions({
        ...DEFAULT_EXPORT_FILTER_OPTIONS,
        ...preset.options,
      });
      setActivePresetId(preset.id);
      if (applyScope && (!initialSelectedIds || initialSelectedIds.length === 0)) {
        if (preset.scope === "answers") handleSelectOnlyAssistant();
        else if (preset.scope === "questions") handleSelectOnlyUser();
        else handleSelectAll();
      }
    },
    [initialSelectedIds, handleSelectAll, handleSelectOnlyAssistant, handleSelectOnlyUser],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getExportPresets()
      .then((res) => {
        if (cancelled) return;
        const list = res.presets ?? [];
        setPresets(list);
        if (res.last_used_preset_id) {
          const found = list.find((p) => p.id === res.last_used_preset_id);
          if (found) {
            applyPreset(found, false);
          }
        }
      })
      .catch(() => {
        /* presets are optional; modal stays usable offline */
      });
    return () => {
      cancelled = true;
    };
  }, [open, applyPreset]);

  const handleSavePreset = async () => {
    const trimmed = newPresetName.trim();
    if (!trimmed) return;
    const slug = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || `preset-${Date.now()}`;
    const scope =
      stats.selectedUserCount === 0 && stats.selectedAssistantCount > 0
        ? "answers"
        : stats.selectedAssistantCount === 0 && stats.selectedUserCount > 0
          ? "questions"
          : "all";
    try {
      const res = await saveExportPreset(slug, {
        name: trimmed,
        format: selectedFormat,
        scope,
        options: {
          includeUserPrompts: options.includeUserPrompts,
          includeThinking: options.includeThinking,
          includeToolCalls: options.includeToolCalls,
          includeToolResults: options.includeToolResults,
          includeSources: options.includeSources,
          includeArtifacts: options.includeArtifacts,
          includeTables: options.includeTables,
        },
      });
      setPresets(res.presets ?? []);
      setActivePresetId(slug);
      setNewPresetName("");
      setShowSavePreset(false);
      notify(t("Export preset saved."), { tone: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Failed to save export preset")}: ${msg}`, { tone: "error" });
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    try {
      await deleteExportPreset(presetId);
      setPresets((prev) => prev.filter((p) => p.id !== presetId));
      if (activePresetId === presetId) setActivePresetId(null);
      notify(t("Export preset deleted."), { tone: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Failed to delete export preset")}: ${msg}`, { tone: "error" });
    }
  };

  const handleToggleOption = useCallback((key: keyof ExportFilterOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const getEffectiveOptions = useCallback((): ExportFilterOptions => {
    return {
      ...options,
      selectedMessageIds: Array.from(selectedIds),
    };
  }, [options, selectedIds]);

  const buildMetadata = useCallback(
    () => ({
      title: title || "DeepTutor Conversation",
      sessionId,
      workspaceId,
      workspaceName,
      exportedAt: new Date(),
    }),
    [title, sessionId, workspaceId, workspaceName],
  );

  const handleExport = async () => {
    if (selectedIds.size === 0) {
      notify(t("Please select at least one message to export"), { tone: "error" });
      return;
    }

    try {
      setExporting(true);
      const metadata = buildMetadata();
      const effectiveOptions = getEffectiveOptions();

      const needsVectorPrint =
        selectedFormat === "pdf" &&
        normalizedList.some(
          (message) => selectedIds.has(message.id) && NON_LATIN_SCRIPT.test(message.content),
        );
      if (needsVectorPrint) {
        printPublicationPdf(messages, effectiveOptions, metadata);
        notify(
          t(
            "This conversation contains non-Latin text, so the vector print dialog opens instead of a downloaded file.",
          ),
          { tone: "success" },
        );
        onClose();
        return;
      }

      const result = await exportSession(
        messages,
        selectedFormat,
        effectiveOptions,
        metadata,
      );
      triggerDownload(result.blob, result.filename);
      if (activePresetId) {
        void setLastUsedExportPreset(activePresetId).catch(() => {});
      }
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
      await copyExportToClipboard(messages, getEffectiveOptions(), buildMetadata());
      setCopied(true);
      notify(t("Copied to clipboard as Markdown"), { tone: "success" });
      setTimeout(() => setCopied(false), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Copy failed")}: ${msg}`, { tone: "error" });
    }
  };

  const handlePrintPdf = () => {
    if (selectedIds.size === 0) {
      notify(t("Please select at least one message to export"), { tone: "error" });
      return;
    }

    try {
      printPublicationPdf(messages, getEffectiveOptions(), buildMetadata());
      notify(t("Opening publication-grade print & vector PDF dialog..."), { tone: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Print failed")}: ${msg}`, { tone: "error" });
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-chat-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        className="flex w-full max-w-2xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--popover)] p-6 text-[var(--foreground)] shadow-2xl overflow-hidden max-h-[92vh] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] pb-4">
          <div>
            <h2
              id="export-chat-title"
              className="text-lg font-semibold tracking-tight flex items-center gap-2"
            >
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

        <div className="flex-1 overflow-y-auto py-4 space-y-6 pr-1">
          {presets.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] flex items-center gap-1.5">
                  <Bookmark size={12} />
                  {t("Export Presets")}
                </label>
                <button
                  type="button"
                  onClick={() => setShowSavePreset((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Plus size={12} />
                  {t("Save Current as Preset")}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {presets.map((preset) => {
                  const isActive = activePresetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        isActive
                          ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
                          : "border-[var(--border)] hover:bg-[var(--muted)]/60"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => applyPreset(preset, true)}
                        className="text-left"
                      >
                        {preset.name}
                      </button>
                      {!preset.builtin && (
                        <button
                          type="button"
                          onClick={() => void handleDeletePreset(preset.id)}
                          aria-label={t("Delete preset")}
                          className="ml-0.5 text-[var(--muted-foreground)] hover:text-red-500"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {showSavePreset && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder={t("Preset name (e.g. Exam Study Pack)")}
                    className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSavePreset()}
                    disabled={!newPresetName.trim()}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {t("Save")}
                  </button>
                </div>
              )}
            </div>
          )}
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
                        <span className="text-xs font-semibold">{t(fmt.label)}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-60">{fmt.ext}</span>
                    </div>
                    <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-2 leading-relaxed">
                      {t(fmt.description)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <ExportMessagePicker
            messages={normalizedList}
            selectedIds={selectedIds}
            expandedPreviewIds={expandedPreviewIds}
            stats={stats}
            showPicker={showPicker}
            onTogglePicker={() => setShowPicker((prev) => !prev)}
            onSelectAll={handleSelectAll}
            onSelectNone={handleSelectNone}
            onSelectOnlyUser={handleSelectOnlyUser}
            onSelectOnlyAssistant={handleSelectOnlyAssistant}
            onInvertSelection={handleInvertSelection}
            onToggleMessage={handleToggleMessage}
            onTogglePreview={togglePreview}
          />

          <ExportOptionsGrid
            options={options}
            stats={stats}
            onToggleOption={handleToggleOption}
          />

          <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)] bg-[var(--muted)]/20 px-3 py-2 rounded-lg border border-[var(--border)]">
            <span className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  stats.selectedCount > 0 ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
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

        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border)] pt-4 mt-2">
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
            {selectedFormat === "pdf" && (
              <Tooltip
                label={t(
                  "Save as publication-grade vector PDF with vector KaTeX math and native Unicode fonts (matching Claude export)",
                )}
              >
                <button
                  type="button"
                  onClick={handlePrintPdf}
                  disabled={exporting || selectedIds.size === 0}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-blue-500/40 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors shadow-sm"
                >
                  <Printer size={14} />
                  {t("Print / Save Vector PDF")}
                </button>
              </Tooltip>
            )}
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
