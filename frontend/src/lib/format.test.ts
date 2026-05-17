import { describe, expect, it } from "vitest";
import {
  DEFAULT_CURRENCY_FORMAT,
  formatCompactMoney,
  formatDate,
  formatMoney,
  formatMoneyDraft,
  formatMoneyValueForInput,
  formatMonthLabel,
  parseMoneyInput,
} from "./format";

const usd = {
  code: "USD",
  name: "US dollar",
  symbol: "$",
  locale: "en-US",
  decimal_places: 2,
};

const eur = {
  code: "EUR",
  name: "Euro",
  symbol: "€",
  locale: "es-ES",
  decimal_places: 2,
};

describe("money formatting", () => {
  it("formats money with the selected visual currency format", () => {
    expect(formatMoney(1234, DEFAULT_CURRENCY_FORMAT)).toContain("$");
    expect(formatMoneyValueForInput(1234.5, usd)).toBe("1,234.50");
    expect(formatCompactMoney(1200000, usd)).toMatch(/\$1\.2M/);
  });

  it("sanitizes money drafts according to decimal support", () => {
    expect(formatMoneyDraft("$ 1.234abc", DEFAULT_CURRENCY_FORMAT)).toBe("1.234");
    expect(formatMoneyDraft("$1,234.56.78", usd)).toBe("1,234.5678");
  });

  it("parses integer and decimal visual inputs", () => {
    expect(parseMoneyInput("$ 1.234", DEFAULT_CURRENCY_FORMAT)).toBe(1234);
    expect(parseMoneyInput("$1,234.56", usd)).toBe(1234.56);
    expect(parseMoneyInput("1.234,56 €", eur)).toBe(1234.56);
    expect(parseMoneyInput("USD 12xx", usd)).toBe(12);
    expect(Number.isNaN(parseMoneyInput("", usd))).toBe(true);
  });
});

describe("date formatting", () => {
  it("formats date and month labels", () => {
    expect(formatDate("2026-05-17T00:00:00Z")).toMatch(/2026/);
    expect(formatMonthLabel("2026-05", "en-US")).toBe("May 2026");
  });
});
