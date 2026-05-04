import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { AppShell, type ViewMode } from "@/components/AppShell";
import { AppSettingsView } from "@/components/AppSettingsView";
import { DashboardView } from "@/components/DashboardView";
import { MovementsTable } from "@/components/MovementsTable";
import { MovementsUploader } from "@/components/MovementsUploader";
import { ReviewCard } from "@/components/ReviewCard";
import { SettingsView } from "@/components/SettingsView";
import { BudgetView } from "@/components/BudgetView";
import { createCategory, createSubcategory, listCategories } from "@/api/categories";
import { listBudgets } from "@/api/budgets";
import { createMovement, listMovements } from "@/api/movements";
import { listSettings, updateSettings } from "@/api/settings";
import {
  previousClassificationsFor,
  type CategoryOption,
  type MovementRow,
  type SettingsCategory,
  toCategoryOptions,
  toMovementRows,
  toSettingsCategories,
} from "@/lib/derive";
import type {
  BudgetRead,
  CategoryRead,
  CurrencyFormatRead,
  MovementRead,
  SettingsRead,
} from "@/api/types";
import { ApiError } from "@/api/utils";
import { useI18n } from "@/i18n";
import {
  DEFAULT_CURRENCY_FORMAT,
  formatMoneyDraft,
  parseMoneyInput,
} from "@/lib/format";

type AppData = {
  categories: CategoryRead[];
  budgets: BudgetRead[];
  movements: MovementRead[];
  settings: SettingsRead;
};

const ONBOARDING_SKIP_STORAGE_KEY = "finance-os:onboarding-skipped";
const ONBOARDING_PRESET_STORAGE_KEY = "finance-os:onboarding-preset";
const FIRST_RUN_IMPORT_TEMPLATE_ID = "first_run_finance_os_import";
const NO_SUBCATEGORY = "__none__";

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

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function ManualMovementDialog({
  categories,
  currencyFormat,
  open,
  onClose,
  onCreated,
}: {
  categories: CategoryOption[];
  currencyFormat: CurrencyFormatRead;
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const es = useI18n();
  const [date, setDate] = useState(todayIsoDate);
  const [amount, setAmount] = useState("");
  const [business, setBusiness] = useState("");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState<"BANK" | "CREDIT_CARD" | "MANUAL">("MANUAL");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState(NO_SUBCATEGORY);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const firstCategoryId = categories[0]?.id ?? "";
    setDate(todayIsoDate());
    setAmount("");
    setBusiness("");
    setReason("");
    setSource("MANUAL");
    setCategoryId(firstCategoryId);
    setSubcategoryId(NO_SUBCATEGORY);
    setErrorMessage(null);
  }, [categories, open]);

  const activeCategory = categories.find((category) => category.id === categoryId);
  const subcategories = activeCategory?.subcategories ?? [];
  const hasCategories = categories.length > 0;

  const handleCategoryChange = (nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
    setSubcategoryId(NO_SUBCATEGORY);
    setErrorMessage(null);
  };

  const handleSubmit = async () => {
    const parsedAmount = parseMoneyInput(amount, currencyFormat);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage(es.manualMovement.invalidAmount);
      return;
    }
    if (!date || !business.trim() || !reason.trim() || !categoryId) {
      setErrorMessage(es.manualMovement.requiredFields);
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      await createMovement({
        date,
        accounting_date: date,
        amount: parsedAmount,
        business: business.trim(),
        reason: reason.trim(),
        source,
        raw_description: business.trim(),
        reviewed: true,
        category_id: categoryId,
        subcategory_id:
          subcategoryId === NO_SUBCATEGORY ? null : subcategoryId,
      });
      await onCreated();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(es.manualMovement.saveError);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog fullWidth maxWidth="sm" open={open} onClose={saving ? undefined : onClose}>
      <DialogTitle>{es.manualMovement.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!hasCategories ? (
            <Alert severity="info">{es.manualMovement.noCategories}</Alert>
          ) : null}
          <TextField
            fullWidth
            label={es.manualMovement.dateLabel}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            fullWidth
            inputMode="numeric"
            label={es.manualMovement.amountLabel}
            value={amount}
            onChange={(event) =>
              setAmount(formatMoneyDraft(event.target.value, currencyFormat))
            }
          />
          <TextField
            fullWidth
            label={es.manualMovement.businessLabel}
            value={business}
            onChange={(event) => setBusiness(event.target.value)}
          />
          <TextField
            fullWidth
            label={es.manualMovement.reasonLabel}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <FormControl fullWidth>
            <InputLabel>{es.manualMovement.sourceLabel}</InputLabel>
            <Select
              label={es.manualMovement.sourceLabel}
              value={source}
              onChange={(event) =>
                setSource(event.target.value as "BANK" | "CREDIT_CARD" | "MANUAL")
              }
            >
              <MenuItem value="MANUAL">{es.settings.sourceLabels.MANUAL}</MenuItem>
              <MenuItem value="BANK">{es.settings.sourceLabels.BANK}</MenuItem>
              <MenuItem value="CREDIT_CARD">
                {es.settings.sourceLabels.CREDIT_CARD}
              </MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth disabled={!hasCategories}>
            <InputLabel>{es.manualMovement.categoryLabel}</InputLabel>
            <Select
              label={es.manualMovement.categoryLabel}
              value={categoryId}
              onChange={(event) => handleCategoryChange(event.target.value)}
            >
              {categories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth disabled={!hasCategories || subcategories.length === 0}>
            <InputLabel>{es.manualMovement.subcategoryLabel}</InputLabel>
            <Select
              label={es.manualMovement.subcategoryLabel}
              value={subcategoryId}
              onChange={(event) => setSubcategoryId(event.target.value)}
            >
              <MenuItem value={NO_SUBCATEGORY}>
                <em>{es.manualMovement.noSubcategory}</em>
              </MenuItem>
              {subcategories.map((subcategory) => (
                <MenuItem key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {errorMessage ? (
            <Typography color="error" sx={{ fontSize: 13 }}>
              {errorMessage}
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={onClose}>
          {es.manualMovement.cancelButton}
        </Button>
        <Button
          disabled={saving || !hasCategories}
          variant="contained"
          onClick={() => void handleSubmit()}
        >
          {es.manualMovement.createButton}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function App() {
  const es = useI18n();
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [manualMovementOpen, setManualMovementOpen] = useState(false);
  const [onboardingCurrencyCode, setOnboardingCurrencyCode] = useState("CLP");
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
      const [categories, budgets, movements, settings] = await Promise.all([
        listCategories(),
        listBudgets(),
        listMovements(),
        listSettings(),
      ]);
      setData({ budgets, categories, movements, settings });
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

  useEffect(() => {
    if (data?.settings.primary_currency_code) {
      setOnboardingCurrencyCode(data.settings.primary_currency_code);
    }
  }, [data?.settings.primary_currency_code]);

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
        await updateSettings({ primaryCurrencyCode: onboardingCurrencyCode });
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
    [es.errors.generic, onboardingCurrencyCode, reload],
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
    () =>
      data
        ? toMovementRows(
            data.movements,
            data.settings.primary_currency_format,
          )
        : [],
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
  const hasCategories = (data?.categories.length ?? 0) > 0;
  const onboarding = firstRunEmpty && !onboardingSkipped;
  const selectedPreset =
    selectedPresetId && hasCategories
      ? CATEGORY_PRESETS[selectedPresetId]
      : null;
  const showCategoryPresetPicker = !hasCategories;
  const currencyFormat = data?.settings.primary_currency_format ?? DEFAULT_CURRENCY_FORMAT;
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
              {showCategoryPresetPicker
                ? es.onboarding.introBody
                : es.onboarding.uploadBody}
            </Typography>
          </Box>
          {showCategoryPresetPicker ? (
            <Stack spacing={2} sx={{ width: "min(100%, 900px)" }}>
              <FormControl fullWidth sx={{ maxWidth: 420, alignSelf: "center" }}>
                <InputLabel>{es.appSettings.formatMovementsAsLabel}</InputLabel>
                <Select
                  label={es.appSettings.formatMovementsAsLabel}
                  value={onboardingCurrencyCode}
                  onChange={(event) => setOnboardingCurrencyCode(event.target.value)}
                >
                  {(data?.settings.currency_formats ?? []).map((format) => (
                    <MenuItem key={format.code} value={format.code}>
                      {format.code} - {format.name} ({format.symbol},{" "}
                      {es.appSettings.decimalCount(format.decimal_places)})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography
                color="text.secondary"
                sx={{ textAlign: "center", fontSize: 13 }}
              >
                {es.appSettings.visualOnlyHint}
              </Typography>
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
            <Stack spacing={2} sx={{ alignItems: "center", width: "100%" }}>
              <MovementsUploader
                templateId={FIRST_RUN_IMPORT_TEMPLATE_ID}
                userNote={onboardingUserNote}
                onUploaded={() => handleOnboardingUploaded()}
                onGoToReview={() => setViewMode("review")}
              />
              <Button variant="outlined" onClick={() => void handleSkipOnboarding()}>
                {es.onboarding.skipButton}
              </Button>
            </Stack>
          )}
        </Stack>
      </Box>
    );
  }

  return (
    <>
      <AppShell
        pendingReviewCount={reviewQueue.length}
        onAddManualMovement={() => setManualMovementOpen(true)}
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
                      : viewMode === "categories"
                        ? es.views.categoriesEyebrow
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
                      : viewMode === "categories"
                        ? es.views.categoriesTitle
                        : es.views.settingsTitle}
            </Typography>
          </Box>

          {viewMode === "dashboard" ? (
            <DashboardView
              budgets={data?.budgets ?? []}
              currencyFormat={currencyFormat}
              movements={movementRows}
            />
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
              currencyFormat={currencyFormat}
              movements={movementRows}
              onMovementChange={handleMovementChange}
              onMovementDelete={handleMovementDelete}
            />
          ) : viewMode === "categories" ? (
            <SettingsView
              categories={settingsCategories}
              onChanged={() => reload()}
            />
          ) : viewMode === "budgets" ? (
            <BudgetView
              budgets={data?.budgets ?? []}
              categories={categoryOptions}
              currencyFormat={currencyFormat}
              onChanged={() => reload()}
            />
          ) : viewMode === "settings" ? (
            data ? (
              <AppSettingsView
                settings={data.settings}
                onChanged={async (settings) => {
                  setData((current) =>
                    current === null ? current : { ...current, settings },
                  );
                  await reload();
                }}
              />
            ) : null
          ) : (
            <Box sx={{ width: "min(100%, 760px)" }}>
              <ReviewCard
                categories={categoryOptions}
                currencyFormat={currencyFormat}
                movement={activeReviewMovement}
                previousClassifications={activePreviousClassifications}
                remaining={reviewQueue.length}
                onGoToDashboard={() => setViewMode("dashboard")}
                onCategoriesChanged={() => reload()}
                onMovementChange={handleMovementChange}
              />
            </Box>
          )}
        </Stack>
      </AppShell>
      <ManualMovementDialog
        categories={categoryOptions}
        currencyFormat={currencyFormat}
        open={manualMovementOpen}
        onClose={() => setManualMovementOpen(false)}
        onCreated={() => reload()}
      />
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
