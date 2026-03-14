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
