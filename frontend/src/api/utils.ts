/**
 * Centralized HTTP helpers. All API modules go through ``request`` so error
 * handling, base URL resolution and JSON parsing live in exactly one place.
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
export const API_BASE_URL = RAW_BASE.replace(/\/+$/, "");

import { isForgerRemoteTunnel, remoteFetch } from "./remoteTunnel";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  let body: string | FormData | undefined;
  if (options.body !== undefined && options.body !== null) {
    if (
      typeof FormData !== "undefined" &&
      options.body instanceof FormData
    ) {
      body = options.body;
    } else {
      body = JSON.stringify(options.body);
      headers.set("Content-Type", "application/json");
    }
  }
  headers.set("Accept", "application/json");

  let response: Response;
  try {
    const method = options.method ?? "GET";
    if (isForgerRemoteTunnel()) {
      const remoteBody = await serializeBodyForRemote(body);
      if (remoteBody.contentType && !headers.has("Content-Type")) {
        headers.set("Content-Type", remoteBody.contentType);
      }
      response = await remoteFetch({
        method,
        path,
        headers: Object.fromEntries(headers.entries()),
        bodyBase64: remoteBody.bodyBase64,
      }, options.signal);
    } else {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        body,
        headers,
        signal: options.signal,
      });
    }
  } catch (error) {
    throw new ApiError(0, "Network error", error);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => null);
  } else {
    payload = await response.text().catch(() => null);
  }

  if (!response.ok) {
    throw new ApiError(response.status, errorMessageFromPayload(payload, `HTTP ${response.status}`), payload);
  }

  return payload as T;
}

export function isoDateOnly(value: string): string {
  return value.length >= 10 ? value.slice(0, 10) : value;
}

type SerializedRemoteBody = {
  bodyBase64: string | null;
  contentType?: string;
};

async function serializeBodyForRemote(body: string | FormData | undefined): Promise<SerializedRemoteBody> {
  if (body === undefined) {
    return { bodyBase64: null };
  }
  if (typeof body === "string") {
    return { bodyBase64: btoa(unescape(encodeURIComponent(body))) };
  }
  return serializeFormDataForRemote(body);
}

async function serializeFormDataForRemote(formData: FormData): Promise<SerializedRemoteBody> {
  const boundary = `----forger-${Math.random().toString(36).slice(2)}`;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  for (const [name, value] of formData.entries()) {
    chunks.push(encoder.encode(`--${boundary}\r\n`));
    if (typeof Blob !== "undefined" && value instanceof Blob) {
      const filename = "name" in value && typeof value.name === "string" ? value.name : "blob";
      const contentType = value.type || "application/octet-stream";
      chunks.push(encoder.encode(
        `Content-Disposition: form-data; name="${escapeHeaderValue(name)}"; filename="${escapeHeaderValue(filename)}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
      ));
      chunks.push(new Uint8Array(await new Response(value).arrayBuffer()));
      chunks.push(encoder.encode("\r\n"));
    } else {
      chunks.push(encoder.encode(
        `Content-Disposition: form-data; name="${escapeHeaderValue(name)}"\r\n\r\n${String(value)}\r\n`,
      ));
    }
  }

  chunks.push(encoder.encode(`--${boundary}--\r\n`));
  return {
    bodyBase64: bytesToBase64(concatBytes(chunks)),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function escapeHeaderValue(value: string): string {
  return value.replace(/["\r\n]/g, "_");
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function errorMessageFromPayload(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || !("detail" in payload)) {
    return fallback;
  }
  return stringifyErrorDetail((payload as { detail: unknown }).detail) ?? fallback;
}

function stringifyErrorDetail(detail: unknown): string | null {
  if (typeof detail === "string") {
    return detail;
  }
  if (typeof detail === "number" || typeof detail === "boolean") {
    return String(detail);
  }
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => stringifyErrorDetail(item)).filter(Boolean);
    return parts.length > 0 ? parts.join("; ") : null;
  }
  if (detail && typeof detail === "object") {
    return JSON.stringify(detail);
  }
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
