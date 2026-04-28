import { useEffect, useState } from "react";
import KeyRounded from "@mui/icons-material/KeyRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  getLLMSettings,
  OPENAI_MODELS,
  updateOpenAISettings,
  type LLMProvider,
} from "@/api/settings";
import { ApiError } from "@/api/utils";
import { es } from "@/i18n/es";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "saving" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

const CUSTOM_MODEL_VALUE = "__custom__";

function inCatalog(modelId: string): boolean {
  return OPENAI_MODELS.some((m) => m.id === modelId);
}

export function LLMSettingsTab() {
  const [providers, setProviders] = useState<LLMProvider[] | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [modelSelection, setModelSelection] = useState<string>("");
  const [customModel, setCustomModel] = useState<string>("");
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  const refresh = async () => {
    try {
      const data = await getLLMSettings();
      setProviders(data.providers);
      const openai = data.providers.find((p) => p.id === "openai");
      if (openai) {
        if (inCatalog(openai.model)) {
          setModelSelection(openai.model);
          setCustomModel("");
        } else {
          setModelSelection(CUSTOM_MODEL_VALUE);
          setCustomModel(openai.model);
        }
      }
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof ApiError ? err.message : es.errors.generic,
      });
    }
  };

  const resolvedModel =
    modelSelection === CUSTOM_MODEL_VALUE ? customModel.trim() : modelSelection;

  useEffect(() => {
    void refresh();
  }, []);

  const openai = providers?.find((p) => p.id === "openai");

  const onSave = async () => {
    setStatus({ kind: "saving" });
    try {
      const payload: { api_key?: string | null; model?: string | null } = {};
      const trimmedKey = apiKeyInput.trim();
      if (trimmedKey) payload.api_key = trimmedKey;
      if (openai && resolvedModel && resolvedModel !== openai.model) {
        payload.model = resolvedModel;
      }
      if (Object.keys(payload).length === 0) {
        setStatus({ kind: "ok", message: es.settings.llm.nothingToSave });
        return;
      }
      const data = await updateOpenAISettings(payload);
      setProviders(data.providers);
      setApiKeyInput("");
      setStatus({ kind: "ok", message: es.settings.llm.saved });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof ApiError ? err.message : es.errors.generic,
      });
    }
  };

  const onClearKey = async () => {
    setStatus({ kind: "saving" });
    try {
      const data = await updateOpenAISettings({ api_key: null });
      setProviders(data.providers);
      setApiKeyInput("");
      setStatus({ kind: "ok", message: es.settings.llm.cleared });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof ApiError ? err.message : es.errors.generic,
      });
    }
  };

  if (status.kind === "loading" || providers === null) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {status.kind === "ok" ? (
        <Alert severity="success" onClose={() => setStatus({ kind: "idle" })}>
          {status.message}
        </Alert>
      ) : status.kind === "error" ? (
        <Alert severity="error" onClose={() => setStatus({ kind: "idle" })}>
          {status.message}
        </Alert>
      ) : null}

      <Alert severity="info" variant="outlined">
        {es.settings.llm.securityNote}
      </Alert>

      {openai ? (
        <Paper sx={{ p: 2.5 }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <KeyRounded />
              <Typography sx={{ fontSize: 18, fontWeight: 800 }}>
                {openai.label}
              </Typography>
              <Chip
                label={
                  openai.key_set
                    ? es.settings.llm.statusSet
                    : es.settings.llm.statusUnset
                }
                color={openai.key_set ? "success" : "default"}
                size="small"
              />
              {openai.key_set && openai.key_preview ? (
                <Chip label={openai.key_preview} size="small" variant="outlined" />
              ) : null}
            </Stack>

            <Typography color="text.secondary" sx={{ fontSize: 13 }}>
              {es.settings.llm.openaiHint}
            </Typography>

            <Stack spacing={1.5}>
              <TextField
                label={es.settings.llm.apiKeyLabel}
                placeholder={
                  openai.key_set
                    ? es.settings.llm.apiKeyPlaceholderReplace
                    : es.settings.llm.apiKeyPlaceholderSet
                }
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
                type="password"
                autoComplete="off"
                size="small"
                fullWidth
              />

              <FormControl size="small" fullWidth>
                <InputLabel id="openai-model-label">
                  {es.settings.llm.modelLabel}
                </InputLabel>
                <Select
                  labelId="openai-model-label"
                  label={es.settings.llm.modelLabel}
                  value={modelSelection}
                  onChange={(event) => setModelSelection(event.target.value)}
                  renderValue={(value) => {
                    if (value === CUSTOM_MODEL_VALUE) {
                      return es.settings.llm.modelCustom;
                    }
                    const match = OPENAI_MODELS.find((m) => m.id === value);
                    return match ? match.label : value;
                  }}
                >
                  {OPENAI_MODELS.map((model) => (
                    <MenuItem key={model.id} value={model.id}>
                      <ListItemText
                        primary={model.label}
                        secondary={model.hint}
                      />
                    </MenuItem>
                  ))}
                  <MenuItem value={CUSTOM_MODEL_VALUE}>
                    <ListItemText
                      primary={es.settings.llm.modelCustom}
                      secondary={es.settings.llm.modelCustomHint}
                    />
                  </MenuItem>
                </Select>
              </FormControl>

              {modelSelection === CUSTOM_MODEL_VALUE ? (
                <TextField
                  label={es.settings.llm.modelCustomLabel}
                  helperText={es.settings.llm.modelHelp(openai.model_default)}
                  value={customModel}
                  onChange={(event) => setCustomModel(event.target.value)}
                  size="small"
                  fullWidth
                />
              ) : (
                <Typography color="text.secondary" sx={{ fontSize: 12, pl: 0.5 }}>
                  {es.settings.llm.modelHelp(openai.model_default)}
                </Typography>
              )}
            </Stack>

            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
              {openai.key_set ? (
                <Tooltip title={es.settings.llm.clearKeyTooltip}>
                  <span>
                    <IconButton
                      color="error"
                      disabled={status.kind === "saving"}
                      onClick={() => void onClearKey()}
                    >
                      <DeleteOutlineRounded />
                    </IconButton>
                  </span>
                </Tooltip>
              ) : null}
              <Button
                startIcon={
                  status.kind === "saving" ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <SaveRounded />
                  )
                }
                variant="contained"
                disabled={status.kind === "saving"}
                onClick={() => void onSave()}
              >
                {es.settings.llm.saveButton}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}
