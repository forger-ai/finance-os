/**
 * Derived view-model types built on top of the raw API responses. Keeping these
 * in one place lets components stay focused on rendering rather than munging
 * data.
 */

import type {
  CategoryRead,
  MovementRead,
  SummaryRead,
} from "@/api/types";
import { formatCurrency, formatDate } from "./format";

export type CategoryOption = {
  id: string;
  name: string;
  subcategories: { id: string; name: string }[];
};

export type MovementRow = MovementRead & {
  dateLabel: string;
  accountingDateLabel: string;
  amountLabel: string;
};

export type SettingsSubcategory = {
  id: string;
  name: string;
  movementCount: number;
  categoryId: string;
  categoryName: string;
};

export type SettingsCategory = {
  id: string;
  name: string;
  kind: CategoryRead["kind"];
  budget: number | null;
  movementCount: number;
  subcategories: SettingsSubcategory[];
};

export type DashboardSummary = {
  total: number;
  bank: number;
  creditCard: number;
  reviewed: number;
};

export function toCategoryOptions(categories: CategoryRead[]): CategoryOption[] {
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    subcategories: category.subcategories.map((sub) => ({
      id: sub.id,
      name: sub.name,
    })),
  }));
}

export function toSettingsCategories(
  categories: CategoryRead[],
): SettingsCategory[] {
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    kind: category.kind,
    budget: category.budget,
    movementCount: category.movement_count,
    subcategories: category.subcategories.map((sub) => ({
      id: sub.id,
      name: sub.name,
      movementCount: sub.movement_count,
      categoryId: category.id,
      categoryName: category.name,
    })),
  }));
}

export function toMovementRow(movement: MovementRead): MovementRow {
  return {
    ...movement,
    dateLabel: formatDate(movement.date),
    accountingDateLabel: formatDate(movement.accounting_date),
    amountLabel: formatCurrency(movement.amount),
  };
}

export function toMovementRows(movements: MovementRead[]): MovementRow[] {
  return movements.map(toMovementRow);
}

export type ClassificationMemoryEntry = {
  business: string;
  businessKey: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  count: number;
};

function normalizeBusinessKey(value: string): string {
  // Mirror the backend's ``normalize_key``: strip diacritics, lowercase, trim.
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function classificationKey(
  categoryId: string,
  subcategoryId: string | null,
): string {
  return `${categoryId}|${subcategoryId ?? ""}`;
}

/**
 * Build a ``business → dominant classification`` map from movements the user
 * has already reviewed. Subcategory may be null (category-only).
 */
export function buildClassificationMemory(
  movements: MovementRead[],
): Map<string, ClassificationMemoryEntry> {
  type Counts = Map<string, number>;
  const counts = new Map<string, Counts>();
  const totalCounts = new Map<string, number>();
  const display = new Map<string, string>();
  const decode = new Map<
    string,
    {
      categoryId: string;
      categoryName: string;
      subcategoryId: string | null;
      subcategoryName: string | null;
    }
  >();

  for (const movement of movements) {
    if (!movement.reviewed) continue;
    const key = normalizeBusinessKey(movement.business || "");
    if (!key) continue;
    if (!display.has(key)) display.set(key, movement.business);
    totalCounts.set(key, (totalCounts.get(key) ?? 0) + 1);
    const cKey = classificationKey(
      movement.category_id,
      movement.subcategory_id,
    );
    const inner = counts.get(key) ?? new Map();
    inner.set(cKey, (inner.get(cKey) ?? 0) + 1);
    counts.set(key, inner);
    if (!decode.has(cKey)) {
      decode.set(cKey, {
        categoryId: movement.category_id,
        categoryName: movement.category_name,
        subcategoryId: movement.subcategory_id,
        subcategoryName: movement.subcategory_name,
      });
    }
  }

  const result = new Map<string, ClassificationMemoryEntry>();
  for (const [key, inner] of counts) {
    let bestKey = "";
    let bestCount = 0;
    for (const [cKey, count] of inner) {
      if (count > bestCount) {
        bestCount = count;
        bestKey = cKey;
      }
    }
    const info = decode.get(bestKey);
    if (!info) continue;
    result.set(key, {
      business: display.get(key) ?? key,
      businessKey: key,
      categoryId: info.categoryId,
      categoryName: info.categoryName,
      subcategoryId: info.subcategoryId,
      subcategoryName: info.subcategoryName,
      count: totalCounts.get(key) ?? 0,
    });
  }
  return result;
}

export function suggestSubcategoryFor(
  movement: MovementRead,
  memory: Map<string, ClassificationMemoryEntry>,
): ClassificationMemoryEntry | null {
  const entry = memory.get(normalizeBusinessKey(movement.business || ""));
  if (!entry) return null;
  if (
    entry.categoryId === movement.category_id &&
    entry.subcategoryId === movement.subcategory_id
  ) {
    return null;
  }
  return entry;
}

export function toDashboardSummary(
  movements: MovementRead[],
  summary: SummaryRead,
): DashboardSummary {
  return {
    total: summary.total || movements.length,
    bank: summary.sources.bank,
    creditCard: summary.sources.credit_card,
    reviewed:
      summary.reviewed ||
      movements.filter((movement) => movement.reviewed).length,
  };
}
