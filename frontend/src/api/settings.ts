import { request } from "./utils";

/**
 * Curated list of OpenAI models suitable for the PDF/image extraction flow.
 * All entries support vision and structured outputs. Order = recommended first.
 */
export const OPENAI_MODELS: { id: string; label: string; hint?: string }[] = [
  {
    id: "gpt-4o-2024-11-20",
    label: "GPT-4o (2024-11-20)",
    hint: "Default. Multimodal estable, buen balance precio/calidad.",
  },
  {
    id: "gpt-4o",
    label: "GPT-4o (alias)",
    hint: "Alias rotativo al último GPT-4o.",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    hint: "Más barato y rápido, calidad menor en documentos densos.",
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    hint: "Generación 4.1, mejor seguimiento de instrucciones.",
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    hint: "Versión barata de 4.1.",
  },
];

export type LLMProvider = {
  id: string;
  label: string;
  key_set: boolean;
  key_preview: string | null;
  model: string;
  model_default: string;
};

export type LLMSettings = {
  providers: LLMProvider[];
};

export function getLLMSettings(): Promise<LLMSettings> {
  return request<LLMSettings>("/api/settings/llm");
}

/**
 * Update OpenAI provider settings.
 * - Omit a field to leave it unchanged.
 * - Pass ``null`` (or empty string) to clear the stored value.
 */
export function updateOpenAISettings(payload: {
  api_key?: string | null;
  model?: string | null;
}): Promise<LLMSettings> {
  return request<LLMSettings>("/api/settings/llm/openai", {
    method: "PUT",
    body: payload,
  });
}
