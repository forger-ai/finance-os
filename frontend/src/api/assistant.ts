import { request } from "./utils";
import type { AssistantStatusRead, AssistantTaskRead } from "./types";

const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled"]);

export function getAssistantStatus(): Promise<AssistantStatusRead> {
  return request<AssistantStatusRead>("/api/assistant/status");
}

export function startMovementImportTask(input: {
  files: File[];
  templateId: string;
  userNote: string;
  locale: string;
}): Promise<AssistantTaskRead> {
  const formData = new FormData();
  for (const file of input.files) {
    formData.append("files", file);
  }
  formData.append("template_id", input.templateId);
  formData.append("user_note", input.userNote);
  formData.append("locale", input.locale);
  return request<AssistantTaskRead>("/api/assistant/tasks/movement-import", {
    method: "POST",
    body: formData,
  });
}

export function startBudgetRecommendationTask(input: {
  expectedIncome: string;
  month: string;
  year: string;
  locale: string;
}): Promise<AssistantTaskRead> {
  return request<AssistantTaskRead>("/api/assistant/tasks/budget-recommendation", {
    method: "POST",
    body: {
      expectedIncome: input.expectedIncome,
      month: input.month,
      year: input.year,
      locale: input.locale,
    },
  });
}

export function getAssistantTask(runId: string): Promise<AssistantTaskRead> {
  return request<AssistantTaskRead>(`/api/assistant/tasks/${runId}`);
}

export async function waitForAssistantTask(
  runId: string,
  onUpdate: (task: AssistantTaskRead) => void,
): Promise<AssistantTaskRead> {
  const deadline = Date.now() + 10 * 60 * 1000;
  let lastTask: AssistantTaskRead | null = null;
  while (Date.now() < deadline) {
    const task = await getAssistantTask(runId);
    lastTask = task;
    onUpdate(task);
    if (TERMINAL_STATUSES.has(task.status)) {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error(lastTask?.error || "assistant_task_timeout");
}
