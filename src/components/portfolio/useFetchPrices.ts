/* ==================================================
 * Fetch-and-apply Prices Hook
 * ================================================== */

import { useState, type Dispatch, type SetStateAction } from "react";
import {
  applyFetchedPrices,
  describeFetchFailures,
  fetchStockData,
  type StockFetchResult,
} from "../../common/helpers/stock-client";
import type { PortfolioHolding } from "../../common/types/portfolio-types";

/**
 * Shared price-fetch flow for the portfolio panel and the stock modal.
 * Prices are merged with a functional update so edits made while the request
 * is in flight are not overwritten by the click-time snapshot. Per-symbol
 * failures (HTTP errors, bodies without a price) are surfaced via `error`.
 */
export function useFetchPrices(
  urlTemplate: string,
  setHoldings: Dispatch<SetStateAction<PortfolioHolding[]>>,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrices = async (
    symbols: string[],
  ): Promise<StockFetchResult[]> => {
    if (!symbols.length) return [];
    setLoading(true);
    setError(null);
    try {
      const results = await fetchStockData(urlTemplate, symbols);
      setHoldings((prev) => applyFetchedPrices(prev, results));
      setError(describeFetchFailures(results));
      return results;
    } catch (err) {
      setError(String(err));
      return [];
    } finally {
      setLoading(false);
    }
  };

  return { fetchPrices, loading, error };
}
