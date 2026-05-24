import { useEffect, useMemo, useState } from "react";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
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
  deleteMovement,
  updateMovementReviewed,
} from "@/api/movements";
import type { CurrencyFormatRead, MovementRead } from "@/api/types";
import { isoDateOnly } from "@/api/utils";
import { es } from "@/i18n/es";
import { toMovementRow } from "@/lib/derive";

type Props = {
  categories: CategoryOption[];
  currencyFormat: CurrencyFormatRead;
  movements: MovementRow[];
  onMovementChange: (movement: MovementRead) => void;
  onMovementDelete: (movementId: string) => void;
};

type FilterValue = "ALL" | "BANK" | "CREDIT_CARD" | "MANUAL";
type ReviewFilter = "ALL" | "REVIEWED" | "PENDING";

const ALL = "ALL" as const;

type FiltersProps = {
  categories: CategoryOption[];
  categoryFilter: string;
  dateFrom: string;
  dateTo: string;
  query: string;
  reviewFilter: ReviewFilter;
  setCategoryFilter: (value: string) => void;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  setQuery: (value: string) => void;
  setReviewFilter: (value: ReviewFilter) => void;
  setSourceFilter: (value: FilterValue) => void;
  setSubcategoryFilter: (value: string) => void;
  sourceFilter: FilterValue;
  subcategoryFilter: string;
};

function MovementsFilters({
  categories,
  categoryFilter,
  dateFrom,
  dateTo,
  query,
  reviewFilter,
  setCategoryFilter,
  setDateFrom,
  setDateTo,
  setQuery,
  setReviewFilter,
  setSourceFilter,
  setSubcategoryFilter,
  sourceFilter,
  subcategoryFilter,
}: FiltersProps) {
  // When a specific category is selected we restrict the subcategory dropdown
  // to its children. With "Todas" we let the user pick any subcategory.
  const subcategoryOptions = useMemo(() => {
    if (categoryFilter === ALL) {
      return categories.flatMap((cat) =>
        cat.subcategories.map((sub) => ({
          id: sub.id,
          label: `${cat.name} / ${sub.name}`,
        })),
      );
    }
    const target = categories.find((cat) => cat.id === categoryFilter);
    return (
      target?.subcategories.map((sub) => ({ id: sub.id, label: sub.name })) ??
      []
    );
  }, [categories, categoryFilter]);

  return (
    <Paper sx={{ p: 1.25 }}>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 1,
          alignItems: "center",
        }}
      >
        <TextField
          placeholder={es.movements.searchPlaceholder}
          size="small"
          sx={{ flex: "1 1 220px", minWidth: 180 }}
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
        <FormControl size="small" sx={{ flex: "1 1 160px", minWidth: 140 }}>
          <InputLabel>{es.movements.categoryLabel}</InputLabel>
          <Select
            label={es.movements.categoryLabel}
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <MenuItem value={ALL}>{es.movements.allCategories}</MenuItem>
            {categories.map((cat) => (
              <MenuItem key={cat.id} value={cat.id}>
                {cat.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ flex: "1 1 180px", minWidth: 160 }}>
          <InputLabel>{es.movements.subcategoryLabel}</InputLabel>
          <Select
            label={es.movements.subcategoryLabel}
            value={subcategoryFilter}
            disabled={subcategoryOptions.length === 0}
            onChange={(event) => setSubcategoryFilter(event.target.value)}
          >
            <MenuItem value={ALL}>{es.movements.allSubcategories}</MenuItem>
            {subcategoryOptions.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ flex: "0 1 130px", minWidth: 110 }}>
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
        <FormControl size="small" sx={{ flex: "0 1 140px", minWidth: 120 }}>
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
        <TextField
          label={es.movements.dateFromLabel}
          size="small"
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
          sx={{ flex: "0 1 150px", minWidth: 130 }}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label={es.movements.dateToLabel}
          size="small"
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
          sx={{ flex: "0 1 150px", minWidth: 130 }}
          InputLabelProps={{ shrink: true }}
        />
      </Box>
    </Paper>
  );
}

export function MovementsTable({
  categories,
  currencyFormat,
  movements,
  onMovementChange,
  onMovementDelete,
}: Props) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<FilterValue>("ALL");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [editingMovement, setEditingMovement] = useState<MovementRow | null>(
    null,
  );

  // Reset the subcategory filter when its parent category no longer matches.
  useEffect(() => {
    if (subcategoryFilter === ALL) return;
    if (categoryFilter === ALL) return;
    const target = categories.find((cat) => cat.id === categoryFilter);
    const stillValid = target?.subcategories.some(
      (sub) => sub.id === subcategoryFilter,
    );
    if (!stillValid) setSubcategoryFilter(ALL);
  }, [categories, categoryFilter, subcategoryFilter]);

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

      const matchesCategory =
        categoryFilter === ALL || movement.category_id === categoryFilter;

      const matchesSubcategory =
        subcategoryFilter === ALL ||
        movement.subcategory_id === subcategoryFilter;

      const accountingDay = isoDateOnly(movement.accounting_date);
      const matchesDateFrom = !dateFrom || accountingDay >= dateFrom;
      const matchesDateTo = !dateTo || accountingDay <= dateTo;

      return (
        matchesQuery &&
        matchesSource &&
        matchesReview &&
        matchesCategory &&
        matchesSubcategory &&
        matchesDateFrom &&
        matchesDateTo
      );
    });
  }, [
    categoryFilter,
    dateFrom,
    dateTo,
    movements,
    query,
    reviewFilter,
    sourceFilter,
    subcategoryFilter,
  ]);

  const columns = useMemo<GridColDef<MovementRow>[]>(
    () => [
      {
        field: "business",
        headerName: es.movements.columns.movement,
        minWidth: 220,
        flex: 1.4,
        sortable: false,
        renderCell: (params: GridRenderCellParams<MovementRow>) => (
          <Box
            sx={{
              minWidth: 0,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <Typography
              sx={{
                fontSize: 14,
                fontWeight: 600,
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
              }}
            >
              {params.row.business}
            </Typography>
            <Typography
              color="text.secondary"
              sx={{
                fontSize: 12,
                mt: 0.25,
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
              }}
            >
              {params.row.accountingDateLabel} · {params.row.reason}
            </Typography>
          </Box>
        ),
      },
      {
        field: "amountLabel",
        headerName: es.movements.columns.amount,
        width: 120,
        renderCell: (params: GridRenderCellParams<MovementRow>) => (
          <Typography sx={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
            {params.row.amountLabel}
          </Typography>
        ),
      },
      {
        field: "classification",
        headerName: es.movements.columns.classification,
        minWidth: 240,
        flex: 1,
        sortable: false,
        renderCell: (params: GridRenderCellParams<MovementRow>) => (
          <Box
            sx={{
              minWidth: 0,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
              }}
            >
              {params.row.category_name}
            </Typography>
            <Typography
              color="text.secondary"
              sx={{
                fontSize: 12,
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
              }}
            >
              {params.row.subcategory_name ?? es.editor.noSubcategory}
            </Typography>
          </Box>
        ),
      },
      {
        field: "reviewed",
        headerName: es.movements.columns.reviewed,
        width: 92,
        sortable: false,
        align: "center",
        headerAlign: "center",
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
      {
        field: "actions",
        headerName: es.movements.columns.actions,
        width: 96,
        sortable: false,
        align: "center",
        headerAlign: "center",
        renderCell: (params: GridRenderCellParams<MovementRow>) => (
          <Stack
            direction="row"
            spacing={0.5}
            sx={{
              alignItems: "center",
              height: "100%",
              justifyContent: "center",
              width: "100%",
            }}
          >
            <Tooltip title={es.movements.editTooltip}>
              <IconButton
                color="primary"
                size="small"
                onClick={() => setEditingMovement(params.row)}
              >
                <EditRounded fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={es.movements.deleteTooltip}>
              <IconButton
                color="error"
                size="small"
                onClick={() => {
                  if (!window.confirm(es.movements.deleteConfirm)) return;
                  void deleteMovement(params.row.id)
                    .then(() => onMovementDelete(params.row.id))
                    .catch((error: unknown) => console.error(error));
                }}
              >
                <DeleteOutlineRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        ),
      },
    ],
    [onMovementChange, onMovementDelete],
  );

  return (
    <Stack spacing={2}>
      <MovementsFilters
        categories={categories}
        categoryFilter={categoryFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        query={query}
        reviewFilter={reviewFilter}
        setCategoryFilter={setCategoryFilter}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        setQuery={setQuery}
        setReviewFilter={setReviewFilter}
        setSourceFilter={setSourceFilter}
        setSubcategoryFilter={setSubcategoryFilter}
        sourceFilter={sourceFilter}
        subcategoryFilter={subcategoryFilter}
      />

      <Paper
        sx={{
          height: "calc(100vh - 240px)",
          minHeight: 480,
          p: 0,
          width: "100%",
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        <DataGrid
          columns={columns}
          disableColumnMenu
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          rows={filteredMovements}
          rowHeight={64}
          sx={{
            border: 0,
            width: "100%",
            "& .MuiDataGrid-columnHeaders": {
              borderBottom: "1px solid",
              borderColor: "divider",
            },
            "& .MuiDataGrid-cell": {
              borderBottom: "1px solid",
              borderColor: "divider",
              display: "flex",
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

      <Dialog
        fullWidth
        maxWidth="sm"
        open={editingMovement !== null}
        onClose={() => setEditingMovement(null)}
      >
        <DialogTitle>{es.movements.editTitle}</DialogTitle>
        <DialogContent>
          {editingMovement ? (
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              <Box>
                <Typography sx={{ fontSize: 18, fontWeight: 800 }}>
                  {editingMovement.raw_description ?? editingMovement.business}
                </Typography>
                <Typography color="text.secondary" sx={{ fontSize: 13, mt: 0.25 }}>
                  {es.movements.editSubtitle}
                </Typography>
              </Box>
              <ClassificationEditor
                categories={categories}
                currencyFormat={currencyFormat}
                movement={editingMovement}
                showAmount
                onChange={(updated) => {
                  onMovementChange(updated);
                  setEditingMovement(toMovementRow(updated, currencyFormat));
                }}
              />
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingMovement(null)}>
            {es.movements.closeButton}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
