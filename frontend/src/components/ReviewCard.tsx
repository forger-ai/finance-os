import CalendarTodayRounded from "@mui/icons-material/CalendarTodayRounded";
import DoneRounded from "@mui/icons-material/DoneRounded";
import WalletRounded from "@mui/icons-material/WalletRounded";
import { alpha } from "@mui/material/styles";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { updateMovementReviewed } from "@/api/movements";
import {
  ClassificationEditor,
  type CategoryOption,
  type MovementRow,
} from "./ClassificationEditor";
import type { MovementRead } from "@/api/types";
import { es } from "@/i18n/es";

function getSourceLabel(source: string) {
  if (source in es.settings.sourceLabels) {
    return es.settings.sourceLabels[
      source as keyof typeof es.settings.sourceLabels
    ];
  }
  return source;
}

export function ReviewCard({
  categories,
  movement,
  remaining,
  total,
  onMovementChange,
}: {
  categories: CategoryOption[];
  movement: MovementRow | null;
  remaining: number;
  total: number;
  onMovementChange: (movement: MovementRead) => void;
}) {
  if (!movement) {
    return (
      <Paper sx={{ p: 4 }}>
        <Typography variant="h5">{es.review.nothingTitle}</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {es.review.nothingHint}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        maxWidth: 980,
        p: { xs: 2, md: 3 },
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
            <Box />
            <Typography
              color="text.secondary"
              sx={{ fontSize: 13, fontWeight: 700 }}
            >
              {total - remaining + 1}/{total}
            </Typography>
          </Stack>

          <Typography
            sx={{
              fontSize: { xs: 34, md: 44 },
              fontWeight: 800,
              letterSpacing: "-0.06em",
              lineHeight: 0.95,
            }}
          >
            {movement.amountLabel}
          </Typography>

          <Typography
            sx={{
              fontSize: { xs: 24, md: 30 },
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            {movement.raw_description ?? movement.business}
          </Typography>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ color: "text.secondary" }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <CalendarTodayRounded sx={{ fontSize: 16 }} />
              <Typography sx={{ fontSize: 14 }}>
                {movement.accountingDateLabel}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <WalletRounded sx={{ fontSize: 17 }} />
              <Typography sx={{ fontSize: 14 }}>
                {getSourceLabel(movement.source)}
              </Typography>
            </Stack>
          </Stack>
        </Stack>

        <Stack spacing={1}>
          <Typography
            color="text.secondary"
            sx={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {es.review.datesEyebrow}
          </Typography>
          <Box
            sx={{
              px: 1.75,
              py: 1.5,
              borderRadius: 1.5,
              bgcolor: (theme) => alpha(theme.palette.common.white, 0.03),
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Typography sx={{ fontSize: 14 }}>
                {es.review.rawDateLabel}: {movement.dateLabel}
              </Typography>
              <Typography sx={{ fontSize: 14 }}>
                {es.review.accountingDateLabel}: {movement.accountingDateLabel}
              </Typography>
            </Stack>
          </Box>
        </Stack>

        <Stack spacing={1}>
          <Typography
            color="text.secondary"
            sx={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {es.review.originalDescription}
          </Typography>
          <Box
            sx={{
              px: 1.75,
              py: 1.5,
              borderRadius: 1.5,
              bgcolor: (theme) => alpha(theme.palette.common.white, 0.03),
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography sx={{ fontSize: 14 }}>
              {movement.raw_description ?? movement.business}
            </Typography>
          </Box>
        </Stack>

        <ClassificationEditor
          categories={categories}
          movement={movement}
          reviewLayout
          onChange={onMovementChange}
        />

        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", justifyContent: "flex-end" }}
        >
          <Button
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
      </Stack>
    </Paper>
  );
}
