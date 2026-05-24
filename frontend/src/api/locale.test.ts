import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initialLocale,
  loadForgerRuntimeContext,
  localeFromNavigator,
  localeFromSearch,
  normalizeLocale,
} from "./locale";

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

describe("Finance OS locale helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes supported locale variants", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("en-GB")).toBe("en");
    expect(normalizeLocale("es-CL")).toBe("es");
    expect(normalizeLocale(undefined)).toBe("es");
  });

  it("reads URL locale with legacy fallback", () => {
    expect(localeFromSearch("")).toBeNull();
    expect(localeFromSearch("?locale=en-US")).toBe("en");
    expect(localeFromSearch("?forgerLocale=es-CL&locale=en-US")).toBe("es");
  });

  it("reads navigator locale when available", () => {
    vi.stubGlobal("navigator", undefined);
    expect(localeFromNavigator()).toBeNull();
    vi.unstubAllGlobals();
    expect(localeFromNavigator({ languages: ["fr-FR", "en-US"], language: "es-CL" })).toBe("en");
    expect(localeFromNavigator({ languages: [], language: "en-US" })).toBe("en");
    expect(localeFromNavigator({ languages: [], language: "" })).toBeNull();
  });

  it("uses browser language when Forger has not provided locale context", () => {
    expect(initialLocale({
      search: "",
      navigator: { languages: ["en-US"], language: "en-US" },
    })).toBe("en");
    expect(initialLocale({ search: "", navigator: { languages: [], language: "" }, fallback: "en" })).toBe("en");
    expect(initialLocale({ search: "", navigator: { languages: [], language: "" } })).toBe("es");
  });

  it("loads Desktop locale context through the app backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      locale: "en",
      rawLocale: "en-US",
      source: "desktop",
    })));

    await expect(loadForgerRuntimeContext()).resolves.toEqual({
      locale: "en",
      rawLocale: "en-US",
      source: "desktop",
    });
  });

  it("normalizes fallback Desktop context responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      rawLocale: "",
      source: "fallback",
    })));

    await expect(loadForgerRuntimeContext()).resolves.toEqual({
      locale: "es",
      rawLocale: null,
      source: "fallback",
    });
  });
});
