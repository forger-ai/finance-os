import { useMemo, useState } from "react";
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
  deleteCategory,
  deleteSubcategory,
  moveCategorySubcategories,
  moveSubcategoryMovements,
  renameCategory,
  renameSubcategory,
  updateCategoryBudget,
} from "@/api/categories";
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
      <Box>
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {es.views.settingsAdministration}
        </Typography>
        <Typography
          sx={{
            mt: 0.5,
            fontSize: { xs: 30, md: 40 },
            fontWeight: 800,
            letterSpacing: "-0.05em",
          }}
        >
          {es.views.settingsTitle}
        </Typography>
      </Box>

      {message ? (
        <Alert onClose={() => setMessage(null)} severity="info">
          {message}
        </Alert>
      ) : null}

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
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>{es.settings.moveSubcategoriesLabel}</InputLabel>
              <Select
                label={es.settings.moveSubcategoriesLabel}
                value={targetCategoryId}
                onChange={(event) => setTargetCategoryId(event.target.value)}
              >
                {allCategories
                  .filter((item) => item.id !== category.id)
                  .map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            <Button
              startIcon={<SwapHorizRounded />}
              variant="outlined"
              onClick={() => void runMoveSubcategories()}
            >
              {es.settings.moveButton}
            </Button>
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
        </Stack>
      </Stack>
    </Paper>
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
          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel>{es.settings.sendAllLabel}</InputLabel>
            <Select
              label={es.settings.sendAllLabel}
              value={targetSubcategoryId}
              onChange={(event) => setTargetSubcategoryId(event.target.value)}
            >
              {allSubcategories
                .filter((item) => item.id !== subcategory.id)
                .map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.categoryName} / {item.name}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          <Button
            startIcon={<SwapHorizRounded />}
            variant="contained"
            onClick={() => void runMoveMovements()}
          >
            {es.settings.sendAllButton}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
