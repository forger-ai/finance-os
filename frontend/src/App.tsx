import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { useAiSubscription } from "@/ai/AiSubscriptionProvider";
import { AppShell, type ViewMode } from "@/components/AppShell";
import { DashboardView } from "@/components/DashboardView";
import { MovementsTable } from "@/components/MovementsTable";
import { MovementsUploader } from "@/components/MovementsUploader";
import { ReviewCard } from "@/components/ReviewCard";
import { SettingsView } from "@/components/SettingsView";
import { BudgetView } from "@/components/BudgetView";
import { createCategory, createSubcategory, listCategories } from "@/api/categories";
import { listBudgets } from "@/api/budgets";
import { listMovements } from "@/api/movements";
import {
  previousClassificationsFor,
  type CategoryOption,
  type MovementRow,
  type SettingsCategory,
  toCategoryOptions,
  toMovementRows,
  toSettingsCategories,
} from "@/lib/derive";
import type { BudgetRead, CategoryRead, MovementRead } from "@/api/types";
import { ApiError } from "@/api/utils";
import { useI18n } from "@/i18n";

type AppData = {
  categories: CategoryRead[];
  budgets: BudgetRead[];
  movements: MovementRead[];
};

const ONBOARDING_SKIP_STORAGE_KEY = "finance-os:onboarding-skipped";
const ONBOARDING_PRESET_STORAGE_KEY = "finance-os:onboarding-preset";
const FIRST_RUN_IMPORT_TEMPLATE_ID = "first_run_finance_os_import";

type CategoryPresetId = "simple" | "organized";

type CategoryPreset = {
  id: CategoryPresetId;
  categories: Array<{
    name: string;
    kind: "INCOME" | "EXPENSE" | "UNCHARGEABLE";
    subcategories: string[];
  }>;
};

const CATEGORY_PRESETS: Record<CategoryPresetId, CategoryPreset> = {
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

async function createPresetCategories(preset: CategoryPreset) {
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

function categoryPresetUserNote(preset: CategoryPreset): string {
  return [
    `The user already chose the "${preset.id}" category preset before this first import.`,
    "Preserve this existing category schema and adapt the extracted movements to it.",
    "Create new subcategories only when the document clearly shows a repeated pattern that does not fit the current subcategories.",
    `Existing schema: ${JSON.stringify(preset.categories)}`,
  ].join("\n");
}

export default function App() {
  const es = useI18n();
  const aiSubscription = useAiSubscription();
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [selectedPresetId, setSelectedPresetId] = useState<CategoryPresetId | null>(
    () => {
      const value = localStorage.getItem(ONBOARDING_PRESET_STORAGE_KEY);
      return value === "simple" || value === "organized" ? value : null;
    },
  );
  const [onboardingSkipped, setOnboardingSkipped] = useState(
    () => localStorage.getItem(ONBOARDING_SKIP_STORAGE_KEY) === "true",
  );

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [categories, budgets, movements] = await Promise.all([
        listCategories(),
        listBudgets(),
        listMovements(),
      ]);
      setData({ budgets, categories, movements });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(es.errors.network);
      }
    } finally {
      setLoading(false);
    }
  }, [es.errors.network]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleMovementChange = useCallback((updated: MovementRead) => {
    setData((current) =>
      current === null
        ? current
        : {
            ...current,
            movements: current.movements.map((movement) =>
              movement.id === updated.id ? updated : movement,
            ),
          },
    );
  }, []);

  const handleMovementDelete = useCallback((movementId: string) => {
    setData((current) =>
      current === null
        ? current
        : {
            ...current,
            movements: current.movements.filter(
              (movement) => movement.id !== movementId,
            ),
          },
    );
  }, []);

  const handleOnboardingUploaded = useCallback(async () => {
    await reload();
    setViewMode("review");
  }, [reload]);

  const handleSkipOnboarding = useCallback(async () => {
    try {
      if ((data?.categories.length ?? 0) === 0) {
        await createPresetCategories(CATEGORY_PRESETS.simple);
        await reload();
      }
      localStorage.setItem(ONBOARDING_SKIP_STORAGE_KEY, "true");
      setOnboardingSkipped(true);
      setViewMode("dashboard");
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(es.errors.generic);
      }
    }
  }, [data?.categories.length, es.errors.generic, reload]);

  const handlePresetSelected = useCallback(
    async (presetId: CategoryPresetId) => {
      setError(null);
      try {
        const preset = CATEGORY_PRESETS[presetId];
        await createPresetCategories(preset);
        localStorage.setItem(ONBOARDING_PRESET_STORAGE_KEY, presetId);
        setSelectedPresetId(presetId);
        await reload();
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError(es.errors.generic);
        }
      }
    },
    [es.errors.generic, reload],
  );

  const categoryOptions = useMemo<CategoryOption[]>(
    () => (data ? toCategoryOptions(data.categories) : []),
    [data],
  );

  const settingsCategories = useMemo<SettingsCategory[]>(
    () => (data ? toSettingsCategories(data.categories) : []),
    [data],
  );

  const movementRows = useMemo<MovementRow[]>(
    () => (data ? toMovementRows(data.movements) : []),
    [data],
  );

  const reviewQueue = useMemo(
    () => movementRows.filter((movement) => !movement.reviewed),
    [movementRows],
  );
  const activeReviewMovement: MovementRow | null = reviewQueue[0] ?? null;

  const activePreviousClassifications = useMemo(
    () =>
      activeReviewMovement
        ? previousClassificationsFor(activeReviewMovement, data?.movements ?? [])
        : [],
    [activeReviewMovement, data?.movements],
  );
  const firstRunEmpty = useMemo(() => {
    if (!data) return false;
    return data.movements.length === 0;
  }, [data]);
  const onboarding = firstRunEmpty && !onboardingSkipped;
  const selectedPreset =
    selectedPresetId && (data?.categories.length ?? 0) > 0
      ? CATEGORY_PRESETS[selectedPresetId]
      : null;
  const onboardingUserNote = selectedPreset
    ? categoryPresetUserNote(selectedPreset)
    : "";

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          bgcolor: "background.default",
        }}
      >
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (onboarding) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", p: 2 }}>
        <Stack
          spacing={3}
          sx={{
            alignItems: "center",
            justifyContent: "center",
            minHeight: "calc(100vh - 32px)",
          }}
        >
          <Box sx={{ maxWidth: 760, textAlign: "center" }}>
            <Typography sx={{ fontSize: { xs: 34, md: 48 }, fontWeight: 850 }}>
              {es.onboarding.title}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1.5, fontSize: 17 }}>
              {selectedPreset ? es.onboarding.uploadBody : es.onboarding.introBody}
            </Typography>
          </Box>
          {!selectedPreset ? (
            <Stack spacing={2} sx={{ width: "min(100%, 900px)" }}>
              <Typography sx={{ fontSize: 22, fontWeight: 800, textAlign: "center" }}>
                {es.onboarding.presetQuestion}
              </Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                {(["simple", "organized"] as const).map((presetId) => (
                  <Paper
                    key={presetId}
                    component="button"
                    type="button"
                    onClick={() => void handlePresetSelected(presetId)}
                    sx={{
                      flex: 1,
                      p: 2.5,
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 2,
                      color: "inherit",
                      bgcolor: "background.paper",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "border-color 140ms, background-color 140ms",
                      "&:hover": {
                        borderColor: "primary.main",
                        bgcolor: "action.hover",
                      },
                    }}
                  >
                    <Stack spacing={1.25}>
                      <Typography sx={{ fontSize: 18, fontWeight: 800 }}>
                        {es.onboarding.presets[presetId].title}
                      </Typography>
                      <Typography color="text.secondary" sx={{ fontSize: 14 }}>
                        {es.onboarding.presets[presetId].description}
                      </Typography>
                      <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                        {es.onboarding.presets[presetId].categories}
                      </Typography>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
              <Typography color="text.secondary" sx={{ textAlign: "center", fontSize: 14 }}>
                {es.onboarding.presetHint}
              </Typography>
            </Stack>
          ) : (
            <MovementsUploader
              templateId={FIRST_RUN_IMPORT_TEMPLATE_ID}
              userNote={onboardingUserNote}
              onUploaded={() => handleOnboardingUploaded()}
              onGoToReview={() => setViewMode("review")}
            />
          )}
          {!aiSubscription.loading && !aiSubscription.connected ? (
            <Button variant="outlined" onClick={() => void handleSkipOnboarding()}>
              {es.onboarding.skipButton}
            </Button>
          ) : null}
        </Stack>
      </Box>
    );
  }

  return (
    <>
      <AppShell
        onViewChange={setViewMode}
        viewMode={viewMode}
      >
        <Stack
          spacing={2}
          sx={
            viewMode === "review"
              ? { alignItems: "center", width: "100%" }
              : undefined
          }
        >
          <Box
            sx={
              viewMode === "review"
                ? { width: "min(100%, 760px)" }
                : undefined
            }
          >
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              {viewMode === "dashboard"
                ? es.views.dashboardEyebrow
                : viewMode === "load"
                  ? es.views.loadEyebrow
                  : viewMode === "movements"
                  ? es.views.movementsEyebrow
                  : viewMode === "review"
                    ? es.views.reviewEyebrow
                    : viewMode === "budgets"
                      ? es.views.budgetsEyebrow
                      : es.views.settingsEyebrow}
            </Typography>
            <Typography
              sx={{
                mt: 0.5,
                fontSize: { xs: 30, md: 40 },
                fontWeight: 800,
                letterSpacing: "-0.05em",
              }}
            >
              {viewMode === "dashboard"
                ? es.nav.dashboard
                : viewMode === "load"
                  ? es.load.title
                  : viewMode === "movements"
                  ? es.nav.movements
                  : viewMode === "review"
                    ? es.nav.review
                    : viewMode === "budgets"
                      ? es.views.budgetsTitle
                      : es.views.settingsTitle}
            </Typography>
          </Box>

          {viewMode === "dashboard" ? (
            <DashboardView budgets={data?.budgets ?? []} movements={movementRows} />
          ) : viewMode === "load" ? (
            <MovementsUploader
              templateId={firstRunEmpty ? FIRST_RUN_IMPORT_TEMPLATE_ID : undefined}
              userNote={firstRunEmpty ? onboardingUserNote : undefined}
              onUploaded={() => reload()}
              onGoToReview={() => setViewMode("review")}
            />
          ) : viewMode === "movements" ? (
            <MovementsTable
              categories={categoryOptions}
              movements={movementRows}
              onMovementChange={handleMovementChange}
              onMovementDelete={handleMovementDelete}
            />
          ) : viewMode === "settings" ? (
            <SettingsView
              categories={settingsCategories}
              onChanged={() => reload()}
            />
          ) : viewMode === "budgets" ? (
            <BudgetView
              budgets={data?.budgets ?? []}
              categories={categoryOptions}
              onChanged={() => reload()}
            />
          ) : (
            <Box sx={{ width: "min(100%, 760px)" }}>
              <ReviewCard
                categories={categoryOptions}
                movement={activeReviewMovement}
                previousClassifications={activePreviousClassifications}
                remaining={reviewQueue.length}
                total={movementRows.length}
                onGoToDashboard={() => setViewMode("dashboard")}
                onCategoriesChanged={() => reload()}
                onMovementChange={handleMovementChange}
              />
            </Box>
          )}
        </Stack>
      </AppShell>
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
