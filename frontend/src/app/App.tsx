import { useCallback, useEffect, useMemo, useState } from "react";
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
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { AppShell, type ViewMode } from "@/app/AppShell";
import { DashboardView } from "@/features/dashboard/DashboardView";
import { BudgetView } from "@/features/budgets/BudgetView";
import { MovementsTable } from "@/features/movements/MovementsTable";
import { MovementsUploader } from "@/features/movements/MovementsUploader";
import { ReviewCard } from "@/features/review/ReviewCard";
import { AppSettingsView } from "@/features/settings/AppSettingsView";
import { SettingsView } from "@/features/settings/SettingsView";
import { listBudgets } from "@/api/budgets";
import { listCategories } from "@/api/categories";
import { listMovements } from "@/api/movements";
import { listSettings, updateSettings } from "@/api/settings";
import { ManualMovementDialog } from "@/features/movements/ManualMovementDialog";
import {
  CATEGORY_PRESETS,
  ONBOARDING_PRESET_STORAGE_KEY,
  ONBOARDING_SKIP_STORAGE_KEY,
  categoryPresetUserNote,
  createPresetCategories,
  type CategoryPresetId,
} from "@/features/onboarding/categoryPresets";
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
  MovementRead,
  SettingsRead,
} from "@/api/types";
import { ApiError } from "@/api/utils";
import { useI18n } from "@/i18n";
import { DEFAULT_CURRENCY_FORMAT } from "@/lib/format";

type AppData = {
  categories: CategoryRead[];
  budgets: BudgetRead[];
  movements: MovementRead[];
  settings: SettingsRead;
};

const FIRST_RUN_IMPORT_TEMPLATE_ID = "first_run_finance_os_import";

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
  const onboarding = firstRunEmpty && (!onboardingSkipped || !hasCategories);
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
                onMovementDelete={handleMovementDelete}
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
