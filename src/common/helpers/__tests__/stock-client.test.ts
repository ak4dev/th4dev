import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeStockSymbol,
  extractStockPrice,
  extractQuoteSymbol,
  fetchStockData,
} from "../stock-client";

// ── normalizeStockSymbol ──────────────────────────────────────────────────────

describe("normalizeStockSymbol", () => {
  it("uppercases a lowercase symbol", () => {
    expect(normalizeStockSymbol("aapl")).toBe("AAPL");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeStockSymbol("  MSFT  ")).toBe("MSFT");
  });

  it("trims and uppercases together", () => {
    expect(normalizeStockSymbol("  goog  ")).toBe("GOOG");
  });

  it("returns empty string for undefined", () => {
    expect(normalizeStockSymbol(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(normalizeStockSymbol("")).toBe("");
  });
});

// ── extractStockPrice ─────────────────────────────────────────────────────────

describe("extractStockPrice", () => {
  it("extracts price from Alpha Vantage Global Quote format", () => {
    const data = { "Global Quote": { "05. price": "182.50" } };
    expect(extractStockPrice(data)).toBe(182.5);
  });

  it("extracts price from a top-level price key", () => {
    const data = { price: "45.75" };
    expect(extractStockPrice(data)).toBe(45.75);
  });

  it("returns undefined for null input", () => {
    expect(extractStockPrice(null)).toBeUndefined();
  });

  it("returns undefined when no price key is found", () => {
    expect(
      extractStockPrice({ "Global Quote": { "01. symbol": "AAPL" } }),
    ).toBeUndefined();
  });

  it("returns undefined for non-numeric price string", () => {
    expect(extractStockPrice({ price: "N/A" })).toBeUndefined();
  });
});

// ── extractQuoteSymbol ────────────────────────────────────────────────────────

describe("extractQuoteSymbol", () => {
  it("extracts symbol from Alpha Vantage Global Quote format", () => {
    const data = {
      "Global Quote": { "01. symbol": "aapl", "05. price": "182.50" },
    };
    expect(extractQuoteSymbol(data)).toBe("AAPL");
  });

  it("extracts symbol from a top-level symbol key", () => {
    expect(extractQuoteSymbol({ symbol: "msft" })).toBe("MSFT");
  });

  it("returns undefined for null input", () => {
    expect(extractQuoteSymbol(null)).toBeUndefined();
  });

  it("returns undefined when no symbol key is found", () => {
    expect(extractQuoteSymbol({ price: "100" })).toBeUndefined();
  });
});

// ── fetchStockData ────────────────────────────────────────────────────────────

describe("fetchStockData", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("substitutes {symbol} in the URL template", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ price: "100" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchStockData("https://api.example.com/quote?symbol={symbol}", [
      "AAPL",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/quote?symbol=AAPL",
    );
  });

  it("returns data on a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ price: "123" }),
      }),
    );

    const results = await fetchStockData("https://api/{symbol}", ["TSLA"]);
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("TSLA");
    expect(results[0].data).toEqual({ price: "123" });
    expect(results[0].error).toBeUndefined();
  });

  it("returns an error string on HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      }),
    );

    const results = await fetchStockData("https://api/{symbol}", ["AAPL"]);
    expect(results[0].error).toContain("429");
    expect(results[0].data).toBeUndefined();
  });

  it("returns an error string when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const results = await fetchStockData("https://api/{symbol}", ["AAPL"]);
    expect(results[0].error).toContain("Network error");
    expect(results[0].data).toBeUndefined();
  });

  it("processes multiple symbols in parallel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );

    const results = await fetchStockData("https://api/{symbol}", [
      "AAPL",
      "MSFT",
      "GOOG",
    ]);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.symbol)).toEqual(["AAPL", "MSFT", "GOOG"]);
  });
});

// ── additional edge cases ─────────────────────────────────────────────────────

describe("normalizeStockSymbol – extra edge cases", () => {
  it("returns empty string for undefined input", () => {
    expect(normalizeStockSymbol(undefined)).toBe("");
  });

  it("trims whitespace-padded input correctly", () => {
    expect(normalizeStockSymbol("  tsla  ")).toBe("TSLA");
    expect(normalizeStockSymbol("\t nvda \n")).toBe("NVDA");
  });
});

describe("extractStockPrice – extra edge cases", () => {
  it("extracts price from deeply nested Global Quote structure", () => {
    const data = {
      "Global Quote": {
        "01. symbol": "AMZN",
        "02. open": "180.00",
        "05. price": "195.25",
        "08. previousClose": "190.00",
      },
    };
    expect(extractStockPrice(data)).toBe(195.25);
  });
});

describe("extractQuoteSymbol – extra edge cases", () => {
  it("returns undefined for an empty object", () => {
    expect(extractQuoteSymbol({})).toBeUndefined();
  });
});

describe("fetchStockData – extra edge cases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty array when given no symbols", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const results = await fetchStockData("https://api/{symbol}", []);
    expect(results).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
