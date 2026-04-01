/* ==================================================
 * Stock API Client
 * ================================================== */

/**
 * Fetches stock data for each symbol by substituting `{symbol}` in the URL template.
 * Compatible with any REST stock API (e.g. Alpha Vantage, Finnhub).
 *
 * Alpha Vantage example (free tier, no CC required):
 *   https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey=YOUR_KEY
 *   Get a free key at https://www.alphavantage.co/support/#api-key
 *
 * @param urlTemplate - URL with `{symbol}` placeholder
 * @param symbols     - List of ticker symbols
 * @returns Array of { symbol, data } results or { symbol, error } on failure
 */
export async function fetchStockData(
  urlTemplate: string,
  symbols: string[],
): Promise<{ symbol: string; data?: unknown; error?: string }[]> {
  return Promise.all(
    symbols.map(async (symbol) => {
      const url = urlTemplate.replace("{symbol}", symbol.trim());
      try {
        const res = await fetch(url);
        if (!res.ok)
          return { symbol, error: `HTTP ${res.status}: ${res.statusText}` };
        const data: unknown = await res.json();
        return { symbol, data };
      } catch (err) {
        return { symbol, error: String(err) };
      }
    }),
  );
}

/**
 * Normalize ticker symbols for matching across imported state, UI input, and
 * API responses that may differ in case or surrounding whitespace.
 */
export function normalizeStockSymbol(symbol: string | undefined): string {
  return (symbol ?? "").trim().toUpperCase();
}

/**
 * Extract the quote symbol from a stock API response when present.
 */
export function extractQuoteSymbol(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;

  const globalQuote = (data as Record<string, unknown>)["Global Quote"];
  if (typeof globalQuote === "object" && globalQuote !== null) {
    const symbolKey = Object.keys(globalQuote).find((k) =>
      k.toLowerCase().includes("symbol"),
    );
    if (symbolKey) {
      const symbol = normalizeStockSymbol(
        String((globalQuote as Record<string, unknown>)[symbolKey]),
      );
      if (symbol) return symbol;
    }
  }

  const topLevelSymbolKey = Object.keys(data).find((k) =>
    k.toLowerCase().includes("symbol"),
  );
  if (topLevelSymbolKey) {
    const symbol = normalizeStockSymbol(
      String((data as Record<string, unknown>)[topLevelSymbolKey]),
    );
    if (symbol) return symbol;
  }

  return undefined;
}

/**
 * Extract a numeric price from a stock quote response.
 */
export function extractStockPrice(data: unknown): number | undefined {
  if (typeof data !== "object" || data === null) return undefined;

  const globalQuote = (data as Record<string, unknown>)["Global Quote"];
  if (typeof globalQuote === "object" && globalQuote !== null) {
    const priceKey = Object.keys(globalQuote).find((k) =>
      k.toLowerCase().includes("price"),
    );
    if (priceKey) {
      const value = parseFloat(
        String((globalQuote as Record<string, unknown>)[priceKey]),
      );
      if (!Number.isNaN(value)) return value;
    }
  }

  const topLevelPriceKey = Object.keys(data).find((k) =>
    k.toLowerCase().includes("price"),
  );
  if (topLevelPriceKey) {
    const value = parseFloat(
      String((data as Record<string, unknown>)[topLevelPriceKey]),
    );
    if (!Number.isNaN(value)) return value;
  }

  return undefined;
}
