import { useMemo, useState } from "react";
import { PieChart } from "@mui/x-charts";
import { alpha, useTheme } from "@mui/material/styles";
import {
  Box,
  Button,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
} from "@mui/x-data-grid";
import { DashboardMetrics } from "./DashboardMetrics";
import type { BudgetRead } from "@/api/types";
import type { MovementRow } from "@/lib/derive";
import {
  formatCompactCurrency,
  formatCurrency,
  formatMonthLabel,
} from "@/lib/format";
import { useI18n, useLocale } from "@/i18n";

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{title}</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5, fontSize: 13 }}>
        {subtitle}
      </Typography>
      <Box sx={{ mt: 2 }}>{children}</Box>
    </Paper>
  );
}

function isSavingsMovement(movement: MovementRow) {
  return movement.category_name.toLowerCase() === "ahorro";
}

function isExpenseMovement(movement: MovementRow) {
  return movement.category_kind === "EXPENSE" && !isSavingsMovement(movement);
}

type ActiveFilter =
  | { type: "category"; value: string }
  | { type: "subcategory"; value: string }
  | null;

function buildBudgetTrack(color: string) {
  return [
    `linear-gradient(135deg, ${alpha("#000000", 0)} 0%, ${alpha(
      "#000000",
      0.02,
    )} 58%, ${alpha("#000000", 0.14)} 100%)`,
    color,
  ].join(", ");
}

function getBudgetStatus(spent: number, budget: number) {
  const ratio = budget > 0 ? spent / budget : 0;

  if (ratio >= 1) {
    return {
      color: "#ef4444",
      track: buildBudgetTrack("#ef4444"),
    };
  }

  if (ratio >= 0.85) {
    return {
      color: "#f59e0b",
      track: buildBudgetTrack("#f59e0b"),
    };
  }

  return {
    color: "#22c55e",
    track: buildBudgetTrack("#22c55e"),
  };
}

function getRoundedTrackMax(value: number) {
  return Math.ceil((value * 1.15) / 100000) * 100000;
}

function BudgetProgressRow({
  active,
  budget,
  copy,
  maxValue,
  name,
  onSelect,
  spent,
}: {
  active: boolean;
  budget: number;
  copy: {
    spentLabel: (amount: string) => string;
  };
  maxValue: number;
  name: string;
  onSelect: () => void;
  spent: number;
}) {
  const theme = useTheme();
  const status = getBudgetStatus(spent, budget);
  const trackMax = Math.max(maxValue, budget, spent, 1);
  const fillWidth = Math.min((spent / trackMax) * 100, 100);
  const markerLeft = Math.min((budget / trackMax) * 100, 100);
  const budgetMarkerColor = alpha("#dbe7f0", 0.96);

  return (
    <Box
      component="button"
      type="button"
      onClick={onSelect}
      sx={{
        width: "100%",
        p: 1.25,
        border: "1px solid",
        borderColor: active ? alpha(status.color, 0.75) : "divider",
        borderRadius: 1,
        color: "inherit",
        textAlign: "left",
        background: active ? alpha(status.color, 0.1) : alpha("#dbe7f0", 0.02),
        cursor: "pointer",
        transition: "border-color 160ms ease, background-color 160ms ease",
        "&:hover": {
          borderColor: alpha(status.color, 0.65),
          background: alpha(status.color, 0.08),
        },
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: "flex-start",
          justifyContent: "space-between",
          mb: 1.5,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700 }} noWrap>
            {name}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.25, fontSize: 12 }}>
            {copy.spentLabel(formatCurrency(spent))}
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ position: "relative", pt: 2.5, pb: 1 }}>
        <Typography
          sx={{
            position: "absolute",
            left: `${markerLeft}%`,
            top: 0,
            color: budgetMarkerColor,
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1,
            textShadow: `0 1px 0 ${alpha(theme.palette.background.default, 0.7)}`,
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
          }}
        >
          {formatCompactCurrency(budget)}
        </Typography>
        <Box
          sx={{
            position: "relative",
            height: 16,
            borderRadius: 1,
            bgcolor: alpha(theme.palette.text.primary, 0.08),
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              width: `${fillWidth}%`,
              height: "100%",
              borderRadius: 1,
              background: status.track,
              boxShadow: `0 0 18px ${alpha(status.color, 0.22)}`,
            }}
          />
          <Box
            sx={{
              position: "absolute",
              top: -6,
              bottom: -6,
              left: `${markerLeft}%`,
              width: 3,
              borderRadius: 999,
              bgcolor: budgetMarkerColor,
              boxShadow: `0 0 0 1px ${alpha(theme.palette.background.default, 0.82)}, 0 0 0 4px ${alpha(
                "#dbe7f0",
                0.08,
              )}`,
              transform: "translateX(-1.5px)",
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}

export function DashboardView({
  budgets,
  movements,
}: {
  budgets: BudgetRead[];
  movements: MovementRow[];
}) {
  const theme = useTheme();
  const t = useI18n();
  const locale = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "es-CL";
  const chartColors = useMemo(
    () => [
      theme.palette.primary.main,
      "#7dd3fc",
      "#c084fc",
      "#f59e0b",
      "#fb7185",
      "#22d3ee",
      "#a3e635",
      "#f97316",
    ],
    [theme.palette.primary.main],
  );
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);
  const [breakdownMode, setBreakdownMode] = useState<
    "category" | "subcategory"
  >("subcategory");

  const monthOptions = useMemo(() => {
    const months = Array.from(
      new Set(
        movements.map((movement) => movement.accounting_date.slice(0, 7)),
      ),
    ).sort((a, b) => b.localeCompare(a));

    return months.map((month) => ({
      value: month,
      label: formatMonthLabel(month, dateLocale),
    }));
  }, [dateLocale, movements]);

  const [selectedMonth, setSelectedMonth] = useState(
    monthOptions[0]?.value ?? "",
  );

  const monthlyMovements = useMemo(
    () =>
      movements.filter((movement) =>
        selectedMonth
          ? movement.accounting_date.startsWith(selectedMonth)
          : true,
      ),
    [movements, selectedMonth],
  );

  const monthlyExpenses = useMemo(
    () => monthlyMovements.filter(isExpenseMovement),
    [monthlyMovements],
  );

  const monthlySavings = useMemo(
    () => monthlyMovements.filter(isSavingsMovement),
    [monthlyMovements],
  );

  const metrics = useMemo(() => {
    const totalIncome = monthlyMovements
      .filter((movement) => movement.category_kind === "INCOME")
      .reduce((total, movement) => total + movement.amount, 0);
    const totalSpent = monthlyExpenses.reduce(
      (total, movement) => total + movement.amount,
      0,
    );
    const totalSaved = monthlySavings.reduce(
      (total, movement) => total + movement.amount,
      0,
    );

    const balanceValue = totalIncome - totalSpent - totalSaved;
    return {
      balance: `${balanceValue >= 0 ? "+" : ""}${formatCurrency(balanceValue)}`,
      balanceValue,
      totalIncome: formatCurrency(totalIncome),
      totalSaved: formatCurrency(totalSaved),
      totalSpent: formatCurrency(totalSpent),
    };
  }, [monthlyExpenses, monthlyMovements, monthlySavings]);

  const pieMovements = useMemo(() => {
    if (activeFilter?.type !== "category") {
      return monthlyExpenses;
    }
    return monthlyExpenses.filter(
      (movement) => movement.category_name === activeFilter.value,
    );
  }, [activeFilter, monthlyExpenses]);

  const subcategoryData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const movement of pieMovements) {
      // The breakdown can be aggregated either at the category level or at
      // the subcategory level. Movements without a subcategory always roll up
      // under the category name so they don't disappear in subcategory mode.
      const label =
        breakdownMode === "category"
          ? movement.category_name
          : (movement.subcategory_name ?? movement.category_name);
      totals.set(label, (totals.get(label) ?? 0) + movement.amount);
    }
    return Array.from(totals.entries())
      .filter(([, total]) => total !== 0)
      .map(([name, total], index) => ({
        id: index,
        value: total,
        signedValue: total,
        label: name,
        color: chartColors[index % chartColors.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [breakdownMode, chartColors, pieMovements]);

  const selectedBudget = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    return budgets.find((budget) => budget.year === year && budget.month === month) ?? null;
  }, [budgets, selectedMonth]);

  const budgetData = useMemo(() => {
    if (!selectedBudget) {
      return [];
    }
    const totals = new Map<string, { spent: number; budget: number }>();
    const categoryBudgets = new Map(
      selectedBudget.category_budgets.map((row) => [row.category_name, row.amount]),
    );
    const subcategoryBudgets = new Map(
      selectedBudget.subcategory_budgets.map((row) => [
        `${row.category_name}|${row.subcategory_name}`,
        row.amount,
      ]),
    );
    for (const [categoryName, budget] of categoryBudgets) {
      totals.set(categoryName, { spent: 0, budget });
    }
    for (const movement of monthlyExpenses) {
      const subKey = movement.subcategory_name
        ? `${movement.category_name}|${movement.subcategory_name}`
        : null;
      const subBudget = subKey ? subcategoryBudgets.get(subKey) : undefined;
      if (subBudget != null) {
        const label = movement.subcategory_name ?? movement.category_name;
        const current = totals.get(label) ?? { spent: 0, budget: subBudget };
        current.spent += movement.amount;
        totals.set(label, current);
        continue;
      }
      const categoryBudget = categoryBudgets.get(movement.category_name);
      if (categoryBudget == null) {
        continue;
      }
      const current = totals.get(movement.category_name) ?? {
        spent: 0,
        budget: categoryBudget,
      };
      current.spent += movement.amount;
      totals.set(movement.category_name, current);
    }
    return Array.from(totals.entries())
      .map(([name, values]) => ({
        name,
        spent: values.spent,
        budget: values.budget,
      }))
      .sort((a, b) => b.spent - a.spent);
  }, [monthlyExpenses, selectedBudget]);

  const maxBudgetValue = useMemo(
    () =>
      getRoundedTrackMax(
        budgetData.reduce(
          (currentMax, item) => Math.max(currentMax, item.spent, item.budget),
          0,
        ),
      ),
    [budgetData],
  );

  const filteredMovements = useMemo(() => {
    if (!activeFilter) {
      return monthlyExpenses;
    }
    if (activeFilter.type === "category") {
      return monthlyExpenses.filter(
        (movement) => movement.category_name === activeFilter.value,
      );
    }
    return monthlyExpenses.filter(
      (movement) =>
        (movement.subcategory_name ?? movement.category_name) ===
        activeFilter.value,
    );
  }, [activeFilter, monthlyExpenses]);

  const movementColumns = useMemo<GridColDef<MovementRow>[]>(
    () => [
      {
        field: "dateLabel",
        headerName: t.dashboard.columns.date,
        width: 116,
      },
      {
        field: "business",
        headerName: t.dashboard.columns.movement,
        minWidth: 260,
        flex: 1,
        sortable: false,
        renderCell: (params: GridRenderCellParams<MovementRow>) => (
          <Box sx={{ py: 1 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 650 }}>
              {params.row.business}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.25, fontSize: 12 }}>
              {params.row.reason}
            </Typography>
          </Box>
        ),
      },
      {
        field: "category_name",
        headerName: t.dashboard.columns.category,
        minWidth: 170,
        flex: 0.7,
      },
      {
        field: "subcategory_name",
        headerName: t.dashboard.columns.subcategory,
        minWidth: 170,
        flex: 0.7,
        valueFormatter: (value: unknown) =>
          value ? String(value) : t.dashboard.noSubcategory,
      },
      {
        field: "amountLabel",
        headerName: t.dashboard.columns.amount,
        width: 132,
      },
    ],
    [t],
  );

  const filterLabel =
    activeFilter == null
      ? t.dashboard.consideredSubtitleAll
      : activeFilter.type === "category"
        ? t.dashboard.consideredSubtitleCategory(activeFilter.value)
        : t.dashboard.consideredSubtitleSubcategory(activeFilter.value);

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 1.5 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{
            alignItems: { md: "center" },
            justifyContent: "space-between",
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
              {t.dashboard.monthSelectorTitle}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5, fontSize: 13 }}>
              {t.dashboard.monthSelectorSubtitle}
            </Typography>
          </Box>
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <Select
              value={selectedMonth}
              onChange={(event) => {
                setSelectedMonth(event.target.value);
                setActiveFilter(null);
              }}
            >
              {monthOptions.length === 0 ? (
                <MenuItem disabled value="">
                  {t.dashboard.noMonthOption}
                </MenuItem>
              ) : (
                monthOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      <DashboardMetrics summary={metrics} />

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
        }}
      >
        <Box
          sx={{
            alignSelf: "start",
            display: "grid",
            gap: 1.25,
          }}
        >
          {budgetData.length === 0 ? (
            <Paper sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
                {t.dashboard.budgetEmptyTitle}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5, fontSize: 13 }}>
                {t.dashboard.budgetEmptyHint}
              </Typography>
            </Paper>
          ) : (
            budgetData.map((item) => (
              <BudgetProgressRow
                key={item.name}
                active={
                  activeFilter?.type === "category" &&
                  activeFilter.value === item.name
                }
                budget={item.budget}
                copy={t.dashboard}
                maxValue={maxBudgetValue}
                name={item.name}
                onSelect={() =>
                  setActiveFilter((current) =>
                    current?.type === "category" && current.value === item.name
                      ? null
                      : { type: "category", value: item.name },
                  )
                }
                spent={item.spent}
              />
            ))
          )}
        </Box>
        <ChartCard
          title={
            breakdownMode === "category"
              ? t.dashboard.breakdownTitleByCategory
              : t.dashboard.breakdownTitle
          }
          subtitle={
            activeFilter?.type === "category"
              ? t.dashboard.breakdownSubtitleFiltered(activeFilter.value)
              : t.dashboard.breakdownSubtitleAll
          }
        >
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateRows: "auto auto auto",
              alignItems: "center",
            }}
          >
            <ToggleButtonGroup
              size="small"
              exclusive
              value={breakdownMode}
              onChange={(_event, next) => {
                if (next) setBreakdownMode(next);
              }}
              sx={{ alignSelf: "flex-end" }}
            >
              <ToggleButton value="category">
                {t.dashboard.breakdownToggleCategory}
              </ToggleButton>
              <ToggleButton value="subcategory">
                {t.dashboard.breakdownToggleSubcategory}
              </ToggleButton>
            </ToggleButtonGroup>
            {subcategoryData.length === 0 ? (
              <Typography
                color="text.secondary"
                sx={{ py: 8, textAlign: "center", fontSize: 14 }}
              >
                {t.dashboard.breakdownEmpty}
              </Typography>
            ) : (
              <PieChart
                height={250}
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                onItemClick={(_event, itemData) => {
                  const item = subcategoryData[itemData.dataIndex];
                  if (!item) {
                    return;
                  }
                  setActiveFilter((current) =>
                    current?.type === breakdownMode &&
                    current.value === item.label
                      ? null
                      : { type: breakdownMode, value: item.label },
                  );
                }}
                series={[
                  {
                    cornerRadius: 4,
                    cx: "50%",
                    cy: "50%",
                    data: subcategoryData,
                    highlightScope: { fade: "global", highlight: "item" },
                    innerRadius: 58,
                    outerRadius: 98,
                    paddingAngle: 2,
                  },
                ]}
                slotProps={{ legend: { hidden: true } }}
              />
            )}

            <Stack spacing={1}>
              {subcategoryData.map((item) => (
                <Stack
                  key={item.id}
                  component="button"
                  type="button"
                  onClick={() =>
                    setActiveFilter((current) =>
                      current?.type === breakdownMode &&
                      current.value === item.label
                        ? null
                        : { type: breakdownMode, value: item.label },
                    )
                  }
                  direction="row"
                  spacing={1.25}
                  sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    p: 0.75,
                    border: "1px solid",
                    borderColor:
                      activeFilter?.type === breakdownMode &&
                      activeFilter.value === item.label
                        ? alpha(item.color, 0.65)
                        : "transparent",
                    borderRadius: 1,
                    color: "inherit",
                    bgcolor:
                      activeFilter?.type === breakdownMode &&
                      activeFilter.value === item.label
                        ? alpha(item.color, 0.1)
                        : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    "&:hover": {
                      bgcolor: alpha(item.color, 0.08),
                    },
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", minWidth: 0 }}
                  >
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        bgcolor: item.color,
                        flexShrink: 0,
                      }}
                    />
                    <Typography sx={{ fontSize: 13 }} noWrap>
                      {item.label}
                    </Typography>
                  </Stack>
                  <Typography
                    color="text.secondary"
                    sx={{ fontSize: 13, fontWeight: 600 }}
                  >
                    {formatCurrency(item.signedValue)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        </ChartCard>
      </Box>

      <Paper sx={{ p: 1.5 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          sx={{
            alignItems: { md: "center" },
            justifyContent: "space-between",
            mb: 1.5,
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
              {t.dashboard.consideredTitle}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5, fontSize: 13 }}>
              {filterLabel}
            </Typography>
          </Box>
          {activeFilter ? (
            <Button
              size="small"
              variant="outlined"
              onClick={() => setActiveFilter(null)}
            >
              {t.dashboard.clearFilter}
            </Button>
          ) : null}
        </Stack>
        <Box sx={{ height: 460, minHeight: 360 }}>
          <DataGrid
            columns={movementColumns}
            disableColumnMenu
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50]}
            rows={filteredMovements}
            rowHeight={70}
            sx={{
              border: 0,
              "& .MuiDataGrid-columnHeaders": {
                borderBottom: "1px solid",
                borderColor: "divider",
              },
              "& .MuiDataGrid-cell": {
                borderBottom: "1px solid",
                borderColor: "divider",
                alignItems: "center",
                overflow: "hidden",
              },
              "& .MuiDataGrid-footerContainer": {
                borderTop: "1px solid",
                borderColor: "divider",
              },
            }}
          />
        </Box>
      </Paper>
    </Stack>
  );
}
