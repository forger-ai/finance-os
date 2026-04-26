import { request } from "./utils";
import type { ActionResult, CategoryRead, SubcategoryRead } from "./types";

export function listCategories(): Promise<CategoryRead[]> {
  return request<CategoryRead[]>("/api/categories");
}

export function renameCategory(input: {
  categoryId: string;
  name: string;
}): Promise<CategoryRead> {
  return request<CategoryRead>(`/api/categories/${input.categoryId}`, {
    method: "PATCH",
    body: { name: input.name },
  });
}

export function updateCategoryBudget(input: {
  categoryId: string;
  budget: string;
}): Promise<CategoryRead> {
  const normalized = input.budget.trim().replace(",", ".");
  const value =
    normalized === ""
      ? null
      : Number.isNaN(Number(normalized))
        ? Promise.reject(new Error("El budget debe ser un número válido."))
        : Number(normalized);
  if (value instanceof Promise) {
    return value as Promise<CategoryRead>;
  }
  return request<CategoryRead>(`/api/categories/${input.categoryId}`, {
    method: "PATCH",
    body: { budget: value },
  });
}

export function deleteCategory(categoryId: string): Promise<ActionResult> {
  return request<ActionResult>(`/api/categories/${categoryId}`, {
    method: "DELETE",
  });
}

export function moveCategorySubcategories(input: {
  categoryId: string;
  targetCategoryId: string;
}): Promise<ActionResult> {
  return request<ActionResult>(
    `/api/categories/${input.categoryId}/move-subcategories`,
    {
      method: "POST",
      body: { target_category_id: input.targetCategoryId },
    },
  );
}

export function renameSubcategory(input: {
  subcategoryId: string;
  name: string;
}): Promise<SubcategoryRead> {
  return request<SubcategoryRead>(`/api/subcategories/${input.subcategoryId}`, {
    method: "PATCH",
    body: { name: input.name },
  });
}

export function deleteSubcategory(
  subcategoryId: string,
): Promise<ActionResult> {
  return request<ActionResult>(`/api/subcategories/${subcategoryId}`, {
    method: "DELETE",
  });
}

export function moveSubcategoryMovements(input: {
  subcategoryId: string;
  targetSubcategoryId: string;
}): Promise<ActionResult> {
  return request<ActionResult>(
    `/api/subcategories/${input.subcategoryId}/move-movements`,
    {
      method: "POST",
      body: { target_subcategory_id: input.targetSubcategoryId },
    },
  );
}
