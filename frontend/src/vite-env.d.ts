/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type ForgerCodexTaskStatus =
  | "queued"
  | "running"
  | "needs_permission"
  | "completed"
  | "failed"
  | "canceled";

type ForgerCodexTaskSummary = {
  runId: string;
  appId: string;
  templateId: string;
  status: ForgerCodexTaskStatus;
  createdAt: string;
  updatedAt: string;
  resultText?: string;
  error?: string;
  progressLog?: string[];
};

type ForgerCodexTaskEvent = {
  task: ForgerCodexTaskSummary;
};

interface Window {
  forgerApp?: {
    startCodexTask: (input: {
      templateId: string;
      arguments?: Record<
        string,
        | string
        | number
        | boolean
        | null
        | { type: "string"; value: string }
        | { type: "file"; name: string; mimeType?: string; dataBase64: string }
        | Array<{
            type: "file";
            name: string;
            mimeType?: string;
            dataBase64: string;
          }>
      >;
    }) => Promise<ForgerCodexTaskSummary>;
    getCodexTask: (runId: string) => Promise<ForgerCodexTaskSummary | null>;
    cancelCodexTask: (runId: string) => Promise<{ success: boolean }>;
    onCodexTaskUpdated: (
      listener: (event: ForgerCodexTaskEvent) => void,
    ) => () => void;
  };
}
