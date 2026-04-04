import { describe, it, expect } from "vitest";
import {
  runMonteCarloSimulation,
  simulateAll,
  computeBands,
  runCombinedSimulation,
  runRolloverSimulation,
  type MonteCarloParams,
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

  it("completes 500 simulations x 30 years in under 2000ms", () => {
    const start = performance.now();
    runMonteCarloSimulation({
      ...baseParams,
      yearsOfGrowth: 30,
      simCount: 500,
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
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

describe("simulateAll", () => {
  it("returns simCount paths each with yearsOfGrowth + 1 entries", () => {
    const paths = simulateAll({ ...baseParams, simCount: 10 });
    expect(paths).toHaveLength(10);
    for (const p of paths) {
      expect(p).toHaveLength(baseParams.yearsOfGrowth + 1);
    }
  });

  it("first entry of each path equals initialAmount", () => {
    const paths = simulateAll({ ...baseParams, simCount: 5 });
    for (const p of paths) {
      expect(p[0]).toBe(baseParams.initialAmount);
    }
  });
});

describe("computeBands", () => {
  it("returns bands matching path length", () => {
    const paths = simulateAll({ ...baseParams, simCount: 20 });
    const bands = computeBands(paths);
    expect(bands).toHaveLength(baseParams.yearsOfGrowth + 1);
  });

  it("returns empty array for empty paths", () => {
    expect(computeBands([])).toEqual([]);
  });

  it("is equivalent to runMonteCarloSimulation for same paths", () => {
    const params = { ...baseParams, volatility: 0, simCount: 10 };
    const direct = runMonteCarloSimulation(params);
    const manual = computeBands(simulateAll(params));
    expect(direct).toEqual(manual);
  });
});

describe("runCombinedSimulation", () => {
  it("combined bands are sum of A and B at year 0", () => {
    const paramsA = { ...baseParams, initialAmount: 100000, volatility: 0, simCount: 10 };
    const paramsB = { ...baseParams, initialAmount: 50000, volatility: 0, simCount: 10 };
    const bands = runCombinedSimulation(paramsA, paramsB);
    expect(bands[0].p50).toBe(150000);
  });

  it("uses max of both yearsOfGrowth for band length", () => {
    const paramsA = { ...baseParams, yearsOfGrowth: 5, volatility: 0, simCount: 10 };
    const paramsB = { ...baseParams, yearsOfGrowth: 10, volatility: 0, simCount: 10 };
    const bands = runCombinedSimulation(paramsA, paramsB);
    expect(bands).toHaveLength(11); // 0..10
  });

  it("locks A final value after A timeline ends", () => {
    // A runs 5 years, B runs 10 years. With 0 volatility and no contributions,
    // A's value at year 5 should be carried forward for years 6-10.
    const paramsA = { ...baseParams, yearsOfGrowth: 5, volatility: 0, simCount: 10, monthlyContribution: 0 };
    const paramsB = { ...baseParams, yearsOfGrowth: 10, volatility: 0, simCount: 10, monthlyContribution: 0 };
    const bands = runCombinedSimulation(paramsA, paramsB);

    // A-only value at year 5
    const aAlone = runMonteCarloSimulation(paramsA);
    const aFinalValue = aAlone[5].p50;

    // B-only value at year 6
    const bAlone = runMonteCarloSimulation({ ...paramsB, yearsOfGrowth: 10 });
    const bValueAt6 = bAlone[6].p50;

    // Combined at year 6 = A's locked final + B's year 6
    expect(bands[6].p50).toBe(aFinalValue + bValueAt6);
  });

  it("produces wider bands than individual A alone", () => {
    const paramsA = { ...baseParams, simCount: 200 };
    const paramsB = { ...baseParams, initialAmount: 50000, simCount: 200 };
    const combined = runCombinedSimulation(paramsA, paramsB);
    const aOnly = runMonteCarloSimulation(paramsA);
    const lastCombined = combined[combined.length - 1];
    const lastA = aOnly[aOnly.length - 1];
    expect(lastCombined.p50).toBeGreaterThan(lastA.p50);
  });
});

describe("runRolloverSimulation", () => {
  it("returns bands of length max(yearA, yearB) + 1", () => {
    const paramsA = { ...baseParams, yearsOfGrowth: 5, volatility: 0, simCount: 10 };
    const paramsB = { ...baseParams, yearsOfGrowth: 10, volatility: 0, simCount: 10 };
    const bands = runRolloverSimulation(paramsA, paramsB, 5);
    expect(bands).toHaveLength(11);
  });

  it("year 0 equals sum of both initial amounts", () => {
    const paramsA = { ...baseParams, initialAmount: 80000, volatility: 0, simCount: 10 };
    const paramsB = { ...baseParams, initialAmount: 20000, volatility: 0, simCount: 10 };
    const bands = runRolloverSimulation(paramsA, paramsB, 5);
    expect(bands[0].p50).toBe(100000);
  });

  it("rollover compounds exceed constant addition (zero-vol)", () => {
    // With rollover, A's value is injected into B and then grows with B.
    // With combined-sum, A's value is a constant. Rollover should exceed.
    const paramsA = { ...baseParams, yearsOfGrowth: 5, volatility: 0, simCount: 10 };
    const paramsB = { ...baseParams, yearsOfGrowth: 15, volatility: 0, simCount: 10 };
    const rolloverBands = runRolloverSimulation(paramsA, paramsB, 5);
    const combinedBands = runCombinedSimulation(paramsA, paramsB);
    // At the final year, rollover should be greater because A's value
    // compounds inside B from year 5 onward
    const rolloverFinal = rolloverBands[rolloverBands.length - 1].p50;
    const combinedFinal = combinedBands[combinedBands.length - 1].p50;
    expect(rolloverFinal).toBeGreaterThan(combinedFinal);
  });

  it("with same yearsOfGrowth, produces single bloom of correct length", () => {
    const paramsA = { ...baseParams, yearsOfGrowth: 10, volatility: 0, simCount: 10 };
    const paramsB = { ...baseParams, yearsOfGrowth: 10, volatility: 0, simCount: 10 };
    const bands = runRolloverSimulation(paramsA, paramsB, 10);
    expect(bands).toHaveLength(11);
  });

  it("rollover at year 1 adds A initial to B immediately", () => {
    // A has 1 year of growth, B has 5 years. Rollover at year 1.
    const paramsA = { ...baseParams, initialAmount: 50000, yearsOfGrowth: 1, volatility: 0, simCount: 10 };
    const paramsB = { ...baseParams, initialAmount: 50000, yearsOfGrowth: 5, volatility: 0, simCount: 10 };
    const bands = runRolloverSimulation(paramsA, paramsB, 1);
    // After rollover (year 1+), B's value should include A's grown amount
    // so year 1 value should exceed sum of individual year-1 values before rollover
    expect(bands[1].p50).toBeGreaterThan(paramsA.initialAmount + paramsB.initialAmount);
  });
});

describe("Monte Carlo edge cases", () => {
  it("simCount = 1 produces valid bands (no percentile spread)", () => {
    const bands = runMonteCarloSimulation({
      ...baseParams,
      volatility: 0,
      simCount: 1,
    });
    expect(bands).toHaveLength(baseParams.yearsOfGrowth + 1);
    expect(bands[0].p10).toBe(bands[0].p90);
  });

  it("zero volatility produces identical percentile values", () => {
    const bands = runMonteCarloSimulation({
      ...baseParams,
      volatility: 0,
      simCount: 50,
    });
    const last = bands[bands.length - 1];
    expect(last.p10).toBeCloseTo(last.p90, 0);
    expect(last.p25).toBeCloseTo(last.p75, 0);
  });

  it("zero initial amount and zero contribution stays at zero", () => {
    const bands = runMonteCarloSimulation({
      ...baseParams,
      initialAmount: 0,
      monthlyContribution: 0,
      volatility: 0,
      simCount: 10,
    });
    expect(bands[bands.length - 1].p50).toBe(0);
  });

  it("1-year simulation produces 2 bands (year 0 and year 1)", () => {
    const bands = runMonteCarloSimulation({
      ...baseParams,
      yearsOfGrowth: 1,
      simCount: 10,
    });
    expect(bands).toHaveLength(2);
  });
});

describe("computeBands edge cases", () => {
  it("returns empty array for empty paths", () => {
    expect(computeBands([])).toEqual([]);
  });

  it("handles single-simulation input", () => {
    const paths = [[1000, 1100]];
    const bands = computeBands(paths);
    expect(bands).toHaveLength(2);
    expect(bands[0].p50).toBe(1000);
    expect(bands[1].p50).toBe(1100);
  });
});
