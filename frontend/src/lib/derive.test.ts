import { describe, expect, it } from "vitest";
import type { CategoryRead, MovementRead, SummaryRead } from "@/api/types";
import {
  buildClassificationMemory,
  previousClassificationsFor,
  suggestSubcategoryFor,
  toCategoryOptions,
  toDashboardSummary,
  toMovementRows,
  toSettingsCategories,
} from "./derive";

const category: CategoryRead = {
  id: "cat-food",
  name: "Food",
  kind: "EXPENSE",
  movement_count: 2,
  subcategories: [
    { id: "sub-market", name: "Market", category_id: "cat-food", movement_count: 2 },
  ],
};

const movement = (override: Partial<MovementRead>): MovementRead => ({
  id: "mov-1",
  date: "2026-05-17T00:00:00Z",
  accounting_date: "2026-05-17T00:00:00Z",
  amount: 1000,
  business: "Cafe Águila",
  reason: "Lunch",
  source: "BANK",
  raw_description: null,
  source_file: null,
  external_id: null,
  source_row: null,
  import_hash: null,
  duplicate_warning: null,
  reviewed: false,
  category_id: "cat-food",
  category_name: "Food",
  category_kind: "EXPENSE",
  subcategory_id: "sub-market",
  subcategory_name: "Market",
  ...override,
});

describe("category view models", () => {
  it("derives category options and settings categories", () => {
    expect(toCategoryOptions([category])).toEqual([
      {
        id: "cat-food",
        name: "Food",
        subcategories: [{ id: "sub-market", name: "Market" }],
      },
    ]);

    expect(toSettingsCategories([category])[0]).toMatchObject({
      id: "cat-food",
      movementCount: 2,
      subcategories: [{ categoryId: "cat-food", categoryName: "Food" }],
    });
  });
});

describe("movement view models", () => {
  it("adds formatted labels", () => {
    const [row] = toMovementRows([movement({})]);
    expect(row.amountLabel).toContain("$");
    expect(row.dateLabel).toMatch(/2026/);
    expect(row.accountingDateLabel).toMatch(/2026/);
  });

  it("builds reviewed-business classification memory", () => {
    const reviewed = movement({ id: "reviewed", reviewed: true });
    const pending = movement({ id: "pending", reviewed: false, subcategory_id: null, subcategory_name: null });
    const memory = buildClassificationMemory([reviewed, pending]);

    expect(memory.get("cafe aguila")).toMatchObject({
      categoryId: "cat-food",
      subcategoryId: "sub-market",
      count: 1,
    });
    expect(suggestSubcategoryFor(pending, memory)).toMatchObject({
      subcategoryId: "sub-market",
    });
    expect(suggestSubcategoryFor(reviewed, memory)).toBeNull();
  });

  it("returns prior classifications for the same reviewed business", () => {
    const current = movement({ id: "current", reviewed: false });
    const previous = movement({ id: "previous", reviewed: true });
    const previousAgain = movement({ id: "previous-again", reviewed: true });
    const unrelated = movement({ id: "other", business: "Other", reviewed: true });

    expect(previousClassificationsFor(current, [current, previous, previousAgain, unrelated])).toEqual([
      {
        categoryId: "cat-food",
        categoryName: "Food",
        subcategoryId: "sub-market",
        subcategoryName: "Market",
        count: 2,
      },
    ]);
  });
});

describe("dashboard summary", () => {
  it("uses API totals with movement fallback for reviewed count", () => {
    const summary: SummaryRead = {
      total: 0,
      sources: { bank: 1, credit_card: 2, manual: 0 },
      reviewed: 0,
    };

    expect(toDashboardSummary([movement({ reviewed: true }), movement({ id: "two" })], summary)).toEqual({
      total: 2,
      bank: 1,
      creditCard: 2,
      reviewed: 1,
    });

    expect(
      toDashboardSummary([], {
        ...summary,
        total: 10,
        reviewed: 4,
      }),
    ).toEqual({
      total: 10,
      bank: 1,
      creditCard: 2,
      reviewed: 4,
    });
  });
});
