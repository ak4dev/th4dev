import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runMonteCarloSimulation,
  simulateAll,
  computeBands,
  runCombinedSimulation,
  runRolloverSimulation,
  type MonteCarloParams,
} from "../monte-carlo";
import { InvestmentCalculator } from "../investment-growth-calculator";
import type { InvestmentCalculatorProps } from "../../types/types";

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

const zeroVol = (o: Partial<MonteCarloParams> = {}): MonteCarloParams => ({
  ...baseParams,
  volatility: 0,
  simCount: 10,
  ...o,
});

const last = (bands: { p50: number }[]) => bands[bands.length - 1].p50;

// ── parity helpers ────────────────────────────────────────────────────────────

const calcProps = (
  o: Partial<InvestmentCalculatorProps> = {},
): InvestmentCalculatorProps => ({
  currentAmount: "100000",
  projectedGain: 10,
  yearsOfGrowth: 10,
  monthlyContribution: 0,
  monthlyWithdrawal: 0,
  yearWithdrawalsBegin: 0,
  maxMonthlyWithdrawal: 10000,
  depreciationRate: 0,
  advanced: true,
  ...o,
});

/** The same scenario expressed as zero-volatility Monte Carlo params */
const mcFrom = (
  p: InvestmentCalculatorProps,
  showInflation = false,
): MonteCarloParams => ({
  initialAmount: Number(p.currentAmount),
  projectedGain: p.projectedGain,
  yearsOfGrowth: p.yearsOfGrowth,
  monthlyContribution: p.monthlyContribution,
  monthlyWithdrawal: p.monthlyWithdrawal,
  withdrawalStartYear: p.yearWithdrawalsBegin,
  contributionStopYear: p.yearContributionsStop,
  depreciationRate: p.depreciationRate,
  annualFee: p.annualFee,
  dynamicWithdrawal: p.dynamicWithdrawal,
  showInflation,
  volatility: 0,
  simCount: 1,
});

/** Yearly balances from the deterministic engine (index k = end of year k+1) */
const yearly = (p: InvestmentCalculatorProps, showInflation = false) => {
  const calc = new InvestmentCalculator(p);
  calc.calculateGrowth(showInflation);
  return calc.getGrowthMatrix().map((e) => e.y);
};

const expectWithinADollar = (actual: number[], expected: number[]) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) =>
    expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(1),
  );
};

/** MC band i (i >= 1) must equal growthMatrix[i - 1] within a dollar */
const expectParity = (
  overrides: Partial<InvestmentCalculatorProps>,
  showInflation = false,
) => {
  const props = calcProps(overrides);
  const bands = runMonteCarloSimulation(mcFrom(props, showInflation));
  expectWithinADollar(
    bands.slice(1).map((b) => b.p50),
    yearly(props, showInflation),
  );
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 15));
});

afterAll(() => {
  vi.useRealTimers();
});

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

  it("percentiles are ordered: p10 <= p25 <= p50 <= p75 <= p90", () => {
    const bands = runMonteCarloSimulation(baseParams);
    for (const b of bands) {
      expect(b.p10).toBeLessThanOrEqual(b.p25);
      expect(b.p25).toBeLessThanOrEqual(b.p50);
      expect(b.p50).toBeLessThanOrEqual(b.p75);
      expect(b.p75).toBeLessThanOrEqual(b.p90);
    }
  });

  it("zero volatility makes all percentiles identical", () => {
    const bands = runMonteCarloSimulation(zeroVol({ simCount: 100 }));
    for (const b of bands) {
      expect(b.p10).toBe(b.p90);
      expect(b.p25).toBe(b.p75);
    }
  });

  it("higher volatility produces wider bands", () => {
    const narrow = runMonteCarloSimulation({ ...baseParams, volatility: 5 });
    const wide = runMonteCarloSimulation({ ...baseParams, volatility: 25 });
    const spread = (b: typeof narrow) =>
      b[b.length - 1].p90 - b[b.length - 1].p10;
    expect(spread(wide)).toBeGreaterThan(spread(narrow));
  });

  it("completes 500 simulations x 30 years in under 2000ms", () => {
    const start = performance.now();
    runMonteCarloSimulation({ ...baseParams, yearsOfGrowth: 30 });
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("cash-flow timing (0% gain, exact)", () => {
  const flat = (o: Partial<MonteCarloParams>) =>
    last(runMonteCarloSimulation(zeroVol({ projectedGain: 0, ...o })));

  it("withdrawals begin withdrawalStartYear years from today", () => {
    // start 1 over 2 years: 12 withdrawals; start 0.5 over 1 year: 6
    expect(
      flat({
        yearsOfGrowth: 2,
        monthlyWithdrawal: 100,
        withdrawalStartYear: 1,
      }),
    ).toBe(98800);
    expect(
      flat({
        yearsOfGrowth: 1,
        monthlyWithdrawal: 100,
        withdrawalStartYear: 0.5,
      }),
    ).toBe(99400);
  });

  it("contributions stop contributionStopYear years from today", () => {
    expect(
      flat({
        yearsOfGrowth: 2,
        monthlyContribution: 100,
        contributionStopYear: 1,
      }),
    ).toBe(101200);
    expect(
      flat({
        yearsOfGrowth: 2,
        monthlyContribution: 100,
        contributionStopYear: 0.5,
      }),
    ).toBe(100600);
  });

  it("contributes until the horizon when no stop year is set", () => {
    expect(flat({ yearsOfGrowth: 2, monthlyContribution: 100 })).toBe(102400);
  });
});

describe("parity with InvestmentCalculator at zero volatility", () => {
  it("whole-year contribution and withdrawal windows", () => {
    expectParity({
      monthlyContribution: 500,
      yearContributionsStop: 3,
      monthlyWithdrawal: 200,
      yearWithdrawalsBegin: 5,
    });
  });

  it("fractional windows and a fractional horizon", () => {
    expectParity({
      yearsOfGrowth: 10.5,
      monthlyContribution: 500,
      yearContributionsStop: 0.5,
      monthlyWithdrawal: 200,
      yearWithdrawalsBegin: 0.5,
    });
  });

  it("contributions until the horizon", () => {
    expectParity({ monthlyContribution: 500 });
  });

  it("fees and inflation in both display modes", () => {
    const scenario = {
      yearsOfGrowth: 7.5,
      monthlyContribution: 300,
      annualFee: 1,
      depreciationRate: 2.5,
      monthlyWithdrawal: 150,
      yearWithdrawalsBegin: 2,
    };
    expectParity(scenario, false);
    expectParity(scenario, true);
  });

  it("dynamic withdrawals re-evaluated on the path's own balance", () => {
    const scenario = {
      yearsOfGrowth: 10.5,
      monthlyContribution: 200,
      yearContributionsStop: 4,
      annualFee: 0.5,
      depreciationRate: 2.5,
      monthlyWithdrawal: 999,
      yearWithdrawalsBegin: 2,
      dynamicWithdrawal: { ratePct: 6, floor: 550, ceiling: 700 },
    };
    expectParity(scenario, false);
    expectParity(scenario, true);
  });

  it("rollover lands at the same month with the same amount as the calculator", () => {
    for (const [yearsA, yearsB] of [
      [1, 2],
      [0.5, 3],
      [4.5, 10],
      [0, 1],
    ]) {
      const propsA = calcProps({
        yearsOfGrowth: yearsA,
        monthlyContribution: 300,
      });
      const totalA = new InvestmentCalculator(propsA).calculateGrowth(
        false,
      ).numeric;
      const propsB = calcProps({
        currentAmount: "50000",
        yearsOfGrowth: yearsB,
        monthlyContribution: 200,
        depreciationRate: 2.5,
        rollOver: true,
        investmentToRoll: totalA,
        yearOfRollover: yearsA,
      });
      const bands = runRolloverSimulation(
        mcFrom(propsA),
        mcFrom(propsB),
        yearsA,
      );
      const a = yearly(propsA);
      const b = yearly(propsB);
      const expected = b.map((bVal, i) =>
        i + 1 < yearsA ? a[i] + bVal : bVal,
      );
      expect(bands[0].p50).toBe(yearsA === 0 ? 100000 + 50000 : 150000);
      expectWithinADollar(
        bands.slice(1).map((band) => band.p50),
        expected,
      );
    }
  });

  it("rollover in inflation view injects the inflation-adjusted figure once", () => {
    const propsA = calcProps({ yearsOfGrowth: 3, depreciationRate: 10 });
    const calcA = new InvestmentCalculator(propsA);
    const nominal = calcA.calculateGrowth(false).numeric;
    const inflationAdjusted = calcA.calculateGrowth(true).numeric;
    const propsB = calcProps({
      currentAmount: "0",
      projectedGain: 0,
      yearsOfGrowth: 3,
      depreciationRate: 10,
      rollOver: true,
      yearOfRollover: 3,
    });
    const expected = new InvestmentCalculator({
      ...propsB,
      investmentToRoll: { nominal, inflationAdjusted },
    }).calculateGrowth(true).numeric;
    const bands = runRolloverSimulation(
      mcFrom(propsA, true),
      mcFrom(propsB, true),
      3,
    );
    expect(expected).toBe(inflationAdjusted);
    expect(last(bands)).toBe(expected);
  });
});

describe("simulateAll", () => {
  it("returns simCount paths each with yearsOfGrowth + 1 entries", () => {
    const paths = simulateAll({ ...baseParams, simCount: 10 });
    expect(paths).toHaveLength(10);
    for (const p of paths) {
      expect(p).toHaveLength(baseParams.yearsOfGrowth + 1);
      expect(p[0]).toBe(baseParams.initialAmount);
    }
  });
});

describe("seeded randomness", () => {
  it("the same seed reproduces identical bands", () => {
    const a = runMonteCarloSimulation({ ...baseParams, seed: 42 });
    const b = runMonteCarloSimulation({ ...baseParams, seed: 42 });
    expect(a).toEqual(b);
  });

  it("different seeds produce different bands", () => {
    const a = runMonteCarloSimulation({ ...baseParams, seed: 42 });
    const b = runMonteCarloSimulation({ ...baseParams, seed: 43 });
    expect(last(a)).not.toBe(last(b));
  });

  it("combined and rollover simulations are deterministic under a seed", () => {
    const paramsA = { ...baseParams, seed: 7 };
    const paramsB = {
      ...baseParams,
      initialAmount: 50000,
      yearsOfGrowth: 12,
      seed: 7,
    };
    expect(runCombinedSimulation(paramsA, paramsB)).toEqual(
      runCombinedSimulation(paramsA, paramsB),
    );
    expect(runRolloverSimulation(paramsA, paramsB, 10)).toEqual(
      runRolloverSimulation(paramsA, paramsB, 10),
    );
  });

  it("seeded A and B draw independent return sequences", () => {
    const paramsA = { ...baseParams, seed: 7, simCount: 50 };
    const combined = runCombinedSimulation(paramsA, paramsA);
    const doubled = runMonteCarloSimulation(paramsA).map((b) => b.p50 * 2);
    // Perfectly correlated lanes would make the median exactly 2 x A's median
    expect(last(combined)).not.toBe(doubled[doubled.length - 1]);
  });
});

describe("dynamic withdrawal", () => {
  it("ratePct 0 with a floor withdraws the floor and replaces monthlyWithdrawal", () => {
    const dynamic = runMonteCarloSimulation({
      ...baseParams,
      seed: 3,
      monthlyWithdrawal: 999,
      dynamicWithdrawal: { ratePct: 0, floor: 300, ceiling: 1000 },
    });
    const fixed = runMonteCarloSimulation({
      ...baseParams,
      seed: 3,
      monthlyWithdrawal: 300,
    });
    expect(dynamic).toEqual(fixed);
  });

  it("ratePct 0 with no floor withdraws nothing", () => {
    const dynamic = runMonteCarloSimulation({
      ...baseParams,
      seed: 3,
      dynamicWithdrawal: { ratePct: 0, floor: 0, ceiling: 1000 },
    });
    expect(dynamic).toEqual(
      runMonteCarloSimulation({ ...baseParams, seed: 3 }),
    );
  });
});

describe("computeBands", () => {
  it("returns bands matching path length", () => {
    const bands = computeBands(simulateAll({ ...baseParams, simCount: 20 }));
    expect(bands).toHaveLength(baseParams.yearsOfGrowth + 1);
  });

  it("returns empty array for empty paths", () => {
    expect(computeBands([])).toEqual([]);
  });

  it("handles single-simulation input", () => {
    const bands = computeBands([[1000, 1100]]);
    expect(bands).toHaveLength(2);
    expect(bands[0].p50).toBe(1000);
    expect(bands[1].p50).toBe(1100);
  });

  it("is equivalent to runMonteCarloSimulation for same paths", () => {
    const params = zeroVol();
    expect(runMonteCarloSimulation(params)).toEqual(
      computeBands(simulateAll(params)),
    );
  });
});

describe("runCombinedSimulation", () => {
  it("combined bands are sum of A and B at year 0", () => {
    const bands = runCombinedSimulation(
      zeroVol(),
      zeroVol({ initialAmount: 50000 }),
    );
    expect(bands[0].p50).toBe(150000);
  });

  it("uses max of both yearsOfGrowth for band length", () => {
    const bands = runCombinedSimulation(
      zeroVol({ yearsOfGrowth: 5 }),
      zeroVol({ yearsOfGrowth: 10 }),
    );
    expect(bands).toHaveLength(11);
  });

  it("locks A final value after A timeline ends", () => {
    const paramsA = zeroVol({ yearsOfGrowth: 5 });
    const paramsB = zeroVol({ yearsOfGrowth: 10 });
    const bands = runCombinedSimulation(paramsA, paramsB);
    const aFinalValue = runMonteCarloSimulation(paramsA)[5].p50;
    const bValueAt6 = runMonteCarloSimulation(paramsB)[6].p50;
    expect(bands[6].p50).toBe(aFinalValue + bValueAt6);
  });

  it("simulates each lane for its own horizon regardless of slot", () => {
    const short = zeroVol({ yearsOfGrowth: 5, monthlyContribution: 500 });
    const long = zeroVol({ yearsOfGrowth: 10, monthlyContribution: 500 });
    const shortFinal = last(runMonteCarloSimulation(short));
    const longFinal = last(runMonteCarloSimulation(long));
    expect(last(runCombinedSimulation(long, short))).toBe(
      shortFinal + longFinal,
    );
    expect(last(runCombinedSimulation(short, long))).toBe(
      shortFinal + longFinal,
    );
  });

  it("produces wider bands than individual A alone", () => {
    const paramsA = { ...baseParams, simCount: 200 };
    const paramsB = { ...baseParams, initialAmount: 50000, simCount: 200 };
    expect(last(runCombinedSimulation(paramsA, paramsB))).toBeGreaterThan(
      last(runMonteCarloSimulation(paramsA)),
    );
  });
});

describe("runRolloverSimulation", () => {
  it("returns bands of length max(yearA, yearB) + 1", () => {
    const bands = runRolloverSimulation(
      zeroVol({ yearsOfGrowth: 5 }),
      zeroVol({ yearsOfGrowth: 10 }),
      5,
    );
    expect(bands).toHaveLength(11);
  });

  it("year 0 equals sum of both initial amounts", () => {
    const bands = runRolloverSimulation(
      zeroVol({ initialAmount: 80000 }),
      zeroVol({ initialAmount: 20000 }),
      5,
    );
    expect(bands[0].p50).toBe(100000);
  });

  it("rollover compounds exceed constant addition (zero-vol)", () => {
    const paramsA = zeroVol({ yearsOfGrowth: 5 });
    const paramsB = zeroVol({ yearsOfGrowth: 15 });
    expect(last(runRolloverSimulation(paramsA, paramsB, 5))).toBeGreaterThan(
      last(runCombinedSimulation(paramsA, paramsB)),
    );
  });

  it("with same yearsOfGrowth, produces single bloom of correct length", () => {
    const bands = runRolloverSimulation(zeroVol(), zeroVol(), 10);
    expect(bands).toHaveLength(11);
  });

  it("rollover at year 1 adds A's grown value to B at the year-1 checkpoint", () => {
    const paramsA = zeroVol({ initialAmount: 50000, yearsOfGrowth: 1 });
    const paramsB = zeroVol({ initialAmount: 50000, yearsOfGrowth: 5 });
    const bands = runRolloverSimulation(paramsA, paramsB, 1);
    const aAtYear1 = runMonteCarloSimulation(paramsA)[1].p50;
    const bAtYear1 = runMonteCarloSimulation(paramsB)[1].p50;
    expect(bands[1].p50).toBe(aAtYear1 + bAtYear1);
  });

  it("a rollover at year 0 lands before the first month", () => {
    const bands = runRolloverSimulation(
      zeroVol({ initialAmount: 5000, yearsOfGrowth: 0 }),
      zeroVol({ initialAmount: 10000, yearsOfGrowth: 1, projectedGain: 0 }),
      0,
    );
    expect(bands.map((b) => b.p50)).toEqual([15000, 15000]);
  });

  it("a rollover past B's horizon never fires and B keeps its own horizon", () => {
    const paramsA = zeroVol({ yearsOfGrowth: 10, monthlyContribution: 500 });
    const paramsB = zeroVol({ yearsOfGrowth: 5, monthlyContribution: 500 });
    const rollover = runRolloverSimulation(paramsA, paramsB, 10);
    const combined = runCombinedSimulation(paramsA, paramsB);
    expect(rollover).toHaveLength(11);
    expect(rollover).toEqual(combined);
  });
});

describe("Monte Carlo edge cases", () => {
  it("simCount = 1 produces valid bands", () => {
    const bands = runMonteCarloSimulation(zeroVol({ simCount: 1 }));
    expect(bands).toHaveLength(baseParams.yearsOfGrowth + 1);
    expect(bands[0].p10).toBe(bands[0].p90);
  });

  it("zero initial amount and zero contribution stays at zero", () => {
    expect(last(runMonteCarloSimulation(zeroVol({ initialAmount: 0 })))).toBe(
      0,
    );
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

describe("partial (fractional) years", () => {
  it("adds one extra band for the trailing partial year", () => {
    const bands = runMonteCarloSimulation(zeroVol({ yearsOfGrowth: 10.5 }));
    expect(bands).toHaveLength(12);
    for (const b of bands) {
      expect(Number.isFinite(b.p10)).toBe(true);
      expect(Number.isFinite(b.p90)).toBe(true);
    }
  });

  it("partial-year value sits between the floor- and ceil-year values", () => {
    const half = runMonteCarloSimulation(zeroVol({ yearsOfGrowth: 5.5 }));
    const whole = runMonteCarloSimulation(zeroVol({ yearsOfGrowth: 6 }));
    expect(last(half)).toBeGreaterThan(whole[5].p50);
    expect(last(half)).toBeLessThan(whole[6].p50);
  });

  it("combined and rollover simulations with a fractional A horizon stay finite", () => {
    const paramsA = zeroVol({ yearsOfGrowth: 5.5 });
    const paramsB = zeroVol({ yearsOfGrowth: 10 });
    for (const bands of [
      runCombinedSimulation(paramsA, paramsB),
      runRolloverSimulation(paramsA, paramsB, 5.5),
    ]) {
      expect(bands.length).toBeGreaterThan(0);
      for (const b of bands) expect(Number.isFinite(b.p50)).toBe(true);
    }
  });

  it("does not double-count A's balance at the fractional rollover's floor-year checkpoint", () => {
    const paramsA = zeroVol({ simCount: 1 });
    const paramsB = zeroVol({ simCount: 1 });
    const bands = runRolloverSimulation(paramsA, paramsB, 4.5);
    const combinedBands = runCombinedSimulation(paramsA, paramsB);
    // Year 4 is still pre-rollover, so it tracks the plain combined sum
    expect(bands[4].p50).toBe(combinedBands[4].p50);
    // Year 5 is past the rollover point: A's value now compounds inside B
    expect(bands[5].p50).toBeGreaterThan(combinedBands[5].p50);
  });

  it("applies the rollover injection for a rollover year below 1", () => {
    const paramsA = zeroVol({ yearsOfGrowth: 5, simCount: 1 });
    const paramsB = zeroVol({ yearsOfGrowth: 5, simCount: 1 });
    const bands = runRolloverSimulation(paramsA, paramsB, 0.5);
    // By year 1 the rollover has landed, so the balance exceeds B grown alone
    // plus A's un-invested initial amount
    const bPlainInitialGrowth = 100000 * Math.pow(1 + 0.1 / 12, 12);
    expect(bands[1].p50).toBeGreaterThan(
      bPlainInitialGrowth + paramsA.initialAmount,
    );
  });
});
