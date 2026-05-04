import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import CalendarTodayRounded from "@mui/icons-material/CalendarTodayRounded";
import DashboardRounded from "@mui/icons-material/DashboardRounded";
import DoneRounded from "@mui/icons-material/DoneRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import { alpha } from "@mui/material/styles";
import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import {
  updateMovementCategoryOnly,
  updateMovementReviewed,
  updateMovementSubcategory,
} from "@/api/movements";
import {
  ClassificationEditor,
  type CategoryOption,
  type MovementRow,
} from "./ClassificationEditor";
import type { PreviousClassificationEntry } from "@/lib/derive";
import type { CurrencyFormatRead, MovementRead } from "@/api/types";
import { useI18n } from "@/i18n";

export function ReviewCard({
  categories,
  currencyFormat,
  movement,
  previousClassifications,
  remaining,
  onGoToDashboard,
  onCategoriesChanged,
  onMovementChange,
}: {
  categories: CategoryOption[];
  currencyFormat: CurrencyFormatRead;
  movement: MovementRow | null;
  previousClassifications: PreviousClassificationEntry[];
  remaining: number;
  onGoToDashboard: () => void;
  onCategoriesChanged?: () => Promise<void> | void;
  onMovementChange: (movement: MovementRead) => void;
}) {
  const es = useI18n();

  if (!movement) {
    return (
      <Paper sx={{ p: 4 }}>
        <Typography variant="h5">{es.review.completeTitle}</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {es.review.completeHint}
        </Typography>
        <Button
          startIcon={<DashboardRounded />}
          sx={{ mt: 2 }}
          variant="contained"
          onClick={onGoToDashboard}
        >
          {es.review.goToDashboard}
        </Button>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        width: "100%",
        p: { xs: 2, md: 2.5 },
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Stack spacing={3}>
        <Stack spacing={1.5}>
          <Stack
            direction="row"
            spacing={2}
            sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
          >
            <Typography
              color="text.secondary"
              sx={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {es.review.glossLabel}
            </Typography>
            <Typography
              color="text.secondary"
              sx={{ fontSize: 13, fontWeight: 700 }}
            >
              {es.review.remainingLabel(remaining)}
            </Typography>
          </Stack>

          <Typography
            sx={{
              fontSize: { xs: 22, md: 26 },
              maxWidth: 620,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.08,
              overflowWrap: "anywhere",
            }}
          >
            {movement.raw_description ?? movement.business}
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <CalendarTodayRounded sx={{ fontSize: 16 }} />
              <Typography color="text.secondary" sx={{ fontSize: 14 }}>
                {es.review.movementDateLabel}: {movement.dateLabel}
              </Typography>
            </Stack>
            <Typography color="text.secondary" sx={{ fontSize: 14 }}>
              {es.review.amountLabel}: {movement.amountLabel}
            </Typography>
          </Stack>
        </Stack>

        {movement.duplicate_warning ? (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              border: "1px solid",
              borderColor: (theme) => alpha(theme.palette.warning.main, 0.35),
              bgcolor: (theme) => alpha(theme.palette.warning.main, 0.08),
            }}
          >
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
              <WarningAmberRounded color="warning" sx={{ fontSize: 18 }} />
              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                {es.review.possibleDuplicateWarning}
              </Typography>
            </Stack>
          </Box>
        ) : null}

        <ClassificationEditor
          categories={categories}
          currencyFormat={currencyFormat}
          movement={movement}
          reviewLayout
          showAmount
          onCategoriesChanged={onCategoriesChanged}
          onChange={onMovementChange}
        />

        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", justifyContent: "stretch" }}
        >
          <Button
            fullWidth
            startIcon={<DoneRounded />}
            variant="contained"
            onClick={() => {
              void updateMovementReviewed({
                movementId: movement.id,
                reviewed: true,
              })
                .then(onMovementChange)
                .catch((error: unknown) => console.error(error));
            }}
            sx={{ minWidth: 220 }}
          >
            {es.review.confirmAndContinue}
          </Button>
        </Stack>

        {previousClassifications.length > 0 ? (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              border: "1px solid",
              borderColor: (theme) => alpha(theme.palette.primary.main, 0.3),
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.07),
            }}
          >
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 1.25 }}>
              <AutoAwesomeRounded color="primary" sx={{ fontSize: 18 }} />
              <Stack spacing={0.25}>
                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                  {es.review.suggestionTitle}
                </Typography>
                <Typography color="text.secondary" sx={{ fontSize: 12 }}>
                  {es.review.suggestionHint(
                    movement.business,
                    previousClassifications.reduce((sum, entry) => sum + entry.count, 0),
                  )}
                </Typography>
              </Stack>
            </Stack>
            <Stack spacing={0.75}>
              {previousClassifications.map((entry) => (
                <Stack
                  key={`${entry.categoryId}-${entry.subcategoryId ?? "none"}`}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{
                    alignItems: { sm: "center" },
                    justifyContent: "space-between",
                    p: 1,
                    borderRadius: 1,
                    bgcolor: (theme) => alpha(theme.palette.common.white, 0.04),
                  }}
                >
                  <Chip
                    label={
                      entry.subcategoryName
                        ? `${entry.categoryName} / ${entry.subcategoryName} (${entry.count})`
                        : `${entry.categoryName} (${entry.count})`
                    }
                    size="small"
                    variant="outlined"
                    sx={{ alignSelf: { xs: "flex-start", sm: "center" } }}
                  />
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => {
                      const apply = entry.subcategoryId
                        ? updateMovementSubcategory({
                            movementId: movement.id,
                            subcategoryId: entry.subcategoryId,
                          })
                        : updateMovementCategoryOnly({
                            movementId: movement.id,
                            categoryId: entry.categoryId,
                          });
                      void apply
                        .then(onMovementChange)
                        .catch((error: unknown) => console.error(error));
                    }}
                  >
                    {es.review.suggestionApply}
                  </Button>
                </Stack>
              ))}
            </Stack>
          </Box>
        ) : null}
      </Stack>
    </Paper>
  );
}
