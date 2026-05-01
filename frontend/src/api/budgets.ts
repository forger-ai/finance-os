import { request } from "./utils";
import type { ActionResult, BudgetRead } from "./types";

export function listBudgets(): Promise<BudgetRead[]> {
  return request<BudgetRead[]>("/api/budgets");
}

export function createBudget(input: {
  month: number;
  year: number;
}): Promise<BudgetRead> {
  return request<BudgetRead>("/api/budgets", {
    method: "POST",
    body: input,
  });
}

export function updateBudget(input: {
  budgetId: string;
  month?: number;
  year?: number;
}): Promise<BudgetRead> {
  return request<BudgetRead>(`/api/budgets/${input.budgetId}`, {
    method: "PATCH",
    body: { month: input.month, year: input.year },
  });
}

export function deleteBudget(budgetId: string): Promise<ActionResult> {
  return request<ActionResult>(`/api/budgets/${budgetId}`, { method: "DELETE" });
}

export function createCategoryBudget(input: {
  budgetId: string;
  categoryId: string;
  amount: number;
}): Promise<BudgetRead> {
  return request<BudgetRead>(`/api/budgets/${input.budgetId}/category-budgets`, {
    method: "POST",
    body: { category_id: input.categoryId, amount: input.amount },
  }).then(() => request<BudgetRead>(`/api/budgets/${input.budgetId}`));
}

export function updateCategoryBudgetRow(input: {
  rowId: string;
  categoryId?: string;
  amount?: number;
  budgetId: string;
}): Promise<BudgetRead> {
  return request(`/api/category-budgets/${input.rowId}`, {
    method: "PATCH",
    body: { category_id: input.categoryId, amount: input.amount },
  }).then(() => request<BudgetRead>(`/api/budgets/${input.budgetId}`));
}

export function deleteCategoryBudgetRow(input: {
  rowId: string;
  budgetId: string;
}): Promise<BudgetRead> {
  return request(`/api/category-budgets/${input.rowId}`, {
    method: "DELETE",
  }).then(() => request<BudgetRead>(`/api/budgets/${input.budgetId}`));
}

export function createSubcategoryBudget(input: {
  budgetId: string;
  subcategoryId: string;
  amount: number;
}): Promise<BudgetRead> {
  return request<BudgetRead>(`/api/budgets/${input.budgetId}/subcategory-budgets`, {
    method: "POST",
    body: { subcategory_id: input.subcategoryId, amount: input.amount },
  }).then(() => request<BudgetRead>(`/api/budgets/${input.budgetId}`));
}

export function updateSubcategoryBudgetRow(input: {
  rowId: string;
  subcategoryId?: string;
  amount?: number;
  budgetId: string;
}): Promise<BudgetRead> {
  return request(`/api/subcategory-budgets/${input.rowId}`, {
    method: "PATCH",
    body: { subcategory_id: input.subcategoryId, amount: input.amount },
  }).then(() => request<BudgetRead>(`/api/budgets/${input.budgetId}`));
}

export function deleteSubcategoryBudgetRow(input: {
  rowId: string;
  budgetId: string;
}): Promise<BudgetRead> {
  return request(`/api/subcategory-budgets/${input.rowId}`, {
    method: "DELETE",
  }).then(() => request<BudgetRead>(`/api/budgets/${input.budgetId}`));
}
