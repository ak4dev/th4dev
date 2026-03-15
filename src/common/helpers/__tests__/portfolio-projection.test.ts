import { describe, it, expect } from "vitest";
import { computePortfolioProjection } from "../portfolio-projection";
import type { PortfolioHolding } from "../../types/portfolio-types";

const holding = (
  overrides: Partial<PortfolioHolding> & { symbol?: string } = {},
): PortfolioHolding => ({
  symbol: "AAPL",
  allocationPct: 100,
  currentPrice: 100,
  ...overrides,
});

describe("computePortfolioProjection", () => {
  it("returns empty object when holdings have no currentPrice", () => {
    const result = computePortfolioProjection({
      holdings: [holding({ currentPrice: undefined })],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 100,
      yearsForward: 5,
    });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("skips holdings with zero or negative currentPrice", () => {
    const result = computePortfolioProjection({
      holdings: [
        holding({ currentPrice: 0 }),
        holding({ symbol: "MSFT", currentPrice: -5 }),
      ],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 100,
      yearsForward: 2,
    });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("skips holdings with zero allocationPct", () => {
    const result = computePortfolioProjection({
      holdings: [holding({ allocationPct: 0 })],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 100,
      yearsForward: 2,
    });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("produces yearsForward+1 data points per holding", () => {
    const result = computePortfolioProjection({
      holdings: [holding()],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 100,
      yearsForward: 5,
    });
    expect(result["AAPL"]).toHaveLength(6);
  });

  it("year-0 required price equals the current price", () => {
    const result = computePortfolioProjection({
      holdings: [holding({ currentPrice: 150 })],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 100,
      yearsForward: 3,
    });
    expect(result["AAPL"][0].requiredPrice).toBe(150);
  });

  // Formula: requiredPrice(y) = currentPrice × (1 + y×12×withdrawalShare / allocationValue)
  // With 100% allocation, $10 000 portfolio, $100/month withdrawal, $100 price:
  //   allocationValue = 10000, shares = 100, monthlyWithdrawalShare = 100
  //   year 1: (10000 + 1×12×100) / 100 = 11200 / 100 = 112
  it("year-1 required price matches formula", () => {
    const result = computePortfolioProjection({
      holdings: [holding({ currentPrice: 100, allocationPct: 100 })],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 100,
      yearsForward: 2,
    });
    expect(result["AAPL"][1].requiredPrice).toBe(112);
  });

  it("required price is non-decreasing with positive withdrawal", () => {
    const result = computePortfolioProjection({
      holdings: [holding()],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 200,
      yearsForward: 10,
    });
    const prices = result["AAPL"].map((p) => p.requiredPrice);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  it("handles multiple holdings independently", () => {
    const result = computePortfolioProjection({
      holdings: [
        holding({ symbol: "AAPL", allocationPct: 60, currentPrice: 100 }),
        holding({ symbol: "GOOG", allocationPct: 40, currentPrice: 200 }),
      ],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 100,
      yearsForward: 3,
    });
    expect(result["AAPL"]).toHaveLength(4);
    expect(result["GOOG"]).toHaveLength(4);
    // Year-0 required prices equal their respective current prices
    expect(result["AAPL"][0].requiredPrice).toBe(100);
    expect(result["GOOG"][0].requiredPrice).toBe(200);
  });

  it("year property on each point matches its index", () => {
    const result = computePortfolioProjection({
      holdings: [holding()],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 50,
      yearsForward: 4,
    });
    result["AAPL"].forEach((pt, i) => {
      expect(pt.year).toBe(i);
    });
  });
});
