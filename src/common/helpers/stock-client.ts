/* ==================================================
 * Stock API Client
 * ================================================== */

import type { PortfolioHolding } from "../types/portfolio-types";

/** One per-symbol outcome of fetchStockData — never both data and error. */
export interface StockFetchResult {
  symbol: string;
  data?: unknown;
  error?: string;
}

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
): Promise<StockFetchResult[]> {
  return Promise.all(
    symbols.map(async (symbol) => {
      // Encode the symbol so it cannot alter the URL structure, and only
      // allow http(s) — the template may come from an imported state file.
      const url = urlTemplate.replace(
        "{symbol}",
        encodeURIComponent(symbol.trim()),
      );
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          return {
            symbol,
            error: `Unsupported URL scheme: ${parsed.protocol}`,
          };
        }
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
 * Finds the first quote field whose key contains `word`, looking inside an
 * Alpha Vantage style `Global Quote` object first and then at the top level.
 * A scope whose value fails to parse is skipped so the next scope is tried.
 */
function findQuoteField<T>(
  data: unknown,
  word: string,
  parse: (raw: unknown) => T | undefined,
): T | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const scopes = [(data as Record<string, unknown>)["Global Quote"], data];
  for (const scope of scopes) {
    if (typeof scope !== "object" || scope === null) continue;
    const key = Object.keys(scope).find((k) => k.toLowerCase().includes(word));
    if (key === undefined) continue;
    const value = parse((scope as Record<string, unknown>)[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Extract the quote symbol from a stock API response when present. */
export function extractQuoteSymbol(data: unknown): string | undefined {
  return findQuoteField(
    data,
    "symbol",
    (raw) => normalizeStockSymbol(String(raw)) || undefined,
  );
}

/** Extract a numeric price from a stock quote response. */
export function extractStockPrice(data: unknown): number | undefined {
  return findQuoteField(data, "price", (raw) => {
    const value = parseFloat(String(raw));
    return Number.isNaN(value) ? undefined : value;
  });
}

/**
 * Merges fetched quotes into holdings. Results are matched by the symbol the
 * API echoed back (falling back to the requested one), case-insensitively.
 * The first successful price for a holding also locks its projection start
 * price and date; later fetches only refresh currentPrice. Holdings whose
 * fetch failed or returned no price are left untouched.
 */
export function applyFetchedPrices(
  holdings: PortfolioHolding[],
  results: StockFetchResult[],
  now: Date = new Date(),
): PortfolioHolding[] {
  const priceBySymbol = new Map<string, number>();
  for (const result of results) {
    const price = extractStockPrice(result.data);
    if (price === undefined) continue;
    priceBySymbol.set(
      normalizeStockSymbol(extractQuoteSymbol(result.data) || result.symbol),
      price,
    );
  }
  return holdings.map((h) => {
    const price = priceBySymbol.get(normalizeStockSymbol(h.symbol));
    return price === undefined
      ? h
      : {
          ...h,
          currentPrice: price,
          startPrice: h.startPrice ?? price,
          projectionStartDate: h.projectionStartDate ?? now.toISOString(),
        };
  });
}

/**
 * Summarises the symbols that produced no usable price (HTTP/network error,
 * or a 200 body without a price such as an Alpha Vantage rate-limit notice).
 * Returns null when every symbol succeeded.
 */
export function describeFetchFailures(
  results: StockFetchResult[],
): string | null {
  const failed = results.filter(
    (r) => r.error || extractStockPrice(r.data) === undefined,
  );
  return failed.length
    ? failed
        .map((r) => `${r.symbol}: ${r.error ?? "no price in response"}`)
        .join("; ")
    : null;
}
