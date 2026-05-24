import { useState } from "react";
import AddRounded from "@mui/icons-material/AddRounded";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { createCategory, createSubcategory } from "@/api/categories";
import {
  updateMovementAccountingDate,
  updateMovementAmount,
  updateMovementCategoryOnly,
  updateMovementSubcategory,
} from "@/api/movements";
import { ApiError } from "@/api/utils";
import type { CurrencyFormatRead, MovementRead } from "@/api/types";
import type { CategoryOption, MovementRow } from "@/lib/derive";
import { isoDateOnly } from "@/api/utils";
import { useI18n } from "@/i18n";
import {
  DEFAULT_CURRENCY_FORMAT,
  formatMoneyDraft,
  formatMoneyValueForInput,
  parseMoneyInput,
} from "@/lib/format";

export type { CategoryOption, MovementRow } from "@/lib/derive";

const NO_SUBCATEGORY = "__none__";

const dateInputSx = {
  '& input[type="date"]::-webkit-calendar-picker-indicator': {
    filter: "invert(1)",
    opacity: 0.9,
  },
};

const amountInputSx = {
  "& input": {
    fontVariantNumeric: "tabular-nums",
  },
};

type Props = {
  movement: MovementRow;
  categories: CategoryOption[];
  dense?: boolean;
  reviewLayout?: boolean;
  showAmount?: boolean;
  currencyFormat?: CurrencyFormatRead;
  onChange: (movement: MovementRead) => void;
  onCategoriesChanged?: () => Promise<void> | void;
};

function describeError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function ClassificationEditor({
  movement,
  categories,
  dense = false,
  reviewLayout = false,
  showAmount = false,
  currencyFormat = DEFAULT_CURRENCY_FORMAT,
  onChange,
  onCategoriesChanged,
}: Props) {
  const es = useI18n();
  const [draftValues, setDraftValues] = useState({
    accountingDate: isoDateOnly(movement.accounting_date),
    amount: formatMoneyValueForInput(movement.amount, currencyFormat),
    categoryId: movement.category_id,
    movementId: movement.id,
    subcategoryId: movement.subcategory_id,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creationModal, setCreationModal] = useState<"category" | "subcategory" | null>(
    null,
  );
  const [creationName, setCreationName] = useState("");
  const [creating, setCreating] = useState(false);

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
  const selectedAmount = isCurrentMovement
    ? draftValues.amount
    : formatMoneyValueForInput(movement.amount, currencyFormat);

  const activeCategory =
    categories.find((category) => category.id === selectedCategoryId) ??
    categories[0];

  const handleApiResult = (updated: MovementRead) => {
    setErrorMessage(null);
    onChange(updated);
  };

  const handleApiError = (error: unknown) => {
    setErrorMessage(describeError(error, es.editor.saveError));
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
      amount: selectedAmount,
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
        amount: selectedAmount,
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
      amount: selectedAmount,
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
      amount: selectedAmount,
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

  const handleAmountChange = (nextAmount: string) => {
    setDraftValues({
      accountingDate: selectedAccountingDate,
      amount: formatMoneyDraft(nextAmount, currencyFormat),
      categoryId: selectedCategoryId,
      movementId: movement.id,
      subcategoryId: selectedSubcategoryId,
    });
    setErrorMessage(null);
  };

  const handleAmountCommit = () => {
    const parsed = parseMoneyInput(selectedAmount, currencyFormat);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setErrorMessage(es.editor.invalidAmount);
      return;
    }
    if (parsed === movement.amount) {
      setDraftValues({
        accountingDate: selectedAccountingDate,
        amount: formatMoneyValueForInput(movement.amount, currencyFormat),
        categoryId: selectedCategoryId,
        movementId: movement.id,
        subcategoryId: selectedSubcategoryId,
      });
      return;
    }
    void updateMovementAmount({
      movementId: movement.id,
      amount: parsed,
    })
      .then(handleApiResult)
      .catch(handleApiError);
  };

  const openCreationModal = (kind: "category" | "subcategory") => {
    setCreationModal(kind);
    setCreationName("");
    setErrorMessage(null);
  };

  const closeCreationModal = () => {
    if (creating) return;
    setCreationModal(null);
    setCreationName("");
  };

  const handleCreateClassification = async () => {
    const name = creationName.trim();
    if (!name || !creationModal) return;
    setCreating(true);
    setErrorMessage(null);
    try {
      if (creationModal === "category") {
        const created = await createCategory({
          name,
          kind: movement.category_kind,
        });
        const updated = await updateMovementCategoryOnly({
          movementId: movement.id,
          categoryId: created.id,
        });
        setDraftValues({
          accountingDate: selectedAccountingDate,
          amount: selectedAmount,
          categoryId: created.id,
          movementId: movement.id,
          subcategoryId: null,
        });
        handleApiResult(updated);
      } else {
        const categoryId = activeCategory?.id ?? selectedCategoryId;
        const created = await createSubcategory({
          name,
          categoryId,
        });
        const updated = await updateMovementSubcategory({
          movementId: movement.id,
          subcategoryId: created.id,
        });
        setDraftValues({
          accountingDate: selectedAccountingDate,
          amount: selectedAmount,
          categoryId,
          movementId: movement.id,
          subcategoryId: created.id,
        });
        handleApiResult(updated);
      }
      await onCategoriesChanged?.();
      setCreationModal(null);
      setCreationName("");
    } catch (error) {
      handleApiError(error);
    } finally {
      setCreating(false);
    }
  };

  const subOptions = activeCategory?.subcategories ?? [];
  const showSubSelect = reviewLayout || subOptions.length > 0;
  // The Select wants a string value; ``null`` becomes the sentinel "no sub".
  const subSelectValue = selectedSubcategoryId ?? NO_SUBCATEGORY;

  const creationDialog = (
    <Dialog
      fullWidth
      maxWidth="xs"
      open={creationModal !== null}
      onClose={closeCreationModal}
    >
      <DialogTitle>
        {creationModal === "category"
          ? es.editor.newCategoryTitle
          : es.editor.newSubcategoryTitle}
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label={
            creationModal === "category"
              ? es.editor.newCategoryLabel
              : es.editor.newSubcategoryLabel
          }
          sx={{ mt: 1 }}
          value={creationName}
          onChange={(event) => setCreationName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleCreateClassification();
          }}
        />
        {creationModal === "subcategory" && activeCategory ? (
          <Typography color="text.secondary" sx={{ fontSize: 12, mt: 1 }}>
            {es.editor.newSubcategoryHint(activeCategory.name)}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button disabled={creating} onClick={closeCreationModal}>
          {es.editor.cancelButton}
        </Button>
        <Button
          disabled={creating || creationName.trim().length === 0}
          variant="contained"
          onClick={() => void handleCreateClassification()}
        >
          {es.editor.createButton}
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (reviewLayout) {
    return (
      <Stack spacing={1.5}>
        <TextField
          fullWidth
          label={es.editor.dateLabel}
          size="small"
          sx={dateInputSx}
          type="date"
          value={selectedAccountingDate}
          onChange={(event) => handleAccountingDateChange(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        {showAmount ? (
          <TextField
            fullWidth
            label={es.editor.amountLabel}
            size="small"
            type="text"
            inputMode="numeric"
            sx={amountInputSx}
            value={selectedAmount}
            onBlur={handleAmountCommit}
            onChange={(event) => handleAmountChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleAmountCommit();
            }}
          />
        ) : null}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <FormControl fullWidth size="small">
            <InputLabel>{es.editor.categoryLabel}</InputLabel>
            <Select
              label={es.editor.categoryLabel}
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
          <Tooltip title={es.editor.addCategoryTooltip}>
            <IconButton
              aria-label={es.editor.addCategoryTooltip}
              color="primary"
              onClick={() => openCreationModal("category")}
            >
              <AddRounded />
            </IconButton>
          </Tooltip>
        </Stack>

        {showSubSelect ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <FormControl fullWidth size="small">
              <InputLabel>{es.editor.subcategoryLabel}</InputLabel>
              <Select
                label={es.editor.subcategoryLabel}
                value={subSelectValue}
                onChange={(event) => handleSubcategoryChange(event.target.value)}
              >
                <MenuItem value={NO_SUBCATEGORY}>
                  <em>{es.editor.noSubcategory}</em>
                </MenuItem>
                {subOptions.map((subcategory) => (
                  <MenuItem key={subcategory.id} value={subcategory.id}>
                    {subcategory.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title={es.editor.addSubcategoryTooltip}>
              <IconButton
                aria-label={es.editor.addSubcategoryTooltip}
                color="primary"
                onClick={() => openCreationModal("subcategory")}
              >
                <AddRounded />
              </IconButton>
            </Tooltip>
          </Stack>
        ) : null}
        {errorMessage ? (
          <Typography color="error" sx={{ fontSize: 12 }}>
            {errorMessage}
          </Typography>
        ) : null}
        {creationDialog}
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
        label={es.editor.dateLabel}
        size="small"
        sx={dateInputSx}
        type="date"
        value={selectedAccountingDate}
        onChange={(event) => handleAccountingDateChange(event.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />

      {showAmount ? (
        <TextField
          fullWidth
          label={es.editor.amountLabel}
          size="small"
          type="text"
          inputMode="numeric"
          sx={amountInputSx}
          value={selectedAmount}
          onBlur={handleAmountCommit}
          onChange={(event) => handleAmountChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleAmountCommit();
          }}
        />
      ) : null}

      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
        <FormControl fullWidth size="small">
          <InputLabel>{es.editor.categoryLabel}</InputLabel>
          <Select
            label={es.editor.categoryLabel}
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
            <InputLabel>{es.editor.subcategoryLabel}</InputLabel>
            <Select
              label={es.editor.subcategoryLabel}
              value={subSelectValue}
              onChange={(event) => handleSubcategoryChange(event.target.value)}
            >
              <MenuItem value={NO_SUBCATEGORY}>
                <em>{es.editor.noSubcategory}</em>
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
      {creationDialog}
    </Stack>
  );
}
