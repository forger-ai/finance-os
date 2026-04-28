import { useCallback, useRef, useState } from "react";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import CloudUploadRounded from "@mui/icons-material/CloudUploadRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { extractMovementsFromFile } from "@/api/imports";
import { applyClassificationMemory } from "@/api/movements";
import type { ImportResult } from "@/api/types";
import { ApiError } from "@/api/utils";
import { es } from "@/i18n/es";

type UploaderState =
  | { kind: "idle" }
  | { kind: "uploading"; filename: string }
  | { kind: "done"; result: ImportResult }
  | { kind: "error"; message: string };

const ACCEPTED =
  ".csv,.xlsx,.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*,text/csv," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function MovementsUploader({ onUploaded }: { onUploaded: () => void }) {
  const [state, setState] = useState<UploaderState>({ kind: "idle" });
  const [dragActive, setDragActive] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryNote, setMemoryNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onApplyMemory = useCallback(async () => {
    setMemoryBusy(true);
    setMemoryNote(null);
    try {
      const result = await applyClassificationMemory();
      setMemoryNote(
        result.updated === 0
          ? es.review.applyMemoryEmpty
          : es.review.applyMemorySuccess(result.updated),
      );
      if (result.updated > 0) onUploaded();
    } catch (err) {
      setMemoryNote(
        err instanceof ApiError ? err.message : es.review.upload.genericError,
      );
    } finally {
      setMemoryBusy(false);
    }
  }, [onUploaded]);

  const handleFile = useCallback(
    async (file: File) => {
      setState({ kind: "uploading", filename: file.name });
      try {
        const result = await extractMovementsFromFile(file);
        setState({ kind: "done", result });
        if (result.inserted > 0) {
          onUploaded();
        }
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : es.review.upload.genericError;
        setState({ kind: "error", message });
      }
    },
    [onUploaded],
  );

  const onPick = () => inputRef.current?.click();

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void handleFile(file);
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!dragActive) setDragActive(true);
  };

  const onDragLeave = () => setDragActive(false);

  return (
    <Paper
      sx={{
        maxWidth: 980,
        p: { xs: 2, md: 2.5 },
        borderRadius: 2,
        border: "1px dashed",
        borderColor: dragActive ? "primary.main" : "divider",
        bgcolor: (theme) =>
          dragActive
            ? alpha(theme.palette.primary.main, 0.08)
            : alpha(theme.palette.common.white, 0.02),
        transition: "border-color 120ms, background-color 120ms",
      }}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <Stack spacing={1.5}>
        <Typography
          color="text.secondary"
          sx={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {es.review.upload.eyebrow}
        </Typography>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ alignItems: { xs: "flex-start", sm: "center" } }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: { xs: 16, md: 18 }, fontWeight: 700 }}>
              {es.review.upload.title}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.25, fontSize: 13 }}>
              {es.review.upload.hint}
            </Typography>
          </Box>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <Button
              startIcon={
                memoryBusy ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <AutoAwesomeRounded />
                )
              }
              variant="outlined"
              disabled={memoryBusy || state.kind === "uploading"}
              onClick={() => void onApplyMemory()}
            >
              {es.review.applyMemoryButton}
            </Button>
            <Button
              startIcon={
                state.kind === "uploading" ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <CloudUploadRounded />
                )
              }
              variant="contained"
              disabled={state.kind === "uploading"}
              onClick={onPick}
              sx={{ minWidth: 180 }}
            >
              {state.kind === "uploading"
                ? es.review.upload.processing
                : dragActive
                  ? es.review.upload.ctaDrop
                  : es.review.upload.ctaIdle}
            </Button>
          </Stack>
        </Stack>

        {memoryNote ? (
          <Alert
            severity="info"
            onClose={() => setMemoryNote(null)}
            sx={{ mt: 0 }}
          >
            {memoryNote}
          </Alert>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          hidden
          onChange={onChange}
        />

        <Collapse in={state.kind === "done" || state.kind === "error"}>
          {state.kind === "done" ? (
            <Alert
              severity={
                state.result.failed > 0 && state.result.inserted === 0
                  ? "warning"
                  : "success"
              }
              onClose={() => setState({ kind: "idle" })}
              sx={{ mt: 0.5 }}
            >
              <Stack spacing={0.75}>
                <Typography sx={{ fontWeight: 600 }}>
                  {state.result.inserted === 0 && state.result.failed === 0
                    ? es.review.upload.summaryNothing
                    : es.review.upload.summary(
                        state.result.inserted,
                        state.result.failed,
                      )}
                </Typography>
                {state.result.errors.length > 0 ? (
                  <Box>
                    <Typography
                      sx={{ fontSize: 12, fontWeight: 700, mb: 0.5 }}
                    >
                      {es.review.upload.errorsHeader}
                    </Typography>
                    <Box
                      component="ul"
                      sx={{ m: 0, pl: 2, fontSize: 12, lineHeight: 1.5 }}
                    >
                      {state.result.errors.slice(0, 5).map((e, i) => (
                        <li key={`${e.row}-${i}`}>
                          fila {e.row}: {e.error}
                        </li>
                      ))}
                      {state.result.errors.length > 5 ? (
                        <li>… +{state.result.errors.length - 5}</li>
                      ) : null}
                    </Box>
                  </Box>
                ) : null}
              </Stack>
            </Alert>
          ) : state.kind === "error" ? (
            <Alert
              severity="error"
              onClose={() => setState({ kind: "idle" })}
              sx={{ mt: 0.5 }}
            >
              {state.message}
            </Alert>
          ) : (
            <Box />
          )}
        </Collapse>
      </Stack>
    </Paper>
  );
}
