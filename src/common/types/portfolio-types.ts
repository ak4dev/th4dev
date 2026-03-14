/* ==================================================
 * Portfolio Types
 * ================================================== */

/**
 * A single holding in the user's stock portfolio.
 * Allocation percentages across all holdings should sum to 100.
 */
export interface PortfolioHolding {
  /** Ticker symbol (e.g. "AAPL") */
  symbol: string;
  /** Percentage of total portfolio value allocated to this holding (0–100) */
  allocationPct: number;
  /** Most recently fetched price per share in USD */
  currentPrice?: number;
}

/**
 * A single point on the required-price projection curve for one holding.
 */
export interface RequiredPricePoint {
  /** Future date for this projection point */
  date: Date;
  /** Year offset from today (0 = current year) */
  year: number;
  /** The price per share required on this date to preserve initial capital */
  requiredPrice: number;
}

/**
 * Projection results keyed by ticker symbol.
 */
export type PortfolioProjection = Record<string, RequiredPricePoint[]>;
