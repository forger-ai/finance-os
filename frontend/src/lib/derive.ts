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
