/* ==================================================
 * Monte Carlo Simulation Engine
 *
 * Runs N simulations of investment growth with randomised
 * annual returns drawn from a normal distribution around
 * the projected mean, and extracts percentile bands for
 * charting confidence intervals.
 *
 * Cash flows are applied month-for-month exactly as
 * InvestmentCalculator applies them, so with zero
 * volatility every path reproduces the deterministic
 * projection. Like that engine, each path carries a single
 * nominal balance and derives the inflation-adjusted
 * ("real") figure by deflating it at each checkpoint, and
 * floors its balance at zero rather than letting a spent
 * portfolio compound a debt. All year-valued parameters
 * accept fractional values (e.g. 10.5 years), which are
 * resolved to whole months from today.
 *
 * Every path carries BOTH tracks and the caller names the
 * one its bands are drawn on. The plan itself no longer
 * carries the Inflated switch: a simulation whose numbers
 * change with a display flag is a simulation whose answer
 * depends on what is on screen, and the deterministic engine
 * gave that up in the same refactor.
 *
 * Checkpoints are dated in MONTHS FROM TODAY, never by
 * array index: every band carries the month it describes
 * (see checkpointMonths), so two lanes with different -
 * possibly fractional - horizons can be summed, spliced and
 * charted without any index arithmetic lining up by luck.
 *
 * ---------- Drift convention ----------
 * projectedGain is the ARITHMETIC MEAN of the annual return
 * draw: each simulated year draws X ~ N(projectedGain,
 * volatility) and applies X/12 as that year's constant
 * monthly rate. Because log(1 + x) is concave, the median
 * of the compounded outcome trails the deterministic plan
 * line, and the gap grows with sigma and horizon (1.5% at
 * sigma 12 over 30 years, 10% at sigma 30). The
 * dashed median and the solid plan line are therefore
 * expected to disagree: one is the middle outcome of a
 * volatile plan, the other is the same plan with the
 * volatility switched off.
 *
 * The alternative - correcting the drift (drawing around
 * projectedGain + sigma^2/2 or similar) so the median lands
 * on the plan line - is DELIBERATELY NOT IMPLEMENTED. It
 * would move every non-zero-volatility figure in the app
 * away from the plain reading of the return slider, which
 * the deterministic engine, the target solver, the
 * portfolio schedule and the totals table all treat as the
 * rate they compound. Do not add it to this file alone.
 *
 * ---------- Return model ----------
 * WHICH SHAPE the annual draw has is a separate question
 * from its mean and spread, and it is the caller's
 * (see ReturnModel). Both shapes below are standardised to
 * mean 0 and variance 1 before projectedGain and volatility
 * are applied, so the two sliders keep their plain reading
 * whichever is chosen - and, just as importantly, so does
 * the SUM of many years: Var(30-year sum) / (30 * Var(year))
 * is 1.00 for both, which is what stops a model switch from
 * being a covert volatility switch.
 * ================================================== */

import {
  MONTHS_PER_YEAR,
  PERCENTAGE_DIVISOR,
} from "../constants/app-constants";
import type { DisplayTrack, PlanInputs, ReturnModel } from "../types/types";
import { bisect } from "./bisect";
import {
  dynamicMonthlyWithdrawal,
  grossWithdrawal,
  guardrailIndex,
  toMonths,
} from "./investment-growth-calculator";

/* ---------- Types ---------- */

/**
 * One lane's plan, plus the three settings only a simulated run needs.
 *
 * The plan half is PlanInputs verbatim - the very object the deterministic
 * engine is constructed with, spread straight in - so no hand-written adapter
 * stands between the two engines to drop a field or rename one into a
 * different meaning. Every plan quantity is documented once, on PlanInputs;
 * nothing is re-described here.
 *
 * The rollover trio is deliberately omitted. This engine models a rollover at
 * the PORTFOLIO level - runRolloverSimulation injects A's own simulated ending
 * balance into B - so honouring a lane's `investmentToRoll` as well would land
 * the money twice. Leaving those three fields out of the type is what says so.
 */
export interface MonteCarloParams extends Omit<
  PlanInputs,
  "rollOver" | "investmentToRoll" | "yearOfRollover"
> {
  /**
   * Standard deviation of the ANNUAL RATE this engine compounds monthly, in
   * percentage points. Note it is not the standard deviation of the resulting
   * calendar-year return: a rate X is applied as twelve months of X/12, so the
   * year returns (1 + X/1200)^12 - 1, whose spread is about 1.115x this
   * figure. A slider at 18 therefore produces simulated years averaging 12.1%
   * arithmetic / 10.4% geometric with a 20.1-point spread, which is the US
   * large-cap record; that ratio is why DEFAULT_VOLATILITY is 18 and not 15.
   */
  volatility: number;
  /** Number of simulations to run */
  simCount: number;
  /** Seed for a deterministic random stream; Math.random is used when absent */
  seed?: number;
  /**
   * Shape of the annual draw. Absent means "normal" - the plain i.i.d.
   * Gaussian this engine has always drawn - so a caller that does not ask for
   * a model gets the same numbers it got before models existed, and every
   * band recorded before this field is still the band this engine produces.
   * The app itself asks for "clustered" (see DEFAULT_TOGGLES.returnModel).
   */
  returnModel?: ReturnModel;
}

export interface PercentileBand {
  /** Whole months from today that this band describes */
  months: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  /**
   * Share of simulated portfolios (0-1) that have been at or below zero at
   * this checkpoint or any earlier one: the probability the plan has run out
   * of money by then. It is cumulative, so a path refilled by later
   * contributions keeps counting - having run out is what the figure claims.
   * It is measured on the portfolio the band describes, so in combined and
   * rollover mode it is the summed/spliced path, not either leg on its own.
   */
  depletedPct: number;
  /**
   * The same figure measured on each ACCOUNT separately, present only where
   * the band describes a portfolio built from more than one of them
   * (runCombinedSimulation, runRolloverSimulation).
   *
   * It exists because depletedPct above and p10/p50/p90 beside it describe
   * DIFFERENT POOLS, and nothing on screen used to say so. The percentiles
   * are the summed portfolio; the depletion figure is "either account ran
   * dry", which on a typical plan is one account's risk and not the other's -
   * a lane drawing 9% a year beside a lane that only saves reports the
   * spending lane's ruin verbatim, next to a 10th percentile made almost
   * entirely of the saving lane's money. Reading the two as one pool is the
   * misread this field exists to make impossible.
   *
   * Named rather than positional: this file dates every checkpoint by month
   * "never by array index" for the same reason a leg is named here. A swapped
   * index yields a plausible percentage under the wrong lane letter, which no
   * range assertion can catch.
   */
  legDepletion?: LegDepletion;
}

/** One account's cumulative ruin share, and the last checkpoint it was measured over */
export interface LegRuin {
  /** Share of runs (0-1) in which THIS account has run dry by this checkpoint */
  depletedPct: number;
  /**
   * Months from today up to which this account was still being measured. It
   * equals the band's own `months` for an account that lives to the horizon,
   * and the rollover month for lane A in a rollover, after which A has been
   * absorbed into B and can no longer fail on its own.
   */
  throughMonth: number;
}

/** Both accounts of a two-lane portfolio, named as runIndividualSimulations names them */
export interface LegDepletion {
  a: LegRuin;
  b: LegRuin;
}

interface LumpSumInjection {
  /** Whole months from today after which the lump sum lands */
  month: number;
  /**
   * NOMINAL amount to add, exactly as InvestmentCalculator adds
   * investmentToRoll.nominal to its own single nominal balance. The receiving
   * lane deflates its balance at every checkpoint, so a rolled figure is
   * charged inflation once, for its own elapsed time, and never twice.
   */
  amount: number;
}

interface SimOptions {
  injection?: LumpSumInjection;
  /** Checkpoint months to record; defaults to this lane's own grid */
  grid?: number[];
  /**
   * The generator this path's annual draws come from. Absent means "build
   * one from `random`", which is what a lane simulated alone does; a paired
   * run supplies one so that both lanes of a path read the same market.
   */
  draw?: ReturnDraw;
}

/**
 * One simulated path, sampled on the caller's month grid and carried on BOTH
 * tracks, exactly as LineGraphEntry carries the deterministic engine's
 * checkpoints. A single nominal balance is simulated and `real` is that same
 * balance deflated, so which of the two a cone is drawn on is a decision for
 * the view - taken when the bands are extracted, never inside the loop. Both
 * are floored exactly as InvestmentCalculator floors its matrix rows, so a
 * checkpoint rolled into another lane is the same figure the deterministic
 * engine rolls.
 */
interface SimPath {
  /** Balance in the dollars of the checkpoint's own month */
  nominal: number[];
  /** The same checkpoints in today's dollars */
  real: number[];
}

/* ---------- RNG ---------- */

/**
 * A uniform source in [0, 1). Exported with makeRandom below so a test can
 * feed returnDraw a seeded stream directly: recovering an annual draw from a
 * compounded balance is lossy - a deep enough draw floors the balance at zero
 * and the logarithm goes to -Infinity - so a distributional assertion has to
 * read the scalar stream, not the plan it produced.
 */
export type Random = () => number;

/** mulberry32: a small, fast seeded PRNG yielding uniforms in [0, 1) */
function mulberry32(seed: number): Random {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRandom(seed?: number): Random {
  return seed === undefined ? Math.random : mulberry32(seed);
}

/** Box-Muller transform: a standard-normal variate from two uniforms */
function normalRandom(random: Random): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------- Return models ---------- */

/**
 * The shape of one year's return draw, at a fixed mean and spread.
 *
 * - "normal": independent draws from a Gaussian. Every year is a fresh coin,
 *   unrelated to the one before it.
 * - "clustered": bad years arrive in RUNS. A two-state Markov chain switches
 *   between a calm market and a crisis market, and the crisis state is both
 *   more volatile and more likely to be followed by another crisis year.
 *
 * The difference is not a matter of taste for a plan that WITHDRAWS. What
 * empties a portfolio is not one bad year, it is several arriving early while
 * the draw continues; independent draws almost never produce that run, so a
 * Gaussian engine flatters exactly the plans a user has tuned until the
 * number looked acceptable. Measured on a $400,000 pot drawing $1,333/mo over
 * 30 years, at the same mean and the same sigma: 0.07% ruin under "normal",
 * 0.27% under "clustered". At sigma 18 the same pair is 1.97% and 2.56%.
 *
 * The name itself lives in types.ts, with the rest of the shared vocabulary;
 * what lives HERE is the calibration and the evidence for it.
 */

export type { ReturnModel } from "../types/types";

/**
 * A generator of standardised annual draws - mean 0, variance 1 - for ONE
 * simulated path. Multiplying by `volatility` and adding `projectedGain` is
 * the caller's job, and doing it in that order is what makes a zero-volatility
 * run collapse to exactly the deterministic plan whatever the model.
 */
export type ReturnDraw = () => number;

/* --- the "clustered" market --- */

/**
 * Two-state Markov switching, calibrated against the annual record rather
 * than invented: about a quarter of years sit in the volatile state, a spell
 * in it lasts two years on average, and it is roughly 2.2x as volatile as a
 * calm year (the 1973-74, 2000-02, 2008-09, 2020 and 2022 clusters are all
 * one to three years long).
 *
 * The two states share ONE mean. A regime that also shifted the mean would be
 * a persistent drift rather than clustering, and a persistent drift shows up
 * as serial correlation in the returns themselves - the annual record has
 * essentially none (about -0.03) - and, worse, inflates the variance of a
 * multi-year sum. That is the trap this calibration avoids on purpose: with
 * equal means, Var(30-year sum) / (30 * Var(one year)) is 1.00, so sigma
 * still means sigma at thirty years as well as at one. An earlier draft with
 * a mean tilt measured 1.31 there, quietly turning a slider set to 12 into an
 * effective 13.8 over a long plan.
 */
const CALM_TO_CRISIS = 0.176;
const CRISIS_TO_CALM = 0.5;
/** Stationary share of years spent in the crisis state: 0.176 / (0.176 + 0.5) */
const CRISIS_SHARE = CALM_TO_CRISIS / (CALM_TO_CRISIS + CRISIS_TO_CALM);
const CALM_SD = 0.8;
const CRISIS_SD = 1.75;
/**
 * Standard deviation of the mixture, in closed form. Both states have mean 0,
 * so the mixture variance is just the share-weighted mean of the two
 * variances; dividing each state's sd by it makes the marginal variance
 * exactly 1 rather than approximately 1.
 */
const REGIME_SD = Math.sqrt(
  (1 - CRISIS_SHARE) * CALM_SD * CALM_SD + CRISIS_SHARE * CRISIS_SD * CRISIS_SD,
);

/**
 * The four numbers the clustered market is, exported so a test can pin them.
 *
 * They are not recoverable from the draws at any sample size this suite can
 * afford: cutting the mean crisis spell from two years to 1.7 while holding
 * the stationary share leaves every distributional statistic - mean, sd,
 * skew, autocorrelation, even the clustering measure itself - inside its
 * tolerance, because the two ranges overlap at 40,000 draws. Spell length is
 * the model's whole reason for existing, so it is pinned as a constant rather
 * than estimated from a sample that cannot resolve it.
 */
export const CLUSTERED_CALIBRATION = {
  calmToCrisis: CALM_TO_CRISIS,
  crisisToCalm: CRISIS_TO_CALM,
  calmSd: CALM_SD,
  crisisSd: CRISIS_SD,
} as const;

/**
 * Shape of the skew-normal innovation. Annual equity returns are close to
 * Gaussian in their tails - fat tails are a daily and monthly fact that
 * averaging washes out by the time a year is up - but they are decidedly
 * LEFT-SKEWED, about -0.43 over the annual record. Skew is therefore the one
 * non-normality worth carrying at this frequency, and alpha -1.9 is the shape
 * that reproduces that figure.
 */
const SKEW_SHAPE = -1.9;
const SKEW_DELTA = SKEW_SHAPE / Math.sqrt(1 + SKEW_SHAPE * SKEW_SHAPE);
const SKEW_MEAN = SKEW_DELTA * Math.sqrt(2 / Math.PI);
const SKEW_SD = Math.sqrt(1 - (2 * SKEW_DELTA * SKEW_DELTA) / Math.PI);

/**
 * A standardised skew-normal variate, shaped from two standard normals: one
 * folded to its magnitude, one added whole.
 *
 * TWO NORMALS, and no rejection step, so a year's innovation costs a FIXED
 * amount of randomness. A rejection sampler would draw a data-dependent
 * number of uniforms, which is how a seeded stream stops being reproducible
 * from the plan alone.
 *
 * Drawing the normals and SHAPING them are separate steps, which is what
 * makes two correlated lanes possible at all. This function is total over
 * every pair of standard normals, so a second lane whose normals are
 * correlated with this lane's - but still marginally standard normal - comes
 * out of it with EXACTLY this distribution. See followingDraw.
 */
function skewNormalFrom(half: number, rest: number): number {
  return (
    (SKEW_DELTA * Math.abs(half) +
      Math.sqrt(1 - SKEW_DELTA * SKEW_DELTA) * rest -
      SKEW_MEAN) /
    SKEW_SD
  );
}

/* --- the market a path lives through --- */

/**
 * One year of the market, split into the pieces a second lane needs to live
 * through the SAME year: the regime's spread, and the two standard normals
 * the year's innovation is shaped from.
 *
 * "normal" leaves `half` unused and pins `sd` at 1, because a Gaussian year
 * is its own innovation and has no regime. The field is still present rather
 * than optional so one MarketYear type describes both models and neither
 * branch has to test whether a field exists.
 */
interface MarketYear {
  /** The regime's standardised spread this year; 1 under "normal" */
  sd: number;
  /** The normal the skew-normal folds; 0 and unused under "normal" */
  half: number;
  /** The normal it adds whole; the entire draw under "normal" */
  rest: number;
}

/**
 * The years one path's market has lived so far, and the regime the next year
 * would start in.
 *
 * A tape is per PATH, exactly as the regime it carries always was: it is
 * created inside the path loop and dropped when the path ends. Sharing one
 * across paths is the bug the comment on startTape names.
 */
interface MarketTape {
  years: MarketYear[];
  /** The regime the NEXT year starts in; always false under "normal" */
  crisis: boolean;
}

/**
 * Starts a fresh path's market.
 *
 * The regime is drawn from its STATIONARY distribution, not started calm.
 * Starting every path in the calm state is a subtle and expensive mistake:
 * the chain then relaxes towards its long-run mix over the first few years,
 * handing every path a quiet opening it did not earn, and a withdrawal plan
 * is at its most fragile precisely in those years. Measured on the stressed
 * plan, an always-calm start reports 14.7% ruin where a stationary start
 * reports 21.7% - it does not merely blur the answer, it reverses the sign of
 * the model's effect.
 *
 * The state is per PATH, which is why this is a factory and not a module
 * variable: simulateOnce is called in a loop over one shared stream, and a
 * hoisted regime would let each path inherit the previous path's ending
 * state. Two LANES of the same path are the deliberate exception and are not
 * that bug: see simulatePair.
 */
const startTape = (model: ReturnModel, random: Random): MarketTape => ({
  years: [],
  crisis: model === "clustered" ? random() < CRISIS_SHARE : false,
});

/**
 * Appends one year to a tape and returns it.
 *
 * This is the ONLY place either model touches the stream, and it consumes it
 * exactly as this engine always has: one normalRandom per year under
 * "normal"; under "clustered" the two normals the innovation is shaped from
 * and then one uniform for the transition, in that order. Anything that
 * changed the count or the order here would re-phase every path after it and
 * move bands recorded since before models existed.
 */
function extendTape(
  model: ReturnModel,
  random: Random,
  tape: MarketTape,
): MarketYear {
  if (model !== "clustered") {
    const year = { sd: 1, half: 0, rest: normalRandom(random) };
    tape.years.push(year);
    return year;
  }
  const sd = (tape.crisis ? CRISIS_SD : CALM_SD) / REGIME_SD;
  const half = normalRandom(random);
  const rest = normalRandom(random);
  // Transition AFTER the draw, so the state sampled above is the one this
  // year was actually lived in
  tape.crisis = tape.crisis
    ? random() >= CRISIS_TO_CALM
    : random() < CALM_TO_CRISIS;
  const year = { sd, half, rest };
  tape.years.push(year);
  return year;
}

/** The standardised draw a recorded market year is worth under `model` */
const yearDraw = (model: ReturnModel, year: MarketYear): number =>
  model === "clustered"
    ? year.sd * skewNormalFrom(year.half, year.rest)
    : year.rest;

/**
 * The draw generator for the lane that LEADS: it lives each year as this
 * engine always has and records it on the tape for the other lane to read.
 * Recording is all that distinguishes it from a lone lane's generator, which
 * is why returnDraw below is defined as exactly this with a tape nobody
 * keeps.
 */
const leadingDraw =
  (model: ReturnModel, random: Random, tape: MarketTape): ReturnDraw =>
  () =>
    yearDraw(model, extendTape(model, random, tape));

/**
 * The draw generator for one path under `model`.
 *
 * "normal" MUST consume exactly one normalRandom per year and nothing else,
 * in the position it always has: the stream is seeded once per run and shared
 * across paths and lanes, so a single extra uniform re-phases every path after
 * it and moves bands this engine has recorded since before models existed.
 * The tape this builds is written and never read - a lone lane has no partner
 * to hand it to - and exists only so that a lane simulated alone and a lane
 * leading a pair run the same code rather than two copies that can drift.
 */
export function returnDraw(model: ReturnModel, random: Random): ReturnDraw {
  return leadingDraw(model, random, startTape(model, random));
}

/* --- two accounts, one market --- */

/**
 * How strongly the two lanes' annual returns move together in the two modes
 * that COMBINE them (combined and rollover). It is the correlation of the
 * finished annual draw, under either return model and whatever each lane's
 * own volatility slider says, because correlation is scale-free.
 *
 * ---------- The failure this prevents ----------
 * Until this constant existed the two lanes were drawn off one stream
 * consumed sequentially - all of A's paths, then all of B's - so path i of A
 * and path i of B came from disjoint stretches of the stream and were
 * INDEPENDENT. Measured at 600,000 annual draws a lane, the cross-lane
 * correlation was 0.0006 under "normal" and 0.0010 under "clustered". Nobody
 * chose that; it is what simulating one lane after the other happens to
 * produce, and it quietly credited a household with the diversification of
 * two unrelated markets.
 *
 * It is not a small error, and it is worst on the pessimistic figure the
 * whole simulation exists to produce. Splitting ONE $700,000 account into two
 * identically-configured $350,000 lanes - the same money, the same plan, the
 * same sliders - moved the 30-year 10th percentile UP by 70.7% and the 90th
 * DOWN by 11.3%. Summing two independent paths averages away variance that
 * does not average away for one investor holding two accounts in one market.
 *
 * ---------- Why a constant, and not a slider ----------
 * Every other simulated quantity in this app is something the user can
 * estimate: what they hold, what they will draw, how volatile they think it
 * is. Correlation is not. There is no figure in a user's head to type here,
 * and a slider would still need a default, so it would add a control without
 * removing the decision. It is the engine's claim about what two accounts of
 * one household are, and the honest place for it is a named constant with
 * this comment beside it and a row in the exported report (see
 * planAssumptions) rather than a knob nobody moves.
 *
 * ---------- Why not derived from the lanes' own sliders ----------
 * Deriving it from how alike the two lanes look - min(sigma)/max(sigma), or
 * some blend with the gains - was tried and rejected. It is not a
 * measurement; it is a second arbitrary choice wearing a derivation's
 * clothes. Three things kill it. At this app's OWN defaults both lanes carry
 * DEFAULT_VOLATILITY, so the ratio is 1 and the shipped default state becomes
 * two PERFECTLY correlated lanes - which is exactly the re-seeding artifact
 * the docblock on runIndividualSimulations names as a bug, arriving through
 * the front door. It makes the volatility slider do two jobs, so dragging
 * lane B from 15 to 16 moves the combined 10th percentile through a channel
 * no user can see or explain, which is the same objection that took the
 * Inflated switch out of this engine. And two lanes at sigma 18 gaining 12%
 * and 4% are plainly not the same asset, which no function of sigma alone can
 * know.
 *
 * ---------- Why 0.85 ----------
 * Two lanes here are two ACCOUNTS of one household - a 401(k) and a taxable
 * account, one spouse's and the other's - not two asset classes; the app has
 * no asset-class concept at all. Two diversified equity portfolios sit around
 * 0.85 to 0.95 on annual data (US total market against developed ex-US is
 * about 0.86), and 0.85 is deliberately the LOW end of that band, so the
 * engine errs towards the user's own reading rather than towards manufactured
 * pessimism. It also leaves lane B's own settings doing real work:
 * sqrt(1 - 0.85^2) = 0.527 of B's risk is still B's own.
 *
 * The one common pairing genuinely lower is equity against aggregate bonds,
 * near 0. 0.85 overstates joint risk there and is chosen KNOWING so, for two
 * reasons. The first is that the error is cheap exactly where it is wrong: a
 * low-sigma lane contributes little variance whatever it is correlated with,
 * so on a 25-year accumulating pair with lane A at sigma 17, the 0-to-0.85
 * swing in combined p10 is 38.6% when lane B is equity-like at sigma 17, 15.5%
 * at sigma 5, and 3.4% when it is cash-like at sigma 1. The second is that the
 * two directions of error are not symmetric: too high makes a plan look
 * riskier than it is, too low makes a retirement plan report a floor it does
 * not have. An unexamined 0 was choosing the second.
 *
 * The choice WITHIN the plausible band barely matters, and the band's floor
 * is the honest end of it. On that same plan the whole range 0.75 to 0.95
 * spans 6.9% of the 10th percentile ($1,425,973 to $1,334,182) against the
 * 38.8% the move off zero is worth ($1,913,977 to $1,378,693). That flatness
 * is the real argument for a constant: precision above 0.6 buys almost
 * nothing, and a slider would promise it.
 *
 * ---------- What it does NOT fix ----------
 * Two lanes at 0.85 are still not one account. Splitting $700,000 into two
 * identical $350,000 lanes and running it at this constant leaves the
 * 10th percentile 7.5% above the whole-account truth, where independence left
 * it 72.7% above; on the spending version of the same plan it leaves ruin
 * 8.4 points high where independence left it 23.7 points high. Only rho = 1
 * closes that gap exactly, and it does so exactly - the pair reproduces the
 * single account to the dollar. Rho = 1 is nonetheless a claim about the
 * market that is false for two different accounts, and it would make lane B's
 * own market nothing but lane A's rescaled, so the residual is accepted and
 * stated here rather than removed. A reader who weighs that identity above
 * the market claim should read 0.90 to 0.95 as the defensible neighbouring
 * choice; the numbers above are what the argument turns on.
 */
export const LANE_CORRELATION = 0.85;

/**
 * The correlation of two "clustered" draws whose underlying normals are
 * correlated at `latent`, in closed form.
 *
 * The clustered draw is sd * (delta*|h| + sqrt(1 - delta^2)*r - mean) / sd0.
 * Both lanes of a path share sd, and E[sd^2] is exactly 1 by REGIME_SD's
 * construction, so the regime drops out of the correlation entirely and only
 * the innovation is left. For a standard bivariate normal pair at correlation
 * p, Cov(|h_a|, |h_b|) is (2/pi)(sqrt(1 - p^2) + p*asin(p) - 1), and the two
 * normals of one lane are independent of the other lane's other normal, so
 * the cross terms vanish and what remains is the expression below.
 *
 * It is worth checking the two ends by hand: this is 0 at latent 0, and at
 * latent 1 the numerator collapses to delta^2*(1 - 2/pi) + 1 - delta^2, which
 * is SKEW_SD^2 exactly, so it is 1. The map is therefore a genuine
 * correlation-to-correlation function on [0, 1], and its derivative,
 * (delta^2*(2/pi)*asin(p) + 1 - delta^2) / SKEW_SD^2, is positive throughout -
 * which is what lets it be inverted by bisection.
 */
const clusteredDrawCorrelation = (latent: number): number =>
  (SKEW_DELTA *
    SKEW_DELTA *
    (2 / Math.PI) *
    (Math.sqrt(1 - latent * latent) + latent * Math.asin(latent) - 1) +
    (1 - SKEW_DELTA * SKEW_DELTA) * latent) /
  (SKEW_SD * SKEW_SD);

/**
 * The correlation to apply to the two normals a lane's year is shaped from,
 * so that the FINISHED draws come out at LANE_CORRELATION.
 *
 * Under "normal" the draw is the normal, so there is nothing to invert. Under
 * "clustered" the fold that makes the draw left-skewed also eats correlation:
 * feeding 0.85 straight through measures 0.756 in the finished draws. Storing
 * 0.85 as the latent figure and shipping it would mean the Return Model
 * toggle silently switched the correlation between the accounts from 0.85 to
 * 0.756 - one control quietly moving two assumptions, which is precisely what
 * standardising both models to variance 1 exists to stop, and it would make
 * the figure printed in the exported report wrong for the shipped default.
 *
 * So the TARGET is the constant and the latent figure is derived from it, by
 * the repo's own bisection over the closed form above. Deriving rather than
 * pinning also means the constant keeps its meaning if SKEW_SHAPE is ever
 * recalibrated: it is read out of SKEW_DELTA, not written down beside it.
 * Twenty halvings leave the realised correlation within about 2e-6 of the
 * target, which is finer than 200,000 draws can measure.
 */
const CLUSTERED_LATENT_CORRELATION = bisect(
  clusteredDrawCorrelation,
  1,
  0,
  LANE_CORRELATION,
);

const latentCorrelation = (model: ReturnModel): number =>
  model === "clustered" ? CLUSTERED_LATENT_CORRELATION : LANE_CORRELATION;

/**
 * The draw generator for the lane that FOLLOWS: it lives the leader's year -
 * the same regime, the same market shock - with an idiosyncratic component of
 * its own mixed in at the weight that realises LANE_CORRELATION.
 *
 * The coupling is applied to the two NORMALS the year is shaped from, never
 * to the finished draw, and that is the whole design. A follower's normals
 * are still marginally standard normal, so skewNormalFrom maps them onto
 * EXACTLY the leader's distribution: mean, spread, skew and kurtosis are
 * preserved by construction rather than approximately.
 *
 * The obvious alternative - a Cholesky blend of the finished draws,
 * z_b = rho*z_a + sqrt(1 - rho^2)*z_idio - was prototyped and measured, and
 * it is wrong for the model this app ships. Blending two independent copies
 * of a skewed variable is a convolution, and convolution washes the skew out:
 * it survives at a factor of rho^3 + (1 - rho^2)^1.5, which is 0.760 at
 * rho 0.85. Measured over 600,000 draws that turns lane B's skew from -0.523
 * into -0.397 and its excess kurtosis from 2.56 into 1.55, while lane A keeps
 * both - so whether a plan gets the clustered model's left tail at all would
 * depend on which slot the account was typed into. The worst case is not even
 * at a low rho: the factor bottoms out at 0.707 for rho = 1/sqrt(2). That is
 * a return model quietly de-skewed by a correlation setting, and it is the
 * reason the coupling lives one level down.
 *
 * The REGIME is shared outright rather than correlated. A crisis is a market
 * event, not an account event: 2008 did not arrive in the 401(k) and skip the
 * brokerage account. This is not the leak the comment on startTape forbids -
 * that one is a regime surviving from one PATH to the next, which lets a
 * simulated life inherit a market it never lived through. Here the two lanes
 * of the SAME path share the same simulated year, which is the claim being
 * modelled, and every path still starts its own chain from stationary.
 *
 * Sharing it also happens to be what makes LANE_CORRELATION mean what it
 * says. Because both lanes carry the same regime scale each year and
 * E[sd^2] is exactly 1, the regime cancels out of the correlation and the
 * closed form above is the whole story. Give each lane its OWN chain and the
 * two independent scale factors dilute the coupling by E[sd]^2 = 0.863: the
 * same latent figure then realises 0.734 rather than 0.850 (measured over
 * 3,000,000 draws, and 0.85 * 0.863 = 0.734 in closed form), so a second
 * calibration constant would be needed to undo a modelling choice nobody
 * wanted. Correlating the two chains at a rho of their own is the obvious
 * refinement and is deliberately not attempted: a second uncalibrated
 * correlation is not an improvement on one calibrated one, and an outright
 * share is the honest upper bound rather than a fitted guess.
 *
 * Years past the leader's horizon extend the tape from the follower's own
 * stream, continuing the same regime chain rather than starting a new one:
 * lane B outliving lane A is not lane B entering a fresh market.
 */
function followingDraw(
  model: ReturnModel,
  random: Random,
  tape: MarketTape,
  latent: number,
): ReturnDraw {
  const own = Math.sqrt(1 - latent * latent);
  let year = 0;
  return () => {
    while (tape.years.length <= year) extendTape(model, random, tape);
    const market = tape.years[year];
    year++;
    if (model !== "clustered") {
      return latent * market.rest + own * normalRandom(random);
    }
    // Locals, not arguments: the two idiosyncratic normals come off the
    // stream in a stated order rather than in whatever order the arguments
    // of a call happen to be evaluated in
    const half = latent * market.half + own * normalRandom(random);
    const rest = latent * market.rest + own * normalRandom(random);
    return market.sd * skewNormalFrom(half, rest);
  };
}

/**
 * One path's pair of draw generators: the leader's, and the follower's
 * reading the leader's market.
 *
 * Exported for the same reason returnDraw is - recovering an annual draw from
 * a compounded balance is lossy, so the assertions that this coupling leaves
 * both marginals alone and lands the correlation on LANE_CORRELATION have to
 * read the scalar draws. Call `a` for a path's whole horizon and then `b` for
 * its whole horizon, which is the order simulatePair consumes them in.
 */
export function pairedReturnDraws(
  model: ReturnModel,
  random: Random,
): { a: ReturnDraw; b: ReturnDraw } {
  const tape = startTape(model, random);
  return {
    a: leadingDraw(model, random, tape),
    b: followingDraw(model, random, tape, latentCorrelation(model)),
  };
}

/* ---------- Checkpoint grid ---------- */

/**
 * The months from today at which a lane of `years` is sampled: today, every
 * completed year, and the horizon itself when it is fractional. This is
 * exactly the grid simulateOnce walks, and it is what a band's `months`
 * reports, so nothing downstream has to infer a date from an array index.
 *
 * @param years - Horizon in years (fractional allowed)
 * @returns Ascending, duplicate-free months, always starting at 0
 */
export function checkpointMonths(years: number): number[] {
  const totalMonths = Math.max(0, toMonths(years));
  const months: number[] = [];
  for (let m = 0; m <= totalMonths; m += MONTHS_PER_YEAR) months.push(m);
  if (months[months.length - 1] !== totalMonths) months.push(totalMonths);
  return months;
}

/**
 * The union of two lanes' grids. Pairing two lanes on this grid is what keeps
 * months, rather than array indices, the key: a lane with a fractional horizon
 * no longer pushes the other lane's whole-year checkpoints off their dates.
 */
const sharedGrid = (a: MonteCarloParams, b: MonteCarloParams): number[] =>
  [
    ...new Set([
      ...checkpointMonths(a.yearsOfGrowth),
      ...checkpointMonths(b.yearsOfGrowth),
    ]),
  ].sort((x, y) => x - y);

/* ---------- Single Simulation ---------- */

/**
 * Simulates one randomised path month-by-month, recording a checkpoint at
 * every month in `grid` (its own grid by default). Grid months beyond this
 * lane's horizon repeat its final value, so a shorter lane contributes a
 * constant to a longer portfolio instead of ending the series early.
 */
function simulateOnce(
  params: MonteCarloParams,
  random: Random,
  {
    injection,
    grid = checkpointMonths(params.yearsOfGrowth),
    draw: pairedDraw,
  }: SimOptions = {},
): SimPath {
  const {
    initialAmount,
    projectedGain,
    yearsOfGrowth,
    monthlyContribution,
    monthlyWithdrawal,
    withdrawalStartYear,
    contributionStopYear,
    inflationPct,
    annualFeePct = 0,
    volatility,
    dynamicWithdrawal,
    withdrawalTaxPct,
    spendingKeepsPace,
    returnModel = "normal",
  } = params;

  const totalMonths = Math.max(0, toMonths(yearsOfGrowth));
  // Cash-flow windows use the same months-from-today resolution as
  // InvestmentCalculator: contribute while month < toMonths(stop) (an unset
  // stop year, and only an unset one, means "until the horizon"), withdraw
  // once month >= toMonths(start), and land the rollover after the month that
  // completes injection.month months.
  const contributionEndMonth = toMonths(contributionStopYear ?? yearsOfGrowth);
  const withdrawalStartMonth = toMonths(withdrawalStartYear);
  const monthlyFeeRate = annualFeePct / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
  // Fisher deflator (1 + i)^-t, not (1 - i)^t; the minus sign belongs to the
  // exponent, so a zero rate leaves every checkpoint untouched
  const inflationFactor = 1 + inflationPct / PERCENTAGE_DIVISOR;

  let nominal = initialAmount;
  let monthlyRate = 0;
  let dynamicMonthly = 0;
  // Per PATH, never hoisted: a clustered draw carries a regime that must
  // start fresh - and start stationary - for every simulated life. A paired
  // run hands its own generator in, so the two lanes of one path can read one
  // market; a lone lane builds its own here and reads nothing else.
  const draw = pairedDraw ?? returnDraw(returnModel, random);

  const injectIfDue = (monthsDone: number) => {
    if (injection && monthsDone === injection.month) {
      nominal += injection.amount;
    }
  };

  const nominalTrack: number[] = [];
  const realTrack: number[] = [];
  let next = 0;
  /**
   * Records every grid entry falling on this month, on both tracks. The grid
   * is ascending and monthsDone advances one month at a time, so a single
   * cursor visits each entry exactly once, whatever mid-year months the other
   * lane contributed.
   */
  const record = (monthsDone: number) => {
    while (next < grid.length && grid[next] === monthsDone) {
      nominalTrack.push(Math.floor(nominal));
      realTrack.push(
        Math.floor(
          nominal * Math.pow(inflationFactor, -monthsDone / MONTHS_PER_YEAR),
        ),
      );
      next++;
    }
  };

  injectIfDue(0);
  record(0);

  for (let month = 0; month < totalMonths; month++) {
    // Randomise the annual return at the start of each simulated year. A draw
    // held for k months moves the log balance by k*X/1200, so its standard
    // deviation is k*sigma/1200 where a k-month slice should carry
    // sqrt(k/12)*sigma/100; equating the two gives the sqrt(12/k) factor
    // below. The drift is already pro-rated correctly by k, and this consumes
    // no extra randomness, so every seeded stream and every whole-year chunk
    // (the only kind an integer horizon has) is unchanged.
    if (month % MONTHS_PER_YEAR === 0) {
      const chunk = Math.min(MONTHS_PER_YEAR, totalMonths - month);
      // The whole standardised deviate is multiplied by volatility, so a
      // zero-volatility run collapses to exactly projectedGain under EVERY
      // model - which is what the parity suite against the deterministic
      // engine measures. A model that added anything outside this multiplier
      // would survive at sigma 12 and break every one of those tests at 0.
      const shock = volatility * Math.sqrt(MONTHS_PER_YEAR / chunk) * draw();
      monthlyRate =
        (projectedGain + shock) / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
    }

    // Withdrawals: a dynamic policy is re-evaluated from this path's own
    // balance at the start of every withdrawal year, with its guardrails
    // indexed to that month so they hold their value in today's dollars
    const sinceStart = month - withdrawalStartMonth;
    if (
      dynamicWithdrawal &&
      sinceStart >= 0 &&
      sinceStart % MONTHS_PER_YEAR === 0
    ) {
      dynamicMonthly = dynamicMonthlyWithdrawal(
        nominal,
        dynamicWithdrawal,
        guardrailIndex(inflationPct, month),
        withdrawalTaxPct,
      );
    }
    // Only the fixed leg is grossed here: dynamicMonthly already came back
    // grossed from the shared helper, and grossing it twice would be invisible
    // at a zero rate and wrong at every other one. Both engines gross BEFORE
    // the cap below, so the balance floors at zero instead of going negative
    // paying a tax it cannot afford.
    const requested =
      sinceStart < 0
        ? 0
        : dynamicWithdrawal
          ? dynamicMonthly
          : grossWithdrawal(
              spendingKeepsPace
                ? monthlyWithdrawal * guardrailIndex(inflationPct, month)
                : monthlyWithdrawal,
              withdrawalTaxPct,
            );
    // A path can only spend what it holds, exactly as InvestmentCalculator
    // caps its draw: the balance floors at zero instead of going negative and
    // compounding a debt for the rest of the horizon
    nominal -= Math.min(requested, Math.max(0, nominal));
    if (nominal <= 0) nominal = 0;

    nominal += nominal * monthlyRate;

    if (monthlyFeeRate > 0) {
      nominal -= nominal * monthlyFeeRate;
    }

    // Contributions earn growth in the month they are made
    if (month < contributionEndMonth) {
      nominal += monthlyContribution * (1 + monthlyRate);
    }

    // Apply any rollover due, then record whatever checkpoints land here
    const monthsDone = month + 1;
    injectIfDue(monthsDone);
    record(monthsDone);
  }

  // Grid months past this lane's own horizon hold its final value
  while (next < grid.length) {
    nominalTrack.push(nominalTrack[nominalTrack.length - 1]);
    realTrack.push(realTrack[realTrack.length - 1]);
    next++;
  }

  return { nominal: nominalTrack, real: realTrack };
}

function simulatePaths(
  params: MonteCarloParams,
  random: Random,
  options?: SimOptions,
): SimPath[] {
  return Array.from({ length: params.simCount }, () =>
    simulateOnce(params, random, options),
  );
}

/** Picks the track a view is drawing off paths that always carry both */
const tracked = (paths: SimPath[], track: DisplayTrack): number[][] =>
  paths.map((path) => path[track]);

/* ---------- Percentile extraction ---------- */

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/* ---------- Public API ---------- */

/**
 * Which track every band below is drawn on. It is an argument, never a field
 * of the plan: the paths always carry both, and the Inflated toggle is a
 * property of the view that is reading them. "nominal" is the money track -
 * what the plan will actually hold - which is what anything but a display
 * wants.
 */
const DEFAULT_TRACK: DisplayTrack = "nominal";

/**
 * Runs N simulations and returns raw paths (one number[] per simulation) on
 * this lane's own checkpoint grid: one entry per completed year (index 0 =
 * today), plus one for a trailing partial year. Use checkpointMonths() to
 * date them.
 */
export function simulateAll(
  params: MonteCarloParams,
  track: DisplayTrack = DEFAULT_TRACK,
): number[][] {
  return tracked(simulatePaths(params, makeRandom(params.seed)), track);
}

/**
 * Computes percentile bands from raw simulation paths, dated by `grid` (whole
 * years from today by default).
 *
 * The depletion probability is measured here rather than inside simulateOnce
 * because it is a property of the portfolio the band describes: in combined
 * and rollover mode the paths handed in are already summed or spliced, and a
 * per-leg first-zero month would measure the wrong series. It is cumulative -
 * once a funded path has been seen at or below zero it stays counted - so the
 * figure answers "has this plan run out by now", not "is it empty at this
 * instant". A path that has never held a positive balance has nothing to run
 * out of and is not counted.
 */
export function computeBands(
  paths: number[][],
  grid?: number[],
): PercentileBand[] {
  if (paths.length === 0) return [];
  const checkpoints = paths[0].length;
  const monthsAt = (i: number) => grid?.[i] ?? i * MONTHS_PER_YEAR;
  const ranOut = paths.map(() => false);
  // A path only counts as "run out" once it has held money to lose. A plan
  // that starts at zero and is being funded up sits at zero on checkpoint 0
  // through no failure of its own, and the deterministic engine agrees: it
  // records a depletion month only when a withdrawal was actually requested.
  const funded = paths.map(() => false);
  const bands: PercentileBand[] = [];

  for (let i = 0; i < checkpoints; i++) {
    let depleted = 0;
    const values = paths.map((run, p) => {
      if (run[i] > 0) funded[p] = true;
      else if (funded[p]) ranOut[p] = true;
      if (ranOut[p]) depleted++;
      return run[i];
    });
    values.sort((a, b) => a - b);

    bands.push({
      months: monthsAt(i),
      p10: percentile(values, 10),
      p25: percentile(values, 25),
      p50: percentile(values, 50),
      p75: percentile(values, 75),
      p90: percentile(values, 90),
      depletedPct: depleted / values.length,
    });
  }

  return bands;
}

/**
 * Share of runs, per checkpoint, in which ANY leg of a multi-lane portfolio has
 * run dry.
 *
 * Depletion cannot be read off a summed series: a lane that never withdraws
 * can never reach zero, so the sum never reaches zero either, and the spending
 * lane's risk disappears into it. The app's default Monte Carlo mode is
 * "combined" and advanced mode always carries a lane B, so the masking lane
 * was one the user had not chosen - the panel reported a 0% chance of running
 * out beside a row naming the very date the plan runs out.
 *
 * Each leg carries the same `funded`/`ranOut` gates computeBands applies, so a
 * leg that has never held money has nothing to run out of, and a leg once seen
 * empty stays counted. `until` bounds the checkpoints a leg exists over, for a
 * rollover where one account is absorbed into the other partway along.
 */
function ruinAcrossLegs(
  legs: { paths: number[][]; until?: number }[],
  checkpoints: number,
): { any: number[]; perLeg: number[][] } {
  const runs = legs[0]?.paths.length ?? 0;
  if (runs === 0) {
    return {
      any: new Array<number>(checkpoints).fill(0),
      perLeg: legs.map(() => new Array<number>(checkpoints).fill(0)),
    };
  }
  const funded = legs.map(() => new Array<boolean>(runs).fill(false));
  const ranOut = legs.map(() => new Array<boolean>(runs).fill(false));
  const any = new Array<number>(checkpoints);
  const perLeg = legs.map(() => new Array<number>(checkpoints));

  for (let i = 0; i < checkpoints; i++) {
    let depleted = 0;
    const legCount = legs.map(() => 0);
    for (let run = 0; run < runs; run++) {
      let anyLeg = false;
      legs.forEach((leg, l) => {
        if (i < (leg.until ?? checkpoints)) {
          const value = leg.paths[run][i];
          if (value > 0) funded[l][run] = true;
          else if (funded[l][run]) ranOut[l][run] = true;
        }
        // Outside the `until` bound on purpose: an account that has already
        // run dry has run dry for good, and stops being inspected only in the
        // sense that it can gain no NEW failure after it is absorbed
        if (ranOut[l][run]) {
          anyLeg = true;
          legCount[l]++;
        }
      });
      if (anyLeg) depleted++;
    }
    any[i] = depleted / runs;
    legs.forEach((_, l) => {
      perLeg[l][i] = legCount[l] / runs;
    });
  }

  // `any` is a per-run OR and is deliberately NOT derived from the per-leg
  // shares: max(a, b) <= any <= min(1, a + b), with equality at the lower
  // bound only when the legs never fail in the same run. On a plan where only
  // one lane spends it happens to equal the max, which is exactly the kind of
  // coincidence that makes a wrong derivation look right on the plan it was
  // tested against.
  return { any, perLeg };
}

/** Attaches an any-leg figure and its per-account breakdown to a band set */
const withLegRuin = (
  bands: PercentileBand[],
  ruin: { any: number[]; perLeg: number[][] },
  bounds: { a: number; b: number },
): PercentileBand[] =>
  bands.map((band, i) => ({
    ...band,
    depletedPct: ruin.any[i],
    legDepletion: {
      a: {
        depletedPct: ruin.perLeg[0][i],
        throughMonth: Math.min(band.months, bounds.a),
      },
      b: {
        depletedPct: ruin.perLeg[1][i],
        throughMonth: Math.min(band.months, bounds.b),
      },
    },
  }));

/**
 * Simulates BOTH lanes of a pair, path for path, on one market.
 *
 * Lane A leads and lane B follows, and the asymmetry is only in the code: the
 * pair's joint distribution is the same either way round, because a
 * correlation is symmetric and both lanes end up with the same marginal. What
 * the asymmetry buys is that lane A reads the seeded stream in exactly the
 * order and quantity a lane simulated ALONE reads it, so leg A's percentiles,
 * leg A's ruin share and the balance a rollover rolls are bit-identical to a
 * lone run of A. Half of what a correlation changes is therefore provably
 * nothing, which is what makes the rest of it auditable.
 *
 * Both lanes are simulated in full passes, A then B, exactly as before. The
 * tapes are what carry A's market across to B, and they are the only new
 * state: one per path, holding at most that path's years.
 *
 * Two lanes on DIFFERENT return models are NOT paired. There is no calibrated
 * correlation between a Gaussian year and a clustered one, and forcing the
 * one there is would break a marginal: a "clustered" follower reading a
 * "normal" leader's tape would take a fold of `half` that is not a standard
 * normal, and lose its own skew. The app cannot produce the case - one toggle
 * drives both lanes - so this branch exists to say what happens if it ever
 * does: B draws its own independent market, exactly as it did before this
 * function existed.
 */
function simulatePair(
  paramsA: MonteCarloParams,
  paramsB: MonteCarloParams,
  random: Random,
  grid: number[],
  injectionFor?: (pathA: SimPath) => LumpSumInjection | undefined,
): { pathsA: SimPath[]; pathsB: SimPath[] } {
  const model = paramsA.returnModel ?? "normal";
  const paired = (paramsB.returnModel ?? "normal") === model;
  const latent = latentCorrelation(model);
  const tapes: MarketTape[] = [];
  const pathsA = Array.from({ length: paramsA.simCount }, () => {
    const tape = startTape(model, random);
    tapes.push(tape);
    return simulateOnce(paramsA, random, {
      grid,
      draw: leadingDraw(model, random, tape),
    });
  });
  const pathsB = pathsA.map((pathA, i) =>
    simulateOnce({ ...paramsB, simCount: paramsA.simCount }, random, {
      grid,
      injection: injectionFor?.(pathA),
      draw: paired ? followingDraw(model, random, tapes[i], latent) : undefined,
    }),
  );
  return { pathsA, pathsB };
}

/**
 * Runs paired A+B simulations, sums paths element-wise, returns combined bands.
 * Each investment is simulated for its own horizon; past it, its final value
 * is carried forward as a constant so only the other's randomness drives
 * further widening. Both lanes are sampled on the union of their grids, so a
 * fractional horizon adds a row of its own rather than displacing one.
 *
 * Path i of A and path i of B are ONE household's two accounts in ONE market
 * (see LANE_CORRELATION and simulatePair). They used to be two draws from
 * unrelated markets, which is what summing them element-wise had quietly been
 * claiming, and it made the lower tail this function exists to report
 * optimistic by tens of percent.
 */
export function runCombinedSimulation(
  paramsA: MonteCarloParams,
  paramsB: MonteCarloParams,
  track: DisplayTrack = DEFAULT_TRACK,
): PercentileBand[] {
  const random = makeRandom(paramsA.seed ?? paramsB.seed);
  const grid = sharedGrid(paramsA, paramsB);
  const { pathsA, pathsB } = simulatePair(paramsA, paramsB, random, grid);
  const legA = pathsA.map((p) => p[track]);
  const legB = pathsB.map((p) => p[track]);
  const bands = computeBands(
    legA.map((a, i) => a.map((value, k) => value + legB[i][k])),
    grid,
  );
  // Percentiles describe the portfolio; running out is a property of the
  // accounts inside it, so it is measured on the legs (see ruinAcrossLegs)
  const ruin = ruinAcrossLegs([{ paths: legA }, { paths: legB }], grid.length);
  const last = grid[grid.length - 1] ?? 0;
  return withLegRuin(bands, ruin, { a: last, b: last });
}

/**
 * Runs both lanes off ONE shared random stream, consumed sequentially, and
 * returns a band set per lane on that lane's own grid.
 *
 * Two separate runMonteCarloSimulation calls would restart the same seeded
 * stream and hand path i of B exactly the shocks of path i of A, making the
 * lanes perfectly correlated - invisible in the marginal percentiles drawn
 * today, and wrong for anything that ever pairs the two path sets.
 *
 * This is the one paired entry point that is deliberately NOT coupled at
 * LANE_CORRELATION, and the reason is that nothing here is paired: individual
 * mode draws two cones and prints two blocks of rows, and never sums, splices
 * or compares the two path sets. Every figure it returns is a MARGINAL, and a
 * correlation leaves marginals exactly where they are - so coupling here
 * would re-phase both lanes' streams and move every individual-mode figure on
 * record to change nothing a reader can see. It would also cost the identity
 * the test below pins, that lane A here IS a lone run of A.
 */
export function runIndividualSimulations(
  paramsA: MonteCarloParams,
  paramsB: MonteCarloParams,
  track: DisplayTrack = DEFAULT_TRACK,
): { a: PercentileBand[]; b: PercentileBand[] } {
  const random = makeRandom(paramsA.seed ?? paramsB.seed);
  const gridA = checkpointMonths(paramsA.yearsOfGrowth);
  const gridB = checkpointMonths(paramsB.yearsOfGrowth);
  const pathsA = simulatePaths(paramsA, random, { grid: gridA });
  const pathsB = simulatePaths(paramsB, random, { grid: gridB });
  return {
    a: computeBands(tracked(pathsA, track), gridA),
    b: computeBands(tracked(pathsB, track), gridB),
  };
}

/**
 * Runs paired A+B simulations modelling rollover: A's ending balance is
 * injected into B as a lump sum at A's finish year, so B's growth compounds on
 * the larger base. Before that month the portfolio is A+B; from it on, B alone
 * (which now includes A's rolled value).
 *
 * The rollover date is not a parameter because the product semantic fixes it:
 * "A's ending balance rolls into B at A's finish year". The injected figure is
 * A's final checkpoint on the nominal track, floored exactly as the
 * deterministic engine floors the matrix row it rolls. A rollover past B's
 * horizon never fires, so the portfolio then stays A+B throughout.
 */
export function runRolloverSimulation(
  paramsA: MonteCarloParams,
  paramsB: MonteCarloParams,
  track: DisplayTrack = DEFAULT_TRACK,
): PercentileBand[] {
  const random = makeRandom(paramsA.seed ?? paramsB.seed);
  const grid = sharedGrid(paramsA, paramsB);
  const rolloverMonth = Math.max(0, toMonths(paramsA.yearsOfGrowth));
  const fires = rolloverMonth <= Math.max(0, toMonths(paramsB.yearsOfGrowth));

  const { pathsA, pathsB } = simulatePair(
    paramsA,
    paramsB,
    random,
    grid,
    // A is sampled on the shared grid, so its last entry is its horizon
    // value carried forward: the balance at the rollover month itself
    (pathA) =>
      fires
        ? {
            month: rolloverMonth,
            amount: pathA.nominal[pathA.nominal.length - 1],
          }
        : undefined,
  );
  const legA = pathsA.map((p) => p[track]);
  const legB = pathsB.map((p) => p[track]);
  const portfolioPaths = legA.map((a, i) =>
    grid.map((months, k) =>
      fires && months >= rolloverMonth ? legB[i][k] : a[k] + legB[i][k],
    ),
  );

  const bands = computeBands(portfolioPaths, grid);
  // Until the roll fires the two accounts are separate and either can run dry
  // behind the sum; after it there is one account, and A no longer exists to
  // fail on its own
  const rollAt = fires
    ? grid.findIndex((months) => months >= rolloverMonth)
    : -1;
  // INCLUSIVE of A's own final checkpoint. `until` is an exclusive bound and
  // rollAt is the index of the rollover month itself, so stopping at rollAt
  // skipped the one checkpoint where a spending lane most often first reads
  // zero: an A that drained during its last year reported 0% ruin here while
  // the same pair in combined mode reported 100%. A run out at the moment it
  // rolls has still run out - what B receives is nothing.
  const untilA = rollAt === -1 ? grid.length : rollAt + 1;
  const ruin = ruinAcrossLegs(
    [{ paths: legA, until: untilA }, { paths: legB }],
    grid.length,
  );
  const last = grid[grid.length - 1] ?? 0;
  return withLegRuin(bands, ruin, {
    // After the roll, A no longer exists to fail on its own, so its figure is
    // frozen at the roll date and says so rather than implying a horizon-end
    // claim about an account that stopped existing years earlier
    a: fires ? rolloverMonth : last,
    b: last,
  });
}

/**
 * Runs Monte Carlo simulations and returns percentile bands per checkpoint.
 * Convenience wrapper around simulateAll + computeBands.
 */
export function runMonteCarloSimulation(
  params: MonteCarloParams,
  track: DisplayTrack = DEFAULT_TRACK,
): PercentileBand[] {
  return computeBands(
    simulateAll(params, track),
    checkpointMonths(params.yearsOfGrowth),
  );
}
