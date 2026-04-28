import { useMemo, useState } from "react";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
import SettingsSuggestRounded from "@mui/icons-material/SettingsSuggestRounded";
import SwapHorizRounded from "@mui/icons-material/SwapHorizRounded";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  createCategory,
  createSubcategory,
  deleteCategory,
  deleteSubcategory,
  moveCategorySubcategories,
  moveSubcategoryMovements,
  renameCategory,
  renameSubcategory,
  updateCategoryBudget,
} from "@/api/categories";
import type { CategoryKind } from "@/api/types";
import type { SettingsCategory, SettingsSubcategory } from "@/lib/derive";
import { ApiError } from "@/api/utils";
import { es } from "@/i18n/es";

type Props = {
  categories: SettingsCategory[];
  onChanged: () => Promise<void> | void;
};

function getKindLabel(kind: SettingsCategory["kind"]) {
  return es.settings.kindLabels[kind] ?? kind;
}

function describeError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export function SettingsView({ categories, onChanged }: Props) {
  const [message, setMessage] = useState<string | null>(null);

  const allSubcategories = useMemo(
    () => categories.flatMap((category) => category.subcategories),
    [categories],
  );

  return (
    <Stack spacing={2.5}>
      {message ? (
        <Alert onClose={() => setMessage(null)} severity="info">
          {message}
        </Alert>
      ) : null}

      <CreateCategoryForm onChanged={onChanged} onMessage={setMessage} />

      <Stack spacing={2}>
        {categories.map((category) => (
          <CategoryCard
            allCategories={categories}
            allSubcategories={allSubcategories}
            category={category}
            key={category.id}
            onChanged={onChanged}
            onMessage={setMessage}
          />
        ))}
      </Stack>
    </Stack>
  );
}

function CategoryCard({
  allCategories,
  allSubcategories,
  category,
  onChanged,
  onMessage,
}: {
  allCategories: SettingsCategory[];
  allSubcategories: SettingsSubcategory[];
  category: SettingsCategory;
  onChanged: () => Promise<void> | void;
  onMessage: (value: string | null) => void;
}) {
  const [name, setName] = useState(category.name);
  const [budget, setBudget] = useState(
    category.budget == null ? "" : String(category.budget),
  );
  const [targetCategoryId, setTargetCategoryId] = useState("");

  const runRename = async () => {
    try {
      await renameCategory({ categoryId: category.id, name });
      onMessage(es.settings.categoryUpdated);
      await onChanged();
    } catch (error) {
      onMessage(describeError(error, "No se pudo renombrar la categoría."));
    }
  };

  const runUpdateBudget = async () => {
    try {
      await updateCategoryBudget({ categoryId: category.id, budget });
      onMessage(es.settings.budgetUpdated);
      await onChanged();
    } catch (error) {
      onMessage(describeError(error, "No se pudo actualizar el budget."));
    }
  };

  const moveCategoryTargets = useMemo(
    () => allCategories.filter((item) => item.id !== category.id),
    [allCategories, category.id],
  );
  const noOtherCategories = moveCategoryTargets.length === 0;
  const noSubcategoriesHere = category.subcategories.length === 0;
  const moveSubsDisabled =
    noOtherCategories || noSubcategoriesHere || !targetCategoryId;
  const moveSubsHelper = noOtherCategories
    ? es.settings.noOtherCategoriesHint
    : noSubcategoriesHere
      ? es.settings.noSubcategoriesToMoveHint
      : null;

  const runMoveSubcategories = async () => {
    if (!targetCategoryId) {
      onMessage("Debes elegir una categoría de destino.");
      return;
    }
    try {
      await moveCategorySubcategories({
        categoryId: category.id,
        targetCategoryId,
      });
      onMessage(es.settings.subcategoriesMoved);
      setTargetCategoryId("");
      await onChanged();
    } catch (error) {
      onMessage(describeError(error, "No se pudieron mover las subcategorías."));
    }
  };

  const runDelete = async () => {
    try {
      await deleteCategory(category.id);
      onMessage(es.settings.categoryDeleted);
      await onChanged();
    } catch (error) {
      onMessage(describeError(error, "No se pudo eliminar la categoría."));
    }
  };

  return (
    <Paper sx={{ p: 2.25 }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={1.5}
          sx={{
            alignItems: { lg: "center" },
            justifyContent: "space-between",
          }}
        >
          <Box>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", flexWrap: "wrap" }}
            >
              <Typography sx={{ fontSize: 20, fontWeight: 800 }}>
                {category.name}
              </Typography>
              <Chip
                label={getKindLabel(category.kind)}
                size="small"
                variant="outlined"
              />
              <Chip
                label={es.settings.movementCount(category.movementCount)}
                size="small"
                variant="outlined"
              />
            </Stack>
            <Typography color="text.secondary" sx={{ fontSize: 13, mt: 0.75 }}>
              {es.settings.subcategoryCount(category.subcategories.length)}
            </Typography>
          </Box>

          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1}
            sx={{ minWidth: { lg: 580 } }}
          >
            <TextField
              label={es.settings.renameCategoryLabel}
              size="small"
              value={name}
              onChange={(event) => setName(event.target.value)}
              sx={{ minWidth: 220 }}
            />
            <Tooltip title={es.settings.saveNameTooltip}>
              <IconButton onClick={() => void runRename()}>
                <SaveRounded />
              </IconButton>
            </Tooltip>
            <TextField
              label={es.settings.budgetLabel}
              size="small"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              sx={{ minWidth: 140 }}
            />
            <Tooltip title={es.settings.saveBudgetTooltip}>
              <IconButton onClick={() => void runUpdateBudget()}>
                <SaveRounded />
              </IconButton>
            </Tooltip>
            <FormControl
              size="small"
              sx={{ minWidth: 220 }}
              disabled={noOtherCategories || noSubcategoriesHere}
            >
              <InputLabel>{es.settings.moveSubcategoriesLabel}</InputLabel>
              <Select
                label={es.settings.moveSubcategoriesLabel}
                value={targetCategoryId}
                onChange={(event) => setTargetCategoryId(event.target.value)}
              >
                {moveCategoryTargets.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip
              title={moveSubsHelper ?? ""}
              disableHoverListener={!moveSubsHelper}
            >
              <span>
                <Button
                  startIcon={<SwapHorizRounded />}
                  variant="outlined"
                  onClick={() => void runMoveSubcategories()}
                  disabled={moveSubsDisabled}
                >
                  {es.settings.moveButton}
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={es.settings.deleteCategoryTooltip}>
              <span>
                <IconButton
                  color="error"
                  disabled={category.movementCount > 0}
                  onClick={() => void runDelete()}
                >
                  <DeleteOutlineRounded />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Stack>

        <Stack spacing={1.25}>
          {category.subcategories.map((subcategory) => (
            <SubcategoryRow
              allSubcategories={allSubcategories}
              key={subcategory.id}
              onChanged={onChanged}
              onMessage={onMessage}
              subcategory={subcategory}
            />
          ))}
          <CreateSubcategoryRow
            categoryId={category.id}
            onChanged={onChanged}
            onMessage={onMessage}
          />
        </Stack>
      </Stack>
    </Paper>
  );
}

function CreateCategoryForm({
  onChanged,
  onMessage,
}: {
  onChanged: () => Promise<void> | void;
  onMessage: (value: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("EXPENSE");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      onMessage("El nombre no puede estar vacío.");
      return;
    }
    let budgetValue: number | null = null;
    if (budget.trim()) {
      const parsed = Number(budget.trim().replace(",", "."));
      if (Number.isNaN(parsed)) {
        onMessage("El budget debe ser un número válido.");
        return;
      }
      budgetValue = parsed;
    }

    setBusy(true);
    try {
      await createCategory({ name: trimmed, kind, budget: budgetValue });
      onMessage(es.settings.categoryCreated);
      setName("");
      setBudget("");
      setKind("EXPENSE");
      await onChanged();
    } catch (error) {
      onMessage(describeError(error, "No se pudo crear la categoría."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Stack spacing={1.5}>
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
          {es.settings.newCategoryTitle}
        </Typography>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.25}
          sx={{ alignItems: { md: "center" } }}
        >
          <TextField
            label={es.settings.newCategoryNameLabel}
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            sx={{ minWidth: 220, flex: 1 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{es.settings.newCategoryKindLabel}</InputLabel>
            <Select
              label={es.settings.newCategoryKindLabel}
              value={kind}
              onChange={(event) => setKind(event.target.value as CategoryKind)}
            >
              <MenuItem value="EXPENSE">{es.settings.kindLabels.EXPENSE}</MenuItem>
              <MenuItem value="INCOME">{es.settings.kindLabels.INCOME}</MenuItem>
              <MenuItem value="UNCHARGEABLE">
                {es.settings.kindLabels.UNCHARGEABLE}
              </MenuItem>
            </Select>
          </FormControl>
          <TextField
            label={es.settings.budgetLabel}
            size="small"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            sx={{ minWidth: 140 }}
          />
          <Button
            startIcon={<AddRounded />}
            variant="contained"
            onClick={() => void submit()}
            disabled={busy}
          >
            {es.settings.createButton}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function CreateSubcategoryRow({
  categoryId,
  onChanged,
  onMessage,
}: {
  categoryId: string;
  onChanged: () => Promise<void> | void;
  onMessage: (value: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      onMessage("El nombre no puede estar vacío.");
      return;
    }
    setBusy(true);
    try {
      await createSubcategory({ name: trimmed, categoryId });
      onMessage(es.settings.subcategoryCreated);
      setName("");
      await onChanged();
    } catch (error) {
      onMessage(describeError(error, "No se pudo crear la subcategoría."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1}
      sx={{
        alignItems: { sm: "center" },
        pt: 0.5,
      }}
    >
      <TextField
        label={es.settings.newSubcategoryLabel}
        size="small"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
        sx={{ minWidth: 260, flex: 1 }}
      />
      <Button
        startIcon={<AddRounded />}
        variant="outlined"
        size="small"
        onClick={() => void submit()}
        disabled={busy}
      >
        {es.settings.addSubcategoryButton}
      </Button>
    </Stack>
  );
}

function SubcategoryRow({
  allSubcategories,
  onChanged,
  onMessage,
  subcategory,
}: {
  allSubcategories: SettingsSubcategory[];
  onChanged: () => Promise<void> | void;
  onMessage: (value: string | null) => void;
  subcategory: SettingsSubcategory;
}) {
  const [name, setName] = useState(subcategory.name);
  const [targetSubcategoryId, setTargetSubcategoryId] = useState("");

  const runRename = async () => {
    try {
      await renameSubcategory({ subcategoryId: subcategory.id, name });
      onMessage(es.settings.subcategoryUpdated);
      await onChanged();
    } catch (error) {
      onMessage(describeError(error, "No se pudo renombrar la subcategoría."));
    }
  };

  const runDelete = async () => {
    try {
      await deleteSubcategory(subcategory.id);
      onMessage(es.settings.subcategoryDeleted);
      await onChanged();
    } catch (error) {
      onMessage(describeError(error, "No se pudo eliminar la subcategoría."));
    }
  };

  const moveTargets = useMemo(
    () => allSubcategories.filter((item) => item.id !== subcategory.id),
    [allSubcategories, subcategory.id],
  );
  const noMoveTargets = moveTargets.length === 0;
  const noMovements = subcategory.movementCount === 0;
  const moveDisabled = noMoveTargets || noMovements || !targetSubcategoryId;
  const moveHelper = noMoveTargets
    ? es.settings.noOtherSubcategoriesHint
    : noMovements
      ? es.settings.noMovementsToMoveHint
      : null;

  const runMoveMovements = async () => {
    if (!targetSubcategoryId) {
      onMessage("Debes elegir una subcategoría de destino.");
      return;
    }
    try {
      await moveSubcategoryMovements({
        subcategoryId: subcategory.id,
        targetSubcategoryId,
      });
      onMessage(es.settings.movementsReassigned);
      setTargetSubcategoryId("");
      await onChanged();
    } catch (error) {
      onMessage(describeError(error, "No se pudieron mover los movimientos."));
    }
  };

  return (
    <Paper
      sx={{
        p: 1.5,
        bgcolor: "rgba(255,255,255,0.02)",
        border: "1px solid",
        borderColor: "divider",
      }}
      variant="outlined"
    >
      <Stack spacing={1.25}>
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={1}
          sx={{
            alignItems: { lg: "center" },
            justifyContent: "space-between",
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <SettingsSuggestRounded sx={{ fontSize: 18 }} />
            <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
              {subcategory.name}
            </Typography>
            <Chip
              label={es.settings.movementCount(subcategory.movementCount)}
              size="small"
              variant="outlined"
            />
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              label={es.settings.renameSubcategoryLabel}
              size="small"
              value={name}
              onChange={(event) => setName(event.target.value)}
              sx={{ minWidth: 220 }}
            />
            <Tooltip title={es.settings.saveNameTooltip}>
              <IconButton onClick={() => void runRename()}>
                <SaveRounded />
              </IconButton>
            </Tooltip>
            <Tooltip title={es.settings.deleteSubcategoryTooltip}>
              <span>
                <IconButton
                  color="error"
                  disabled={subcategory.movementCount > 0}
                  onClick={() => void runDelete()}
                >
                  <DeleteOutlineRounded />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Stack>

        <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
          <FormControl
            size="small"
            sx={{ minWidth: 260 }}
            disabled={noMoveTargets || noMovements}
          >
            <InputLabel>{es.settings.sendAllLabel}</InputLabel>
            <Select
              label={es.settings.sendAllLabel}
              value={targetSubcategoryId}
              onChange={(event) => setTargetSubcategoryId(event.target.value)}
            >
              {moveTargets.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.categoryName} / {item.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title={moveHelper ?? ""} disableHoverListener={!moveHelper}>
            <span>
              <Button
                startIcon={<SwapHorizRounded />}
                variant="contained"
                onClick={() => void runMoveMovements()}
                disabled={moveDisabled}
              >
                {es.settings.sendAllButton}
              </Button>
            </span>
          </Tooltip>
        </Stack>
        {moveHelper ? (
          <Typography color="text.secondary" sx={{ fontSize: 12, pl: 0.5 }}>
            {moveHelper}
          </Typography>
        ) : null}
      </Stack>
    </Paper>
  );
}
