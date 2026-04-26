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
