/* ==================================================
 * Portfolio Capital Preservation Projection
 * ================================================== */

import { addYears } from "date-fns";
import type {
  PortfolioHolding,
  PortfolioProjection,
  RequiredPricePoint,
} from "../types/portfolio-types";
import { MONTHS_PER_YEAR } from "../constants/app-constants";

/* ==================================================
 * Parameters
 * ================================================== */

export interface ProjectionParams {
  /** Holdings that have a currentPrice set */
  holdings: PortfolioHolding[];
  /** Total portfolio value in USD today */
  totalPortfolioValue: number;
  /** Total monthly withdrawal across the whole portfolio in USD */
  monthlyWithdrawal: number;
  /** Number of years forward to project */
  yearsForward: number;
}

/* ==================================================
 * Projection Calculator
 * ================================================== */

/**
 * For each holding with a known price, computes the required share price at each
 * future year-end such that the holding's value exactly equals its initial allocation
 * value plus all withdrawals drawn from it to that date.
 *
 * Formula (year y):
 *   allocationValue  = totalPortfolioValue × (allocationPct / 100)
 *   shares           = allocationValue / currentPrice
 *   withdrawalShare  = monthlyWithdrawal × (allocationPct / 100)
 *   requiredPrice(y) = (allocationValue + y × 12 × withdrawalShare) / shares
 *                    = currentPrice × (1 + y × 12 × withdrawalShare / allocationValue)
 *
 * Holdings without a currentPrice are skipped.
 */
export function computePortfolioProjection(
  params: ProjectionParams,
): PortfolioProjection {
  const { holdings, totalPortfolioValue, monthlyWithdrawal, yearsForward } =
    params;
  const today = new Date();
  const result: PortfolioProjection = {};

  for (const holding of holdings) {
    if (
      holding.currentPrice == null ||
      holding.currentPrice <= 0 ||
      holding.allocationPct <= 0
    ) {
      continue;
    }

    const allocationValue = totalPortfolioValue * (holding.allocationPct / 100);
    if (allocationValue <= 0) continue;
    const shares = allocationValue / holding.currentPrice;
    const monthlyWithdrawalShare =
      monthlyWithdrawal * (holding.allocationPct / 100);

    const points: RequiredPricePoint[] = [];

    for (let year = 0; year <= yearsForward; year++) {
      const cumulativeWithdrawals =
        year * MONTHS_PER_YEAR * monthlyWithdrawalShare;
      const requiredPrice = (allocationValue + cumulativeWithdrawals) / shares;

      points.push({
        date: addYears(today, year),
        year,
        requiredPrice: Math.max(0, requiredPrice),
      });
    }

    result[holding.symbol] = points;
  }

  return result;
}
