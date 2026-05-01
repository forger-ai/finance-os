import { useEffect, useMemo, useState } from "react";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import SwapHorizRounded from "@mui/icons-material/SwapHorizRounded";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  migrateCategoryMovements,
  moveSubcategoryMovements,
  renameCategory,
  renameSubcategory,
} from "@/api/categories";
import type { CategoryKind } from "@/api/types";
import type { SettingsCategory, SettingsSubcategory } from "@/lib/derive";
import { ApiError } from "@/api/utils";
import { useI18n } from "@/i18n";

type Props = {
  categories: SettingsCategory[];
  onChanged: () => Promise<void> | void;
};

type RenameTarget =
  | { type: "category"; id: string; name: string }
  | { type: "subcategory"; id: string; name: string }
  | null;

type MigrateTarget =
  | { type: "category"; id: string; label: string }
  | { type: "subcategory"; id: string; label: string }
  | null;

function describeError(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function SettingsView({ categories, onChanged }: Props) {
  const es = useI18n();
  const [message, setMessage] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget>(null);
  const [migrateTarget, setMigrateTarget] = useState<MigrateTarget>(null);

  const allSubcategories = useMemo(
    () => categories.flatMap((category) => category.subcategories),
    [categories],
  );

  return (
    <Stack spacing={2}>
      {message ? (
        <Alert severity="info" onClose={() => setMessage(null)}>
          {message}
        </Alert>
      ) : null}

      <CreateCategoryForm onChanged={onChanged} onMessage={setMessage} />

      <Stack spacing={1.5}>
        {categories.map((category) => (
          <Accordion key={category.id} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreRounded />}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1}
                sx={{ alignItems: { md: "center" }, width: "100%" }}
              >
                <Typography sx={{ fontSize: 17, fontWeight: 800, flex: 1 }}>
                  {category.name}
                </Typography>
                <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                  {es.settings.movementCount(category.movementCount)}
                </Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1}>
                  <Tooltip title={es.settings.saveNameTooltip}>
                    <IconButton
                      onClick={() =>
                        setRenameTarget({
                          type: "category",
                          id: category.id,
                          name: category.name,
                        })
                      }
                    >
                      <EditRounded />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={es.settings.moveButton}>
                    <IconButton
                      disabled={category.movementCount === 0}
                      onClick={() =>
                        setMigrateTarget({
                          type: "category",
                          id: category.id,
                          label: category.name,
                        })
                      }
                    >
                      <SwapHorizRounded />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={es.settings.deleteCategoryTooltip}>
                    <span>
                      <IconButton
                        color="error"
                        disabled={category.movementCount > 0}
                        onClick={() => {
                          void deleteCategory(category.id)
                            .then(onChanged)
                            .catch((error) =>
                              setMessage(
                                describeError(error, es.settings.deleteCategoryError),
                              ),
                            );
                        }}
                      >
                        <DeleteOutlineRounded />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>

                <Stack spacing={1}>
                  {category.subcategories.map((subcategory) => (
                    <SubcategoryRow
                      key={subcategory.id}
                      subcategory={subcategory}
                      onChanged={onChanged}
                      onMessage={setMessage}
                      onMigrate={setMigrateTarget}
                      onRename={setRenameTarget}
                    />
                  ))}
                  <CreateSubcategoryRow
                    categoryId={category.id}
                    onChanged={onChanged}
                    onMessage={setMessage}
                  />
                </Stack>
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>

      <RenameDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onChanged={onChanged}
        onMessage={setMessage}
      />
      <MigrateDialog
        categories={categories}
        source={migrateTarget}
        subcategories={allSubcategories}
        onClose={() => setMigrateTarget(null)}
        onChanged={onChanged}
        onMessage={setMessage}
      />
    </Stack>
  );
}

function CreateCategoryForm({
  onChanged,
  onMessage,
}: {
  onChanged: () => Promise<void> | void;
  onMessage: (value: string | null) => void;
}) {
  const es = useI18n();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("EXPENSE");

  const submit = async () => {
    if (!name.trim()) return;
    await createCategory({ name: name.trim(), kind });
    setName("");
    await onChanged();
    onMessage(es.settings.categoryCreated);
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
        <TextField
          label={es.settings.newCategoryNameLabel}
          size="small"
          value={name}
          onChange={(event) => setName(event.target.value)}
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
            <MenuItem value="UNCHARGEABLE">{es.settings.kindLabels.UNCHARGEABLE}</MenuItem>
          </Select>
        </FormControl>
        <Button startIcon={<AddRounded />} variant="contained" onClick={() => void submit()}>
          {es.settings.createButton}
        </Button>
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
  const es = useI18n();
  const [name, setName] = useState("");
  const submit = async () => {
    if (!name.trim()) return;
    await createSubcategory({ name: name.trim(), categoryId });
    setName("");
    await onChanged();
    onMessage(es.settings.subcategoryCreated);
  };
  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
      <TextField
        label={es.settings.newSubcategoryLabel}
        size="small"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Button startIcon={<AddRounded />} onClick={() => void submit()}>
        {es.settings.addSubcategoryButton}
      </Button>
    </Stack>
  );
}

function SubcategoryRow({
  subcategory,
  onChanged,
  onMessage,
  onMigrate,
  onRename,
}: {
  subcategory: SettingsSubcategory;
  onChanged: () => Promise<void> | void;
  onMessage: (value: string | null) => void;
  onMigrate: (value: MigrateTarget) => void;
  onRename: (value: RenameTarget) => void;
}) {
  const es = useI18n();
  return (
    <Paper sx={{ p: 1.25 }} variant="outlined">
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography sx={{ flex: 1, fontWeight: 700 }}>{subcategory.name}</Typography>
        <Typography color="text.secondary" sx={{ fontSize: 13 }}>
          {es.settings.movementCount(subcategory.movementCount)}
        </Typography>
        <IconButton
          onClick={() =>
            onRename({
              type: "subcategory",
              id: subcategory.id,
              name: subcategory.name,
            })
          }
        >
          <EditRounded />
        </IconButton>
        <IconButton
          disabled={subcategory.movementCount === 0}
          onClick={() =>
            onMigrate({
              type: "subcategory",
              id: subcategory.id,
              label: `${subcategory.categoryName} / ${subcategory.name}`,
            })
          }
        >
          <SwapHorizRounded />
        </IconButton>
        <IconButton
          color="error"
          disabled={subcategory.movementCount > 0}
          onClick={() => {
            void deleteSubcategory(subcategory.id)
              .then(onChanged)
              .catch((error) =>
                onMessage(describeError(error, es.settings.deleteSubcategoryError)),
              );
          }}
        >
          <DeleteOutlineRounded />
        </IconButton>
      </Stack>
    </Paper>
  );
}

function RenameDialog({
  target,
  onClose,
  onChanged,
  onMessage,
}: {
  target: RenameTarget;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onMessage: (value: string | null) => void;
}) {
  const es = useI18n();
  const [name, setName] = useState("");
  const open = target !== null;

  useEffect(() => {
    setName(target?.name ?? "");
  }, [target]);

  const submit = async () => {
    if (!target || !name.trim()) return;
    if (target.type === "category") {
      await renameCategory({ categoryId: target.id, name: name.trim() });
    } else {
      await renameSubcategory({ subcategoryId: target.id, name: name.trim() });
    }
    setName("");
    onClose();
    await onChanged();
    onMessage(es.settings.categoryUpdated);
  };

  return (
    <Dialog fullWidth maxWidth="xs" open={open} onClose={onClose}>
      <DialogTitle>{es.settings.saveNameTooltip}</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          autoFocus
          label={es.settings.newCategoryNameLabel}
          sx={{ mt: 1 }}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{es.settings.cancelButton}</Button>
        <Button variant="contained" onClick={() => void submit()}>
          {es.settings.saveButton}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function MigrateDialog({
  source,
  categories,
  subcategories,
  onClose,
  onChanged,
  onMessage,
}: {
  source: MigrateTarget;
  categories: SettingsCategory[];
  subcategories: SettingsSubcategory[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onMessage: (value: string | null) => void;
}) {
  const es = useI18n();
  const [targetCategoryId, setTargetCategoryId] = useState("");
  const [targetSubcategoryId, setTargetSubcategoryId] = useState("");

  const submit = async () => {
    if (!source || (!targetCategoryId && !targetSubcategoryId)) return;
    if (source.type === "category") {
      await migrateCategoryMovements({
        categoryId: source.id,
        targetCategoryId,
        targetSubcategoryId: targetSubcategoryId || null,
      });
    } else {
      await moveSubcategoryMovements({
        subcategoryId: source.id,
        targetCategoryId: targetCategoryId || null,
        targetSubcategoryId: targetSubcategoryId || null,
      });
    }
    setTargetCategoryId("");
    setTargetSubcategoryId("");
    onClose();
    await onChanged();
    onMessage(es.settings.movementsReassigned);
  };

  return (
    <Dialog fullWidth maxWidth="sm" open={source !== null} onClose={onClose}>
      <DialogTitle>{es.settings.moveButton}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Typography color="text.secondary">{source?.label}</Typography>
          <FormControl fullWidth size="small">
            <InputLabel>{es.movements.categoryLabel}</InputLabel>
            <Select
              label={es.movements.categoryLabel}
              value={targetCategoryId}
              onChange={(event) => {
                setTargetCategoryId(event.target.value);
                setTargetSubcategoryId("");
              }}
            >
              {categories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>{es.movements.subcategoryLabel}</InputLabel>
            <Select
              label={es.movements.subcategoryLabel}
              value={targetSubcategoryId}
              onChange={(event) => {
                const subId = event.target.value;
                const sub = subcategories.find((item) => item.id === subId);
                setTargetSubcategoryId(subId);
                setTargetCategoryId(sub?.categoryId ?? "");
              }}
            >
              {subcategories
                .filter((subcategory) => subcategory.id !== source?.id)
                .map((subcategory) => (
                  <MenuItem key={subcategory.id} value={subcategory.id}>
                    {subcategory.categoryName} / {subcategory.name}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{es.settings.cancelButton}</Button>
        <Button variant="contained" onClick={() => void submit()}>
          {es.settings.moveButton}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
