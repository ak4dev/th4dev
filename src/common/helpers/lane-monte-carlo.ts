/* ==================================================
 * Lane Monte Carlo
 *
 * The wiring between a built Lane and the Monte Carlo
 * engine: which simulation the current toggles ask for,
 * the parameters each lane is simulated with, and which
 * entry point answers for that mode.
 *
 * Pure, and separate from the engine itself: the engine
 * knows how to simulate a plan, and this knows which plan
 * and which simulation the screen is asking for.
 * ================================================== */

import {
  runCombinedSimulation,
  runIndividualSimulations,
  runRolloverSimulation,
  type MonteCarloParams,
  type PercentileBand,
} from "./monte-carlo";
import { isRollover, isTool, type Lane } from "./lane-model";
import { MONTE_CARLO_SIM_COUNT } from "../constants/app-constants";
import type { DisplayTrack, TogglesState } from "../types/types";

/** Which simulation is running, "off" included */
export type McMode = "off" | "combined" | "individual" | "rollover";

/** One whole simulation request: both lanes, the mode and the track */
export interface McInput {
  a: MonteCarloParams;
  b: MonteCarloParams;
  mode: McMode;
  /** Which of the two tracks the cone is drawn on */
  track: DisplayTrack;
}

/** Both lanes' percentile bands; B's are empty in every single-cone mode */
export interface McBands {
  mcBandsA: PercentileBand[];
  mcBandsB: PercentileBand[];
}

/**
 * The simulation the current toggles ask for.
 *
 * Gated on the tool predicate, not the bare toggle: in basic mode the Monte
 * Carlo switch is off screen, so a plan left with it on would keep paying for
 * five hundred simulations the user cannot turn off. A rollover outranks the
 * mode switch, because a portfolio that rolls A into B is one portfolio.
 */
export const resolveMcMode = (toggles: TogglesState): McMode =>
  !isTool(toggles, "monteCarlo")
    ? "off"
    : isRollover(toggles)
      ? "rollover"
      : toggles.monteCarloMode;

/**
 * One lane's plan, handed to the other engine unchanged.
 *
 * There is nothing to translate: the plan is already in the vocabulary Monte
 * Carlo reads, so the lane's own object is spread in and only the three
 * simulation settings are added. This used to be a hand-written field-by-field
 * copy that renamed four of them on the way past, which is exactly the seam
 * where the two engines could end up simulating different cash flows.
 *
 * The plan's rollover fields ride along and are ignored: this engine models a
 * roll at the portfolio level, in runRolloverSimulation, off A's own simulated
 * ending balance. MonteCarloParams omits them for that reason.
 *
 * Monte Carlo has no mode flag of its own, and needs none: buildLane already
 * resolved basic mode, so the lane's plan carries exactly the cash flows the
 * deterministic engine applies.
 */
export const toMcParams = (
  lane: Lane,
  volatility: number,
  seed: number,
): MonteCarloParams => ({
  ...lane.plan,
  volatility,
  simCount: MONTE_CARLO_SIM_COUNT,
  seed,
});

/**
 * The answer for a plan with no simulation to run. One identity, so a chart
 * that is not drawing a cone is not handed a fresh pair of empty arrays on
 * every render.
 */
export const NO_BANDS: McBands = {
  mcBandsA: [],
  mcBandsB: [],
};

export function runMonteCarlo({ a, b, mode, track }: McInput): McBands {
  switch (mode) {
    case "rollover":
      // A's ending balance rolls into B at A's finish year: the engine reads
      // that date off A rather than taking it as a parameter
      return { mcBandsA: runRolloverSimulation(a, b, track), mcBandsB: [] };
    case "combined":
      return { mcBandsA: runCombinedSimulation(a, b, track), mcBandsB: [] };
    case "individual": {
      // One shared stream across both lanes, so B's paths are a different
      // market from A's; each lane's bands are dated on its own horizon
      const { a: bandsA, b: bandsB } = runIndividualSimulations(a, b, track);
      return { mcBandsA: bandsA, mcBandsB: bandsB };
    }
    default:
      return NO_BANDS;
  }
}
