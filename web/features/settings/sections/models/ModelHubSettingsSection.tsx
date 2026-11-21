"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  Plus,
  RefreshCw,
  RotateCcw,
  Terminal,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  SettingsPageHeader,
  inputClass,
  selectClass,
  selectOptionClass,
  subPanelClass,
} from "@/components/settings/shared";
import { notify } from "@/lib/notifications";
import {
  addModelCatalogOverride,
  clearModelUnavailable,
  deleteCustomHarness,
  exportModelPreferences,
  getCustomHarnesses,
  getModelCatalogOverrides,
  getModelPreferences,
  getStaleModelPreferences,
  importModelPreferences,
  markModelUnavailable,
  pruneStaleModelPreferences,
  removeModelCatalogOverride,
  restoreModelCatalogOverride,
  upsertCustomHarness,
  type CustomCatalogsMap,
  type CustomHarnessSpec,
  type ModelPreferencesData,
  type StalePreferencesReport,
} from "@/lib/model-hub-api";

type HubTab = "preferences" | "catalogs" | "harnesses";

const BUILTIN_HARNESS_KINDS = [
  "antigravity",
  "command_code",
  "opencode",
  "deepseek_harness",
  "freebuff",
  "claude_code",
  "codex",
  "grok",
  "kimi",
  "mimo",
  "acp",
];

function splitArgs(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function ModelHubSettingsSection() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<HubTab>("preferences");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Tab 1: Preferences & Health (L-06)
  const [prefs, setPrefs] = useState<ModelPreferencesData | null>(null);
  const [staleReport, setStaleReport] = useState<StalePreferencesReport | null>(null);
  const [unavailableModel, setUnavailableModel] = useState("");
  const [unavailableReason, setUnavailableReason] = useState("");
  const [importMerge, setImportMerge] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Tab 2: Custom Model Catalog Overrides (Bravo 4)
  const [catalogs, setCatalogs] = useState<CustomCatalogsMap>({ harnesses: {} });
  const [selectedKind, setSelectedKind] = useState<string>("antigravity");
  const [newModelSlug, setNewModelSlug] = useState("");
  const [newModelDisplayName, setNewModelDisplayName] = useState("");
  const [newModelEfforts, setNewModelEfforts] = useState("low,medium,high");
  const [newModelDefaultEffort, setNewModelDefaultEffort] = useState("medium");
  const [retireSlug, setRetireSlug] = useState("");

  // Tab 3: Custom CLI & ACP Harnesses (Bravo 5)
  const [harnesses, setHarnesses] = useState<Record<string, CustomHarnessSpec>>({});
  const [harnessKind, setHarnessKind] = useState("");
  const [harnessDisplayName, setHarnessDisplayName] = useState("");
  const [harnessProtocol, setHarnessProtocol] = useState<"cli" | "acp">("cli");
  const [harnessCommand, setHarnessCommand] = useState("");
  const [harnessPromptArgs, setHarnessPromptArgs] = useState("-p {prompt}");
  const [harnessModelFlag, setHarnessModelFlag] = useState("--model");
  const [harnessEffortFlag, setHarnessEffortFlag] = useState("--effort");
  const [harnessDefaultModel, setHarnessDefaultModel] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prefsData, catalogsData, harnessesData] = await Promise.all([
        getModelPreferences(),
        getModelCatalogOverrides(),
        getCustomHarnesses(),
      ]);
      setPrefs(prefsData);
      setCatalogs(catalogsData ?? { harnesses: {} });
      setHarnesses(harnessesData?.harnesses ?? {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Failed to load model hub settings")}: ${msg}`, { tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleExportPrefs = async () => {
    setBusy(true);
    try {
      const bundle = await exportModelPreferences();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `deeptutor-model-preferences-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(t("Model preferences exported."), { tone: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Export failed")}: ${msg}`, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Partial<ModelPreferencesData> & {
        preferences?: ModelPreferencesData;
      };
      const payload: ModelPreferencesData = parsed.preferences ?? {
        display_names: parsed.display_names ?? {},
        pinned: parsed.pinned ?? [],
        hidden: parsed.hidden ?? [],
        unavailable: parsed.unavailable ?? {},
      };
      const updated = await importModelPreferences(payload, importMerge);
      setPrefs(updated);
      notify(t("Model preferences imported."), { tone: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Import failed")}: ${msg}`, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleScanStale = async () => {
    setBusy(true);
    try {
      const report = await getStaleModelPreferences();
      setStaleReport(report);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Failed to scan stale preferences")}: ${msg}`, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handlePruneStale = async () => {
    setBusy(true);
    try {
      const result = await pruneStaleModelPreferences();
      setPrefs(result.preferences);
      setStaleReport(null);
      notify(
        `${t("Pruned stale preference entries")}: ${result.total_removed}`,
        { tone: "success" },
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Failed to prune stale preferences")}: ${msg}`, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleMarkUnavailable = async (event: React.FormEvent) => {
    event.preventDefault();
    const target = unavailableModel.trim();
    if (!target) return;
    setBusy(true);
    try {
      const updated = await markModelUnavailable(
        target,
        unavailableReason.trim() || "Unavailable on current plan",
      );
      setPrefs(updated);
      setUnavailableModel("");
      setUnavailableReason("");
      notify(t("Model flagged as unavailable."), { tone: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Failed to flag model")}: ${msg}`, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleClearUnavailable = async (name: string) => {
    setBusy(true);
    try {
      await clearModelUnavailable(name);
      const updated = await getModelPreferences();
      setPrefs(updated);
      notify(t("Unavailable flag cleared."), { tone: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Failed to clear unavailable flag")}: ${msg}`, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleAddCatalogModel = async (event: React.FormEvent) => {
    event.preventDefault();
    const slug = newModelSlug.trim();
    if (!slug) return;
    setBusy(true);
    try {
      const efforts = newModelEfforts
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);
      const updated = await addModelCatalogOverride(selectedKind, {
        slug,
        display_name: newModelDisplayName.trim() || slug,
        default_effort: newModelDefaultEffort.trim(),
        efforts,
      });
      setCatalogs(updated);
      setNewModelSlug("");
      setNewModelDisplayName("");
      notify(t("Custom model added to harness catalog."), { tone: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Failed to add custom model")}: ${msg}`, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleRetireCatalogModel = async (slug: string) => {
    const cleaned = slug.trim();
    if (!cleaned) return;
    setBusy(true);
    try {
      const updated = await removeModelCatalogOverride(selectedKind, cleaned);
      setCatalogs(updated);
      setRetireSlug("");
      notify(t("Model retired from harness catalog."), { tone: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Failed to retire model")}: ${msg}`, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreCatalogModel = async (slug: string) => {
    setBusy(true);
    try {
      const updated = await restoreModelCatalogOverride(selectedKind, slug);
      setCatalogs(updated);
      notify(t("Retired model restored."), { tone: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Failed to restore model")}: ${msg}`, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveHarness = async (event: React.FormEvent) => {
    event.preventDefault();
    const kind = harnessKind.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const command = harnessCommand.trim();
    if (!kind || !command) return;
    setBusy(true);
    try {
      const updated = await upsertCustomHarness(kind, {
        display_name: harnessDisplayName.trim() || kind,
        protocol: harnessProtocol,
        command,
        version_args: ["--version"],
        prompt_args: splitArgs(harnessPromptArgs),
        model_flag: harnessModelFlag.trim(),
        effort_flag: harnessEffortFlag.trim(),
        efforts: ["low", "medium", "high", "max"],
        default_model: harnessDefaultModel.trim(),
        models: harnessDefaultModel.trim()
          ? [{ slug: harnessDefaultModel.trim(), display_name: harnessDefaultModel.trim() }]
          : [],
        env: {},
        enabled: true,
      });
      setHarnesses(updated.harnesses ?? {});
      setHarnessKind("");
      setHarnessDisplayName("");
      setHarnessCommand("");
      setHarnessDefaultModel("");
      notify(t("Custom harness saved."), { tone: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Failed to save custom harness")}: ${msg}`, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteHarness = async (kind: string) => {
    setBusy(true);
    try {
      await deleteCustomHarness(kind);
      const refreshed = await getCustomHarnesses();
      setHarnesses(refreshed.harnesses ?? {});
      notify(t("Custom harness removed."), { tone: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`${t("Failed to remove custom harness")}: ${msg}`, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const allKinds = Array.from(
    new Set([...BUILTIN_HARNESS_KINDS, ...Object.keys(harnesses), ...Object.keys(catalogs.harnesses ?? {})]),
  );
  const currentCatalog = catalogs.harnesses?.[selectedKind] ?? { added: [], removed: [] };
  const unavailableEntries = Object.entries(prefs?.unavailable ?? {});
  const customHarnessList = Object.entries(harnesses);

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title={t("Model & Harness Hub")}
        description={t(
          "Manage portable model preferences, per-harness custom model catalogs, and plug-and-play CLI/ACP harnesses in update-safe JSON.",
        )}
      />

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
        {(
          [
            { id: "preferences", label: t("Preferences & Health") },
            { id: "catalogs", label: t("Custom Model Catalogs") },
            { id: "harnesses", label: t("Custom CLI & ACP Harnesses") },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-[var(--accent)] text-[var(--foreground)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]/50"
            }`}
          >
            {tab.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => void loadAll()}
          disabled={loading || busy}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {t("Refresh")}
        </button>
      </div>

      {loading ? (
        <div className="min-h-40 animate-pulse rounded-xl bg-[var(--muted)]/30" />
      ) : activeTab === "preferences" ? (
        <div className="space-y-5">
          {/* Portability: Export & Import */}
          <div className={`${subPanelClass} p-5 space-y-4`}>
            <div>
              <h3 className="text-sm font-semibold">{t("Preference Portability")}</h3>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {t("Export or import pinned models, hidden models, display names, and unavailable flags as JSON.")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleExportPrefs()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Download size={14} />
                {t("Export Preferences JSON")}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3.5 py-2 text-xs font-medium hover:bg-[var(--muted)] disabled:opacity-50"
              >
                <Upload size={14} />
                {t("Import Preferences JSON")}
              </button>
              <label className="inline-flex items-center gap-2 text-xs text-[var(--muted-foreground)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={importMerge}
                  onChange={(e) => setImportMerge(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)]"
                />
                {t("Merge with existing preferences")}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => void handleImportFile(e)}
              />
            </div>
            {prefs && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded-lg border border-[var(--border)]/70 p-2.5">
                  <div className="text-[var(--muted-foreground)]">{t("Pinned")}</div>
                  <div className="text-base font-semibold">{prefs.pinned.length}</div>
                </div>
                <div className="rounded-lg border border-[var(--border)]/70 p-2.5">
                  <div className="text-[var(--muted-foreground)]">{t("Hidden")}</div>
                  <div className="text-base font-semibold">{prefs.hidden.length}</div>
                </div>
                <div className="rounded-lg border border-[var(--border)]/70 p-2.5">
                  <div className="text-[var(--muted-foreground)]">{t("Custom Names")}</div>
                  <div className="text-base font-semibold">
                    {Object.keys(prefs.display_names).length}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border)]/70 p-2.5">
                  <div className="text-[var(--muted-foreground)]">{t("Unavailable")}</div>
                  <div className="text-base font-semibold">{unavailableEntries.length}</div>
                </div>
              </div>
            )}
          </div>

          {/* Stale Preference Detection & Prune */}
          <div className={`${subPanelClass} p-5 space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">{t("Stale Preference Cleanup")}</h3>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {t("Detect and prune orphaned preferences for models no longer present in your active catalog.")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleScanStale()}
                  disabled={busy}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--muted)] disabled:opacity-50"
                >
                  {t("Scan for Stale Entries")}
                </button>
                {staleReport && staleReport.total > 0 && (
                  <button
                    type="button"
                    onClick={() => void handlePruneStale()}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                    {t("Prune Stale")} ({staleReport.total})
                  </button>
                )}
              </div>
            </div>
            {staleReport && (
              <div className="rounded-lg border border-[var(--border)]/70 p-3 text-xs space-y-1.5">
                <div className="font-medium">
                  {staleReport.total === 0
                    ? t("No stale preference entries found.")
                    : `${t("Stale entries detected")}: ${staleReport.total}`}
                </div>
                {staleReport.total > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[var(--muted-foreground)]">
                    {Object.entries(staleReport.stale).map(([bucket, items]) =>
                      items.length > 0 ? (
                        <div key={bucket}>
                          <span className="font-semibold text-[var(--foreground)]">{bucket}:</span>{" "}
                          {items.join(", ")}
                        </div>
                      ) : null,
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Plan-Unavailable Models */}
          <div className={`${subPanelClass} p-5 space-y-4`}>
            <div>
              <h3 className="text-sm font-semibold">{t("Plan-Unavailable Models")}</h3>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {t("Flag models that return plan/quota errors so they stay clearly marked and out of your way.")}
              </p>
            </div>
            <form onSubmit={(e) => void handleMarkUnavailable(e)} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                value={unavailableModel}
                onChange={(e) => setUnavailableModel(e.target.value)}
                placeholder={t("Model ID or slug")}
                className={inputClass}
              />
              <input
                type="text"
                value={unavailableReason}
                onChange={(e) => setUnavailableReason(e.target.value)}
                placeholder={t("Reason (optional)")}
                className={inputClass}
              />
              <button
                type="submit"
                disabled={busy || !unavailableModel.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3.5 py-2 text-xs font-medium hover:bg-[var(--muted)] disabled:opacity-50"
              >
                <AlertTriangle size={14} className="text-amber-500" />
                {t("Mark Unavailable")}
              </button>
            </form>
            {unavailableEntries.length > 0 && (
              <div className="divide-y divide-[var(--border)]/60 rounded-lg border border-[var(--border)]/70">
                {unavailableEntries.map(([name, reason]) => (
                  <div key={name} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-mono font-medium truncate">{name}</div>
                      <div className="text-[11px] text-[var(--muted-foreground)]">{reason}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleClearUnavailable(name)}
                      disabled={busy}
                      className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] hover:bg-[var(--muted)]"
                    >
                      {t("Clear")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "catalogs" ? (
        <div className="space-y-5">
          <div className={`${subPanelClass} p-5 space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{t("Per-Harness Model Overrides")}</h3>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {t("Add newly released models or retire deprecated slugs in custom_model_catalogs.json without editing Python.")}
                </p>
              </div>
              <div className="w-56">
                <select
                  value={selectedKind}
                  onChange={(e) => setSelectedKind(e.target.value)}
                  className={selectClass}
                >
                  {allKinds.map((kind) => (
                    <option key={kind} value={kind} className={selectOptionClass}>
                      {kind}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Add Custom Model Form */}
            <form onSubmit={(e) => void handleAddCatalogModel(e)} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <input
                type="text"
                value={newModelSlug}
                onChange={(e) => setNewModelSlug(e.target.value)}
                placeholder={t("Model slug (e.g. gpt-5.6-luna)")}
                className={inputClass}
              />
              <input
                type="text"
                value={newModelDisplayName}
                onChange={(e) => setNewModelDisplayName(e.target.value)}
                placeholder={t("Display name")}
                className={inputClass}
              />
              <input
                type="text"
                value={newModelEfforts}
                onChange={(e) => setNewModelEfforts(e.target.value)}
                placeholder={t("Efforts (comma-separated)")}
                className={inputClass}
              />
              <input
                type="text"
                value={newModelDefaultEffort}
                onChange={(e) => setNewModelDefaultEffort(e.target.value)}
                placeholder={t("Default effort")}
                className={inputClass}
              />
              <button
                type="submit"
                disabled={busy || !newModelSlug.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus size={14} />
                {t("Add Model")}
              </button>
            </form>

            {/* Added Models List */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[var(--muted-foreground)]">
                {t("Added Models")} ({currentCatalog.added.length})
              </div>
              {currentCatalog.added.length === 0 ? (
                <div className="text-xs text-[var(--muted-foreground)] italic">
                  {t("No custom models added for this harness yet.")}
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]/60 rounded-lg border border-[var(--border)]/70">
                  {currentCatalog.added.map((entry) => (
                    <div key={entry.slug} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {entry.display_name || entry.slug}{" "}
                          <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                            ({entry.slug})
                          </span>
                        </div>
                        {entry.efforts && entry.efforts.length > 0 && (
                          <div className="text-[11px] text-[var(--muted-foreground)]">
                            {t("Efforts")}: {entry.efforts.join(", ")}
                            {entry.default_effort ? ` · ${t("Default")}: ${entry.default_effort}` : ""}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRetireCatalogModel(entry.slug)}
                        disabled={busy}
                        className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-red-600 dark:text-red-400 hover:bg-red-500/10"
                      >
                        {t("Retire")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Retire Existing Built-in Model */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border)]/60">
              <input
                type="text"
                value={retireSlug}
                onChange={(e) => setRetireSlug(e.target.value)}
                placeholder={t("Built-in model slug to retire")}
                className={`${inputClass} max-w-xs`}
              />
              <button
                type="button"
                onClick={() => void handleRetireCatalogModel(retireSlug)}
                disabled={busy || !retireSlug.trim()}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium hover:bg-[var(--muted)] disabled:opacity-50"
              >
                {t("Retire Model")}
              </button>
            </div>

            {/* Retired Models List */}
            {currentCatalog.removed.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--muted-foreground)]">
                  {t("Retired Models")} ({currentCatalog.removed.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {currentCatalog.removed.map((slug) => (
                    <span
                      key={slug}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-mono"
                    >
                      {slug}
                      <button
                        type="button"
                        onClick={() => void handleRestoreCatalogModel(slug)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <RotateCcw size={11} />
                        {t("Restore")}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Register Custom Harness Form */}
          <div className={`${subPanelClass} p-5 space-y-4`}>
            <div>
              <h3 className="text-sm font-semibold">{t("Register Custom CLI / ACP Harness")}</h3>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {t("Add external CLI agents or ACP hosts (such as omniroute or custom wrappers) in data/user/settings/custom_harnesses.json.")}
              </p>
            </div>

            <form onSubmit={(e) => void handleSaveHarness(e)} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <input
                type="text"
                value={harnessKind}
                onChange={(e) => setHarnessKind(e.target.value)}
                placeholder={t("Harness ID (e.g. omniroute)")}
                className={inputClass}
              />
              <input
                type="text"
                value={harnessDisplayName}
                onChange={(e) => setHarnessDisplayName(e.target.value)}
                placeholder={t("Display name")}
                className={inputClass}
              />
              <select
                value={harnessProtocol}
                onChange={(e) => setHarnessProtocol(e.target.value as "cli" | "acp")}
                className={selectClass}
              >
                <option value="cli" className={selectOptionClass}>CLI</option>
                <option value="acp" className={selectOptionClass}>ACP</option>
              </select>
              <input
                type="text"
                value={harnessCommand}
                onChange={(e) => setHarnessCommand(e.target.value)}
                placeholder={t("Executable command")}
                className={inputClass}
              />
              <input
                type="text"
                value={harnessPromptArgs}
                onChange={(e) => setHarnessPromptArgs(e.target.value)}
                placeholder={t("Prompt args (e.g. -p {prompt})")}
                className={inputClass}
              />
              <input
                type="text"
                value={harnessModelFlag}
                onChange={(e) => setHarnessModelFlag(e.target.value)}
                placeholder={t("Model flag (e.g. --model)")}
                className={inputClass}
              />
              <input
                type="text"
                value={harnessEffortFlag}
                onChange={(e) => setHarnessEffortFlag(e.target.value)}
                placeholder={t("Effort flag (e.g. --effort)")}
                className={inputClass}
              />
              <input
                type="text"
                value={harnessDefaultModel}
                onChange={(e) => setHarnessDefaultModel(e.target.value)}
                placeholder={t("Default model (optional)")}
                className={inputClass}
              />
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <button
                  type="submit"
                  disabled={busy || !harnessKind.trim() || !harnessCommand.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Plus size={14} />
                  {t("Save Harness")}
                </button>
              </div>
            </form>
          </div>

          {/* Registered Custom Harnesses List */}
          <div className={`${subPanelClass} p-5 space-y-3`}>
            <h3 className="text-sm font-semibold">
              {t("Registered Custom Harnesses")} ({customHarnessList.length})
            </h3>
            {customHarnessList.length === 0 ? (
              <div className="text-xs text-[var(--muted-foreground)] italic">
                {t("No custom harnesses registered yet. Built-in backends (including FreeBuff) remain auto-detected.")}
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]/60 rounded-lg border border-[var(--border)]/70">
                {customHarnessList.map(([kind, spec]) => (
                  <div key={kind} className="flex items-center justify-between gap-3 px-3.5 py-3 text-xs">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 font-medium">
                        <Terminal size={14} className="text-blue-500 shrink-0" />
                        <span>{spec.display_name || kind}</span>
                        <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[10px]">
                          {kind}
                        </span>
                        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] uppercase text-blue-600 dark:text-blue-400">
                          {spec.protocol}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-[var(--muted-foreground)] truncate">
                        {spec.command} {(spec.prompt_args ?? []).join(" ")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteHarness(kind)}
                      disabled={busy}
                      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-red-600 dark:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 size={12} />
                      {t("Delete")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
