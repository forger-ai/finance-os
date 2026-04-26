/**
 * Shared response/payload shapes that mirror the FastAPI schemas.
 */

export type CategoryKind = "INCOME" | "EXPENSE" | "UNCHARGEABLE";
export type MovementSource = "BANK" | "CREDIT_CARD" | "MANUAL";

export type SubcategoryRead = {
  id: string;
  name: string;
  budget: number | null;
  category_id: string;
  movement_count: number;
};

export type CategoryRead = {
  id: string;
  name: string;
  kind: CategoryKind;
  budget: number | null;
  movement_count: number;
  subcategories: SubcategoryRead[];
};

export type MovementRead = {
  id: string;
  date: string;
  accounting_date: string;
  amount: number;
  business: string;
  reason: string;
  source: MovementSource;
  raw_description: string | null;
  reviewed: boolean;
  subcategory_id: string;
  subcategory_name: string;
  category_id: string;
  category_name: string;
  category_kind: CategoryKind;
  category_budget: number | null;
};

export type SummaryRead = {
  total: number;
  reviewed: number;
  sources: {
    bank: number;
    credit_card: number;
    manual: number;
  };
};

export type ImportResult = {
  file: string;
  inserted: number;
  failed: number;
  errors: { row: number; error: string }[];
};

export type ActionResult = { ok: true };
