"use client";

import React from "react";
import {
  Bot,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NormalizedExportMessage } from "@/lib/export";
import type { ExportSelectionStats } from "./useExportSelection";

export interface ExportMessagePickerProps {
  messages: NormalizedExportMessage[];
  selectedIds: Set<string | number>;
  expandedPreviewIds: Set<string | number>;
  stats: ExportSelectionStats;
  showPicker: boolean;
  onTogglePicker: () => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSelectOnlyUser: () => void;
  onSelectOnlyAssistant: () => void;
  onInvertSelection: () => void;
  onToggleMessage: (index: number, id: string | number, shiftKey: boolean) => void;
  onTogglePreview: (id: string | number) => void;
}

export function ExportMessagePicker({
  messages,
  selectedIds,
  expandedPreviewIds,
  stats,
  showPicker,
  onTogglePicker,
  onSelectAll,
  onSelectNone,
  onSelectOnlyUser,
  onSelectOnlyAssistant,
  onInvertSelection,
  onToggleMessage,
  onTogglePreview,
}: ExportMessagePickerProps) {
  const { t } = useTranslation();

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card)]">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={showPicker}
        className="flex w-full cursor-pointer items-center justify-between px-3.5 py-2.5 bg-[var(--muted)]/40 hover:bg-[var(--muted)]/60 transition-colors select-none text-left"
        onClick={onTogglePicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onTogglePicker();
          }
        }}
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
          <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-[var(--border)]/60">
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={onSelectAll}
                className="px-2 py-1 rounded bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-[11px] font-medium transition-colors"
              >
                {t("Select All")}
              </button>
              <button
                type="button"
                onClick={onSelectNone}
                className="px-2 py-1 rounded bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-[11px] font-medium transition-colors"
              >
                {t("Select None")}
              </button>
              <button
                type="button"
                onClick={onSelectOnlyUser}
                className="px-2 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[11px] font-medium transition-colors"
              >
                {t("Only Questions")} ({stats.userCount})
              </button>
              <button
                type="button"
                onClick={onSelectOnlyAssistant}
                className="px-2 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[11px] font-medium transition-colors"
              >
                {t("Only Answers")} ({stats.assistantCount})
              </button>
              <button
                type="button"
                onClick={onInvertSelection}
                className="px-2 py-1 rounded bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-[11px] font-medium transition-colors"
              >
                {t("Invert")}
              </button>
            </div>
            <span className="text-[10px] text-[var(--muted-foreground)] hidden sm:inline">
              {t("Tip: Shift+click to select range")}
            </span>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 divide-y divide-[var(--border)]/30">
            {messages.map((m, index) => {
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
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleMessage(index, m.id, false)}
                      className="mt-0.5 rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                    />

                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={(e) => onToggleMessage(index, m.id, e.shiftKey)}
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

                      <p className="text-[11px] text-[var(--muted-foreground)] mt-1 truncate">
                        {previewText || (
                          <span className="italic">{t("(Attachment/tool result only)")}</span>
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePreview(m.id);
                      }}
                      className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 rounded hover:bg-[var(--muted)] transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>

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
  );
}
