import { request } from "./utils";
import type { ActionResult, MovementRead, SummaryRead } from "./types";

export function listMovements(): Promise<MovementRead[]> {
  return request<MovementRead[]>("/api/movements");
}

export function getSummary(): Promise<SummaryRead> {
  return request<SummaryRead>("/api/summary");
}

export function updateMovementSubcategory(input: {
  movementId: string;
  subcategoryId: string;
}): Promise<MovementRead> {
  return request<MovementRead>(`/api/movements/${input.movementId}`, {
    method: "PATCH",
    body: { subcategory_id: input.subcategoryId },
  });
}

/**
 * Assign a movement to a category only (no subcategory). Used when the user
 * picks a category that has no subcategories, or explicitly demotes a fully
 * classified movement to category-only.
 */
export function updateMovementCategoryOnly(input: {
  movementId: string;
  categoryId: string;
}): Promise<MovementRead> {
  return request<MovementRead>(`/api/movements/${input.movementId}`, {
    method: "PATCH",
    body: {
      category_id: input.categoryId,
      clear_subcategory: true,
    },
  });
}

export function updateMovementReviewed(input: {
  movementId: string;
  reviewed: boolean;
}): Promise<MovementRead> {
  return request<MovementRead>(`/api/movements/${input.movementId}`, {
    method: "PATCH",
    body: { reviewed: input.reviewed },
  });
}

export function updateMovementAccountingDate(input: {
  movementId: string;
  accountingDate: string;
}): Promise<MovementRead> {
  return request<MovementRead>(`/api/movements/${input.movementId}`, {
    method: "PATCH",
    body: { accounting_date: input.accountingDate },
  });
}

export function deleteMovement(movementId: string): Promise<ActionResult> {
  return request<ActionResult>(`/api/movements/${movementId}`, {
    method: "DELETE",
  });
}

export type ApplyClassificationMemoryResult = { updated: number };

export function applyClassificationMemory(): Promise<ApplyClassificationMemoryResult> {
  return request<ApplyClassificationMemoryResult>(
    "/api/movements/apply-classification-memory",
    { method: "POST" },
  );
}
