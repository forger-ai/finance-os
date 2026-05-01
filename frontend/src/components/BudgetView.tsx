import { useEffect, useMemo, useState } from "react";
import AddRounded from "@mui/icons-material/AddRounded";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useAiSubscription } from "@/ai/AiSubscriptionProvider";
import {
  createBudget,
  createCategoryBudget,
  createSubcategoryBudget,
  deleteBudget,
  deleteCategoryBudgetRow,
  deleteSubcategoryBudgetRow,
  updateCategoryBudgetRow,
  updateSubcategoryBudgetRow,
} from "@/api/budgets";
import type { BudgetRead } from "@/api/types";
import type { CategoryOption } from "@/lib/derive";
import { useI18n, useLocale } from "@/i18n";

const RECOMMEND_BUDGET_TEMPLATE_ID = "recommend_budget";

type RecommendationPhase =
  | { kind: "idle" }
  | { kind: "running"; codexStatus?: ForgerCodexTaskStatus }
  | { kind: "done"; resultText: string }
  | { kind: "error"; message: string };

type ProgressMessage = {
  id: string;
  text: string;
};

function parseAmount(value: string): number | null {
  const normalized = value.trim().replace(/\./g, "").replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAmountInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("es-CL");
}

function localizeAssistantName(text: string, assistantName: string): string {
  return text.replace(/\b(Codex|The assistant|El asistente)\b/gi, assistantName);
}

async function waitForCodexTask(runId: string): Promise<ForgerCodexTaskSummary> {
  const api = window.forgerApp;
  if (!api) {
    throw new Error("codex_unavailable");
  }
  const initial = await api.getCodexTask(runId);
  if (
    initial?.status === "completed" ||
    initial?.status === "failed" ||
    initial?.status === "canceled"
  ) {
    return initial;
  }
  return new Promise((resolve) => {
    const unsubscribe = api.onCodexTaskUpdated((event) => {
      if (event.task.runId !== runId) return;
      if (
        event.task.status === "completed" ||
        event.task.status === "failed" ||
        event.task.status === "canceled"
      ) {
        unsubscribe();
        resolve(event.task);
      }
    });
  });
}

export function BudgetView({
  budgets,
  categories,
  onChanged,
}: {
  budgets: BudgetRead[];
  categories: CategoryOption[];
  onChanged: () => Promise<void> | void;
}) {
  const es = useI18n();
  const locale = useLocale();
  const aiSubscription = useAiSubscription();
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(
    budgets[0]?.id ?? null,
  );
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [targetCategoryId, setTargetCategoryId] = useState("");
  const [targetSubcategoryId, setTargetSubcategoryId] = useState("");
  const [categoryAmount, setCategoryAmount] = useState("");
  const [subcategoryAmount, setSubcategoryAmount] = useState("");
  const [expectedIncome, setExpectedIncome] = useState("");
  const [recommendationPhase, setRecommendationPhase] =
    useState<RecommendationPhase>({ kind: "idle" });
  const [recommendationProgress, setRecommendationProgress] = useState<
    ProgressMessage[]
  >([]);

  const selectedBudget = useMemo(
    () => budgets.find((budget) => budget.id === selectedBudgetId) ?? null,
    [budgets, selectedBudgetId],
  );
  const subcategoryOptions = useMemo(
    () =>
      categories.flatMap((category) =>
        category.subcategories.map((subcategory) => ({
          ...subcategory,
          categoryId: category.id,
          categoryName: category.name,
        })),
      ),
    [categories],
  );

  const refresh = async () => {
    await onChanged();
  };

  const pushRecommendationProgress = (text: string) => {
    setRecommendationProgress((current) => [
      ...current,
      { id: `${Date.now()}-${current.length}`, text },
    ]);
  };

  const runCreateBudget = async () => {
    const nextMonth = Number(month);
    const nextYear = Number(year);
    if (!Number.isInteger(nextMonth) || !Number.isInteger(nextYear)) return;
    const created = await createBudget({ month: nextMonth, year: nextYear });
    setSelectedBudgetId(created.id);
    await refresh();
  };

  const runAddCategoryBudget = async () => {
    if (!selectedBudget || !targetCategoryId) return;
    const parsed = parseAmount(categoryAmount);
    if (parsed == null) return;
    await createCategoryBudget({
      budgetId: selectedBudget.id,
      categoryId: targetCategoryId,
      amount: parsed,
    });
    setCategoryAmount("");
    await refresh();
  };

  const runAddSubcategoryBudget = async () => {
    if (!selectedBudget || !targetSubcategoryId) return;
    const parsed = parseAmount(subcategoryAmount);
    if (parsed == null) return;
    await createSubcategoryBudget({
      budgetId: selectedBudget.id,
      subcategoryId: targetSubcategoryId,
      amount: parsed,
    });
    setSubcategoryAmount("");
    await refresh();
  };

  const runRecommend = async () => {
    if (!selectedBudget) return;
    const hasAi = await aiSubscription.requireAi();
    if (!hasAi) return;
    if (!window.forgerApp) {
      setRecommendationPhase({
        kind: "error",
        message: es.budgets.codexUnavailable,
      });
      return;
    }

    setRecommendationPhase({ kind: "running" });
    setRecommendationProgress([]);
    pushRecommendationProgress(es.budgets.recommendationProgressStarting);

    try {
      const started = await window.forgerApp.startCodexTask({
        templateId: RECOMMEND_BUDGET_TEMPLATE_ID,
        locale,
        arguments: {
          expectedIncome: { type: "string", value: expectedIncome },
          locale: { type: "string", value: locale },
          month: { type: "string", value: String(selectedBudget.month) },
          year: { type: "string", value: String(selectedBudget.year) },
        },
      });
      setRecommendationPhase({ kind: "running", codexStatus: started.status });

      const seenCodexProgress = new Set<string>();
      const unsubscribe = window.forgerApp.onCodexTaskUpdated((event) => {
        if (event.task.runId !== started.runId) return;
        setRecommendationPhase({
          kind: "running",
          codexStatus: event.task.status,
        });
        for (const entry of event.task.progressLog ?? []) {
          const progressMessage = entry.trim();
          if (!progressMessage || seenCodexProgress.has(progressMessage)) continue;
          seenCodexProgress.add(progressMessage);
          pushRecommendationProgress(
            localizeAssistantName(progressMessage, es.app.assistantName),
          );
        }
      });

      const task = await waitForCodexTask(started.runId);
      unsubscribe();
      if (task.status !== "completed") {
        throw new Error(task.error || es.budgets.recommendationError);
      }
      setRecommendationPhase({
        kind: "done",
        resultText: task.resultText
          ? localizeAssistantName(task.resultText, es.app.assistantName)
          : es.budgets.recommendationDone,
      });
      pushRecommendationProgress(es.budgets.recommendationDone);
      await refresh();
    } catch (error) {
      setRecommendationPhase({
        kind: "error",
        message:
          error instanceof Error && error.message !== "codex_unavailable"
            ? error.message
            : es.budgets.recommendationError,
      });
    }
  };

  if (!selectedBudget) {
    return (
      <Stack spacing={2}>
        <BudgetCreateForm
          month={month}
          year={year}
          onMonthChange={setMonth}
          onSubmit={() => void runCreateBudget()}
          onYearChange={setYear}
        />
        <Paper sx={{ p: 2 }}>
          <Typography sx={{ fontWeight: 800, mb: 1 }}>{es.budgets.listTitle}</Typography>
          {budgets.length === 0 ? (
            <Typography color="text.secondary">{es.budgets.emptyList}</Typography>
          ) : (
            <Stack spacing={1}>
              {budgets.map((budget) => (
                <Button
                  key={budget.id}
                  variant="outlined"
                  onClick={() => setSelectedBudgetId(budget.id)}
                >
                  {budget.label}
                </Button>
              ))}
            </Stack>
          )}
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {recommendationPhase.kind === "done" ? (
        <Alert severity="success" onClose={() => setRecommendationPhase({ kind: "idle" })}>
          {recommendationPhase.resultText}
        </Alert>
      ) : recommendationPhase.kind === "error" ? (
        <Alert severity="error" onClose={() => setRecommendationPhase({ kind: "idle" })}>
          {recommendationPhase.message}
        </Alert>
      ) : null}
      <Button
        startIcon={<ArrowBackRounded />}
        sx={{ alignSelf: "flex-start" }}
        variant="outlined"
        onClick={() => setSelectedBudgetId(null)}
      >
        {es.budgets.backToList}
      </Button>

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}
      >
        <Typography sx={{ fontSize: 24, fontWeight: 800 }}>
          {es.budgets.detailTitle(selectedBudget.label)}
        </Typography>
        <Button
          color="error"
          startIcon={<DeleteOutlineRounded />}
          variant="outlined"
          onClick={() => {
            if (!window.confirm(es.budgets.deleteConfirm)) return;
            void deleteBudget(selectedBudget.id).then(async () => {
              setSelectedBudgetId(null);
              await refresh();
            });
          }}
        >
          {es.budgets.deleteButton}
        </Button>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography sx={{ fontSize: 20, fontWeight: 800 }}>
            {es.budgets.recommendationTitle}
          </Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              label={es.budgets.expectedIncomeLabel}
              size="small"
              value={expectedIncome}
              onChange={(event) =>
                setExpectedIncome(formatAmountInput(event.target.value))
              }
            />
            <Button
              startIcon={<AutoAwesomeRounded />}
              variant="contained"
              disabled={recommendationPhase.kind === "running"}
              onClick={() => void runRecommend()}
            >
              {recommendationPhase.kind === "running"
                ? es.budgets.recommendationRunningButton
                : es.budgets.recommendButton}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {recommendationPhase.kind === "running" ? (
        <Paper sx={{ p: 2.25 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
              <CircularProgress size={20} />
              <Stack spacing={0.25}>
                <Typography sx={{ fontWeight: 800 }}>
                  {es.budgets.recommendationProgressTitle}
                </Typography>
                <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                  {es.budgets.recommendationProgressHint}
                </Typography>
              </Stack>
            </Stack>
            <Stack spacing={0.75}>
              {recommendationProgress.map((entry) => (
                <Box
                  key={entry.id}
                  sx={{
                    px: 1.25,
                    py: 1,
                    borderRadius: 1,
                    bgcolor: (theme) => alpha(theme.palette.common.white, 0.04),
                    fontSize: 13,
                    color: "text.secondary",
                    "@keyframes budgetProgressIn": {
                      "0%": { opacity: 0, transform: "translateY(8px)" },
                      "100%": { opacity: 1, transform: "translateY(0)" },
                    },
                    animation: "budgetProgressIn 220ms ease-out",
                  }}
                >
                  {entry.text}
                </Box>
              ))}
            </Stack>
          </Stack>
        </Paper>
      ) : null}

      <Paper sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Typography sx={{ fontWeight: 800 }}>{es.budgets.categoryRows}</Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel>{es.budgets.categoryTargetLabel}</InputLabel>
              <Select
                label={es.budgets.categoryTargetLabel}
                value={targetCategoryId}
                onChange={(event) => setTargetCategoryId(event.target.value)}
              >
                {categories.map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    {category.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={es.budgets.amountLabel}
              size="small"
              value={categoryAmount}
              onChange={(event) =>
                setCategoryAmount(formatAmountInput(event.target.value))
              }
            />
            <Button
              startIcon={<AddRounded />}
              onClick={() => void runAddCategoryBudget()}
            >
              {es.budgets.defineCategoryBudget}
            </Button>
          </Stack>
          {selectedBudget.category_budgets.map((row) => (
            <BudgetRow
              key={row.id}
              label={row.category_name}
              amount={row.amount}
              onAmountChange={(nextAmount) =>
                updateCategoryBudgetRow({
                  amount: nextAmount,
                  budgetId: selectedBudget.id,
                  rowId: row.id,
                }).then(refresh)
              }
              onDelete={() => {
                if (!window.confirm(es.budgets.rowDeleteConfirm)) return;
                void deleteCategoryBudgetRow({
                  budgetId: selectedBudget.id,
                  rowId: row.id,
                }).then(refresh);
              }}
            />
          ))}
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Typography sx={{ fontWeight: 800 }}>{es.budgets.subcategoryRows}</Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <FormControl size="small" sx={{ minWidth: 280 }}>
              <InputLabel>{es.budgets.subcategoryTargetLabel}</InputLabel>
              <Select
                label={es.budgets.subcategoryTargetLabel}
                value={targetSubcategoryId}
                onChange={(event) => setTargetSubcategoryId(event.target.value)}
              >
                {subcategoryOptions.map((subcategory) => (
                  <MenuItem key={subcategory.id} value={subcategory.id}>
                    {subcategory.categoryName} / {subcategory.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={es.budgets.amountLabel}
              size="small"
              value={subcategoryAmount}
              onChange={(event) =>
                setSubcategoryAmount(formatAmountInput(event.target.value))
              }
            />
            <Button
              startIcon={<AddRounded />}
              onClick={() => void runAddSubcategoryBudget()}
            >
              {es.budgets.defineSubcategoryBudget}
            </Button>
          </Stack>
          {selectedBudget.subcategory_budgets.map((row) => (
            <BudgetRow
              key={row.id}
              label={`${row.category_name} / ${row.subcategory_name}`}
              amount={row.amount}
              onAmountChange={(nextAmount) =>
                updateSubcategoryBudgetRow({
                  amount: nextAmount,
                  budgetId: selectedBudget.id,
                  rowId: row.id,
                }).then(refresh)
              }
              onDelete={() => {
                if (!window.confirm(es.budgets.rowDeleteConfirm)) return;
                void deleteSubcategoryBudgetRow({
                  budgetId: selectedBudget.id,
                  rowId: row.id,
                }).then(refresh);
              }}
            />
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}

function BudgetCreateForm({
  month,
  year,
  onMonthChange,
  onYearChange,
  onSubmit,
}: {
  month: string;
  year: string;
  onMonthChange: (value: string) => void;
  onYearChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const es = useI18n();

  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{es.budgets.monthLabel}</InputLabel>
          <Select
            label={es.budgets.monthLabel}
            value={month}
            onChange={(event) => onMonthChange(event.target.value)}
          >
            {es.budgets.monthNames.map((name, index) => (
              <MenuItem key={name} value={String(index + 1)}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label={es.budgets.yearLabel}
          size="small"
          value={year}
          onChange={(event) => onYearChange(event.target.value)}
        />
        <Button startIcon={<AddRounded />} variant="contained" onClick={onSubmit}>
          {es.budgets.createButton}
        </Button>
      </Stack>
    </Paper>
  );
}

function BudgetRow({
  label,
  amount,
  onAmountChange,
  onDelete,
}: {
  label: string;
  amount: number;
  onAmountChange: (amount: number) => Promise<unknown>;
  onDelete: () => void;
}) {
  const es = useI18n();
  const [draft, setDraft] = useState(formatAmountInput(String(amount)));
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "invalid" | "error"
  >("idle");

  useEffect(() => {
    setDraft(formatAmountInput(String(amount)));
  }, [amount]);

  useEffect(() => {
    const parsed = parseAmount(draft);
    if (draft.trim() === "" || parsed == null || parsed < 0) {
      setSaveState(draft.trim() === "" ? "idle" : "invalid");
      return;
    }
    if (parsed === amount) {
      setSaveState("idle");
      return;
    }

    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      void onAmountChange(parsed)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [amount, draft, onAmountChange]);

  const saveStateLabel =
    saveState === "saving"
      ? es.budgets.savingLabel
      : saveState === "saved"
        ? es.budgets.savedLabel
        : saveState === "invalid"
          ? es.budgets.invalidAmountLabel
          : saveState === "error"
            ? es.budgets.saveErrorLabel
            : "";

  return (
    <Box
      sx={{
        alignItems: { xs: "stretch", md: "center" },
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        gap: 1,
        justifyContent: "space-between",
        p: 1,
      }}
    >
      <Typography sx={{ fontWeight: 700 }}>{label}</Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
        <TextField
          label={es.budgets.amountLabel}
          size="small"
          sx={{ width: { xs: "100%", sm: 180 } }}
          value={draft}
          onChange={(event) => setDraft(formatAmountInput(event.target.value))}
        />
        {saveStateLabel ? (
          <Typography
            color={saveState === "invalid" || saveState === "error" ? "error" : "text.secondary"}
            sx={{ minWidth: 86, fontSize: 12 }}
          >
            {saveStateLabel}
          </Typography>
        ) : null}
        <Button
          color="error"
          size="small"
          startIcon={<DeleteOutlineRounded />}
          onClick={onDelete}
        >
          {es.budgets.deleteButton}
        </Button>
      </Stack>
    </Box>
  );
}
