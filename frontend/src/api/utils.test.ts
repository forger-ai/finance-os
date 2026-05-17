import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, isoDateOnly, request } from "./utils";

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

describe("request", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends JSON bodies with browser-safe headers", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(
      request<{ ok: boolean }>("/api/movements", {
        method: "POST",
        body: { amount: 1200 },
      }),
    ).resolves.toEqual({ ok: true });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ amount: 1200 }));
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
  });

  it("keeps FormData bodies untouched", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ uploaded: true }));
    const body = new FormData();
    body.append("file", new Blob(["a,b\n1,2\n"]), "movements.csv");

    await request("/api/imports/movements-extract", { method: "POST", body });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.body).toBe(body);
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });

  it("returns undefined for 204 responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(request<void>("/api/movements/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("uses API details from JSON error payloads", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: "Invalid category" }, { status: 400 }));

    await expect(request("/api/movements/1")).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      message: "Invalid category",
      body: { detail: "Invalid category" },
    });
  });

  it("falls back to HTTP status for non-JSON errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("offline", { status: 503, headers: { "Content-Type": "text/plain" } }),
    );

    await expect(request("/api/summary")).rejects.toMatchObject({
      status: 503,
      message: "HTTP 503",
      body: "offline",
    });
  });

  it("falls back to HTTP status for JSON errors without detail", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "invalid" }, { status: 422 }));

    await expect(request("/api/summary")).rejects.toMatchObject({
      status: 422,
      message: "HTTP 422",
      body: { error: "invalid" },
    });
  });

  it("wraps network errors as ApiError status 0", async () => {
    const cause = new Error("connection refused");
    vi.mocked(fetch).mockRejectedValueOnce(cause);

    await expect(request("/api/settings")).rejects.toEqual(
      expect.objectContaining(new ApiError(0, "Network error", cause)),
    );
  });
});

describe("isoDateOnly", () => {
  it("keeps only the date component when present", () => {
    expect(isoDateOnly("2026-05-17T12:30:00Z")).toBe("2026-05-17");
    expect(isoDateOnly("short")).toBe("short");
  });
});
