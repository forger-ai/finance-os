import { useMemo, useState } from "react";
import SearchRounded from "@mui/icons-material/SearchRounded";
import {
  Box,
  Chip,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
} from "@mui/x-data-grid";
import {
  ClassificationEditor,
  type CategoryOption,
  type MovementRow,
} from "./ClassificationEditor";
import {
  updateMovementAccountingDate,
  updateMovementReviewed,
} from "@/api/movements";
import type { MovementRead } from "@/api/types";
import { isoDateOnly } from "@/api/utils";
import { es } from "@/i18n/es";

type Props = {
  categories: CategoryOption[];
  movements: MovementRow[];
  onMovementChange: (movement: MovementRead) => void;
};

type FilterValue = "ALL" | "BANK" | "CREDIT_CARD" | "MANUAL";
type ReviewFilter = "ALL" | "REVIEWED" | "PENDING";

function MovementsFilters({
  query,
  reviewFilter,
  setQuery,
  setReviewFilter,
  setSourceFilter,
  sourceFilter,
}: {
  query: string;
  reviewFilter: ReviewFilter;
  setQuery: (value: string) => void;
  setReviewFilter: (value: ReviewFilter) => void;
  setSourceFilter: (value: FilterValue) => void;
  sourceFilter: FilterValue;
}) {
  return (
    <Paper sx={{ p: 1.5 }}>
      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={2}
        sx={{
          alignItems: { lg: "center" },
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
            {es.movements.filtersTitle}
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: 13, mt: 0.5 }}>
            {es.movements.filtersSubtitle}
          </Typography>
        </Box>

        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.25}
          sx={{
            width: { xs: "100%", lg: "auto" },
            flexWrap: "wrap",
            rowGap: 1,
          }}
        >
          <TextField
            placeholder={es.movements.searchPlaceholder}
            size="small"
            sx={{ width: { xs: "100%", md: 340 } }}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <FormControl size="small" sx={{ minWidth: { xs: "100%", md: 150 } }}>
            <InputLabel>{es.movements.sourceLabel}</InputLabel>
            <Select
              label={es.movements.sourceLabel}
              value={sourceFilter}
              onChange={(event) =>
                setSourceFilter(event.target.value as FilterValue)
              }
            >
              <MenuItem value="ALL">{es.movements.sources.all}</MenuItem>
              <MenuItem value="BANK">{es.movements.sources.bank}</MenuItem>
              <MenuItem value="CREDIT_CARD">
                {es.movements.sources.creditCard}
              </MenuItem>
              <MenuItem value="MANUAL">{es.movements.sources.manual}</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: { xs: "100%", md: 170 } }}>
            <InputLabel>{es.movements.reviewLabel}</InputLabel>
            <Select
              label={es.movements.reviewLabel}
              value={reviewFilter}
              onChange={(event) =>
                setReviewFilter(event.target.value as ReviewFilter)
              }
            >
              <MenuItem value="ALL">{es.movements.reviewFilters.all}</MenuItem>
              <MenuItem value="PENDING">
                {es.movements.reviewFilters.pending}
              </MenuItem>
              <MenuItem value="REVIEWED">
                {es.movements.reviewFilters.reviewed}
              </MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Stack>
    </Paper>
  );
}

export function MovementsTable({
  categories,
  movements,
  onMovementChange,
}: Props) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<FilterValue>("ALL");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("ALL");

  const filteredMovements = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return movements.filter((movement) => {
      const matchesQuery =
        normalizedQuery === "" ||
        movement.business.toLowerCase().includes(normalizedQuery) ||
        movement.reason.toLowerCase().includes(normalizedQuery) ||
        movement.raw_description?.toLowerCase().includes(normalizedQuery);

      const matchesSource =
        sourceFilter === "ALL" || movement.source === sourceFilter;

      const matchesReview =
        reviewFilter === "ALL" ||
        (reviewFilter === "REVIEWED" && movement.reviewed) ||
        (reviewFilter === "PENDING" && !movement.reviewed);

      return matchesQuery && matchesSource && matchesReview;
    });
  }, [movements, query, reviewFilter, sourceFilter]);

  const columns = useMemo<GridColDef<MovementRow>[]>(
    () => [
      {
        field: "accountingDateLabel",
        headerName: es.movements.columns.accountingDate,
        width: 168,
        sortable: false,
        renderCell: (params: GridRenderCellParams<MovementRow>) => (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              height: "100%",
              width: "100%",
            }}
          >
            <TextField
              size="small"
              type="date"
              value={isoDateOnly(params.row.accounting_date)}
              onChange={(event) => {
                void updateMovementAccountingDate({
                  movementId: params.row.id,
                  accountingDate: event.target.value,
                })
                  .then(onMovementChange)
                  .catch((error: unknown) => console.error(error));
              }}
              sx={{ width: 150 }}
            />
          </Box>
        ),
      },
      {
        field: "business",
        headerName: es.movements.columns.movement,
        minWidth: 300,
        flex: 1.2,
        sortable: false,
        renderCell: (params: GridRenderCellParams<MovementRow>) => (
          <Box sx={{ py: 1 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
              {params.row.business}
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: 13, mt: 0.25 }}>
              {params.row.reason}
            </Typography>
            {params.row.raw_description ? (
              <Typography
                color="text.secondary"
                sx={{ fontSize: 11, mt: 0.5 }}
              >
                {params.row.raw_description}
              </Typography>
            ) : null}
          </Box>
        ),
      },
      {
        field: "source",
        headerName: es.movements.columns.source,
        width: 138,
        renderCell: (params: GridRenderCellParams<MovementRow>) => (
          <Chip label={params.row.source} size="small" variant="outlined" />
        ),
      },
      {
        field: "amountLabel",
        headerName: es.movements.columns.amount,
        width: 142,
      },
      {
        field: "classification",
        headerName: es.movements.columns.classification,
        width: 360,
        sortable: false,
        renderCell: (params: GridRenderCellParams<MovementRow>) => (
          <Box
            sx={{
              width: "100%",
              minWidth: 0,
              height: "100%",
              display: "flex",
              alignItems: "center",
            }}
          >
            <ClassificationEditor
              categories={categories}
              dense
              movement={params.row}
              onChange={onMovementChange}
            />
          </Box>
        ),
      },
      {
        field: "reviewed",
        headerName: es.movements.columns.reviewed,
        width: 122,
        sortable: false,
        renderCell: (params: GridRenderCellParams<MovementRow>) => (
          <Switch
            checked={params.row.reviewed}
            onChange={(event) => {
              void updateMovementReviewed({
                movementId: params.row.id,
                reviewed: event.target.checked,
              })
                .then(onMovementChange)
                .catch((error: unknown) => console.error(error));
            }}
          />
        ),
      },
    ],
    [categories, onMovementChange],
  );

  return (
    <Stack spacing={2}>
      <MovementsFilters
        query={query}
        reviewFilter={reviewFilter}
        setQuery={setQuery}
        setReviewFilter={setReviewFilter}
        setSourceFilter={setSourceFilter}
        sourceFilter={sourceFilter}
      />

      <Paper sx={{ height: "calc(100vh - 240px)", minHeight: 480, p: 0 }}>
        <DataGrid
          columns={columns}
          disableColumnMenu
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          rows={filteredMovements}
          rowHeight={82}
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
      </Paper>
    </Stack>
  );
}
