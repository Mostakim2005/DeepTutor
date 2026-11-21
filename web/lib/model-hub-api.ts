import { requestJson } from "@/shared/api/client";

export interface ModelPreferencesData {
  display_names: Record<string, string>;
  pinned: string[];
  hidden: string[];
  unavailable: Record<string, string>;
}

export interface ModelPreferencesBundle {
  schema_version: number;
  exported_at: string;
  preferences: ModelPreferencesData;
}

export interface StalePreferencesReport {
  stale: {
    display_names: string[];
    pinned: string[];
    hidden: string[];
    unavailable: string[];
  };
  total: number;
  known_count: number;
}

export interface PrunePreferencesResult {
  removed: Record<string, number>;
  total_removed: number;
  preferences: ModelPreferencesData;
}

export interface CustomCatalogModelEntry {
  slug: string;
  display_name: string;
  default_effort?: string;
  efforts?: string[];
}

export interface CustomCatalogHarnessEntry {
  added: CustomCatalogModelEntry[];
  removed: string[];
}

export interface CustomCatalogsMap {
  schema_version?: number;
  harnesses: Record<string, CustomCatalogHarnessEntry>;
}

export interface CustomHarnessSpec {
  kind: string;
  display_name: string;
  protocol: "cli" | "acp" | string;
  command: string;
  version_args: string[];
  prompt_args: string[];
  model_flag: string;
  effort_flag: string;
  efforts: string[];
  default_model: string;
  models: Array<{ slug: string; display_name?: string }>;
  env: Record<string, string>;
  enabled: boolean;
}

export interface CustomHarnessesResponse {
  schema_version?: number;
  harnesses: Record<string, CustomHarnessSpec>;
}

export async function getModelPreferences(): Promise<ModelPreferencesData> {
  return requestJson<ModelPreferencesData>("/api/settings/model-preferences");
}

export async function exportModelPreferences(): Promise<ModelPreferencesBundle> {
  return requestJson<ModelPreferencesBundle>("/api/settings/model-preferences/export");
}

export async function importModelPreferences(
  preferences: ModelPreferencesData,
  merge = true,
): Promise<ModelPreferencesData> {
  return requestJson<ModelPreferencesData>("/api/settings/model-preferences/import", {
    method: "POST",
    json: { preferences, merge },
  });
}

export async function getStaleModelPreferences(): Promise<StalePreferencesReport> {
  return requestJson<StalePreferencesReport>("/api/settings/model-preferences/stale");
}

export async function pruneStaleModelPreferences(): Promise<PrunePreferencesResult> {
  return requestJson<PrunePreferencesResult>("/api/settings/model-preferences/prune", {
    method: "POST",
  });
}

export async function markModelUnavailable(
  name: string,
  reason = "Unavailable on current plan",
): Promise<ModelPreferencesData> {
  return requestJson<ModelPreferencesData>("/api/settings/model-preferences/mark-unavailable", {
    method: "POST",
    json: { name, reason },
  });
}

export async function clearModelUnavailable(
  name: string,
): Promise<{ name: string; cleared: boolean }> {
  return requestJson<{ name: string; cleared: boolean }>(
    "/api/settings/model-preferences/clear-unavailable",
    {
      method: "POST",
      json: { name },
    },
  );
}

export async function getModelCatalogOverrides(): Promise<CustomCatalogsMap> {
  return requestJson<CustomCatalogsMap>("/api/settings/model-catalog-overrides");
}

export async function addModelCatalogOverride(
  kind: string,
  payload: CustomCatalogModelEntry,
): Promise<CustomCatalogsMap> {
  return requestJson<CustomCatalogsMap>(
    `/api/settings/model-catalog-overrides/${encodeURIComponent(kind)}/add-model`,
    {
      method: "POST",
      json: payload,
    },
  );
}

export async function removeModelCatalogOverride(
  kind: string,
  slug: string,
): Promise<CustomCatalogsMap> {
  return requestJson<CustomCatalogsMap>(
    `/api/settings/model-catalog-overrides/${encodeURIComponent(kind)}/remove-model`,
    {
      method: "POST",
      json: { slug },
    },
  );
}

export async function restoreModelCatalogOverride(
  kind: string,
  slug: string,
): Promise<CustomCatalogsMap> {
  return requestJson<CustomCatalogsMap>(
    `/api/settings/model-catalog-overrides/${encodeURIComponent(kind)}/restore-model`,
    {
      method: "POST",
      json: { slug },
    },
  );
}

export async function getCustomHarnesses(): Promise<CustomHarnessesResponse> {
  return requestJson<CustomHarnessesResponse>("/api/settings/custom-harnesses");
}

export async function upsertCustomHarness(
  kind: string,
  payload: Omit<CustomHarnessSpec, "kind">,
): Promise<CustomHarnessesResponse> {
  return requestJson<CustomHarnessesResponse>(
    `/api/settings/custom-harnesses/${encodeURIComponent(kind)}`,
    {
      method: "PUT",
      json: payload,
    },
  );
}

export async function deleteCustomHarness(
  kind: string,
): Promise<{ kind: string; deleted: boolean }> {
  return requestJson<{ kind: string; deleted: boolean }>(
    `/api/settings/custom-harnesses/${encodeURIComponent(kind)}`,
    {
      method: "DELETE",
    },
  );
}
