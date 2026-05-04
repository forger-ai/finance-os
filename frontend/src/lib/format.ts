/**
 * Formatting helpers used across the app. Money formatting is a visual
 * preference: it controls symbols, separators, and decimal precision, but does
 * not convert or reinterpret stored amounts.
 */

import type { CurrencyFormatRead } from "@/api/types";

export const DEFAULT_CURRENCY_FORMAT: CurrencyFormatRead = {
  code: "CLP",
  name: "Chilean peso",
  symbol: "$",
  locale: "es-CL",
  decimal_places: 0,
};

function numberParts(format: CurrencyFormatRead) {
  const parts = new Intl.NumberFormat(format.locale).formatToParts(12345.6);
  return {
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
    group: parts.find((part) => part.type === "group")?.value ?? ",",
  };
}

export function formatMoney(
  value: number,
  format: CurrencyFormatRead = DEFAULT_CURRENCY_FORMAT,
): string {
  return new Intl.NumberFormat(format.locale, {
    style: "currency",
    currency: format.code,
    minimumFractionDigits: format.decimal_places,
    maximumFractionDigits: format.decimal_places,
  }).format(value);
}

export function formatCompactMoney(
  value: number,
  format: CurrencyFormatRead = DEFAULT_CURRENCY_FORMAT,
): string {
  return new Intl.NumberFormat(format.locale, {
    style: "currency",
    currency: format.code,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatMoneyValueForInput(
  value: number,
  format: CurrencyFormatRead = DEFAULT_CURRENCY_FORMAT,
): string {
  return new Intl.NumberFormat(format.locale, {
    minimumFractionDigits: format.decimal_places,
    maximumFractionDigits: format.decimal_places,
  }).format(value);
}

export function formatMoneyDraft(
  input: string,
  format: CurrencyFormatRead = DEFAULT_CURRENCY_FORMAT,
): string {
  const { decimal, group } = numberParts(format);
  const allowedSeparators =
    format.decimal_places > 0
      ? new Set([decimal, group, ".", ","])
      : new Set([group, ".", ","]);
  let output = "";
  let hasDecimal = false;
  for (const char of input) {
    if (/\d/.test(char)) {
      output += char;
      continue;
    }
    if (/\s/.test(char)) {
      continue;
    }
    if (!allowedSeparators.has(char)) {
      continue;
    }
    const isDecimal = format.decimal_places > 0 && char === decimal;
    if (isDecimal) {
      if (hasDecimal) continue;
      hasDecimal = true;
    }
    output += char;
  }
  return output;
}

export function parseMoneyInput(
  input: string,
  format: CurrencyFormatRead = DEFAULT_CURRENCY_FORMAT,
): number {
  const { decimal, group } = numberParts(format);
  let normalized = input.trim();
  if (!normalized) return Number.NaN;

  normalized = normalized
    .replace(new RegExp(`\\${group}`, "g"), "")
    .replace(/\s/g, "");

  if (format.decimal_places > 0) {
    if (decimal !== ".") {
      normalized = normalized.replace(new RegExp(`\\${decimal}`, "g"), ".");
    }
    normalized = normalized.replace(/,/g, ".");
    const firstDecimal = normalized.indexOf(".");
    if (firstDecimal >= 0) {
      normalized =
        normalized.slice(0, firstDecimal + 1) +
        normalized.slice(firstDecimal + 1).replace(/\./g, "");
    }
  } else {
    normalized = normalized.replace(/\D/g, "");
  }

  if (!normalized) return Number.NaN;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return Number.NaN;
  const factor = 10 ** format.decimal_places;
  return Math.round(parsed * factor) / factor;
}

export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatMonthLabel(value: string, locale = "es-CL"): string {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}
