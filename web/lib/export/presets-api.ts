import { requestJson } from "@/shared/api/client";
import type { ExportFilterOptions, ExportFormat } from "./types";

export type ExportPresetScope = "all" | "answers" | "questions";

export interface ExportPreset {
  id: string;
  name: string;
  format: ExportFormat;
  scope: ExportPresetScope;
  builtin?: boolean;
  options: Omit<ExportFilterOptions, "selectedMessageIds">;
}

export interface ExportPresetsResponse {
  schema_version: number;
  last_used_preset_id: string | null;
  presets: ExportPreset[];
}

export async function getExportPresets(): Promise<ExportPresetsResponse> {
  return requestJson<ExportPresetsResponse>("/api/settings/export-presets");
}

export async function saveExportPreset(
  presetId: string,
  payload: Omit<ExportPreset, "id" | "builtin">,
): Promise<ExportPresetsResponse> {
  return requestJson<ExportPresetsResponse>(
    `/api/settings/export-presets/${encodeURIComponent(presetId)}`,
    {
      method: "PUT",
      json: payload,
    },
  );
}

export async function deleteExportPreset(
  presetId: string,
): Promise<{ id: string; deleted: boolean }> {
  return requestJson<{ id: string; deleted: boolean }>(
    `/api/settings/export-presets/${encodeURIComponent(presetId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function setLastUsedExportPreset(
  presetId: string | null,
): Promise<ExportPresetsResponse> {
  return requestJson<ExportPresetsResponse>("/api/settings/export-presets/last-used", {
    method: "POST",
    json: { preset_id: presetId },
  });
}
