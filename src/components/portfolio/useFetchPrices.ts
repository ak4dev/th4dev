/* ==================================================
 * Fetch-and-apply Prices Hook
 * ================================================== */

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  applyFetchedPrices,
  describeFetchFailures,
  fetchStockData,
  STOCK_FETCH_TIMEOUT_MS,
  type StockFetchResult,
} from "../../common/helpers/stock-client";
import type { PortfolioHolding } from "../../common/types/portfolio-types";

/**
 * Shared price-fetch flow for the portfolio panel and the stock modal.
 * Prices are merged with a functional update so edits made while the request
 * is in flight are not overwritten by the click-time snapshot. Per-symbol
 * failures (HTTP errors, timeouts, bodies without a price) surface via
 * `error`.
 *
 * Every run owns an AbortController, aborted by the timeout, by a newer run,
 * and by unmount: a stalled API used to leave `loading` true forever with the
 * Fetch button disabled until a reload. Only the newest run writes state — an
 * aborted run still resolves, to per-symbol timeout errors, and those must not
 * overwrite the results of the run that replaced it.
 */
export function useFetchPrices(
  urlTemplate: string,
  setHoldings: Dispatch<SetStateAction<PortfolioHolding[]>>,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      inFlight.current?.abort();
      // Clearing the ref also retires the run: its results land after the
      // panel is gone and must not be pushed into the parent's holdings.
      inFlight.current = null;
    },
    [],
  );

  const fetchPrices = async (
    symbols: string[],
  ): Promise<StockFetchResult[]> => {
    if (!symbols.length) return [];
    inFlight.current?.abort();
    const run = new AbortController();
    inFlight.current = run;
    const isCurrent = () => inFlight.current === run;

    setLoading(true);
    setError(null);
    try {
      const results = await fetchStockData(
        urlTemplate,
        symbols,
        AbortSignal.any([
          run.signal,
          AbortSignal.timeout(STOCK_FETCH_TIMEOUT_MS),
        ]),
      );
      if (!isCurrent()) return [];
      setHoldings((prev) => applyFetchedPrices(prev, results));
      setError(describeFetchFailures(results));
      return results;
    } catch (err) {
      if (!isCurrent()) return [];
      setError(String(err));
      return [];
    } finally {
      // A superseded run leaves the flag to its successor; the newest run
      // always clears it, so no failure mode can strand the button.
      if (isCurrent()) {
        inFlight.current = null;
        setLoading(false);
      }
    }
  };

  return { fetchPrices, loading, error };
}
