import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { createMovement } from "@/api/movements";
import type { CurrencyFormatRead } from "@/api/types";
import { ApiError } from "@/api/utils";
import { useI18n } from "@/i18n";
import type { CategoryOption } from "@/lib/derive";
import { formatMoneyDraft, parseMoneyInput } from "@/lib/format";

const NO_SUBCATEGORY = "__none__";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ManualMovementDialog({
  categories,
  currencyFormat,
  open,
  onClose,
  onCreated,
}: {
  categories: CategoryOption[];
  currencyFormat: CurrencyFormatRead;
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const es = useI18n();
  const [date, setDate] = useState(todayIsoDate);
  const [amount, setAmount] = useState("");
  const [business, setBusiness] = useState("");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState<"BANK" | "CREDIT_CARD" | "MANUAL">("MANUAL");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState(NO_SUBCATEGORY);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const firstCategoryId = categories[0]?.id ?? "";
    setDate(todayIsoDate());
    setAmount("");
    setBusiness("");
    setReason("");
    setSource("MANUAL");
    setCategoryId(firstCategoryId);
    setSubcategoryId(NO_SUBCATEGORY);
    setErrorMessage(null);
  }, [categories, open]);

  const activeCategory = categories.find((category) => category.id === categoryId);
  const subcategories = activeCategory?.subcategories ?? [];
  const hasCategories = categories.length > 0;

  const handleCategoryChange = (nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
    setSubcategoryId(NO_SUBCATEGORY);
    setErrorMessage(null);
  };

  const handleSubmit = async () => {
    const parsedAmount = parseMoneyInput(amount, currencyFormat);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage(es.manualMovement.invalidAmount);
      return;
    }
    if (!date || !business.trim() || !reason.trim() || !categoryId) {
      setErrorMessage(es.manualMovement.requiredFields);
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      await createMovement({
        date,
        accounting_date: date,
        amount: parsedAmount,
        business: business.trim(),
        reason: reason.trim(),
        source,
        raw_description: business.trim(),
        reviewed: true,
        category_id: categoryId,
        subcategory_id:
          subcategoryId === NO_SUBCATEGORY ? null : subcategoryId,
      });
      await onCreated();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(es.manualMovement.saveError);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog fullWidth maxWidth="sm" open={open} onClose={saving ? undefined : onClose}>
      <DialogTitle>{es.manualMovement.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!hasCategories ? (
            <Alert severity="info">{es.manualMovement.noCategories}</Alert>
          ) : null}
          <TextField
            fullWidth
            label={es.manualMovement.dateLabel}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            fullWidth
            inputMode="numeric"
            label={es.manualMovement.amountLabel}
            value={amount}
            onChange={(event) =>
              setAmount(formatMoneyDraft(event.target.value, currencyFormat))
            }
          />
          <TextField
            fullWidth
            label={es.manualMovement.businessLabel}
            value={business}
            onChange={(event) => setBusiness(event.target.value)}
          />
          <TextField
            fullWidth
            label={es.manualMovement.reasonLabel}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <FormControl fullWidth>
            <InputLabel>{es.manualMovement.sourceLabel}</InputLabel>
            <Select
              label={es.manualMovement.sourceLabel}
              value={source}
              onChange={(event) =>
                setSource(event.target.value as "BANK" | "CREDIT_CARD" | "MANUAL")
              }
            >
              <MenuItem value="MANUAL">{es.settings.sourceLabels.MANUAL}</MenuItem>
              <MenuItem value="BANK">{es.settings.sourceLabels.BANK}</MenuItem>
              <MenuItem value="CREDIT_CARD">
                {es.settings.sourceLabels.CREDIT_CARD}
              </MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth disabled={!hasCategories}>
            <InputLabel>{es.manualMovement.categoryLabel}</InputLabel>
            <Select
              label={es.manualMovement.categoryLabel}
              value={categoryId}
              onChange={(event) => handleCategoryChange(event.target.value)}
            >
              {categories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth disabled={!hasCategories || subcategories.length === 0}>
            <InputLabel>{es.manualMovement.subcategoryLabel}</InputLabel>
            <Select
              label={es.manualMovement.subcategoryLabel}
              value={subcategoryId}
              onChange={(event) => setSubcategoryId(event.target.value)}
            >
              <MenuItem value={NO_SUBCATEGORY}>
                <em>{es.manualMovement.noSubcategory}</em>
              </MenuItem>
              {subcategories.map((subcategory) => (
                <MenuItem key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {errorMessage ? (
            <Typography color="error" sx={{ fontSize: 13 }}>
              {errorMessage}
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={onClose}>
          {es.manualMovement.cancelButton}
        </Button>
        <Button
          disabled={saving || !hasCategories}
          variant="contained"
          onClick={() => void handleSubmit()}
        >
          {es.manualMovement.createButton}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
