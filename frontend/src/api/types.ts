/**
 * Shared response/payload shapes that mirror the FastAPI schemas.
 */

export type CategoryKind = "INCOME" | "EXPENSE" | "UNCHARGEABLE";
export type MovementSource = "BANK" | "CREDIT_CARD" | "MANUAL";

export type SubcategoryRead = {
  id: string;
  name: string;
  category_id: string;
  movement_count: number;
};

export type CategoryRead = {
  id: string;
  name: string;
  kind: CategoryKind;
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
  source_file: string | null;
  external_id: string | null;
  source_row: string | null;
  import_hash: string | null;
  duplicate_warning: string | null;
  reviewed: boolean;
  category_id: string;
  category_name: string;
  category_kind: CategoryKind;
  // Subcategory is optional under the new model: a movement can belong to a
  // category alone when the category has no subcategories.
  subcategory_id: string | null;
  subcategory_name: string | null;
};

export type MovementCreate = {
  date: string;
  accounting_date?: string | null;
  amount: number;
  business: string;
  reason: string;
  source: MovementSource;
  raw_description?: string | null;
  source_file?: string | null;
  external_id?: string | null;
  source_row?: string | null;
  reviewed: boolean;
  category_id: string;
  subcategory_id?: string | null;
};

export type CurrencyFormatRead = {
  code: string;
  name: string;
  symbol: string;
  locale: string;
  decimal_places: number;
};

export type SettingsRead = {
  primary_currency_code: string;
  configured_currency_codes: string[];
  primary_currency_format: CurrencyFormatRead;
  currency_formats: CurrencyFormatRead[];
};

export type CategoryBudgetRead = {
  id: string;
  budget_id: string;
  category_id: string;
  category_name: string;
  amount: number;
};

export type SubcategoryBudgetRead = {
  id: string;
  budget_id: string;
  subcategory_id: string;
  subcategory_name: string;
  category_id: string;
  category_name: string;
  amount: number;
};

export type BudgetRead = {
  id: string;
  month: number;
  year: number;
  label: string;
  category_budgets: CategoryBudgetRead[];
  subcategory_budgets: SubcategoryBudgetRead[];
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
  duplicate: number;
  failed: number;
  errors: { row: number; error: string }[];
};

export type PreprocessedDocument = {
  filename: string;
  content_type: string;
  kind: string;
  text: string;
  row_count: number | null;
  page_count: number | null;
  warning: string | null;
};

export type ActionResult = { ok: true };
