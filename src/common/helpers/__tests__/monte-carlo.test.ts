import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  runMonteCarloSimulation,
  simulateAll,
  computeBands,
  checkpointMonths,
  runCombinedSimulation,
  runIndividualSimulations,
  runRolloverSimulation,
  type MonteCarloParams,
} from "../monte-carlo";
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
    // rollover contract all had to leave whole-year plans byte-identical
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
      150000, 170082, 188292.5, 206662, 237709.5, 266450.5, 290879.5, 336581.5,
      365495.5, 409248.5, 442303, 498902, 505362,
    ]);
    expect(runRolloverSimulation(pinA, pinB).map((b) => b.p50)).toEqual([
      150000, 170082, 188292.5, 206662, 237709.5, 266450.5, 290879.5, 336581.5,
      365495.5, 409248.5, 442303, 526300.5, 556178,
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

  it("measures the whole portfolio, not either leg on its own", () => {
    // A is drained by year 1; the combined portfolio never is, so a per-leg
    // measurement would report the wrong series entirely
    const rich = zeroVol({ yearsOfGrowth: 3 });
    expect(last(runMonteCarloSimulation(dry()))).toBe(0);
    for (const band of runCombinedSimulation(dry(), rich)) {
      expect(band.depletedPct).toBe(0);
    }
    for (const band of runRolloverSimulation(dry(), rich)) {
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
