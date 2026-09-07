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

describe("computePortfolioProjection - deferred withdrawals", () => {
  const holding = {
    symbol: "VOO",
    allocationPct: 100,
    currentPrice: 500,
  };

  it("requires nothing extra of a holding before withdrawals begin", () => {
    // $500,000 drawn at $4,000/mo, but not for twenty years. The chart used
    // to bill every year from today, demanding a 9.6% gain by next year for
    // spending two decades away and $1,940 a share by year 30 against the
    // $980 its own definition gives.
    const result = computePortfolioProjection({
      holdings: [holding],
      totalPortfolioValue: 500000,
      monthlyWithdrawal: 4000,
      withdrawalStartYear: 20,
      yearsForward: 30,
    });
    const at = (year: number) =>
      result["VOO"].find((p) => p.year === year)?.requiredPrice;

    // Nothing has been drawn yet, so today's price is all the plan needs
    expect(at(0)).toBe(500);
    expect(at(1)).toBe(500);
    expect(at(19)).toBe(500);
    // From year 20 the requirement rises with what is actually withdrawn:
    // ten years of $48,000 over 1,000 shares
    expect(at(20)).toBe(500);
    expect(at(30)).toBe(980);
  });

  it("carries a fractional start year as the slider steps it", () => {
    const result = computePortfolioProjection({
      holdings: [holding],
      totalPortfolioValue: 500000,
      monthlyWithdrawal: 1000,
      withdrawalStartYear: 10.5,
      yearsForward: 12,
    });
    const at = (year: number) =>
      result["VOO"].find((p) => p.year === year)?.requiredPrice;
    expect(at(10)).toBe(500);
    // Half a year of $1,000 over 1,000 shares
    expect(at(11)).toBeCloseTo(506, 6);
    expect(at(12)).toBeCloseTo(518, 6);
  });

  it("bills from today when withdrawals start immediately", () => {
    const result = computePortfolioProjection({
      holdings: [holding],
      totalPortfolioValue: 500000,
      monthlyWithdrawal: 4000,
      withdrawalStartYear: 0,
      yearsForward: 2,
    });
    const at = (year: number) =>
      result["VOO"].find((p) => p.year === year)?.requiredPrice;
    expect(at(0)).toBe(500);
    expect(at(1)).toBe(548);
    expect(at(2)).toBe(596);
  });
});

describe("computePortfolioProjection", () => {
  it("returns empty object when holdings have no currentPrice", () => {
    const result = computePortfolioProjection({
      holdings: [holding({ currentPrice: undefined })],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 100,
      withdrawalStartYear: 0,
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
      withdrawalStartYear: 0,
      yearsForward: 2,
    });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("skips holdings with zero allocationPct", () => {
    const result = computePortfolioProjection({
      holdings: [holding({ allocationPct: 0 })],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 100,
      withdrawalStartYear: 0,
      yearsForward: 2,
    });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("produces yearsForward+1 data points per holding", () => {
    const result = computePortfolioProjection({
      holdings: [holding()],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 100,
      withdrawalStartYear: 0,
      yearsForward: 5,
    });
    expect(result["AAPL"]).toHaveLength(6);
  });

  it("year-0 required price equals the current price", () => {
    const result = computePortfolioProjection({
      holdings: [holding({ currentPrice: 150 })],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 100,
      withdrawalStartYear: 0,
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
      withdrawalStartYear: 0,
      yearsForward: 2,
    });
    expect(result["AAPL"][1].requiredPrice).toBe(112);
  });

  it("required price is non-decreasing with positive withdrawal", () => {
    const result = computePortfolioProjection({
      holdings: [holding()],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 200,
      withdrawalStartYear: 0,
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
      withdrawalStartYear: 0,
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
      withdrawalStartYear: 0,
      yearsForward: 4,
    });
    result["AAPL"].forEach((pt, i) => {
      expect(pt.year).toBe(i);
    });
  });
});

// ── additional edge cases ─────────────────────────────────────────────────────

describe("computePortfolioProjection – edge cases", () => {
  it("multiple holdings with allocations summing to 100%", () => {
    const result = computePortfolioProjection({
      holdings: [
        holding({ symbol: "AAPL", allocationPct: 50, currentPrice: 100 }),
        holding({ symbol: "MSFT", allocationPct: 30, currentPrice: 200 }),
        holding({ symbol: "GOOG", allocationPct: 20, currentPrice: 150 }),
      ],
      totalPortfolioValue: 100000,
      monthlyWithdrawal: 500,
      withdrawalStartYear: 0,
      yearsForward: 3,
    });
    expect(Object.keys(result)).toHaveLength(3);
    expect(result["AAPL"]).toHaveLength(4);
    expect(result["MSFT"]).toHaveLength(4);
    expect(result["GOOG"]).toHaveLength(4);
    // Year-0 required prices match current prices
    expect(result["AAPL"][0].requiredPrice).toBe(100);
    expect(result["MSFT"][0].requiredPrice).toBe(200);
    expect(result["GOOG"][0].requiredPrice).toBe(150);
  });

  it("year-0 requiredPrice equals currentPrice exactly", () => {
    const result = computePortfolioProjection({
      holdings: [holding({ currentPrice: 42.5 })],
      totalPortfolioValue: 5000,
      monthlyWithdrawal: 200,
      withdrawalStartYear: 0,
      yearsForward: 5,
    });
    expect(result["AAPL"][0].requiredPrice).toBe(42.5);
  });

  it("zero monthlyWithdrawal keeps requiredPrice constant across all years", () => {
    const result = computePortfolioProjection({
      holdings: [holding({ currentPrice: 100 })],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 0,
      withdrawalStartYear: 0,
      yearsForward: 10,
    });
    const prices = result["AAPL"].map((p) => p.requiredPrice);
    prices.forEach((p) => expect(p).toBe(100));
  });

  it("skips holdings with negative allocationPct", () => {
    const result = computePortfolioProjection({
      holdings: [holding({ allocationPct: -50 })],
      totalPortfolioValue: 10000,
      monthlyWithdrawal: 100,
      withdrawalStartYear: 0,
      yearsForward: 2,
    });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("skips holdings when totalPortfolioValue is zero", () => {
    const result = computePortfolioProjection({
      holdings: [holding()],
      totalPortfolioValue: 0,
      monthlyWithdrawal: 100,
      withdrawalStartYear: 0,
      yearsForward: 2,
    });
    expect(Object.keys(result)).toHaveLength(0);
  });
});
