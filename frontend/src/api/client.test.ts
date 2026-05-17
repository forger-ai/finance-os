import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, del, get, patch, post, put } from "./client";

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

describe("shared stack client mounted by Docker", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("handles JSON, FormData, no-content, API errors, and network errors", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ id: 1 }))
      .mockResolvedValueOnce(jsonResponse({ uploaded: true }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ detail: "Missing" }, { status: 404 }))
      .mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({ saved: true }))
      .mockRejectedValueOnce(new Error("offline"));

    await expect(post<{ id: number }>("/api/items", { name: "demo" })).resolves.toEqual({ id: 1 });
    const jsonInit = vi.mocked(fetch).mock.calls[0][1];
    expect(jsonInit?.body).toBe(JSON.stringify({ name: "demo" }));
    expect(new Headers(jsonInit?.headers).get("Content-Type")).toBe("application/json");

    const formData = new FormData();
    await expect(post("/api/uploads", formData)).resolves.toEqual({ uploaded: true });
    const formInit = vi.mocked(fetch).mock.calls[1][1];
    expect(formInit?.body).toBe(formData);
    expect(new Headers(formInit?.headers).has("Content-Type")).toBe(false);

    await expect(del<void>("/api/items/1")).resolves.toBeUndefined();
    await expect(get("/api/missing")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "Missing",
    });
    await expect(patch("/api/items/1", { name: "updated" })).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      message: "HTTP 502",
      body: "Bad gateway",
    });
    await expect(put("/api/items/1", { name: "saved" })).resolves.toEqual({ saved: true });

    const networkError = await get("/api/health").catch((caught: unknown) => caught);
    expect(networkError).toBeInstanceOf(ApiError);
    expect(networkError).toMatchObject({ status: 0 });
  });
});
