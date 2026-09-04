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

/** The token a URL template carries once per place the ticker has to appear. */
const SYMBOL_PLACEHOLDER = "{symbol}";

/** How long one quote request may run before the caller aborts it. */
export const STOCK_FETCH_TIMEOUT_MS = 15_000;

/** Shown for a request the caller aborted — a timeout, or leaving the panel. */
const TIMEOUT_MESSAGE = "request timed out — try again";

/**
 * Checks a URL template before any request leaves the browser.  The template
 * can arrive from an imported state file, so this is a trust boundary rather
 * than a convenience, and it lives here rather than in a form because two
 * separate Fetch buttons share this client.
 *
 * Rejected: a scheme other than http(s) (`javascript:`, `file:`), a template
 * that is not a URL at all, a template with no `{symbol}` (which would fire
 * one identical request per holding), and an `http:` endpoint while the page
 * itself is served over https — the browser blocks that as mixed content and
 * reports only the unhelpful "Failed to fetch".
 *
 * @returns the reason the template is unusable, or null when it is usable
 */
export function validateStockUrlTemplate(template: string): string | null {
  if (!template.includes(SYMBOL_PLACEHOLDER))
    return `URL template must contain ${SYMBOL_PLACEHOLDER}, or every symbol would request the same URL.`;

  let parsed: URL;
  try {
    // Substitute a harmless ticker so the placeholder braces, which are not
    // legal URL characters everywhere, cannot be what makes parsing fail.
    parsed = new URL(template.replaceAll(SYMBOL_PLACEHOLDER, "X"));
  } catch {
    return "URL template is not a valid URL.";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    return `Unsupported URL scheme: ${parsed.protocol} — use an http(s) endpoint.`;

  // `location` is absent under the node test environment.
  if (
    parsed.protocol === "http:" &&
    typeof location !== "undefined" &&
    location.protocol === "https:"
  )
    return "This page is served over https, so the browser blocks an http: request as mixed content. Use an https: endpoint.";

  return null;
}

/**
 * Fetches stock data for each symbol by substituting `{symbol}` in the URL
 * template — every occurrence, so an API that wants the ticker in both path
 * and query works.  Compatible with any REST stock API (e.g. Alpha Vantage,
 * Finnhub).
 *
 * Alpha Vantage example (free tier, no CC required):
 *   https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey=YOUR_KEY
 *   Get a free key at https://www.alphavantage.co/support/#api-key
 *
 * Never rejects: every failure, an abort included, is reported against the
 * symbol it belongs to, so a caller's own catch would never fire.
 *
 * @param urlTemplate - URL with `{symbol}` placeholder
 * @param symbols     - List of ticker symbols
 * @param signal      - Aborts the requests (caller-owned timeout, unmount)
 * @returns Array of { symbol, data } results or { symbol, error } on failure
 */
export async function fetchStockData(
  urlTemplate: string,
  symbols: string[],
  signal?: AbortSignal,
): Promise<StockFetchResult[]> {
  const templateError = validateStockUrlTemplate(urlTemplate);
  if (templateError !== null)
    return symbols.map((symbol) => ({ symbol, error: templateError }));

  return Promise.all(
    symbols.map(async (symbol) => {
      // Encode the symbol so it cannot alter the URL structure.  The template
      // is already known to parse, and percent-encoding only emits characters
      // that are legal wherever the placeholder sat, so the result still does.
      const url = urlTemplate.replaceAll(
        SYMBOL_PLACEHOLDER,
        encodeURIComponent(symbol.trim()),
      );
      try {
        const res = await fetch(url, { signal, credentials: "omit" });
        if (!res.ok)
          return { symbol, error: `HTTP ${res.status}: ${res.statusText}` };
        const data: unknown = await res.json();
        return { symbol, data };
      } catch (err) {
        // Mapped here, not in the caller: this function resolves rather than
        // rejects, so an abort would otherwise reach the user as the raw
        // "DOMException: signal is aborted without reason".
        if (
          err instanceof DOMException &&
          (err.name === "AbortError" || err.name === "TimeoutError")
        )
          return { symbol, error: TIMEOUT_MESSAGE };
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

/** Top-level keys providers use to say why a 200 body carries no quote. */
const QUOTE_MESSAGE_KEYS = [
  "Information",
  "Note",
  "Error Message",
  "error",
  "message",
] as const;

/** Providers are wordy — enough of the sentence to act on, per symbol. */
const MAX_PROVIDER_MESSAGE = 140;

/**
 * The provider's own explanation for a response that carries no price: an
 * Alpha Vantage rate-limit `Note`/`Information`, or the `Error Message` that
 * names a missing API key.  Whitespace-collapsed and truncated so several
 * symbols still fit one error line.
 */
export function describeQuoteBody(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const body = data as Record<string, unknown>;
  for (const key of QUOTE_MESSAGE_KEYS) {
    const raw = body[key];
    if (typeof raw !== "string") continue;
    const text = raw.replace(/\s+/g, " ").trim();
    if (text === "") continue;
    return text.length > MAX_PROVIDER_MESSAGE
      ? `${text.slice(0, MAX_PROVIDER_MESSAGE - 1).trimEnd()}…`
      : text;
  }
  return undefined;
}

/**
 * Summarises the symbols that produced no usable price.  A 200 body without a
 * price is the common case (a rate limit, an unset API key), and the provider
 * already says why in that body — quote it rather than replacing it with
 * "no price in response", which is true but never actionable.
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
        .map(
          (r) =>
            `${r.symbol}: ${r.error ?? describeQuoteBody(r.data) ?? "no price in response"}`,
        )
        .join("; ")
    : null;
}
