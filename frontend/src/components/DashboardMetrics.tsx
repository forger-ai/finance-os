import type { ReactNode } from "react";
import AssessmentRounded from "@mui/icons-material/AssessmentRounded";
import SavingsRounded from "@mui/icons-material/SavingsRounded";
import PaidRounded from "@mui/icons-material/PaidRounded";
import TrendingUpRounded from "@mui/icons-material/TrendingUpRounded";
import { alpha, Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { es } from "@/i18n/es";

function MetricCard({
  color,
  icon,
  label,
  value,
}: {
  color?: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent sx={{ p: 1.75 }}>
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Box>
            <Typography color="text.secondary" variant="overline">
              {label}
            </Typography>
            <Typography
              sx={{
                mt: 0.5,
                color: color ?? "text.primary",
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              {value}
            </Typography>
          </Box>
          <Box
            sx={{
              width: 36,
              height: 36,
              display: "grid",
              placeItems: "center",
              borderRadius: "10px",
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
              color: "primary.main",
            }}
          >
            {icon}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function DashboardMetrics({
  summary,
}: {
  summary: {
    balance: string;
    totalIncome: string;
    totalSaved: string;
    totalSpent: string;
  };
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 1,
        gridTemplateColumns: {
          xs: "1fr",
          sm: "repeat(2, minmax(0, 1fr))",
          md: "repeat(4, minmax(0, 1fr))",
        },
      }}
    >
      <MetricCard
        icon={<AssessmentRounded />}
        label={es.dashboard.metrics.totalSpent}
        value={summary.totalSpent}
      />
      <MetricCard
        icon={<SavingsRounded />}
        label={es.dashboard.metrics.totalSaved}
        value={summary.totalSaved}
      />
      <MetricCard
        icon={<PaidRounded />}
        label={es.dashboard.metrics.totalIncome}
        value={summary.totalIncome}
      />
      <MetricCard
        icon={<TrendingUpRounded />}
        label={es.dashboard.metrics.balance}
        color={summary.balance.startsWith("-") ? "#ef4444" : "#22c55e"}
        value={summary.balance}
      />
    </Box>
  );
}
