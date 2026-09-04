import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalizeStockSymbol,
  extractStockPrice,
  extractQuoteSymbol,
  validateStockUrlTemplate,
  fetchStockData,
  applyFetchedPrices,
  describeQuoteBody,
  describeFetchFailures,
} from "../stock-client";
import type { PortfolioHolding } from "../../types/portfolio-types";

// `fetch` and `location` are stubbed per test; vi.restoreAllMocks() does NOT
// undo a stubbed global, so without this the last stub leaks into every file
// that runs after this one in the same worker.
afterEach(() => {
  vi.unstubAllGlobals();
});

/** fetchStockData now passes an init object; only the URL differs per call. */
const FETCH_INIT: RequestInit = { signal: undefined, credentials: "omit" };

/** A stubbed fetch that answers every URL with the same 200 body. */
function stubFetch(body: unknown = { price: "100" }) {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", mockFetch);
  return mockFetch;
}

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

  it("trims tabs and newlines, not just spaces", () => {
    expect(normalizeStockSymbol("\t nvda \n")).toBe("NVDA");
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

  it("picks the price out of a full Global Quote block", () => {
    expect(
      extractStockPrice({
        "Global Quote": {
          "01. symbol": "AMZN",
          "02. open": "180.00",
          "05. price": "195.25",
          "08. previousClose": "190.00",
        },
      }),
    ).toBe(195.25);
  });

  it("falls back to the top-level price when the Global Quote price is not numeric", () => {
    expect(
      extractStockPrice({
        "Global Quote": { "05. price": "N/A" },
        price: "12.5",
      }),
    ).toBe(12.5);
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

  it("returns undefined for a rate-limit Information body", () => {
    expect(
      extractStockPrice({ Information: "Thank you for using Alpha Vantage" }),
    ).toBeUndefined();
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

  it("falls back to the top-level symbol when the Global Quote symbol is blank", () => {
    expect(
      extractQuoteSymbol({
        "Global Quote": { "01. symbol": "  " },
        symbol: "ibm",
      }),
    ).toBe("IBM");
  });

  it("returns undefined for null input", () => {
    expect(extractQuoteSymbol(null)).toBeUndefined();
  });

  it("returns undefined for an empty object", () => {
    expect(extractQuoteSymbol({})).toBeUndefined();
  });

  it("returns undefined when no symbol key is found", () => {
    expect(extractQuoteSymbol({ price: "100" })).toBeUndefined();
  });
});

// ── validateStockUrlTemplate ──────────────────────────────────────────────────

describe("validateStockUrlTemplate", () => {
  it("accepts an https template carrying the placeholder", () => {
    expect(
      validateStockUrlTemplate("https://api.example.com/quote?s={symbol}"),
    ).toBeNull();
  });

  it("accepts a template with the placeholder in path and query", () => {
    expect(
      validateStockUrlTemplate(
        "https://api.example.com/{symbol}/quote?s={symbol}",
      ),
    ).toBeNull();
  });

  it("rejects a template with no {symbol} placeholder", () => {
    expect(validateStockUrlTemplate("https://api.example.com/quote")).toContain(
      "{symbol}",
    );
  });

  it("rejects a template that is not a URL at all", () => {
    expect(validateStockUrlTemplate("not a url {symbol}")).toBe(
      "URL template is not a valid URL.",
    );
  });

  it("rejects a javascript: scheme", () => {
    expect(validateStockUrlTemplate("javascript:alert(1)?{symbol}")).toMatch(
      /Unsupported URL scheme/,
    );
  });

  it("rejects a file: scheme", () => {
    expect(validateStockUrlTemplate("file:///etc/{symbol}")).toMatch(
      /Unsupported URL scheme/,
    );
  });

  it("rejects an http: template while the page is served over https", () => {
    vi.stubGlobal("location", { protocol: "https:" });
    expect(validateStockUrlTemplate("http://api.example.com/{symbol}")).toMatch(
      /mixed content/,
    );
  });

  it("allows an http: template while the page itself is http", () => {
    vi.stubGlobal("location", { protocol: "http:" });
    expect(
      validateStockUrlTemplate("http://api.example.com/{symbol}"),
    ).toBeNull();
  });
});

// ── fetchStockData ────────────────────────────────────────────────────────────

describe("fetchStockData", () => {
  it("substitutes {symbol} in the URL template", async () => {
    const mockFetch = stubFetch();

    await fetchStockData("https://api.example.com/quote?symbol={symbol}", [
      "AAPL",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/quote?symbol=AAPL",
      FETCH_INIT,
    );
  });

  it("substitutes every occurrence, not just the first", async () => {
    const mockFetch = stubFetch();

    await fetchStockData("https://api.example.com/{symbol}/quote?s={symbol}", [
      "AAPL",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/AAPL/quote?s=AAPL",
      FETCH_INIT,
    );
  });

  it("percent-encodes a symbol so it cannot alter the URL structure", async () => {
    const mockFetch = stubFetch();

    await fetchStockData("https://api.example.com/quote?s={symbol}", [
      "A&B",
      "BRK.B",
      "X Y",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/quote?s=A%26B",
      FETCH_INIT,
    );
    // A dot is deliberately left alone — it is already URL-safe
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/quote?s=BRK.B",
      FETCH_INIT,
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/quote?s=X%20Y",
      FETCH_INIT,
    );
  });

  it("returns data on a successful response", async () => {
    stubFetch({ price: "123" });

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
    stubFetch({});

    const results = await fetchStockData("https://api/{symbol}", [
      "AAPL",
      "MSFT",
      "GOOG",
    ]);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.symbol)).toEqual(["AAPL", "MSFT", "GOOG"]);
  });

  it("returns an empty array when given no symbols", async () => {
    const mockFetch = stubFetch();

    const results = await fetchStockData("https://api/{symbol}", []);
    expect(results).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── fetchStockData: URL safety ────────────────────────────────────────────────

describe("fetchStockData – URL safety", () => {
  it("refuses a javascript: template without touching the network", async () => {
    const mockFetch = stubFetch();

    const results = await fetchStockData("javascript:alert(1)?{symbol}", [
      "AAPL",
    ]);
    expect(results[0].error).toMatch(/Unsupported URL scheme/);
    expect(results[0].data).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses a file: template without touching the network", async () => {
    const mockFetch = stubFetch();

    const results = await fetchStockData("file:///etc/{symbol}", ["AAPL"]);
    expect(results[0].error).toMatch(/Unsupported URL scheme/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects a template with no placeholder rather than fetching one URL per symbol", async () => {
    const mockFetch = stubFetch();

    const results = await fetchStockData("https://api.example.com/quote", [
      "AAPL",
      "MSFT",
    ]);
    expect(results.map((r) => r.symbol)).toEqual(["AAPL", "MSFT"]);
    expect(results[0].error).toContain("{symbol}");
    expect(results[1].error).toContain("{symbol}");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses an http: template while the page is served over https", async () => {
    const mockFetch = stubFetch();
    vi.stubGlobal("location", { protocol: "https:" });

    const results = await fetchStockData("http://api.example.com/{symbol}", [
      "AAPL",
    ]);
    expect(results[0].error).toMatch(/mixed content/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── fetchStockData: cancellation ──────────────────────────────────────────────

describe("fetchStockData – cancellation", () => {
  it("reports an aborted request as a timeout, not a raw DOMException", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(
          new DOMException("The operation was aborted.", "AbortError"),
        ),
    );

    const results = await fetchStockData("https://api/{symbol}", ["AAPL"]);
    expect(results[0].error).toBe("request timed out — try again");
    expect(results[0].error).not.toContain("DOMException");
  });

  it("reports a TimeoutError the same way", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(
          new DOMException("The operation timed out.", "TimeoutError"),
        ),
    );

    const results = await fetchStockData("https://api/{symbol}", ["AAPL"]);
    expect(results[0].error).toBe("request timed out — try again");
  });

  it("passes the caller's signal through to fetch", async () => {
    const mockFetch = stubFetch();
    const controller = new AbortController();

    await fetchStockData("https://api/{symbol}", ["AAPL"], controller.signal);
    expect(mockFetch).toHaveBeenCalledWith("https://api/AAPL", {
      signal: controller.signal,
      credentials: "omit",
    });
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

// ── describeQuoteBody ─────────────────────────────────────────────────────────

describe("describeQuoteBody", () => {
  it("returns an Alpha Vantage Information notice", () => {
    expect(
      describeQuoteBody({
        Information: "Our standard API rate limit is 25/day",
      }),
    ).toBe("Our standard API rate limit is 25/day");
  });

  it("returns a Note when there is no Information", () => {
    expect(describeQuoteBody({ Note: "Please consider premium" })).toBe(
      "Please consider premium",
    );
  });

  it("returns an Error Message for a missing API key", () => {
    expect(
      describeQuoteBody({
        "Error Message": "the parameter apikey is invalid or missing.",
      }),
    ).toBe("the parameter apikey is invalid or missing.");
  });

  it("falls back to lowercase error and message keys", () => {
    expect(describeQuoteBody({ error: "bad symbol" })).toBe("bad symbol");
    expect(describeQuoteBody({ message: "quota exceeded" })).toBe(
      "quota exceeded",
    );
  });

  it("prefers Information over the later keys", () => {
    expect(describeQuoteBody({ message: "second", Information: "first" })).toBe(
      "first",
    );
  });

  it("collapses whitespace so a wrapped notice stays on one line", () => {
    expect(describeQuoteBody({ Note: "  rate\n  limit \t reached  " })).toBe(
      "rate limit reached",
    );
  });

  it("truncates a very long notice to about 140 characters", () => {
    const long = "x".repeat(400);
    const out = describeQuoteBody({ Information: long });
    expect(out).toHaveLength(140);
    expect(out?.endsWith("…")).toBe(true);
  });

  it("returns undefined when the body carries no message", () => {
    expect(describeQuoteBody({ "Global Quote": { "05. price": "1" } })).toBe(
      undefined,
    );
    expect(describeQuoteBody({ Information: "   " })).toBeUndefined();
    expect(describeQuoteBody({ Note: 42 })).toBeUndefined();
    expect(describeQuoteBody(null)).toBeUndefined();
    expect(describeQuoteBody("Information")).toBeUndefined();
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

  it("quotes the provider's own rate-limit Information verbatim", () => {
    expect(
      describeFetchFailures([
        { symbol: "AAPL", data: { Information: "rate limited" } },
      ]),
    ).toBe("AAPL: rate limited");
  });

  it("quotes an Alpha Vantage Note verbatim", () => {
    expect(
      describeFetchFailures([
        {
          symbol: "AAPL",
          data: { Note: "Thank you for using Alpha Vantage! 5 calls/minute." },
        },
      ]),
    ).toBe("AAPL: Thank you for using Alpha Vantage! 5 calls/minute.");
  });

  it("truncates a long provider message", () => {
    const summary = describeFetchFailures([
      { symbol: "AAPL", data: { Information: "y".repeat(400) } },
    ]);
    expect(summary).toBe(`AAPL: ${"y".repeat(139)}…`);
  });

  it("prefers the transport error over the body", () => {
    expect(
      describeFetchFailures([
        {
          symbol: "AAPL",
          error: "request timed out — try again",
          data: { Information: "rate limited" },
        },
      ]),
    ).toBe("AAPL: request timed out — try again");
  });

  it("falls back to a generic phrase for a body that explains nothing", () => {
    expect(
      describeFetchFailures([{ symbol: "AAPL", data: { "Global Quote": {} } }]),
    ).toBe("AAPL: no price in response");
  });
});
