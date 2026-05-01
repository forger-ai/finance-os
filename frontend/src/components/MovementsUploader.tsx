import { useCallback, useRef, useState } from "react";
import AttachFileRounded from "@mui/icons-material/AttachFileRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import CloudUploadRounded from "@mui/icons-material/CloudUploadRounded";
import InsertDriveFileRounded from "@mui/icons-material/InsertDriveFileRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAiSubscription } from "@/ai/AiSubscriptionProvider";
import { preprocessImportDocument } from "@/api/imports";
import { listMovements } from "@/api/movements";
import { useI18n, useLocale } from "@/i18n";

type UploadPhase =
  | { kind: "idle" }
  | { kind: "importing"; codexStatus?: ForgerCodexTaskStatus }
  | {
      kind: "done";
      inserted: number;
      codexResultText: string | null;
    }
  | { kind: "error"; message: string };

type ProgressMessage = {
  id: string;
  text: string;
};

const ACCEPTED =
  ".csv,.xlsx,.pdf,.png,.jpg,.jpeg,.webp,.heic,application/pdf,image/*,text/csv," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const CODEX_TEMPLATE_ID = "extract_movements_from_statement";

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      resolve(value.includes(",") ? value.split(",").pop() ?? "" : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function localizeAssistantName(text: string, assistantName: string): string {
  return text.replace(/\b(Codex|The assistant|El asistente)\b/gi, assistantName);
}

async function waitForCodexTask(runId: string): Promise<ForgerCodexTaskSummary> {
  const api = window.forgerApp;
  if (!api) {
    throw new Error("codex_unavailable");
  }
  const initial = await api.getCodexTask(runId);
  if (
    initial?.status === "completed" ||
    initial?.status === "failed" ||
    initial?.status === "canceled"
  ) {
    return initial;
  }
  return new Promise((resolve) => {
    const unsubscribe = api.onCodexTaskUpdated((event) => {
      if (event.task.runId !== runId) return;
      if (
        event.task.status === "completed" ||
        event.task.status === "failed" ||
        event.task.status === "canceled"
      ) {
        unsubscribe();
        resolve(event.task);
      }
    });
  });
}

function AssistantMarkdownResult({ text }: { text: string }) {
  return (
    <Box
      sx={{
        fontSize: 13,
        lineHeight: 1.55,
        "& p": { mt: 0, mb: 1 },
        "& p:last-child": { mb: 0 },
        "& ul, & ol": { mt: 0, mb: 1, pl: 2.5 },
        "& li": { mb: 0.35 },
        "& strong": { fontWeight: 700 },
        "& code": {
          px: 0.5,
          py: 0.1,
          borderRadius: 0.5,
          bgcolor: (theme) => alpha(theme.palette.common.white, 0.08),
          fontSize: "0.92em",
        },
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </Box>
  );
}

export function MovementsUploader({
  templateId = CODEX_TEMPLATE_ID,
  onUploaded,
  onGoToReview,
  userNote = "",
}: {
  templateId?: string;
  onUploaded: () => Promise<void> | void;
  onGoToReview: () => void;
  userNote?: string;
}) {
  const es = useI18n();
  const locale = useLocale();
  const aiSubscription = useAiSubscription();
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>({ kind: "idle" });
  const [progress, setProgress] = useState<ProgressMessage[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const appendFiles = useCallback((incoming: FileList | File[]) => {
    const nextFiles = Array.from(incoming);
    setFiles((current) => {
      const keys = new Set(current.map(fileKey));
      return [
        ...current,
        ...nextFiles.filter((file) => {
          const key = fileKey(file);
          if (keys.has(key)) return false;
          keys.add(key);
          return true;
        }),
      ];
    });
    setPhase({ kind: "idle" });
  }, []);

  const pushProgress = useCallback((text: string) => {
    setProgress((current) => [
      ...current,
      { id: `${Date.now()}-${current.length}`, text },
    ]);
  }, []);

  const removeFile = useCallback((target: File) => {
    setFiles((current) => current.filter((file) => fileKey(file) !== fileKey(target)));
    setPhase({ kind: "idle" });
  }, []);

  const handleImport = useCallback(async () => {
    if (files.length === 0) {
      setPhase({ kind: "error", message: es.load.noFilesError });
      return;
    }

    setPhase({ kind: "importing" });
    setProgress([]);

    let codexResultText: string | null = null;

    try {
      const hasAi = await aiSubscription.requireAi();
      if (!hasAi) {
        setPhase({ kind: "idle" });
        return;
      }
      if (!window.forgerApp) {
        throw new Error(es.load.codexUnavailable);
      }

      const beforeCount = (await listMovements()).length;

      pushProgress(es.load.codexProgressStarting(files.length));
      const preprocessedDocuments = await Promise.all(
        files.map(async (file) =>
          preprocessImportDocument(file).catch((error: unknown) => ({
            filename: file.name,
            content_type: file.type,
            kind: "preprocess_error",
            text: "",
            row_count: null,
            page_count: null,
            warning:
              error instanceof Error
                ? error.message
                : "Local preprocessing failed.",
          })),
        ),
      );
      const statementFiles = await Promise.all(
        files.map(async (file) => ({
          type: "file" as const,
          name: file.name,
          mimeType: file.type || undefined,
          dataBase64: await readFileBase64(file),
        })),
      );

      const started = await window.forgerApp.startCodexTask({
        templateId,
        locale,
        arguments: {
          statement: statementFiles,
          preprocessedDocuments: {
            type: "string",
            value: JSON.stringify(preprocessedDocuments),
          },
          locale: { type: "string", value: locale },
          userNote: { type: "string", value: userNote },
        },
      });
      setPhase({ kind: "importing", codexStatus: started.status });

      const seenCodexProgress = new Set<string>();
      const unsubscribe = window.forgerApp.onCodexTaskUpdated((event) => {
        if (event.task.runId !== started.runId) return;
        setPhase({ kind: "importing", codexStatus: event.task.status });
        for (const entry of event.task.progressLog ?? []) {
          const message = entry.trim();
          if (!message || seenCodexProgress.has(message)) continue;
          seenCodexProgress.add(message);
          pushProgress(localizeAssistantName(message, es.app.assistantName));
        }
      });

      const completed = await waitForCodexTask(started.runId);
      unsubscribe();
      if (completed.status !== "completed") {
        throw new Error(completed.error || es.load.genericError);
      }
      codexResultText = completed.resultText
        ? localizeAssistantName(completed.resultText, es.app.assistantName)
        : es.load.codexDone;
      pushProgress(es.load.codexDone);

      const afterCount = (await listMovements()).length;
      const insertedFromCount = Math.max(0, afterCount - beforeCount);
      setPhase({
        kind: "done",
        inserted: insertedFromCount,
        codexResultText,
      });
      await onUploaded();
    } catch (err) {
      const message =
        err instanceof Error && err.message !== "codex_unavailable"
          ? err.message
          : es.load.genericError;
      setPhase({ kind: "error", message });
    }
  }, [aiSubscription, es, files, locale, onUploaded, pushProgress, templateId, userNote]);

  const onPick = () => {
    void aiSubscription.requireAi().then((hasAi) => {
      if (hasAi) inputRef.current?.click();
    });
  };

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selected.length > 0) {
      void aiSubscription.requireAi().then((hasAi) => {
        if (hasAi) appendFiles(selected);
      });
    }
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const droppedFiles = Array.from(event.dataTransfer.files);
    void aiSubscription.requireAi().then((hasAi) => {
      if (hasAi) appendFiles(droppedFiles);
    });
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!dragActive) setDragActive(true);
  };

  const onDragLeave = () => setDragActive(false);
  const importing = phase.kind === "importing";

  return (
    <Stack spacing={2.5} sx={{ alignItems: "center" }}>
      <Paper
        sx={{
          width: "min(100%, 760px)",
          p: { xs: 2, md: 3 },
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
        <Stack spacing={2.25}>
          <Stack spacing={0.5}>
            <Typography sx={{ fontSize: 24, fontWeight: 800 }}>
              {es.load.promptTitle}
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: 14 }}>
              {es.load.promptHint}
            </Typography>
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              startIcon={<AttachFileRounded />}
              variant="outlined"
              disabled={importing}
              onClick={onPick}
            >
              {files.length > 0 ? es.load.addMore : es.load.selectFiles}
            </Button>
            <Button
              startIcon={
                importing ? (
                  <CircularProgress color="inherit" size={16} />
                ) : (
                  <CloudUploadRounded />
                )
              }
              variant="contained"
              disabled={importing || files.length === 0}
              onClick={() => void handleImport()}
            >
              {importing ? es.load.importingTitle : es.load.importButton}
            </Button>
          </Stack>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            hidden
            multiple
            onChange={onChange}
          />

          <Box
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              bgcolor: (theme) => alpha(theme.palette.common.white, 0.03),
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1 }}>
              {es.load.selectedTitle}
            </Typography>
            {files.length === 0 ? (
              <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                {es.load.emptyFiles}
              </Typography>
            ) : (
              <Stack spacing={0.75}>
                {files.map((file) => (
                  <Stack
                    key={fileKey(file)}
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", minWidth: 0 }}
                  >
                    <InsertDriveFileRounded
                      color="primary"
                      sx={{ fontSize: 18, flex: "0 0 auto" }}
                    />
                    <Typography
                      sx={{
                        fontSize: 13,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.name}
                    </Typography>
                    <IconButton
                      aria-label={es.load.removeFileLabel(file.name)}
                      disabled={importing}
                      size="small"
                      onClick={() => removeFile(file)}
                      sx={{ flex: "0 0 auto" }}
                    >
                      <CloseRounded fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </Paper>

      {phase.kind === "importing" ? (
        <Paper sx={{ width: "min(100%, 760px)", p: 2.25 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
              <CircularProgress size={20} />
              <Stack spacing={0.25}>
                <Typography sx={{ fontWeight: 800 }}>
                  {es.load.importingTitle}
                </Typography>
                <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                  {es.load.importingHint}
                </Typography>
              </Stack>
            </Stack>
            <Stack spacing={0.75}>
              {progress.map((entry) => (
                <Box
                  key={entry.id}
                  sx={{
                    px: 1.25,
                    py: 1,
                    borderRadius: 1,
                    bgcolor: (theme) => alpha(theme.palette.common.white, 0.04),
                    fontSize: 13,
                    color: "text.secondary",
                    "@keyframes importProgressIn": {
                      "0%": { opacity: 0, transform: "translateY(8px)" },
                      "100%": { opacity: 1, transform: "translateY(0)" },
                    },
                    animation: "importProgressIn 220ms ease-out",
                  }}
                >
                  {entry.text}
                </Box>
              ))}
            </Stack>
          </Stack>
        </Paper>
      ) : null}

      {phase.kind === "done" ? (
        <Alert
          icon={<CheckCircleRounded />}
          severity="success"
          sx={{ width: "min(100%, 760px)" }}
        >
          <Stack spacing={1}>
            <Typography sx={{ fontWeight: 800 }}>
              {es.load.doneTitle(phase.inserted)}
            </Typography>
            <Typography sx={{ fontSize: 13 }}>{es.load.doneHint}</Typography>
            {phase.codexResultText ? (
              <Box sx={{ mt: 0.5 }}>
                <AssistantMarkdownResult text={phase.codexResultText} />
              </Box>
            ) : null}
            <Button
              startIcon={<AutoAwesomeRounded />}
              variant="contained"
              sx={{ alignSelf: "flex-start", mt: 0.5 }}
              onClick={onGoToReview}
            >
              {es.load.goToReview}
            </Button>
          </Stack>
        </Alert>
      ) : phase.kind === "error" ? (
        <Alert severity="error" sx={{ width: "min(100%, 760px)" }}>
          {phase.message}
        </Alert>
      ) : null}
    </Stack>
  );
}
