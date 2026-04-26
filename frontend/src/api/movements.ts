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
