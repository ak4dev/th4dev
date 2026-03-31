import { describe, it, expect } from "vitest";
import {
  runMonteCarloSimulation,
  type MonteCarloParams,
  type PercentileBand,
} from "../monte-carlo";

const baseParams: MonteCarloParams = {
  initialAmount: 100000,
  projectedGain: 10,
  yearsOfGrowth: 10,
  monthlyContribution: 0,
  monthlyWithdrawal: 0,
  withdrawalStartYear: 0,
  depreciationRate: 0,
  showInflation: false,
  volatility: 12,
  simCount: 500,
};

describe("Monte Carlo simulation", () => {
  it("returns one band per year (inclusive)", () => {
    const bands = runMonteCarloSimulation(baseParams);
    expect(bands).toHaveLength(baseParams.yearsOfGrowth + 1);
  });

  it("year 0 band equals the initial amount", () => {
    const bands = runMonteCarloSimulation(baseParams);
    expect(bands[0].p10).toBe(baseParams.initialAmount);
    expect(bands[0].p50).toBe(baseParams.initialAmount);
    expect(bands[0].p90).toBe(baseParams.initialAmount);
  });

  it("percentiles are ordered: p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90", () => {
    const bands = runMonteCarloSimulation(baseParams);
    for (const b of bands) {
      expect(b.p10).toBeLessThanOrEqual(b.p25);
      expect(b.p25).toBeLessThanOrEqual(b.p50);
      expect(b.p50).toBeLessThanOrEqual(b.p75);
      expect(b.p75).toBeLessThanOrEqual(b.p90);
    }
  });

  it("zero volatility makes all percentiles identical", () => {
    const bands = runMonteCarloSimulation({
      ...baseParams,
      volatility: 0,
      simCount: 100,
    });
    for (const b of bands) {
      expect(b.p10).toBe(b.p90);
    }
  });

  it("higher volatility produces wider bands", () => {
    const narrow = runMonteCarloSimulation({
      ...baseParams,
      volatility: 5,
      simCount: 500,
    });
    const wide = runMonteCarloSimulation({
      ...baseParams,
      volatility: 25,
      simCount: 500,
    });

    // Compare spread at the final year
    const narrowSpread =
      narrow[narrow.length - 1].p90 - narrow[narrow.length - 1].p10;
    const wideSpread =
      wide[wide.length - 1].p90 - wide[wide.length - 1].p10;

    expect(wideSpread).toBeGreaterThan(narrowSpread);
  });

  it("completes 500 simulations × 30 years in under 200ms", () => {
    const start = performance.now();
    runMonteCarloSimulation({
      ...baseParams,
      yearsOfGrowth: 30,
      simCount: 500,
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

  it("handles contributions correctly across simulations", () => {
    const bands = runMonteCarloSimulation({
      ...baseParams,
      monthlyContribution: 500,
      volatility: 0,
      simCount: 10,
    });
    // With contributions and 0 volatility, final should exceed initial significantly
    const final = bands[bands.length - 1].p50;
    expect(final).toBeGreaterThan(baseParams.initialAmount + 500 * 12 * 10 * 0.8);
  });
});
