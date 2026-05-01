import { request } from "./utils";
import type {
  ActionResult,
  CategoryKind,
  CategoryRead,
  SubcategoryRead,
} from "./types";

export function listCategories(): Promise<CategoryRead[]> {
  return request<CategoryRead[]>("/api/categories");
}

export function createCategory(input: {
  name: string;
  kind: CategoryKind;
}): Promise<CategoryRead> {
  return request<CategoryRead>("/api/categories", {
    method: "POST",
    body: {
      name: input.name,
      kind: input.kind,
    },
  });
}

export function createSubcategory(input: {
  name: string;
  categoryId: string;
}): Promise<SubcategoryRead> {
  return request<SubcategoryRead>("/api/subcategories", {
    method: "POST",
    body: {
      name: input.name,
      category_id: input.categoryId,
    },
  });
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

export function deleteCategory(categoryId: string): Promise<ActionResult> {
  return request<ActionResult>(`/api/categories/${categoryId}`, {
    method: "DELETE",
  });
}

export function migrateCategoryMovements(input: {
  categoryId: string;
  targetCategoryId: string;
  targetSubcategoryId?: string | null;
}): Promise<ActionResult> {
  return request<ActionResult>(
    `/api/categories/${input.categoryId}/migrate-movements`,
    {
      method: "POST",
      body: {
        target_category_id: input.targetCategoryId,
        target_subcategory_id: input.targetSubcategoryId ?? null,
      },
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
  targetCategoryId?: string | null;
  targetSubcategoryId?: string | null;
}): Promise<ActionResult> {
  return request<ActionResult>(
    `/api/subcategories/${input.subcategoryId}/move-movements`,
    {
      method: "POST",
      body: {
        target_category_id: input.targetCategoryId ?? null,
        target_subcategory_id: input.targetSubcategoryId ?? null,
      },
    },
  );
}
