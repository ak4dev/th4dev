import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  runMonteCarloSimulation,
  simulateAll,
  computeBands,
  checkpointMonths,
  runCombinedSimulation,
  runIndividualSimulations,
  runRolloverSimulation,
  returnDraw,
  pairedReturnDraws,
  makeRandom,
  CLUSTERED_CALIBRATION,
  LANE_CORRELATION,
  type MonteCarloParams,
} from "../monte-carlo";
import { RETURN_MODELS } from "../../types/types";
import type { ReturnModel } from "../../types/types";
import { InvestmentCalculator } from "../investment-growth-calculator";
import type {
  DisplayTrack,
  InvestmentCalculatorProps,
  PlanInputs,
} from "../../types/types";

const basePlan: PlanInputs = {
  initialAmount: 100000,
  projectedGain: 10,
  yearsOfGrowth: 10,
  monthlyContribution: 0,
  monthlyWithdrawal: 0,
  withdrawalStartYear: 0,
  inflationPct: 0,
};

const baseParams: MonteCarloParams = {
  ...basePlan,
  volatility: 12,
  simCount: 500,
  // Seeded so the whole suite is reproducible; individual cases override it
  seed: 1,
};

const zeroVol = (o: Partial<MonteCarloParams> = {}): MonteCarloParams => ({
  ...baseParams,
  volatility: 0,
  simCount: 10,
  ...o,
});

/**
 * Mean, sd, skew, excess kurtosis, lag-1 autocorrelation, and the same
 * autocorrelation on |x - mean|.
 *
 * At module scope because two suites read it: "return models" measures a lane
 * simulated alone, and "two accounts, one market" measures the same lane
 * leading and following a pair. Sharing the estimator is what lets the second
 * suite assert the FIRST one's bounds unchanged, which is the whole claim -
 * a correlation must leave each lane's own distribution where it found it.
 */
const shape = (values: number[]) => {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const skew = values.reduce((s, v) => s + (v - mean) ** 3, 0) / n / sd ** 3;
  const auto = (xs: number[]) => {
    const m = xs.reduce((s, v) => s + v, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
    let cov = 0;
    for (let i = 1; i < xs.length; i++) cov += (xs[i] - m) * (xs[i - 1] - m);
    return cov / (xs.length - 1) / v;
  };
  return {
    mean,
    sd,
    skew,
    exKurt:
      values.reduce((s, v) => s + (v - mean) ** 4, 0) / n / variance ** 2 - 3,
    ac1: auto(values),
    // Autocorrelation of the ABSOLUTE deviation: this is what "clustering"
    // means. A market can have no memory of its direction (ac1 ~ 0) while
    // very much having a memory of how violent it is.
    acAbs: auto(values.map((v) => Math.abs(v - mean))),
  };
};

const last = (bands: { p50: number }[]) => bands[bands.length - 1].p50;

// ── parity helpers ─────────────────────────────────────────────────────

const calcProps = (o: Partial<PlanInputs> = {}): PlanInputs => ({
  ...basePlan,
  ...o,
});

/**
 * The same scenario expressed as zero-volatility Monte Carlo params.
 *
 * There is nothing to translate any more: ONE plan shape feeds both engines,
 * so the whole adapter is a spread plus the two settings only a simulated run
 * needs. Every earlier version of this helper renamed four fields by hand,
 * which is exactly where a lane could be handed different cash flows by the
 * two engines.
 */
const mcFrom = (p: PlanInputs): MonteCarloParams => ({
  ...p,
  volatility: 0,
  simCount: 1,
});

/** Yearly balances from the deterministic engine (index k = end of year k+1) */
const yearly = (p: PlanInputs, track: DisplayTrack = "nominal") => {
  const calc = new InvestmentCalculator(p);
  calc.calculateGrowth();
  return calc.getGrowthMatrix().map((e) => e[track]);
};

const expectWithinADollar = (actual: number[], expected: number[]) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) =>
    expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(1),
  );
};

/** MC band i (i >= 1) must equal growthMatrix[i - 1] within a dollar */
const expectParity = (
  overrides: Partial<PlanInputs>,
  track: DisplayTrack = "nominal",
) => {
  const plan = calcProps(overrides);
  const bands = runMonteCarloSimulation(mcFrom(plan), track);
  expectWithinADollar(
    bands.slice(1).map((b) => b.p50),
    yearly(plan, track),
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
      contributionStopYear: 3,
      monthlyWithdrawal: 200,
      withdrawalStartYear: 5,
    });
  });

  it("fractional windows and a fractional horizon", () => {
    expectParity({
      yearsOfGrowth: 10.5,
      monthlyContribution: 500,
      contributionStopYear: 0.5,
      monthlyWithdrawal: 200,
      withdrawalStartYear: 0.5,
    });
  });

  it("contributions until the horizon", () => {
    expectParity({ monthlyContribution: 500 });
  });

  /**
   * The shape the hub sends for a basic-mode lane: no contribution and no
   * stop year at all. Neither engine gates cash flows on a mode flag any
   * more, so a withdrawal handed to one must be applied by the other.
   */
  it("a basic-mode plan with a withdrawal and no stop year", () => {
    const basic: Partial<PlanInputs> = {
      monthlyContribution: 0,
      contributionStopYear: undefined,
      monthlyWithdrawal: 400,
      withdrawalStartYear: 1,
    };
    expectParity(basic, "nominal");
    expectParity(basic, "real");
    expectParity({ ...basic, inflationPct: 2.5 }, "real");
  });

  it("a contribution stop year of 0 stops both engines immediately", () => {
    expectParity({
      monthlyContribution: 500,
      contributionStopYear: 0,
      monthlyWithdrawal: 100,
      withdrawalStartYear: 0,
    });
  });

  it("a plan that runs dry floors at zero in both engines", () => {
    expectParity({
      initialAmount: 50000,
      monthlyContribution: 0,
      monthlyWithdrawal: 2000,
      withdrawalStartYear: 0,
    });
  });

  it("a drained plan that is still being funded recovers in both engines", () => {
    expectParity({
      initialAmount: 20000,
      monthlyContribution: 400,
      monthlyWithdrawal: 3000,
      withdrawalStartYear: 0,
    });
  });

  it("indexed guardrails move together in both engines", () => {
    expectParity({
      yearsOfGrowth: 12,
      inflationPct: 3,
      monthlyContribution: 0,
      withdrawalStartYear: 1,
      dynamicWithdrawal: { ratePct: 0, floor: 1000, ceiling: 1000 },
    });
  });

  it("fees and inflation in both display modes", () => {
    const scenario = {
      yearsOfGrowth: 7.5,
      monthlyContribution: 300,
      annualFeePct: 1,
      inflationPct: 2.5,
      monthlyWithdrawal: 150,
      withdrawalStartYear: 2,
    };
    expectParity(scenario, "nominal");
    expectParity(scenario, "real");
  });

  it("dynamic withdrawals re-evaluated on the path's own balance", () => {
    const scenario = {
      yearsOfGrowth: 10.5,
      monthlyContribution: 200,
      contributionStopYear: 4,
      annualFeePct: 0.5,
      inflationPct: 2.5,
      monthlyWithdrawal: 999,
      withdrawalStartYear: 2,
      dynamicWithdrawal: { ratePct: 6, floor: 550, ceiling: 700 },
    };
    expectParity(scenario, "nominal");
    expectParity(scenario, "real");
  });

  it("rollover lands at the same month with the same amount as the calculator", () => {
    // A's horizon IS the rollover date, fractional ones included: the engine
    // reads it off A rather than taking it as a parameter that could disagree
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
      const totalA = new InvestmentCalculator(propsA).calculateGrowth().nominal;
      const propsB = calcProps({
        initialAmount: 50000,
        yearsOfGrowth: yearsB,
        monthlyContribution: 200,
        inflationPct: 2.5,
        rollOver: true,
        investmentToRoll: totalA,
        yearOfRollover: yearsA,
      });
      const bands = runRolloverSimulation(mcFrom(propsA), mcFrom(propsB));
      const byMonth = new Map(bands.map((band) => [band.months, band.p50]));
      const a = yearly(propsA);
      const b = yearly(propsB);

      // Every checkpoint of either lane gets a band of its own, and none is
      // invented past the longer horizon
      expect(bands.map((band) => band.months)).toEqual([
        ...new Set([...checkpointMonths(yearsA), ...checkpointMonths(yearsB)]),
      ]);
      expect(bands[0].p50).toBe(150000);
      // B's own year-ends must reproduce the deterministic engine: A+B until
      // the rollover month, B alone (carrying A's balance) from it on
      b.forEach((bVal, i) => {
        const months = (i + 1) * 12;
        const expected = months < yearsA * 12 ? a[i] + bVal : bVal;
        expect(Math.abs(byMonth.get(months)! - expected)).toBeLessThanOrEqual(
          1,
        );
      });
    }
  });

  it("rollover in inflation view is deflated once, not twice", () => {
    // A's ending balance is rolled into B at its nominal size; B's displayed
    // value is then the deflation of B's own nominal balance, so the rolled
    // figure is charged inflation exactly once
    const propsA = calcProps({ yearsOfGrowth: 3, inflationPct: 10 });
    const calcA = new InvestmentCalculator(propsA);
    const nominal = calcA.calculateGrowth().nominal;
    const inflationAdjusted = calcA.calculateGrowth().real;
    const propsB = calcProps({
      initialAmount: 0,
      projectedGain: 0,
      yearsOfGrowth: 3,
      inflationPct: 10,
      rollOver: true,
      yearOfRollover: 3,
    });
    const expected = new InvestmentCalculator({
      ...propsB,
      investmentToRoll: { nominal, inflationAdjusted },
    }).calculateGrowth().real;
    const bands = runRolloverSimulation(mcFrom(propsA), mcFrom(propsB), "real");
    expect(expected).toBe(inflationAdjusted);
    expect(last(bands)).toBe(expected);
  });

  it("rolls the nominal balance even in inflation view, so a dynamic policy still matches", () => {
    // The receiving lane re-evaluates its withdrawal from its own NOMINAL
    // balance, so rolling the deflated figure would quietly make every path
    // spend less than the plan does. Nothing but a dynamic policy reads that
    // track, which is why this is the scenario that pins it.
    const propsA = calcProps({ yearsOfGrowth: 5, inflationPct: 3 });
    const calcA = new InvestmentCalculator(propsA);
    const nominal = calcA.calculateGrowth().nominal;
    const inflationAdjusted = calcA.calculateGrowth().real;
    const propsB = calcProps({
      initialAmount: 50000,
      yearsOfGrowth: 15,
      inflationPct: 3,
      withdrawalStartYear: 5,
      dynamicWithdrawal: { ratePct: 4, floor: 0, ceiling: 10000 },
      rollOver: true,
      yearOfRollover: 5,
    });
    for (const track of ["nominal", "real"] as const) {
      const expected = new InvestmentCalculator({
        ...propsB,
        investmentToRoll: { nominal, inflationAdjusted },
      }).calculateGrowth()[track];
      const bands = runRolloverSimulation(
        mcFrom(propsA),
        mcFrom(propsB),
        track,
      );
      // Exactly, not within a dollar: the injected figure is the same
      // floored nominal checkpoint the deterministic engine rolls
      expect(last(bands)).toBe(expected);
    }
  });

  /**
   * All three cash-flow paths at once, across the SPREAD the hub now uses.
   *
   * The plan objects below are built as PlanInputs and handed to each engine
   * with nothing renamed on the way: `new InvestmentCalculator(plan)` on one
   * side, `{ ...plan, volatility, simCount, seed }` on the other. That is the
   * whole point of the shared shape, and it is also its risk - a field the
   * spread quietly stops carrying moves the bands without moving a single
   * expected value in this file - so this case exercises contributions that
   * stop, withdrawals that start, and a rollover between the lanes, on both
   * display tracks.
   */
  it("carries contributions, withdrawals and a rollover through the spread", () => {
    const planA: PlanInputs = {
      initialAmount: 100000,
      projectedGain: 8,
      yearsOfGrowth: 5,
      monthlyContribution: 500,
      contributionStopYear: 3,
      monthlyWithdrawal: 300,
      withdrawalStartYear: 1,
      inflationPct: 2.5,
      annualFeePct: 0.5,
    };
    // A's ending balance is what rolls, on both tracks, exactly as the hub's
    // endingAmounts() hands it to lane B
    const endsA = new InvestmentCalculator(planA).calculateGrowth();
    const planB: PlanInputs = {
      initialAmount: 50000,
      projectedGain: 6,
      yearsOfGrowth: 12,
      monthlyContribution: 300,
      contributionStopYear: 8,
      monthlyWithdrawal: 400,
      withdrawalStartYear: 2,
      inflationPct: 2.5,
      annualFeePct: 0.25,
      rollOver: true,
      investmentToRoll: {
        nominal: endsA.nominal,
        inflationAdjusted: endsA.real,
      },
      yearOfRollover: planA.yearsOfGrowth,
    };

    // The hub's spread, verbatim. MonteCarloParams omits the rollover trio -
    // this engine rolls A's own simulated ending balance - so those three
    // fields ride along and are ignored, which is what makes the deterministic
    // lane B and the simulated portfolio comparable at all.
    const mcA: MonteCarloParams = {
      ...planA,
      volatility: 0,
      simCount: 1,
      seed: 1,
    };
    const mcB: MonteCarloParams = {
      ...planB,
      volatility: 0,
      simCount: 1,
      seed: 1,
    };
    const rolloverMonth = planA.yearsOfGrowth * 12;

    for (const track of ["nominal", "real"] as const) {
      const byMonth = new Map(
        runRolloverSimulation(mcA, mcB, track).map((b) => [b.months, b.p50]),
      );
      const a = yearly(planA, track);
      const b = yearly(planB, track);
      // A+B until the roll lands, B alone (now carrying A's balance) after it
      b.forEach((bVal, i) => {
        const months = (i + 1) * 12;
        const expected = months < rolloverMonth ? a[i] + bVal : bVal;
        expect(Math.abs(byMonth.get(months)! - expected)).toBeLessThanOrEqual(
          1,
        );
      });
    }
  });
});

/**
 * The plan half of MonteCarloParams: everything but the rollover trio, which
 * this engine models at the portfolio level instead.
 */
type McPlanFields = Omit<
  PlanInputs,
  "rollOver" | "investmentToRoll" | "yearOfRollover"
>;

describe("one plan shape, both engines", () => {
  const plan: PlanInputs = {
    initialAmount: 75000,
    projectedGain: 7,
    yearsOfGrowth: 8,
    monthlyContribution: 250,
    contributionStopYear: 6,
    monthlyWithdrawal: 150,
    withdrawalStartYear: 2,
    inflationPct: 3,
    annualFeePct: 0.4,
  };

  /**
   * A compile-time guard, asserted in both directions, so a field added to one
   * engine's params cannot silently diverge from the other's. A rename, a
   * dropped field or a re-typed one fails HERE, at the type level, instead of
   * surfacing later as a number that moved.
   */
  it("takes one PlanInputs value on both sides", () => {
    // The engine's props ARE the plan, exactly - no extra inputs, none missing
    const props: InvestmentCalculatorProps = plan;
    const backToPlan: PlanInputs = props;
    // Monte Carlo adds the three settings a simulated run needs and nothing
    // else; assigning back proves it still carries every plan field, typed as
    // the plan types it
    const params: MonteCarloParams = { ...plan, volatility: 0, simCount: 1 };
    const planHalf: McPlanFields = params;

    expect(backToPlan).toBe(plan);
    expect(planHalf.withdrawalStartYear).toBe(plan.withdrawalStartYear);
    expect(planHalf.contributionStopYear).toBe(plan.contributionStopYear);
    expect(planHalf.inflationPct).toBe(plan.inflationPct);
    expect(planHalf.annualFeePct).toBe(plan.annualFeePct);
  });

  it("simulates that one value the same way in both", () => {
    const bands = runMonteCarloSimulation({
      ...plan,
      volatility: 0,
      simCount: 1,
    });
    expectWithinADollar(
      bands.slice(1).map((b) => b.p50),
      yearly(plan),
    );
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
    expect(runRolloverSimulation(paramsA, paramsB)).toEqual(
      runRolloverSimulation(paramsA, paramsB),
    );
  });

  it("seeded A and B draw independent return sequences", () => {
    const paramsA = { ...baseParams, seed: 7, simCount: 50 };
    const combined = runCombinedSimulation(paramsA, paramsA);
    const doubled = runMonteCarloSimulation(paramsA).map((b) => b.p50 * 2);
    // Perfectly correlated lanes would make the median exactly 2 x A's median
    expect(last(combined)).not.toBe(doubled[doubled.length - 1]);
  });

  it("gives each individual-mode lane a different market", () => {
    const params = { ...baseParams, seed: 7, simCount: 50 };
    const { a, b } = runIndividualSimulations(params, params);
    // Two separate runMonteCarloSimulation calls would restart the same
    // stream and hand identical shocks to both lanes
    expect(a.map((band) => band.p50)).not.toEqual(b.map((band) => band.p50));
    // The first lane still reads the stream from the start, so it matches a
    // lone run of A exactly
    expect(a).toEqual(runMonteCarloSimulation(params));
    expect(runIndividualSimulations(params, params)).toEqual({ a, b });
  });

  it("dates each individual-mode lane on its own horizon", () => {
    const { a, b } = runIndividualSimulations(
      { ...baseParams, yearsOfGrowth: 10.5, simCount: 20 },
      { ...baseParams, yearsOfGrowth: 12, simCount: 20 },
    );
    expect(a.map((band) => band.months).at(-1)).toBe(126);
    expect(b.map((band) => band.months).at(-1)).toBe(144);
  });

  it("reproduces the combined and rollover bands recorded before the month grid landed", () => {
    // Pinned literals, not a re-run: the grid, the sqrt shock scaling and the
    // rollover contract all had to leave whole-year plans byte-identical.
    //
    // The two PAIRED literals were re-recorded when LANE_CORRELATION landed
    // and are the only figures in this file that moved for it. They had to:
    // lane B no longer reads a stretch of stream unrelated to lane A's, it
    // reads lane A's own market with an idiosyncratic component mixed in, so
    // every summed path is a different number. The SINGLE-LANE literal below
    // is the control and did NOT move - not one digit - which is the whole
    // claim the coupling rests on: correlating two lanes is not allowed to
    // touch what either lane does on its own.
    //
    // Note the two paired arrays still agree entry for entry through month
    // 120, A's finish. Before the roll fires the portfolio IS A + B, so
    // combined and rollover mode must produce the same figures there, and a
    // coupling that fed the two modes different markets would show up as a
    // disagreement in this pair rather than as a plausible-looking cone.
    const pinA = { ...baseParams, seed: 7, simCount: 50, yearsOfGrowth: 10 };
    const pinB = {
      ...baseParams,
      seed: 7,
      simCount: 50,
      initialAmount: 50000,
      yearsOfGrowth: 12,
      monthlyContribution: 200,
    };
    expect(runCombinedSimulation(pinA, pinB).map((b) => b.p50)).toEqual([
      150000, 169928, 188440.5, 213067, 237303.5, 259301.5, 285368, 336563.5,
      367661, 369754, 414784, 420976.5, 457147,
    ]);
    expect(runRolloverSimulation(pinA, pinB).map((b) => b.p50)).toEqual([
      150000, 169928, 188440.5, 213067, 237303.5, 259301.5, 285368, 336563.5,
      367661, 369754, 414784, 450085.5, 510520,
    ]);
    expect(runMonteCarloSimulation(pinA).map((b) => b.p50)).toEqual([
      100000, 110178, 121455, 132354.5, 148907, 169171, 179766.5, 196489.5,
      223184.5, 221469, 252057,
    ]);
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

describe("depletion probability", () => {
  /** $12 000 drawn at $1 000/month with no growth: dry inside the first year */
  const dry = (o: Partial<MonteCarloParams> = {}) =>
    zeroVol({
      initialAmount: 12000,
      projectedGain: 0,
      monthlyWithdrawal: 1000,
      withdrawalStartYear: 0,
      yearsOfGrowth: 3,
      ...o,
    });

  it("is 0 at every checkpoint for a plan that never withdraws", () => {
    for (const band of runMonteCarloSimulation({ ...baseParams, seed: 11 })) {
      expect(band.depletedPct).toBe(0);
    }
  });

  it("is 1 once every path has been drained", () => {
    const bands = runMonteCarloSimulation(dry());
    expect(bands[0].depletedPct).toBe(0);
    expect(bands.slice(1).map((b) => b.depletedPct)).toEqual([1, 1, 1]);
    expect(last(bands)).toBe(0);
  });

  it("keeps counting a path that ran dry and was refilled", () => {
    // The figure answers "has this plan run out by now", so a path that hits
    // zero and is later lifted by contributions stays counted: measuring the
    // instant instead would let the risk fall back to 0 and read as safe
    const bands = computeBands([
      [100, 0, 50],
      [100, 80, 60],
    ]);
    expect(bands.map((b) => b.depletedPct)).toEqual([0, 0.5, 0.5]);
  });

  it("does not count a plan that starts empty and is funded up", () => {
    // A lane whose current amount is 0 sits at zero on the first checkpoint
    // through no failure of its own. Counting that would print "100% chance
    // of running out" beside the deterministic engine's "Not within horizon".
    const bands = computeBands([
      [0, 500, 1200],
      [0, 400, 1100],
    ]);
    expect(bands.map((b) => b.depletedPct)).toEqual([0, 0, 0]);
  });

  it("still counts a funded path that later drains to zero", () => {
    const bands = computeBands([
      [0, 500, 0],
      [0, 400, 900],
    ]);
    expect(bands.map((b) => b.depletedPct)).toEqual([0, 0, 0.5]);
  });

  it("sits strictly between 0 and 1 and never falls back", () => {
    const bands = runMonteCarloSimulation({
      ...baseParams,
      seed: 5,
      initialAmount: 500000,
      monthlyWithdrawal: 4000,
      withdrawalStartYear: 0,
      yearsOfGrowth: 30,
      volatility: 18,
    });
    const risks = bands.map((b) => b.depletedPct);
    expect(risks[0]).toBe(0);
    expect(risks.at(-1)).toBeGreaterThan(0);
    expect(risks.at(-1)).toBeLessThan(1);
    // A path at zero has no cash flows left to lift it, so the share of
    // depleted paths can only ever grow
    for (let i = 1; i < risks.length; i++) {
      expect(risks[i]).toBeGreaterThanOrEqual(risks[i - 1]);
    }
  });

  it("measures ruin on the legs, so a saving lane cannot hide a spending one", () => {
    // A drains inside its first year while B only grows, so their SUM never
    // reaches zero. Read off that sum, the risk of the plan the user is
    // actually spending disappears: the panel printed "Chance of Running
    // Out: 0%" beside its own row naming the date lane A runs out. The
    // percentiles still describe the whole portfolio; only ruin looks inside.
    const rich = zeroVol({ yearsOfGrowth: 3 });
    expect(last(runMonteCarloSimulation(dry()))).toBe(0);

    const combined = runCombinedSimulation(dry(), rich);
    // The portfolio itself is never empty - which is why the sum could not
    // see this - and every run has still lost the lane that was spending
    expect(last(combined)).toBeGreaterThan(0);
    expect(combined[0].depletedPct).toBe(0);
    expect(combined.at(-1)?.depletedPct).toBe(1);

    const rollover = runRolloverSimulation(dry(), rich);
    expect(rollover[0].depletedPct).toBe(0);
    expect(rollover.at(-1)?.depletedPct).toBe(1);
  });

  it("counts no ruin when neither leg ever spends", () => {
    // Both lanes only grow, so nothing can run out and the combined figure
    // stays at zero for the whole horizon
    const grower = zeroVol({ yearsOfGrowth: 3, monthlyWithdrawal: 0 });
    for (const band of runCombinedSimulation(grower, grower)) {
      expect(band.depletedPct).toBe(0);
    }
  });

  it("counts the depleted share of the paths handed to computeBands", () => {
    const bands = computeBands([
      [100, 0],
      [100, 50],
      [100, -10],
      [100, 20],
    ]);
    expect(bands[0].depletedPct).toBe(0);
    expect(bands[1].depletedPct).toBe(0.5);
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
    );
    expect(bands).toHaveLength(11);
  });

  it("year 0 equals sum of both initial amounts", () => {
    const bands = runRolloverSimulation(
      zeroVol({ initialAmount: 80000 }),
      zeroVol({ initialAmount: 20000 }),
    );
    expect(bands[0].p50).toBe(100000);
  });

  it("rollover compounds exceed constant addition (zero-vol)", () => {
    const paramsA = zeroVol({ yearsOfGrowth: 5 });
    const paramsB = zeroVol({ yearsOfGrowth: 15 });
    expect(last(runRolloverSimulation(paramsA, paramsB))).toBeGreaterThan(
      last(runCombinedSimulation(paramsA, paramsB)),
    );
  });

  it("with same yearsOfGrowth, produces single bloom of correct length", () => {
    const bands = runRolloverSimulation(zeroVol(), zeroVol());
    expect(bands).toHaveLength(11);
  });

  it("rollover at year 1 adds A's grown value to B at the year-1 checkpoint", () => {
    const paramsA = zeroVol({ initialAmount: 50000, yearsOfGrowth: 1 });
    const paramsB = zeroVol({ initialAmount: 50000, yearsOfGrowth: 5 });
    const bands = runRolloverSimulation(paramsA, paramsB);
    const aAtYear1 = runMonteCarloSimulation(paramsA)[1].p50;
    const bAtYear1 = runMonteCarloSimulation(paramsB)[1].p50;
    expect(bands[1].p50).toBe(aAtYear1 + bAtYear1);
  });

  it("a rollover at year 0 lands before the first month", () => {
    const bands = runRolloverSimulation(
      zeroVol({ initialAmount: 5000, yearsOfGrowth: 0 }),
      zeroVol({ initialAmount: 10000, yearsOfGrowth: 1, projectedGain: 0 }),
    );
    expect(bands.map((b) => b.p50)).toEqual([15000, 15000]);
  });

  it("a rollover past B's horizon never fires and B keeps its own horizon", () => {
    const paramsA = zeroVol({ yearsOfGrowth: 10, monthlyContribution: 500 });
    const paramsB = zeroVol({ yearsOfGrowth: 5, monthlyContribution: 500 });
    const rollover = runRolloverSimulation(paramsA, paramsB);
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
      runRolloverSimulation(paramsA, paramsB),
    ]) {
      expect(bands.length).toBeGreaterThan(0);
      for (const b of bands) expect(Number.isFinite(b.p50)).toBe(true);
    }
  });

  it("does not double-count A's balance around a fractional rollover month", () => {
    const paramsA = zeroVol({ yearsOfGrowth: 4.5, simCount: 1 });
    const paramsB = zeroVol({ simCount: 1 });
    const bands = runRolloverSimulation(paramsA, paramsB);
    const combined = runCombinedSimulation(paramsA, paramsB);
    const at = (months: number) =>
      bands.findIndex((band) => band.months === months);

    // A's mid-year finish gets a row of its own between the whole years
    expect(bands.map((band) => band.months)).toEqual([
      0, 12, 24, 36, 48, 54, 60, 72, 84, 96, 108, 120,
    ]);
    // Month 48 is still pre-rollover, so it tracks the plain combined sum
    expect(bands[at(48)].p50).toBe(combined[at(48)].p50);
    // The rollover month itself is a wash: nothing has compounded yet
    expect(bands[at(54)].p50).toBe(combined[at(54)].p50);
    // Six months later A's balance has been compounding inside B
    expect(bands[at(60)].p50).toBeGreaterThan(combined[at(60)].p50);
  });

  it("checkpointMonths hits every year end plus the fractional horizon", () => {
    expect(checkpointMonths(10.5)).toEqual([
      0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 126,
    ]);
    expect(checkpointMonths(10)).toEqual([
      0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120,
    ]);
    expect(checkpointMonths(0.5)).toEqual([0, 6]);
    expect(checkpointMonths(0)).toEqual([0]);
  });

  it("pairs a fractional lane with a whole-year one by month, not by index", () => {
    const paramsA = zeroVol({ yearsOfGrowth: 10.5 });
    const paramsB = zeroVol({ yearsOfGrowth: 12 });
    const combined = runCombinedSimulation(paramsA, paramsB);
    const a = runMonteCarloSimulation(paramsA);
    const b = runMonteCarloSimulation(paramsB);
    const at = (bands: typeof combined, months: number) =>
      bands.find((band) => band.months === months)!.p50;

    // One row per date either lane reaches: A's 126 is not swallowed by a
    // whole year, and nothing is invented past month 144
    expect(combined.map((band) => band.months)).toEqual([
      0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 126, 132, 144,
    ]);
    expect(at(combined, 120)).toBe(at(a, 120) + at(b, 120));
    // Past A's horizon its final value is a constant, added on B's own dates
    expect(at(combined, 132)).toBe(last(a) + at(b, 132));
    expect(at(combined, 144)).toBe(last(a) + at(b, 144));
  });

  it("applies the rollover injection for a horizon below one year", () => {
    const paramsA = zeroVol({ yearsOfGrowth: 0.5, simCount: 1 });
    const paramsB = zeroVol({ yearsOfGrowth: 5, simCount: 1 });
    const bands = runRolloverSimulation(paramsA, paramsB);
    expect(bands.map((band) => band.months)).toEqual([
      0, 6, 12, 24, 36, 48, 60,
    ]);
    // By month 12 the rollover has landed, so the balance exceeds B grown
    // alone plus A's un-invested initial amount
    const bPlainInitialGrowth = 100000 * Math.pow(1 + 0.1 / 12, 12);
    expect(bands[2].p50).toBeGreaterThan(
      bPlainInitialGrowth + paramsA.initialAmount,
    );
  });
});

describe("return distribution calibration", () => {
  const stats = (values: number[]) => {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
    return { mean, sd: Math.sqrt(variance) };
  };

  /** Standard deviation of the log growth over a whole horizon */
  const sdOfLogGrowth = (yearsOfGrowth: number) => {
    const paths = simulateAll({
      ...baseParams,
      seed: 99,
      simCount: 20000,
      yearsOfGrowth,
    });
    return stats(paths.map((path) => Math.log(path[path.length - 1] / path[0])))
      .sd;
  };

  it("implies an annual return with the projected mean and volatility", () => {
    // One draw held for twelve months: recovering the annual rate from the
    // year's growth must give back the slider values. A sigma scaled by 1/12,
    // by sqrt(12), or applied monthly all fail here.
    const paths = simulateAll({
      ...baseParams,
      seed: 99,
      simCount: 20000,
      yearsOfGrowth: 1,
    });
    const { mean, sd } = stats(
      paths.map((path) => 1200 * (Math.pow(path[1] / path[0], 1 / 12) - 1)),
    );
    expect(Math.abs(mean - baseParams.projectedGain)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(sd - baseParams.volatility)).toBeLessThanOrEqual(0.5);
  });

  it("scales a trailing partial year by sqrt of its length, not linearly", () => {
    // Six months of market carry sqrt(1/2) of a year's spread, not half of
    // it: holding one annual draw over a short final chunk would understate
    // the last band of every x.5-year plan
    const half = sdOfLogGrowth(0.5);
    const full = sdOfLogGrowth(1);
    expect(half / full).toBeCloseTo(Math.SQRT1_2, 1);
    expect(half).toBeCloseTo((Math.SQRT1_2 * baseParams.volatility) / 100, 2);
  });
});

/* ==================================================
 * Return models
 * ================================================== */

describe("return models", () => {
  /** N standardised draws from one path of `model` */
  const draws = (model: ReturnModel, seed: number, n: number) => {
    const draw = returnDraw(model, makeRandom(seed));
    return Array.from({ length: n }, draw);
  };

  const SAMPLE = 40_000;
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

  /**
   * The tolerances are the estimators' own standard errors, not taste.
   * At N = 40,000 on a unit-variance stream: se(mean) = 1/sqrt(N) = 0.005,
   * se(sd) ~ 1/sqrt(2N) = 0.0035, se(ac1) ~ 1/sqrt(N) = 0.005.
   *
   * Checked rather than assumed: over a sweep of 40 seeds the observed ranges
   * are mean -0.0116..0.0158, sd 0.9891..1.0096, ac1 -0.0119..0.0114, and for
   * the clustered model acAbs 0.0486..0.0733 and skew -0.604..-0.457. Every
   * bound below clears the worst of those by at least half again, while a
   * real miscalibration misses by orders of magnitude - forgetting the
   * standardisation alone inflates sd by 12%.
   */
  for (const seed of SEEDS) {
    it(`keeps the sliders' plain reading under every model (seed ${seed})`, () => {
      for (const model of RETURN_MODELS) {
        const { mean, sd } = shape(draws(model, seed, SAMPLE));
        expect(Math.abs(mean), model).toBeLessThan(0.04);
        expect(Math.abs(sd - 1), model).toBeLessThan(0.04);
      }
    });
  }

  it("gives 'normal' no memory of direction and none of violence", () => {
    for (const seed of SEEDS) {
      const { ac1, acAbs, skew } = shape(draws("normal", seed, SAMPLE));
      expect(Math.abs(ac1)).toBeLessThan(0.04);
      expect(Math.abs(acAbs)).toBeLessThan(0.04);
      expect(Math.abs(skew)).toBeLessThan(0.1);
    }
  });

  it("gives 'clustered' a memory of violence but not of direction", () => {
    // The whole point of the model, stated as two numbers: bad years arrive
    // in runs (acAbs well above zero) while the returns themselves stay
    // serially uncorrelated, which is what the annual record shows. A regime
    // that also shifted the MEAN would show up here as a non-zero ac1 - and
    // it would quietly rescale the user's sigma, which the horizon test below
    // is what catches.
    for (const seed of SEEDS) {
      const { ac1, acAbs, skew } = shape(draws("clustered", seed, SAMPLE));
      // Two-sided: an OVER-persistent regime is as much a miscalibration as
      // an absent one. Neither bound resolves the spell length itself - see
      // "holds the calibration the annual record was fitted to" for that.
      expect(acAbs, `seed ${seed}`).toBeGreaterThan(0.03);
      expect(acAbs, `seed ${seed}`).toBeLessThan(0.1);
      expect(Math.abs(ac1), `seed ${seed}`).toBeLessThan(0.04);
      // Left-skewed, about -0.5: the one non-normality that survives being
      // aggregated up to a whole year
      expect(skew, `seed ${seed}`).toBeLessThan(-0.3);
      expect(skew, `seed ${seed}`).toBeGreaterThan(-0.8);
    }
  });

  it("makes sigma mean sigma at thirty years as well as at one", () => {
    // Var(30-year sum) / (30 * Var(one year)). Serial dependence in the LEVEL
    // of returns breaks this, and breaking it is a covert volatility change:
    // an earlier calibration with a regime mean tilt measured 1.31 here,
    // turning a slider set to 12 into an effective 13.8 over a long plan
    // while every one-year statistic above still passed.
    //
    // Over 40 seeds this estimator ranges 0.9855..1.0173, so the bounds below
    // sit about three and a half times its spread away - wide enough never to
    // flake, and nowhere near wide enough to admit the tilted model.
    for (const model of RETURN_MODELS) {
      const random = makeRandom(4242);
      const sums = Array.from({ length: 40_000 }, () => {
        const draw = returnDraw(model, random);
        let total = 0;
        for (let year = 0; year < 30; year++) total += draw();
        return total;
      });
      const mean = sums.reduce((s, v) => s + v, 0) / sums.length;
      const variance =
        sums.reduce((s, v) => s + (v - mean) ** 2, 0) / sums.length;
      expect(variance / 30, model).toBeGreaterThan(0.94);
      expect(variance / 30, model).toBeLessThan(1.06);
    }
  });

  it("starts a clustered path from the stationary regime, not from calm", () => {
    // Every path must begin as a random year of the market, not as a quiet
    // one. Starting them all calm hands each path an unearned opening - and a
    // withdrawal plan is at its most fragile in exactly those first years -
    // which measured 14.7% ruin against a stationary 21.7% on the same plan.
    //
    // Observed as the share of FIRST draws that are violent: with an
    // always-calm start it collapses towards the calm state's own spread.
    const firsts = Array.from({ length: 20_000 }, (_, i) =>
      returnDraw("clustered", makeRandom(i + 1))(),
    );
    const violent = firsts.filter((v) => Math.abs(v) > 1.5).length / 20_000;
    const later =
      draws("clustered", 7, 20_000)
        .slice(1000)
        .filter((v) => Math.abs(v) > 1.5).length / 19_000;
    expect(Math.abs(violent - later)).toBeLessThan(0.02);
  });

  it("costs a plan that never asked for a model nothing at all", () => {
    // The engine default is the plain Gaussian, so a caller that says nothing
    // gets exactly what it got before models existed - deep equality across
    // every entry point, on a fractional horizon so the trailing partial-year
    // chunk is exercised too. This is a randomness-BUDGET test as much as a
    // value test: a model that consumed one extra uniform would re-phase every
    // path after it and change bands that have been recorded for months.
    const a = { ...baseParams, yearsOfGrowth: 10.5, monthlyWithdrawal: 300 };
    const b = { ...baseParams, yearsOfGrowth: 12, initialAmount: 50000 };
    const named = { ...a, returnModel: "normal" as const };
    const namedB = { ...b, returnModel: "normal" as const };
    expect(runMonteCarloSimulation(named)).toEqual(runMonteCarloSimulation(a));
    expect(runCombinedSimulation(named, namedB)).toEqual(
      runCombinedSimulation(a, b),
    );
    expect(runRolloverSimulation(named, namedB)).toEqual(
      runRolloverSimulation(a, b),
    );
    expect(runIndividualSimulations(named, namedB)).toEqual(
      runIndividualSimulations(a, b),
    );
  });

  it("draws a different market once a model is asked for", () => {
    // The counterpart to the test above: the field must actually reach the
    // draw. A setting that lands in state, renders its control and changes
    // nothing is the likeliest wiring failure and no value test elsewhere
    // would see it.
    const plain = runMonteCarloSimulation(baseParams);
    const clustered = runMonteCarloSimulation({
      ...baseParams,
      returnModel: "clustered",
    });
    expect(clustered.at(-1)!.p50).not.toBe(plain.at(-1)!.p50);
  });

  it("collapses onto the deterministic plan under every model at sigma 0", () => {
    // Volatility multiplies the WHOLE standardised deviate, so no model may
    // leave anything behind at zero. A regime mean written outside that
    // multiplier survives here and breaks the parity contract.
    for (const model of RETURN_MODELS) {
      const plan = calcProps({
        monthlyWithdrawal: 200,
        withdrawalStartYear: 2,
      });
      const bands = runMonteCarloSimulation({
        ...mcFrom(plan),
        returnModel: model,
      });
      expectWithinADollar(
        bands.slice(1).map((band) => band.p50),
        yearly(plan),
      );
    }
  });
});

/* ==================================================
 * Two accounts, one market
 * ================================================== */

describe("two accounts, one market", () => {
  /**
   * One path's worth of paired draws, consumed in the order simulatePair
   * consumes them: the leader's whole horizon, then the follower's.
   */
  const pairs = (
    model: ReturnModel,
    seed: number,
    paths: number,
    years = 30,
  ) => {
    const random = makeRandom(seed);
    const a: number[] = [];
    const b: number[] = [];
    for (let path = 0; path < paths; path++) {
      const draw = pairedReturnDraws(model, random);
      for (let year = 0; year < years; year++) a.push(draw.a());
      for (let year = 0; year < years; year++) b.push(draw.b());
    }
    return { a, b };
  };

  const correlation = (xs: number[], ys: number[]) => {
    const n = xs.length;
    const mx = xs.reduce((s, v) => s + v, 0) / n;
    const my = ys.reduce((s, v) => s + v, 0) / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
      syy += (ys[i] - my) ** 2;
    }
    return sxy / Math.sqrt(sxx * syy);
  };

  const PATHS = 2_000;

  it("lands the two lanes on LANE_CORRELATION under every model", () => {
    // The constant is a claim about the FINISHED annual draws, and it has to
    // hold under both models with one number, because one toggle drives both
    // lanes. The coupling is applied to the normals underneath, and under
    // "clustered" the fold that makes the draw left-skewed eats correlation
    // on the way out - feeding 0.85 straight through realises 0.756 - so the
    // latent figure is derived from this target rather than being it. That
    // derivation is what this test is really pinning: get it wrong and
    // "clustered" quietly correlates the accounts at 0.756 while "normal"
    // correlates them at 0.85.
    //
    // At 60,000 pairs the standard error of a correlation this high is about
    // (1 - 0.85^2)/sqrt(n) = 0.0011, so 0.01 is nine of them.
    for (const model of RETURN_MODELS) {
      const { a, b } = pairs(model, 20_250_101, PATHS);
      expect(correlation(a, b), model).toBeCloseTo(LANE_CORRELATION, 2);
    }
  });

  it("leaves both lanes' own distributions exactly where they were", () => {
    // The constraint that decides the whole design. A correlation may not
    // change what either account does on its own, and the obvious
    // implementation - blending the FINISHED draws, rho*zA + sqrt(1-rho^2)*z
    // - breaks it under the model this app ships: convolving two independent
    // copies of a skewed variable keeps only rho^3 + (1-rho^2)^1.5 of the
    // skew, measured at 0.85 as -0.397 against the lone lane's -0.523, with
    // excess kurtosis falling from 2.57 to 1.53. Lane A would keep its shape
    // and lane B would not, so whether a plan got the clustered model's left
    // tail would depend on which slot the account was typed into.
    //
    // Coupling the two NORMALS the year is shaped from instead leaves the
    // follower marginally standard normal, so it comes out of the same
    // shaping function with the same distribution. The bounds below are the
    // ones "return models" applies to a lone lane, deliberately unchanged.
    for (const model of RETURN_MODELS) {
      const { a, b } = pairs(model, 20_250_102, PATHS);
      for (const [lane, values] of [
        ["A", a],
        ["B", b],
      ] as const) {
        const { mean, sd, skew, exKurt, ac1, acAbs } = shape(values);
        const why = `${model} lane ${lane}`;
        expect(Math.abs(mean), why).toBeLessThan(0.04);
        expect(Math.abs(sd - 1), why).toBeLessThan(0.04);
        expect(Math.abs(ac1), why).toBeLessThan(0.04);
        if (model === "clustered") {
          expect(skew, why).toBeLessThan(-0.3);
          expect(skew, why).toBeGreaterThan(-0.8);
          expect(exKurt, why).toBeGreaterThan(1.8);
          expect(acAbs, why).toBeGreaterThan(0.03);
          expect(acAbs, why).toBeLessThan(0.1);
        } else {
          expect(Math.abs(skew), why).toBeLessThan(0.1);
          expect(Math.abs(exKurt), why).toBeLessThan(0.15);
          expect(Math.abs(acAbs), why).toBeLessThan(0.04);
        }
      }
    }
  });

  it("puts both accounts in the same crisis at the same time", () => {
    // A crisis is a market event, not an account event, so the regime is
    // shared outright rather than correlated. The visible consequence is that
    // the two lanes' draws co-move in MAGNITUDE beyond what their correlation
    // alone would produce, and the "normal" pair is the benchmark for what
    // that correlation alone is worth: a bivariate normal at 0.85 has
    // corr(|a|, |b|) = 0.684 in closed form, measured 0.684 here. Sharing the
    // regime lifts the clustered pair to 0.754; giving each lane its own
    // chain would DROP it to 0.489, because two independent volatility
    // scales dilute what the innovations agree on. So this assertion fails in
    // exactly the case it is here to catch - two accounts having their
    // crises in different years, which is the one thing a portfolio's bad
    // decade is not.
    const plain = pairs("normal", 20_250_103, PATHS);
    const clustered = pairs("clustered", 20_250_103, PATHS);
    const absCorr = ({ a, b }: { a: number[]; b: number[] }) =>
      correlation(a.map(Math.abs), b.map(Math.abs));
    expect(absCorr(clustered)).toBeGreaterThan(absCorr(plain) + 0.03);
  });

  it("leaves a lane simulated alone untouched, and leg A with it", () => {
    // Lane A reads the seeded stream in exactly the order and quantity a lone
    // lane reads it, so half of what a correlation changes is provably
    // nothing. This is what makes the rest auditable, and it is why the
    // single-lane literal in "seeded randomness" did not move when this
    // landed while the two paired ones did.
    const a = {
      ...baseParams,
      seed: 31,
      simCount: 300,
      monthlyWithdrawal: 900,
      withdrawalStartYear: 1,
      yearsOfGrowth: 20,
    };
    const b = {
      ...baseParams,
      seed: 31,
      simCount: 300,
      initialAmount: 50_000,
      volatility: 22,
      yearsOfGrowth: 25,
    };
    for (const model of RETURN_MODELS) {
      const withModel = { ...a, returnModel: model };
      const alone = runMonteCarloSimulation(withModel);
      const combined = runCombinedSimulation(withModel, {
        ...b,
        returnModel: model,
      });
      expect(
        combined
          .slice(0, alone.length)
          .map((band) => band.legDepletion!.a.depletedPct),
        model,
      ).toEqual(alone.map((band) => band.depletedPct));
      // ...and in rollover mode too, where A's ending balance is the figure
      // that gets rolled
      const rolled = runRolloverSimulation(withModel, {
        ...b,
        returnModel: model,
      });
      expect(
        rolled
          .slice(0, alone.length)
          .map((band) => band.legDepletion!.a.depletedPct),
        model,
      ).toEqual(alone.map((band) => band.depletedPct));
    }
  });

  it("changes nothing at all at zero volatility", () => {
    // The whole standardised deviate is multiplied by volatility, and a
    // correlation only changes which deviate a lane gets, so at sigma 0 the
    // two lanes must still both collapse onto the deterministic plan and
    // their sum onto the sum of the two plans. A coupling that added anything
    // outside the multiplier passes every distributional test above and
    // breaks here.
    for (const model of RETURN_MODELS) {
      const a = zeroVol({
        returnModel: model,
        monthlyWithdrawal: 200,
        withdrawalStartYear: 2,
      });
      const b = zeroVol({
        returnModel: model,
        initialAmount: 40_000,
        yearsOfGrowth: 12,
      });
      const combined = runCombinedSimulation(a, b);
      const soloA = runMonteCarloSimulation(a);
      const soloB = runMonteCarloSimulation(b);
      expect(combined[0].p10, model).toBe(combined[0].p90);
      expect(combined.at(-1)!.p50, model).toBe(last(soloA) + last(soloB));
    }
  });

  it("does not pair two lanes that are not on the same model", () => {
    // There is no calibrated correlation between a Gaussian year and a
    // clustered one, and forcing the one there is would break a marginal: a
    // clustered follower reading a normal leader's market would fold a normal
    // that is not standard and lose its own skew. The app cannot produce the
    // case, so this pins what happens if it ever does - B draws its own
    // market, exactly as it did before lanes were coupled, rather than a
    // silently mis-shaped one.
    const a = {
      ...baseParams,
      seed: 5,
      simCount: 400,
      returnModel: "clustered" as const,
    };
    const b = {
      ...baseParams,
      seed: 5,
      simCount: 400,
      initialAmount: 60_000,
      returnModel: "normal" as const,
    };
    const mixed = runCombinedSimulation(a, b);
    const matched = runCombinedSimulation(a, {
      ...b,
      returnModel: "clustered" as const,
    });
    expect(mixed.at(-1)!.p50).not.toBe(matched.at(-1)!.p50);
    // Lane A still leads its own stream either way, so its leg is the same
    expect(mixed.map((band) => band.legDepletion!.a.depletedPct)).toEqual(
      matched.map((band) => band.legDepletion!.a.depletedPct),
    );
  });
});

/* ==================================================
 * Per-account depletion
 * ================================================== */

describe("depletion is measured per account and says which", () => {
  const spender: MonteCarloParams = {
    ...baseParams,
    initialAmount: 400_000,
    monthlyWithdrawal: 3000,
    withdrawalStartYear: 0,
    yearsOfGrowth: 20,
    seed: 4242,
  };
  const saver: MonteCarloParams = {
    ...baseParams,
    initialAmount: 400_000,
    monthlyWithdrawal: 0,
    yearsOfGrowth: 20,
    seed: 4242,
  };

  it("reports the spending account's own risk, not the portfolio's", () => {
    // The defect this whole field exists for: the summed portfolio holds both
    // pots, so its percentiles are dominated by the saver, while the risk
    // figure beside them is the spender's alone. Now both are on the record
    // and each says which pool it describes.
    const bands = runCombinedSimulation(spender, saver);
    const legs = bands.at(-1)!.legDepletion!;
    expect(legs.a.depletedPct).toBeGreaterThan(0.05);
    expect(legs.b.depletedPct).toBe(0);
    expect(bands.at(-1)!.depletedPct).toBe(legs.a.depletedPct);
    // ...and the percentile it sits next to is made almost entirely of the
    // account that carries none of that risk
    expect(bands.at(-1)!.p10).toBeGreaterThan(400_000);
  });

  it("matches what each account reports when simulated on its own", () => {
    // Exact, not statistical: runCombinedSimulation consumes the shared
    // stream in the same order (all of A's paths, then all of B's), so leg A
    // IS the single-lane run. An implementation that returned the wrong leg,
    // the sum, or the average fails here rather than looking plausible.
    const bands = runCombinedSimulation(spender, saver);
    const alone = runMonteCarloSimulation(spender);
    expect(bands.map((band) => band.legDepletion!.a.depletedPct)).toEqual(
      alone.map((band) => band.depletedPct),
    );
  });

  it("keeps the any-account figure a union, never a sum or a maximum", () => {
    // Lane B draws LESS than A but is twice as volatile, and the second half
    // of that is what the test needs. Once the two lanes share a market
    // (LANE_CORRELATION), a lane that differs from the other only in how hard
    // it draws fails in a SUBSET of the other's runs - the union collapses
    // onto the maximum and the strict assertion at the bottom stops being
    // able to tell a union from a max. This pair fails on genuinely different
    // runs because the accounts hold different markets, not merely different
    // withdrawals, which is the shape the assertion was always about.
    const bothSpend = runCombinedSimulation(spender, {
      ...spender,
      seed: 4242,
      monthlyWithdrawal: 2500,
      volatility: 20,
    });
    for (const band of bothSpend) {
      const { a, b } = band.legDepletion!;
      expect(band.depletedPct).toBeGreaterThanOrEqual(
        Math.max(a.depletedPct, b.depletedPct),
      );
      expect(band.depletedPct).toBeLessThanOrEqual(
        Math.min(1, a.depletedPct + b.depletedPct),
      );
    }
    // And on a plan where both can fail it is strictly inside those bounds,
    // so the test above is not passing on a degenerate case
    const end = bothSpend.at(-1)!;
    const { a, b } = end.legDepletion!;
    expect(end.depletedPct).toBeGreaterThan(
      Math.max(a.depletedPct, b.depletedPct),
    );
    // ...and strictly BELOW the union two independent accounts would show.
    // This is the assertion the old engine could not have passed: with the
    // lanes drawn off disjoint stretches of one stream, the any-account
    // figure sat on a + b - a*b to within sampling error, because that is
    // what a union of independent events is. It is the cheapest end-to-end
    // proof that the coupling reaches the ruin figures and not just the
    // percentiles.
    expect(end.depletedPct).toBeLessThan(
      a.depletedPct + b.depletedPct - a.depletedPct * b.depletedPct,
    );
  });

  it("counts a rollover lane that drains in its own final year", () => {
    // `until` is an exclusive bound and the rollover index IS lane A's last
    // checkpoint, so stopping at it skipped the one place a spend-down lane
    // most often first reads zero. The same pair in combined mode reported
    // the failure; rollover mode reported none, and the panel would have
    // printed "0% chance of running out" beside a row naming the very month
    // it ran out.
    const drains: MonteCarloParams = {
      ...baseParams,
      initialAmount: 12000,
      projectedGain: 0,
      volatility: 0,
      yearsOfGrowth: 3,
      monthlyWithdrawal: 1000,
      withdrawalStartYear: 2,
      simCount: 10,
    };
    const receiver: MonteCarloParams = {
      ...drains,
      initialAmount: 50000,
      monthlyWithdrawal: 0,
      withdrawalStartYear: 0,
      yearsOfGrowth: 6,
    };
    const combined = runCombinedSimulation(drains, receiver);
    const rollover = runRolloverSimulation(drains, receiver);
    expect(combined.at(-1)!.depletedPct).toBe(1);
    expect(rollover.at(-1)!.depletedPct).toBe(1);
    // A is absorbed at the roll, so its figure is dated there rather than at
    // the horizon - the row it feeds is a closed question, not a live one
    expect(rollover.at(-1)!.legDepletion!.a.throughMonth).toBe(36);
    expect(rollover.at(-1)!.legDepletion!.b.throughMonth).toBe(72);
  });

  it("leaves a single-lane run with no breakdown to give", () => {
    // One account IS the portfolio there, so depletedPct already names the
    // right pool and a redundant field would break the identity
    // runIndividualSimulations(a, b).a === runMonteCarloSimulation(a)
    expect(
      runMonteCarloSimulation(spender).at(-1)!.legDepletion,
    ).toBeUndefined();
    expect(
      runIndividualSimulations(spender, saver).a.at(-1)!.legDepletion,
    ).toBeUndefined();
  });
});

/* ==================================================
 * Withdrawal tax and indexed spending
 * ================================================== */

describe("both engines agree about tax and indexed spending", () => {
  it("grosses a fixed withdrawal up identically in both engines", () => {
    expectParity({
      monthlyWithdrawal: 1000,
      withdrawalStartYear: 2,
      withdrawalTaxPct: 25,
    });
  });

  it("agrees once a taxed plan has run itself dry", () => {
    // The cap is applied to the GROSS draw, so the two engines must also
    // agree about the partial payment in the month the money runs out
    expectParity({
      initialAmount: 120_000,
      projectedGain: 0,
      monthlyWithdrawal: 1000,
      withdrawalStartYear: 0,
      withdrawalTaxPct: 25,
    });
  });

  it("indexes a fixed withdrawal identically in both engines", () => {
    expectParity(
      {
        monthlyWithdrawal: 1000,
        withdrawalStartYear: 1,
        inflationPct: 3,
        spendingKeepsPace: true,
      },
      "real",
    );
  });

  it("grosses a dynamic policy's guardrails, and only those, in both", () => {
    expectParity({
      initialAmount: 200_000,
      monthlyWithdrawal: 0,
      dynamicWithdrawal: { ratePct: 4, floor: 2000, ceiling: 3000 },
      inflationPct: 2.5,
      withdrawalTaxPct: 25,
    });
  });

  it("grosses AND indexes the same figure in the same order in both engines", () => {
    // The combination the app itself ships. Grossing before indexing and
    // indexing before grossing agree at month 0 and compound apart after it,
    // so only a long horizon separates them - and this is the one arithmetic
    // both engines write out by hand rather than sharing.
    expectParity({
      initialAmount: 400_000,
      monthlyWithdrawal: 2500,
      withdrawalStartYear: 0,
      inflationPct: 3,
      yearsOfGrowth: 25,
      withdrawalTaxPct: 25,
      spendingKeepsPace: true,
    });
  });

  it("leaves a dynamic policy alone under indexed spending, in the simulation too", () => {
    // The deterministic engine has this test; the simulated one did not. The
    // toggle governs the FIXED withdrawal alone - a policy's guardrails are
    // already indexed and its rate leg scales with the balance - so the
    // simulated bands must be untouched by it.
    const policy = {
      monthlyWithdrawal: 0,
      dynamicWithdrawal: { ratePct: 4, floor: 2000, ceiling: 3000 },
      inflationPct: 3,
      withdrawalTaxPct: 25,
    };
    expect(
      runMonteCarloSimulation(
        mcFrom(calcProps({ ...policy, spendingKeepsPace: true })),
      ),
    ).toEqual(runMonteCarloSimulation(mcFrom(calcProps(policy))));
  });

  it("costs an untaxed, unindexed plan nothing at all", () => {
    const plain = { ...baseParams, monthlyWithdrawal: 400 };
    expect(
      runMonteCarloSimulation({
        ...plain,
        withdrawalTaxPct: 0,
        spendingKeepsPace: false,
      }),
    ).toEqual(runMonteCarloSimulation(plain));
  });

  it("empties a plan sooner once the same spending is taxed", () => {
    const spending = {
      ...baseParams,
      initialAmount: 400_000,
      monthlyWithdrawal: 3000,
      withdrawalStartYear: 0,
      yearsOfGrowth: 20,
      simCount: 2000,
      seed: 4242,
    };
    const untaxed = runMonteCarloSimulation(spending).at(-1)!.depletedPct;
    const taxed = runMonteCarloSimulation({
      ...spending,
      withdrawalTaxPct: 25,
    }).at(-1)!.depletedPct;
    expect(taxed).toBeGreaterThan(untaxed);
  });

  it("empties a plan sooner once the same spending keeps pace with prices", () => {
    // A fixed nominal draw is a real spending cut the plan never announces.
    // Indexing it is the single largest correction in this engine: measured
    // on a stressed plan it moves ruin from 20.8% to 52.7%.
    const spending = {
      ...baseParams,
      initialAmount: 400_000,
      monthlyWithdrawal: 3000,
      withdrawalStartYear: 0,
      yearsOfGrowth: 20,
      inflationPct: 3,
      simCount: 2000,
      seed: 4242,
    };
    const flat = runMonteCarloSimulation(spending).at(-1)!.depletedPct;
    const indexed = runMonteCarloSimulation({
      ...spending,
      spendingKeepsPace: true,
    }).at(-1)!.depletedPct;
    expect(indexed).toBeGreaterThan(flat * 1.5);
  });
});

describe("the clustered market is the one that was calibrated", () => {
  const SAMPLE = 40_000;
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
  const draws = (seed: number, n: number) => {
    const draw = returnDraw("clustered", makeRandom(seed));
    return Array.from({ length: n }, draw);
  };

  it("holds the calibration the annual record was fitted to", () => {
    // Pinned as constants because no sample this suite can afford resolves
    // them: cutting the mean crisis spell from 2.0 years to 1.7 while holding
    // the stationary share passes every distributional assertion above, and a
    // 400-seed sweep of the clustering measure has the two ranges overlapping.
    // Spell length is the model's whole reason for existing - the depletion
    // difference it is documented to produce is a function of it - so a change
    // here has to be a deliberate edit to a test rather than a silent retune.
    const c = CLUSTERED_CALIBRATION;
    // A quarter of years in the volatile state...
    expect(c.calmToCrisis / (c.calmToCrisis + c.crisisToCalm)).toBeCloseTo(
      0.26,
      2,
    );
    // ...spells of two years...
    expect(1 / c.crisisToCalm).toBeCloseTo(2, 5);
    // ...and roughly twice as violent while they last
    expect(c.crisisSd / c.calmSd).toBeCloseTo(2.19, 2);
  });

  it("gives the two regimes ONE mean, so sigma is not quietly rescaled", () => {
    // The sabotage every other assertion misses. Give the crisis state a mean
    // 0.6 sd below the calm state's and renormalise to hold the marginal
    // variance at 1: the mean, the sd, the autocorrelation, the skew and even
    // Var(30-year sum) all stay inside their bounds, because the tilt
    // manufactures exactly the left skew the skew-normal was there to supply.
    // What it actually is, is a persistent DRIFT - and a persistent drift is
    // the thing the calibration comment says it refuses, because it turns the
    // volatility slider into a number that means something else at 30 years.
    //
    // Measured here as the difference between the mean return AFTER a violent
    // year and after a calm one: HEAD spans -0.027..+0.010 over these seeds,
    // the tilted variant -0.133..-0.060.
    for (const seed of SEEDS) {
      const xs = draws(seed, SAMPLE);
      const after: [number[], number[]] = [[], []];
      for (let i = 1; i < xs.length; i++) {
        after[Math.abs(xs[i - 1]) > 1.5 ? 0 : 1].push(xs[i]);
      }
      const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
      expect(
        Math.abs(mean(after[0]) - mean(after[1])),
        `seed ${seed}`,
      ).toBeLessThan(0.045);
    }
  });

  it("starts every path's regime afresh, so no path inherits the last one's", () => {
    // The stationary-start test measures the MARGINAL, which a regime hoisted
    // to module scope reproduces exactly - such a chain is still stationary,
    // it is merely no longer independent between paths. This measures the
    // dependence instead: consecutive path openings taken off ONE stream, the
    // way runCombinedSimulation consumes it. HEAD spans 0.000..0.011 over
    // these seeds; hoisting the regime gives 0.050..0.066.
    for (const seed of SEEDS) {
      const random = makeRandom(seed * 31);
      const openings = Array.from({ length: SAMPLE }, () =>
        Math.abs(returnDraw("clustered", random)()),
      );
      const m = openings.reduce((s, v) => s + v, 0) / openings.length;
      const v =
        openings.reduce((s, x) => s + (x - m) ** 2, 0) / openings.length;
      let cov = 0;
      for (let i = 1; i < openings.length; i++) {
        cov += (openings[i] - m) * (openings[i - 1] - m);
      }
      expect(
        Math.abs(cov / (openings.length - 1) / v),
        `seed ${seed}`,
      ).toBeLessThan(0.02);
    }
  });
});
