import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as assistant from "./assistant";
import * as budgets from "./budgets";
import * as categories from "./categories";
import * as importsApi from "./imports";
import * as movements from "./movements";
import * as settings from "./settings";
import { request } from "./utils";

vi.mock("./utils", () => ({
  request: vi.fn(() => Promise.resolve({ id: "ok", status: "completed" })),
}));

const requestMock = vi.mocked(request);

describe("API wrappers", () => {
  beforeEach(() => {
    requestMock.mockClear();
    requestMock.mockResolvedValue({ id: "ok", status: "completed" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps movement flows to backend payloads", async () => {
    await movements.listMovements();
    await movements.getSummary();
    await movements.createMovement({
      date: "2026-05-17",
      amount: 100,
      business: "Market",
      reason: "Food",
      source: "BANK",
      reviewed: false,
      category_id: "cat",
    });
    await movements.updateMovementSubcategory({ movementId: "mov", subcategoryId: "sub" });
    await movements.updateMovementCategoryOnly({ movementId: "mov", categoryId: "cat" });
    await movements.updateMovementReviewed({ movementId: "mov", reviewed: true });
    await movements.updateMovementAccountingDate({ movementId: "mov", accountingDate: "2026-05-18" });
    await movements.updateMovementAmount({ movementId: "mov", amount: 200 });
    await movements.deleteMovement("mov");
    await movements.applyClassificationMemory();

    expect(requestMock).toHaveBeenCalledWith("/api/movements");
    expect(requestMock).toHaveBeenCalledWith("/api/movements/mov", {
      method: "PATCH",
      body: { category_id: "cat", clear_subcategory: true },
    });
    expect(requestMock).toHaveBeenCalledWith("/api/movements/apply-classification-memory", {
      method: "POST",
    });
  });

  it("maps category management flows to backend payloads", async () => {
    await categories.listCategories();
    await categories.createCategory({ name: "Food", kind: "EXPENSE" });
    await categories.createSubcategory({ name: "Market", categoryId: "cat" });
    await categories.renameCategory({ categoryId: "cat", name: "Essentials" });
    await categories.deleteCategory("cat");
    await categories.migrateCategoryMovements({ categoryId: "from", targetCategoryId: "to" });
    await categories.migrateCategoryMovements({
      categoryId: "from",
      targetCategoryId: "to",
      targetSubcategoryId: "sub",
    });
    await categories.renameSubcategory({ subcategoryId: "sub", name: "Groceries" });
    await categories.deleteSubcategory("sub");
    await categories.moveSubcategoryMovements({ subcategoryId: "sub", targetCategoryId: "cat" });

    expect(requestMock).toHaveBeenCalledWith("/api/categories", {
      method: "POST",
      body: { name: "Food", kind: "EXPENSE" },
    });
    expect(requestMock).toHaveBeenCalledWith("/api/subcategories", {
      method: "POST",
      body: { name: "Market", category_id: "cat" },
    });
    expect(requestMock).toHaveBeenCalledWith("/api/categories/from/migrate-movements", {
      method: "POST",
      body: { target_category_id: "to", target_subcategory_id: null },
    });
    expect(requestMock).toHaveBeenCalledWith("/api/categories/from/migrate-movements", {
      method: "POST",
      body: { target_category_id: "to", target_subcategory_id: "sub" },
    });
  });

  it("maps budget row writes and refreshes the budget after row changes", async () => {
    await budgets.listBudgets();
    await budgets.createBudget({ month: 5, year: 2026 });
    await budgets.updateBudget({ budgetId: "budget", month: 6 });
    await budgets.deleteBudget("budget");
    await budgets.createCategoryBudget({ budgetId: "budget", categoryId: "cat", amount: 100 });
    await budgets.updateCategoryBudgetRow({ rowId: "row", categoryId: "cat", amount: 200, budgetId: "budget" });
    await budgets.deleteCategoryBudgetRow({ rowId: "row", budgetId: "budget" });
    await budgets.createSubcategoryBudget({ budgetId: "budget", subcategoryId: "sub", amount: 50 });
    await budgets.updateSubcategoryBudgetRow({ rowId: "row", subcategoryId: "sub", amount: 60, budgetId: "budget" });
    await budgets.deleteSubcategoryBudgetRow({ rowId: "row", budgetId: "budget" });

    expect(requestMock).toHaveBeenCalledWith("/api/budgets/budget/category-budgets", {
      method: "POST",
      body: { category_id: "cat", amount: 100 },
    });
    expect(requestMock).toHaveBeenCalledWith("/api/budgets/budget");
    expect(requestMock).toHaveBeenCalledWith("/api/subcategory-budgets/row", {
      method: "DELETE",
    });
  });

  it("maps imports and settings to browser-native request bodies", async () => {
    const file = new File(["date,amount"], "movements.csv", { type: "text/csv" });
    await importsApi.importMovementsCsv(file);
    await importsApi.extractMovementsFromFile(file);
    await importsApi.preprocessImportDocument(file);
    await settings.listSettings();
    await settings.updateSettings({ primaryCurrencyCode: "usd" });

    expect(requestMock).toHaveBeenCalledWith("/api/imports/movements-csv", {
      method: "POST",
      body: expect.any(FormData),
    });
    expect(requestMock).toHaveBeenCalledWith("/api/settings", {
      method: "PATCH",
      body: { primary_currency_code: "usd" },
    });
  });

  it("maps assistant tasks and polling states", async () => {
    vi.useFakeTimers();
    requestMock
      .mockResolvedValueOnce({ available: true })
      .mockResolvedValueOnce({ runId: "import" })
      .mockResolvedValueOnce({ runId: "budget" })
      .mockResolvedValueOnce({ runId: "run", status: "running" })
      .mockResolvedValueOnce({ runId: "run", status: "completed" });

    const file = new File(["x"], "statement.csv");
    await assistant.getAssistantStatus();
    await assistant.startMovementImportTask({
      files: [file],
      templateId: "first_run_finance_os_import",
      userNote: "note",
      locale: "es",
    });
    await assistant.startBudgetRecommendationTask({
      expectedIncome: "1000",
      month: "05",
      year: "2026",
      locale: "es",
    });

    const updates: string[] = [];
    const taskPromise = assistant.waitForAssistantTask("run", (task) => updates.push(task.status));
    await vi.advanceTimersByTimeAsync(1200);
    await expect(taskPromise).resolves.toMatchObject({ status: "completed" });

    expect(updates).toEqual(["running", "completed"]);
    expect(requestMock).toHaveBeenCalledWith("/api/assistant/tasks/budget-recommendation", {
      method: "POST",
      body: {
        expectedIncome: "1000",
        month: "05",
        year: "2026",
        locale: "es",
      },
    });
  });

  it("times out assistant polling with the last task error", async () => {
    vi.useFakeTimers();
    requestMock.mockResolvedValue({ runId: "run", status: "running", error: "still working" });

    const taskPromise = assistant.waitForAssistantTask("run", () => undefined);
    const expectation = expect(taskPromise).rejects.toThrow("still working");
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1200);

    await expectation;
  });
});
