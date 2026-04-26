import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { AppShell, type ViewMode } from "@/components/AppShell";
import { DashboardView } from "@/components/DashboardView";
import { MovementsTable } from "@/components/MovementsTable";
import { ReviewCard } from "@/components/ReviewCard";
import { SettingsView } from "@/components/SettingsView";
import { listCategories } from "@/api/categories";
import { listMovements } from "@/api/movements";
import {
  type CategoryOption,
  type DashboardSummary,
  type MovementRow,
  type SettingsCategory,
  toCategoryOptions,
  toMovementRows,
  toSettingsCategories,
} from "@/lib/derive";
import type { CategoryRead, MovementRead } from "@/api/types";
import { ApiError } from "@/api/utils";
import { es } from "@/i18n/es";

type AppData = {
  categories: CategoryRead[];
  movements: MovementRead[];
};

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [categories, movements] = await Promise.all([
        listCategories(),
        listMovements(),
      ]);
      setData({ categories, movements });
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
  }, []);

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

  const summary = useMemo<DashboardSummary>(() => {
    const movements = data?.movements ?? [];
    return {
      total: movements.length,
      bank: movements.filter((m) => m.source === "BANK").length,
      creditCard: movements.filter((m) => m.source === "CREDIT_CARD").length,
      reviewed: movements.filter((m) => m.reviewed).length,
    };
  }, [data]);

  const reviewQueue = useMemo(
    () => movementRows.filter((movement) => !movement.reviewed),
    [movementRows],
  );
  const activeReviewMovement: MovementRow | null = reviewQueue[0] ?? null;

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

  return (
    <>
      <AppShell
        onViewChange={setViewMode}
        summaryLabel={`${summary.reviewed}/${summary.total} revisados`}
        viewMode={viewMode}
      >
        <Stack spacing={2}>
          <Box>
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
                : viewMode === "movements"
                  ? es.views.movementsEyebrow
                  : viewMode === "review"
                    ? es.views.reviewEyebrow
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
                : viewMode === "movements"
                  ? es.nav.movements
                  : viewMode === "review"
                    ? es.nav.review
                    : es.views.settingsTitle}
            </Typography>
          </Box>

          {viewMode === "dashboard" ? (
            <DashboardView movements={movementRows} />
          ) : viewMode === "movements" ? (
            <MovementsTable
              categories={categoryOptions}
              movements={movementRows}
              onMovementChange={handleMovementChange}
            />
          ) : viewMode === "settings" ? (
            <SettingsView
              categories={settingsCategories}
              onChanged={() => reload()}
            />
          ) : (
            <ReviewCard
              categories={categoryOptions}
              movement={activeReviewMovement}
              remaining={reviewQueue.length}
              total={movementRows.length}
              onMovementChange={handleMovementChange}
            />
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
