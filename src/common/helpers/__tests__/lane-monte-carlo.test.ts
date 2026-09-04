import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  NO_BANDS,
  resolveMcMode,
  runMonteCarlo,
  toMcParams,
  type McInput,
} from "../lane-monte-carlo";
import { buildLane } from "../lane-model";
import {
  DEFAULT_INPUTS,
  DEFAULT_SLIDERS,
  DEFAULT_TOGGLES,
} from "../state-manager";
import { MONTE_CARLO_SIM_COUNT } from "../../constants/app-constants";
import type { MonteCarloParams } from "../monte-carlo";
import type { TogglesState } from "../../types/types";

/**
 * The three engine entry points are wrapped, not replaced: each one still runs
 * for real and only records that it was called. Which entry point a mode uses
 * is the whole of what this module decides, and "off runs no simulation" is a
 * claim about a call that must NOT happen — neither is observable from the
 * bands alone.
 */
const called = vi.hoisted(() => [] as string[]);

vi.mock("../monte-carlo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../monte-carlo")>();
  return {
    ...actual,
    runCombinedSimulation: (
      ...args: Parameters<typeof actual.runCombinedSimulation>
    ) => {
      called.push("combined");
      return actual.runCombinedSimulation(...args);
    },
    runIndividualSimulations: (
      ...args: Parameters<typeof actual.runIndividualSimulations>
    ) => {
      called.push("individual");
      return actual.runIndividualSimulations(...args);
    },
    runRolloverSimulation: (
      ...args: Parameters<typeof actual.runRolloverSimulation>
    ) => {
      called.push("rollover");
      return actual.runRolloverSimulation(...args);
    },
  };
});

const TODAY = new Date(2020, 0, 1);

const toggles = (over: Partial<TogglesState> = {}): TogglesState => ({
  ...DEFAULT_TOGGLES,
  ...over,
});

/** A lane carrying every field a plan can, so nothing can be dropped unnoticed */
const fullLane = () =>
  buildLane(
    "A",
    {
      sliders: {
        ...DEFAULT_SLIDERS,
        projectedGainA: 7,
        yearsOfGrowthA: 12,
        monthlyContributionA: 500,
        contributionStopYearA: 8,
        monthlyWithdrawalA: 400,
        withdrawalStartYearA: 6,
        annualFeeA: 0.5,
        yearlyInflation: 2.5,
      },
      inputs: { ...DEFAULT_INPUTS, currentAmountA: "250000" },
      toggles: toggles({ advanced: true, fees: true }),
    },
    TODAY,
  );

/** A cheap simulation: the mapping tests care about fields, not paths */
const params = (over: Partial<MonteCarloParams> = {}): MonteCarloParams => ({
  initialAmount: 100000,
  projectedGain: 7,
  yearsOfGrowth: 5,
  monthlyContribution: 0,
  monthlyWithdrawal: 0,
  withdrawalStartYear: 0,
  inflationPct: 2.5,
  volatility: 12,
  simCount: 20,
  seed: 1,
  ...over,
});

const input = (over: Partial<McInput> = {}): McInput => ({
  a: params(),
  b: params({ initialAmount: 50000, yearsOfGrowth: 8 }),
  mode: "off",
  track: "nominal",
  ...over,
});

beforeEach(() => {
  called.length = 0;
});

describe("resolveMcMode", () => {
  it("is off in basic mode, however the switches are stored", () => {
    // The switch is off screen in basic mode, so a plan left with it on would
    // keep paying for five hundred simulations nobody can turn off
    expect(
      resolveMcMode(
        toggles({
          advanced: false,
          monteCarlo: true,
          monteCarloMode: "individual",
        }),
      ),
    ).toBe("off");
  });

  it("is off while the tool itself is off", () => {
    expect(resolveMcMode(toggles({ advanced: true, monteCarlo: false }))).toBe(
      "off",
    );
  });

  it("passes the display mode through in advanced mode", () => {
    expect(resolveMcMode(toggles({ advanced: true, monteCarlo: true }))).toBe(
      "combined",
    );
    expect(
      resolveMcMode(
        toggles({
          advanced: true,
          monteCarlo: true,
          monteCarloMode: "individual",
        }),
      ),
    ).toBe("individual");
  });

  it("lets a rollover outrank the display mode", () => {
    // A portfolio that rolls A into B is one portfolio, whichever way the
    // mode switch is set
    expect(
      resolveMcMode(
        toggles({
          advanced: true,
          monteCarlo: true,
          rollover: true,
          monteCarloMode: "individual",
        }),
      ),
    ).toBe("rollover");
  });
});

describe("toMcParams", () => {
  it("hands the lane's own plan over with nothing dropped or renamed", () => {
    const lane = fullLane();
    const mapped = toMcParams(lane, 18, 1337);
    // Field for field: this used to be a hand-written copy that renamed four
    // of them on the way past, which is exactly where two engines can end up
    // simulating different cash flows
    for (const [field, value] of Object.entries(lane.plan)) {
      expect(mapped[field as keyof MonteCarloParams]).toEqual(value);
    }
    expect(mapped).toEqual({
      ...lane.plan,
      volatility: 18,
      simCount: MONTE_CARLO_SIM_COUNT,
      seed: 1337,
    });
  });

  it("carries the mode the lane was already resolved in", () => {
    // Monte Carlo has no mode flag and needs none: buildLane zeroed the cash
    // flows basic mode does not run before this engine ever saw them
    const basic = buildLane(
      "A",
      {
        sliders: { ...DEFAULT_SLIDERS, monthlyContributionA: 1000 },
        inputs: DEFAULT_INPUTS,
        toggles: toggles({ advanced: false }),
      },
      TODAY,
    );
    expect(toMcParams(basic, 12, 1).monthlyContribution).toBe(0);
  });
});

describe("runMonteCarlo", () => {
  it("runs no simulation at all when the mode is off", () => {
    const bands = runMonteCarlo(input({ mode: "off" }));
    expect(called).toEqual([]);
    // The same identity every time, so a chart that is not drawing a cone is
    // not handed a fresh pair of empty arrays on every render
    expect(bands).toBe(NO_BANDS);
    expect(bands.mcBandsA).toEqual([]);
    expect(bands.mcBandsB).toEqual([]);
    expect(runMonteCarlo(input({ mode: "off" }))).toBe(bands);
  });

  it("draws one cone for the whole portfolio in combined mode", () => {
    const bands = runMonteCarlo(input({ mode: "combined" }));
    expect(called).toEqual(["combined"]);
    expect(bands.mcBandsA.length).toBeGreaterThan(0);
    expect(bands.mcBandsB).toEqual([]);
  });

  it("uses the shared-stream entry point for individual mode", () => {
    const bands = runMonteCarlo(input({ mode: "individual" }));
    // runIndividualSimulations, not two separate runs: one random stream
    // across both lanes, so B's paths are a different market from A's
    expect(called).toEqual(["individual"]);
    expect(bands.mcBandsA.length).toBeGreaterThan(0);
    expect(bands.mcBandsB.length).toBeGreaterThan(0);
    // Each lane's bands are dated on its own horizon
    expect(bands.mcBandsA.at(-1)?.months).toBe(60);
    expect(bands.mcBandsB.at(-1)?.months).toBe(96);
  });

  it("draws the rolled-up portfolio in rollover mode", () => {
    const bands = runMonteCarlo(input({ mode: "rollover" }));
    expect(called).toEqual(["rollover"]);
    expect(bands.mcBandsA.length).toBeGreaterThan(0);
    expect(bands.mcBandsB).toEqual([]);
  });

  it("draws the cone on the track it was asked for", () => {
    const nominal = runMonteCarlo(input({ mode: "combined" }));
    const real = runMonteCarlo(input({ mode: "combined", track: "real" }));
    // One simulation, two tracks: the same paths read in today's dollars
    expect(real.mcBandsA.at(-1)?.p50).toBeLessThan(
      nominal.mcBandsA.at(-1)?.p50 ?? 0,
    );
  });
});
