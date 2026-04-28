import { useState } from "react";
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  updateMovementAccountingDate,
  updateMovementCategoryOnly,
  updateMovementSubcategory,
} from "@/api/movements";
import { ApiError } from "@/api/utils";
import type { MovementRead } from "@/api/types";
import type { CategoryOption, MovementRow } from "@/lib/derive";
import { isoDateOnly } from "@/api/utils";

export type { CategoryOption, MovementRow } from "@/lib/derive";

const NO_SUBCATEGORY = "__none__";

type Props = {
  movement: MovementRow;
  categories: CategoryOption[];
  dense?: boolean;
  reviewLayout?: boolean;
  onChange: (movement: MovementRead) => void;
};

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "No se pudo guardar el cambio.";
}

export function ClassificationEditor({
  movement,
  categories,
  dense = false,
  reviewLayout = false,
  onChange,
}: Props) {
  const [draftValues, setDraftValues] = useState({
    accountingDate: isoDateOnly(movement.accounting_date),
    categoryId: movement.category_id,
    movementId: movement.id,
    subcategoryId: movement.subcategory_id,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isCurrentMovement = draftValues.movementId === movement.id;
  const selectedCategoryId = isCurrentMovement
    ? draftValues.categoryId
    : movement.category_id;
  const selectedSubcategoryId = isCurrentMovement
    ? draftValues.subcategoryId
    : movement.subcategory_id;
  const selectedAccountingDate = isCurrentMovement
    ? draftValues.accountingDate
    : isoDateOnly(movement.accounting_date);

  const activeCategory =
    categories.find((category) => category.id === selectedCategoryId) ??
    categories[0];

  const handleApiResult = (updated: MovementRead) => {
    setErrorMessage(null);
    onChange(updated);
  };

  const handleApiError = (error: unknown) => {
    setErrorMessage(describeError(error));
  };

  const handleCategoryChange = (nextCategoryId: string) => {
    const nextCategory =
      categories.find((category) => category.id === nextCategoryId) ??
      categories[0];
    if (!nextCategory) return;

    // If the new category has subcategories, default to the first one. If it
    // doesn't, save as category-only.
    const firstSubId = nextCategory.subcategories[0]?.id ?? null;

    setDraftValues({
      accountingDate: selectedAccountingDate,
      categoryId: nextCategory.id,
      movementId: movement.id,
      subcategoryId: firstSubId,
    });
    setErrorMessage(null);

    if (firstSubId) {
      void updateMovementSubcategory({
        movementId: movement.id,
        subcategoryId: firstSubId,
      })
        .then(handleApiResult)
        .catch(handleApiError);
    } else {
      void updateMovementCategoryOnly({
        movementId: movement.id,
        categoryId: nextCategory.id,
      })
        .then(handleApiResult)
        .catch(handleApiError);
    }
  };

  const handleSubcategoryChange = (rawValue: string) => {
    if (rawValue === NO_SUBCATEGORY) {
      setDraftValues({
        accountingDate: selectedAccountingDate,
        categoryId: selectedCategoryId,
        movementId: movement.id,
        subcategoryId: null,
      });
      setErrorMessage(null);
      void updateMovementCategoryOnly({
        movementId: movement.id,
        categoryId: selectedCategoryId,
      })
        .then(handleApiResult)
        .catch(handleApiError);
      return;
    }

    setDraftValues({
      accountingDate: selectedAccountingDate,
      categoryId: selectedCategoryId,
      movementId: movement.id,
      subcategoryId: rawValue,
    });
    setErrorMessage(null);
    void updateMovementSubcategory({
      movementId: movement.id,
      subcategoryId: rawValue,
    })
      .then(handleApiResult)
      .catch(handleApiError);
  };

  const handleAccountingDateChange = (nextAccountingDate: string) => {
    setDraftValues({
      accountingDate: nextAccountingDate,
      categoryId: selectedCategoryId,
      movementId: movement.id,
      subcategoryId: selectedSubcategoryId,
    });
    setErrorMessage(null);
    void updateMovementAccountingDate({
      movementId: movement.id,
      accountingDate: nextAccountingDate,
    })
      .then(handleApiResult)
      .catch(handleApiError);
  };

  const subOptions = activeCategory?.subcategories ?? [];
  const showSubSelect = subOptions.length > 0;
  // The Select wants a string value; ``null`` becomes the sentinel "no sub".
  const subSelectValue = selectedSubcategoryId ?? NO_SUBCATEGORY;

  if (reviewLayout) {
    return (
      <Stack spacing={1.5}>
        <TextField
          fullWidth
          label="Accounting date"
          size="small"
          type="date"
          value={selectedAccountingDate}
          onChange={(event) => handleAccountingDateChange(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
          <FormControl fullWidth size="small">
            <InputLabel>Clasificacion</InputLabel>
            <Select
              label="Clasificacion"
              value={selectedCategoryId}
              onChange={(event) => handleCategoryChange(event.target.value)}
            >
              {categories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {showSubSelect ? (
            <FormControl fullWidth size="small">
              <InputLabel>Sub clasificacion</InputLabel>
              <Select
                label="Sub clasificacion"
                value={subSelectValue}
                onChange={(event) =>
                  handleSubcategoryChange(event.target.value)
                }
              >
                <MenuItem value={NO_SUBCATEGORY}>
                  <em>Sin subcategoría</em>
                </MenuItem>
                {subOptions.map((subcategory) => (
                  <MenuItem key={subcategory.id} value={subcategory.id}>
                    {subcategory.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}
        </Stack>
        {errorMessage ? (
          <Typography color="error" sx={{ fontSize: 12 }}>
            {errorMessage}
          </Typography>
        ) : null}
      </Stack>
    );
  }

  if (dense) {
    return (
      <Box sx={{ minWidth: 0, width: "100%" }}>
        <Stack direction="row" spacing={1} sx={{ minWidth: 0, width: "100%" }}>
          <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
            <Select
              value={selectedCategoryId}
              onChange={(event) => handleCategoryChange(event.target.value)}
            >
              {categories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {showSubSelect ? (
            <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
              <Select
                value={subSelectValue}
                onChange={(event) =>
                  handleSubcategoryChange(event.target.value)
                }
              >
                <MenuItem value={NO_SUBCATEGORY}>
                  <em>—</em>
                </MenuItem>
                {subOptions.map((subcategory) => (
                  <MenuItem key={subcategory.id} value={subcategory.id}>
                    {subcategory.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <Box sx={{ flex: 1, minWidth: 0 }} />
          )}
        </Stack>
        {errorMessage ? (
          <Typography color="error" sx={{ fontSize: 11, mt: 0.5 }}>
            {errorMessage}
          </Typography>
        ) : null}
      </Box>
    );
  }

  return (
    <Stack spacing={1}>
      <TextField
        fullWidth
        label="Accounting date"
        size="small"
        type="date"
        value={selectedAccountingDate}
        onChange={(event) => handleAccountingDateChange(event.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />

      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
        <FormControl fullWidth size="small">
          <InputLabel>Categoria</InputLabel>
          <Select
            label="Categoria"
            value={selectedCategoryId}
            onChange={(event) => handleCategoryChange(event.target.value)}
          >
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                {category.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {showSubSelect ? (
          <FormControl fullWidth size="small">
            <InputLabel>Subcategoria</InputLabel>
            <Select
              label="Subcategoria"
              value={subSelectValue}
              onChange={(event) => handleSubcategoryChange(event.target.value)}
            >
              <MenuItem value={NO_SUBCATEGORY}>
                <em>Sin subcategoría</em>
              </MenuItem>
              {subOptions.map((subcategory) => (
                <MenuItem key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}
      </Stack>
      {errorMessage ? (
        <Typography color="error" sx={{ fontSize: 12 }}>
          {errorMessage}
        </Typography>
      ) : null}
    </Stack>
  );
}
