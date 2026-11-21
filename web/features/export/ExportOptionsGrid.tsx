"use client";

import React from "react";
import {
  Cpu,
  Layers,
  Link as LinkIcon,
  MessageSquare,
  SlidersHorizontal,
  Sparkles,
  Table as TableIcon,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ExportFilterOptions } from "@/lib/export";
import type { ExportSelectionStats } from "./useExportSelection";

export interface ExportOptionsGridProps {
  options: ExportFilterOptions;
  stats: ExportSelectionStats;
  onToggleOption: (key: keyof ExportFilterOptions) => void;
}

export function ExportOptionsGrid({
  options,
  stats,
  onToggleOption,
}: ExportOptionsGridProps) {
  const { t } = useTranslation();

  return (
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
        <label className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--muted)]/50 cursor-pointer text-xs">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-blue-500" />
            <span>{t("User Questions / Prompts")}</span>
          </div>
          <input
            type="checkbox"
            checked={options.includeUserPrompts}
            onChange={() => onToggleOption("includeUserPrompts")}
            className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
          />
        </label>

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
            onChange={() => onToggleOption("includeThinking")}
            className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
          />
        </label>

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
            onChange={() => onToggleOption("includeToolCalls")}
            className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
          />
        </label>

        <label className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--muted)]/50 cursor-pointer text-xs">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-emerald-500" />
            <span>{t("Tool Outputs & Results")}</span>
          </div>
          <input
            type="checkbox"
            checked={options.includeToolResults}
            onChange={() => onToggleOption("includeToolResults")}
            className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
          />
        </label>

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
            onChange={() => onToggleOption("includeSources")}
            className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
          />
        </label>

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
            onChange={() => onToggleOption("includeTables")}
            className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
          />
        </label>

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
            onChange={() => onToggleOption("includeArtifacts")}
            className="rounded border-[var(--border)] text-blue-600 focus:ring-blue-500 h-4 w-4"
          />
        </label>
      </div>
    </div>
  );
}
