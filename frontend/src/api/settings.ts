import { request } from "./utils";
import type { SettingsRead } from "./types";

export function listSettings(): Promise<SettingsRead> {
  return request<SettingsRead>("/api/settings");
}

export function updateSettings(input: {
  primaryCurrencyCode: string;
}): Promise<SettingsRead> {
  return request<SettingsRead>("/api/settings", {
    method: "PATCH",
    body: { primary_currency_code: input.primaryCurrencyCode },
  });
}
