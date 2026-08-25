import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeStockSymbol,
  extractStockPrice,
  extractQuoteSymbol,
  fetchStockData,
  applyFetchedPrices,
  describeFetchFailures,
} from "../stock-client";
import type { PortfolioHolding } from "../../types/portfolio-types";

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

  it("falls back to the top-level price when the Global Quote price is not numeric", () => {
    expect(
      extractStockPrice({
        "Global Quote": { "05. price": "N/A" },
        price: "12.5",
      }),
    ).toBe(12.5);
  });

  it("returns undefined for a rate-limit Information body", () => {
    expect(
      extractStockPrice({ Information: "Thank you for using Alpha Vantage" }),
    ).toBeUndefined();
  });
});

describe("extractQuoteSymbol – extra edge cases", () => {
  it("returns undefined for an empty object", () => {
    expect(extractQuoteSymbol({})).toBeUndefined();
  });

  it("falls back to the top-level symbol when the Global Quote symbol is blank", () => {
    expect(
      extractQuoteSymbol({
        "Global Quote": { "01. symbol": "  " },
        symbol: "ibm",
      }),
    ).toBe("IBM");
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

// ── applyFetchedPrices ────────────────────────────────────────────────────────

describe("applyFetchedPrices", () => {
  const now = new Date("2026-01-15T00:00:00.000Z");
  const holdings: PortfolioHolding[] = [
    { symbol: "AAPL", allocationPct: 50 },
    { symbol: "MSFT", allocationPct: 50 },
  ];

  it("sets currentPrice and locks startPrice/projectionStartDate on the first fetch", () => {
    const out = applyFetchedPrices(
      holdings,
      [
        {
          symbol: "AAPL",
          data: {
            "Global Quote": { "01. symbol": "AAPL", "05. price": "182.50" },
          },
        },
      ],
      now,
    );
    expect(out[0]).toEqual({
      symbol: "AAPL",
      allocationPct: 50,
      currentPrice: 182.5,
      startPrice: 182.5,
      projectionStartDate: "2026-01-15T00:00:00.000Z",
    });
    expect(out[1]).toBe(holdings[1]);
  });

  it("keeps the locked start price and date on later fetches", () => {
    const locked: PortfolioHolding = {
      symbol: "AAPL",
      allocationPct: 100,
      currentPrice: 100,
      startPrice: 100,
      projectionStartDate: "2025-06-01T00:00:00.000Z",
    };
    const [out] = applyFetchedPrices(
      [locked],
      [{ symbol: "AAPL", data: { price: "150" } }],
      now,
    );
    expect(out).toEqual({ ...locked, currentPrice: 150 });
  });

  it("matches on the symbol echoed by the API, case-insensitively", () => {
    const [out] = applyFetchedPrices(
      [{ symbol: "aapl", allocationPct: 100 }],
      [{ symbol: "AAPL", data: { symbol: " Aapl ", price: "10" } }],
      now,
    );
    expect(out.currentPrice).toBe(10);
  });

  it("leaves holdings untouched when the fetch failed or returned no price", () => {
    const out = applyFetchedPrices(
      holdings,
      [
        { symbol: "AAPL", error: "HTTP 401: Unauthorized" },
        { symbol: "MSFT", data: { Information: "rate limited" } },
      ],
      now,
    );
    expect(out).toEqual(holdings);
    expect(holdings[0].currentPrice).toBeUndefined();
  });

  it("ignores results for symbols that are not held", () => {
    const out = applyFetchedPrices(
      holdings,
      [{ symbol: "GOOG", data: { price: "10" } }],
      now,
    );
    expect(out).toEqual(holdings);
  });
});

// ── describeFetchFailures ─────────────────────────────────────────────────────

describe("describeFetchFailures", () => {
  it("returns null when every symbol produced a price", () => {
    expect(
      describeFetchFailures([
        { symbol: "AAPL", data: { price: "1" } },
        { symbol: "MSFT", data: { "Global Quote": { "05. price": "2" } } },
      ]),
    ).toBeNull();
  });

  it("lists HTTP and network errors per symbol", () => {
    expect(
      describeFetchFailures([
        { symbol: "AAPL", error: "HTTP 401: Unauthorized" },
        { symbol: "MSFT", data: { price: "2" } },
        { symbol: "GOOG", error: "TypeError: Failed to fetch" },
      ]),
    ).toBe("AAPL: HTTP 401: Unauthorized; GOOG: TypeError: Failed to fetch");
  });

  it("reports a successful response that carries no price", () => {
    expect(
      describeFetchFailures([
        { symbol: "AAPL", data: { Information: "rate limited" } },
      ]),
    ).toBe("AAPL: no price in response");
  });
});
