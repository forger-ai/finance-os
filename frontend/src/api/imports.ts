import { request } from "./utils";
import type { ImportResult } from "./types";

export function importMovementsCsv(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  return request<ImportResult>("/api/imports/movements-csv", {
    method: "POST",
    body: formData,
  });
}

/**
 * Single endpoint for the Review upload flow: dispatches by file type on the
 * server (CSV deterministic, PDF/image via OpenAI extraction).
 */
export function extractMovementsFromFile(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  return request<ImportResult>("/api/imports/movements-extract", {
    method: "POST",
    body: formData,
  });
}
