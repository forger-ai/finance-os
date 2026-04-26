import { useState } from "react";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import {
  updateMovementAccountingDate,
  updateMovementSubcategory,
} from "@/api/movements";
import type { MovementRead } from "@/api/types";
import type { CategoryOption, MovementRow } from "@/lib/derive";
import { isoDateOnly } from "@/api/utils";

export type { CategoryOption, MovementRow } from "@/lib/derive";

type Props = {
  movement: MovementRow;
  categories: CategoryOption[];
  dense?: boolean;
  reviewLayout?: boolean;
  onChange: (movement: MovementRead) => void;
};

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

  const handleCategoryChange = (nextCategoryId: string) => {
    const nextCategory =
      categories.find((category) => category.id === nextCategoryId) ??
      categories[0];
    const nextSubcategoryId = nextCategory.subcategories[0]?.id;
    setDraftValues({
      accountingDate: selectedAccountingDate,
      categoryId: nextCategoryId,
      movementId: movement.id,
      subcategoryId: nextSubcategoryId ?? selectedSubcategoryId,
    });
    if (!nextSubcategoryId) {
      return;
    }
    void updateMovementSubcategory({
      movementId: movement.id,
      subcategoryId: nextSubcategoryId,
    })
      .then(onChange)
      .catch((error: unknown) => console.error(error));
  };

  const handleSubcategoryChange = (nextSubcategoryId: string) => {
    setDraftValues({
      accountingDate: selectedAccountingDate,
      categoryId: selectedCategoryId,
      movementId: movement.id,
      subcategoryId: nextSubcategoryId,
    });
    void updateMovementSubcategory({
      movementId: movement.id,
      subcategoryId: nextSubcategoryId,
    })
      .then(onChange)
      .catch((error: unknown) => console.error(error));
  };

  const handleAccountingDateChange = (nextAccountingDate: string) => {
    setDraftValues({
      accountingDate: nextAccountingDate,
      categoryId: selectedCategoryId,
      movementId: movement.id,
      subcategoryId: selectedSubcategoryId,
    });
    void updateMovementAccountingDate({
      movementId: movement.id,
      accountingDate: nextAccountingDate,
    })
      .then(onChange)
      .catch((error: unknown) => console.error(error));
  };

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

          <FormControl fullWidth size="small">
            <InputLabel>Sub clasificacion</InputLabel>
            <Select
              label="Sub clasificacion"
              value={selectedSubcategoryId}
              onChange={(event) => handleSubcategoryChange(event.target.value)}
            >
              {activeCategory?.subcategories.map((subcategory) => (
                <MenuItem key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Stack>
    );
  }

  if (dense) {
    return (
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

        <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
          <Select
            value={selectedSubcategoryId}
            onChange={(event) => handleSubcategoryChange(event.target.value)}
          >
            {activeCategory?.subcategories.map((subcategory) => (
              <MenuItem key={subcategory.id} value={subcategory.id}>
                {subcategory.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
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

        <FormControl fullWidth size="small">
          <InputLabel>Subcategoria</InputLabel>
          <Select
            label="Subcategoria"
            value={selectedSubcategoryId}
            onChange={(event) => handleSubcategoryChange(event.target.value)}
          >
            {activeCategory?.subcategories.map((subcategory) => (
              <MenuItem key={subcategory.id} value={subcategory.id}>
                {subcategory.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
    </Stack>
  );
}
