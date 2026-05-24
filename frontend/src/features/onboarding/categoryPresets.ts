import { createCategory, createSubcategory, listCategories } from "@/api/categories";

export const ONBOARDING_SKIP_STORAGE_KEY = "finance-os:onboarding-skipped";
export const ONBOARDING_PRESET_STORAGE_KEY = "finance-os:onboarding-preset";

export type CategoryPresetId = "simple" | "organized";

export type CategoryPreset = {
  id: CategoryPresetId;
  categories: Array<{
    name: string;
    kind: "INCOME" | "EXPENSE" | "UNCHARGEABLE";
    subcategories: string[];
  }>;
};

export const CATEGORY_PRESETS: Record<CategoryPresetId, CategoryPreset> = {
  simple: {
    id: "simple",
    categories: [
      { name: "Income", kind: "INCOME", subcategories: ["Salary", "Refunds", "Other income"] },
      {
        name: "Expenses",
        kind: "EXPENSE",
        subcategories: ["Food", "Transport", "Services", "Shopping", "Other expenses"],
      },
      {
        name: "Non accountable",
        kind: "UNCHARGEABLE",
        subcategories: [
          "Internal transfers",
          "Credit card payment",
          "Transfers between accounts",
          "Adjustments",
        ],
      },
    ],
  },
  organized: {
    id: "organized",
    categories: [
      {
        name: "Essentials",
        kind: "EXPENSE",
        subcategories: ["Rent", "Supermarket", "Utilities", "Health", "Transport"],
      },
      {
        name: "Non-essential",
        kind: "EXPENSE",
        subcategories: ["Restaurants", "Entertainment", "Subscriptions", "Shopping"],
      },
      {
        name: "Extraordinary",
        kind: "EXPENSE",
        subcategories: ["Travel", "Gifts", "Repairs", "One-off purchases"],
      },
      { name: "Income", kind: "INCOME", subcategories: ["Salary", "Refunds", "Other income"] },
      { name: "Savings", kind: "EXPENSE", subcategories: ["Savings", "Investments"] },
      {
        name: "Non accountable",
        kind: "UNCHARGEABLE",
        subcategories: [
          "Internal transfers",
          "Credit card payment",
          "Transfers between accounts",
          "Adjustments",
        ],
      },
    ],
  },
};

export async function createPresetCategories(preset: CategoryPreset) {
  for (const category of preset.categories) {
    let created;
    try {
      created = await createCategory({ name: category.name, kind: category.kind });
    } catch {
      const categories = await listCategories();
      created = categories.find(
        (item) => item.name === category.name && item.kind === category.kind,
      );
      if (!created) throw new Error("category_preset_failed");
    }
    for (const subcategory of category.subcategories) {
      try {
        await createSubcategory({ name: subcategory, categoryId: created.id });
      } catch {
        // Presets are idempotent from the user's perspective; existing rows are fine.
      }
    }
  }
}

export function categoryPresetUserNote(preset: CategoryPreset): string {
  return [
    `The user already chose the "${preset.id}" category preset before this first import.`,
    "Preserve this existing category schema and adapt the extracted movements to it.",
    "Create new subcategories only when the document clearly shows a repeated pattern that does not fit the current subcategories.",
    `Existing schema: ${JSON.stringify(preset.categories)}`,
  ].join("\n");
}
