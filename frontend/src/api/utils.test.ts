import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isForgerRemoteTunnel, remoteFetch } from "./remoteTunnel";
import { ApiError, isoDateOnly, request } from "./utils";

vi.mock("./remoteTunnel", () => ({
  isForgerRemoteTunnel: vi.fn(() => false),
  remoteFetch: vi.fn(),
}));

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
    vi.mocked(isForgerRemoteTunnel).mockReturnValue(false);
    vi.mocked(remoteFetch).mockReset();
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

  it("formats object API details instead of showing object placeholders", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: { error: "Invalid upload", field: "file" } }, { status: 422 }),
    );

    await expect(request("/api/imports/movements-extract")).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      message: JSON.stringify({ error: "Invalid upload", field: "file" }),
      body: { detail: { error: "Invalid upload", field: "file" } },
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

  it("sends empty and multipart bodies through remote RPC mode", async () => {
    vi.mocked(isForgerRemoteTunnel).mockReturnValue(true);
    vi.mocked(remoteFetch)
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ uploaded: true }));
    const signal = new AbortController().signal;

    await expect(request("/api/settings", { signal })).resolves.toEqual({ ok: true });
    expect(remoteFetch).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/api/settings",
      headers: { accept: "application/json" },
      bodyBase64: null,
    }, signal);

    const formData = new FormData();
    formData.append("source", "manual import");
    formData.append("unsafe\"\r\nname", "escaped");
    formData.append("raw", new Blob(["raw-bytes"]));
    formData.append("file", new Blob(["a,b\n1,2\n"]), "movements.csv");
    await expect(
      request("/api/imports/movements-extract", { method: "POST", body: formData }),
    ).resolves.toEqual({ uploaded: true });

    const remoteRequest = vi.mocked(remoteFetch).mock.calls[1][0];
    expect(remoteRequest.method).toBe("POST");
    expect(remoteRequest.path).toBe("/api/imports/movements-extract");
    expect(remoteRequest.headers["content-type"]).toEqual(expect.any(String));
    expect(remoteRequest.bodyBase64).toEqual(expect.any(String));
    const multipart = atob(remoteRequest.bodyBase64 ?? "");
    expect(multipart).toContain("manual import");
    expect(multipart).toContain('name="unsafe___name"');
    expect(multipart).toContain("Content-Type: application/octet-stream");
  });

  it("serializes JSON bodies and readable detail arrays through remote RPC mode", async () => {
    vi.mocked(isForgerRemoteTunnel).mockReturnValue(true);
    vi.mocked(remoteFetch)
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ detail: [1, true, null] }, { status: 422 }))
      .mockResolvedValueOnce(jsonResponse({ detail: [] }, { status: 400 }));

    await expect(
      request("/api/movements", { method: "PATCH", body: { amount: 10 } }),
    ).resolves.toEqual({ ok: true });

    expect(remoteFetch).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: "PATCH",
      path: "/api/movements",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      bodyBase64: "eyJhbW91bnQiOjEwfQ==",
    }), undefined);
    await expect(request("/api/movements")).rejects.toMatchObject({
      status: 422,
      message: "1; true",
    });
    await expect(request("/api/movements")).rejects.toMatchObject({
      status: 400,
      message: "HTTP 400",
    });
  });
});

describe("isoDateOnly", () => {
  it("keeps only the date component when present", () => {
    expect(isoDateOnly("2026-05-17T12:30:00Z")).toBe("2026-05-17");
    expect(isoDateOnly("short")).toBe("short");
  });
});
