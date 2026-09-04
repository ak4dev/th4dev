/* ==================================================
 * Golden Plan Fixtures
 *
 * Five complete plans, each one a different route
 * through the hub's engine-to-UI wiring: basic mode, a
 * fixed withdrawal, a dynamic policy read in today's
 * dollars, a rollover, and a target the solver cannot
 * reach.
 *
 * They exist to be RENDERED and compared against exact
 * numbers (see InvestmentCalculatorModern.test.ts), so
 * every figure here is a whole, readable number: a
 * $250,000 pot at 7% for 30 years, not $247,318.44 at
 * 6.83%. When an expected value moves, the plan that
 * produced it should be legible at a glance.
 *
 * These are TH4State values — the boundary shape a file,
 * a scenario snapshot or a localStorage record carries —
 * so a suite can push each one through normalizeState and
 * exercise the same load path the app does.
 * ================================================== */

import {
  DEFAULT_INPUTS,
  DEFAULT_SLIDERS,
  DEFAULT_TOGGLES,
} from "../../../common/helpers/state-manager";
import { DEFAULT_THEME } from "../../../common/constants/app-constants";
import type { TH4State, TogglesState } from "../../../common/types/types";

/** One plan, plus the wiring rule its numbers are there to hold still */
export interface PlanFixture {
  /** Short name; used as the describe() title */
  name: string;
  /** What a change to this fixture's expected values would mean */
  pins: string;
  state: TH4State;
}

/**
 * Builds a complete TH4State from the app's own defaults plus the handful of
 * values a scenario actually cares about.
 *
 * Spreading DEFAULT_SLIDERS/DEFAULT_INPUTS/DEFAULT_TOGGLES rather than listing
 * thirty keys per fixture is what keeps the interesting values visible: a
 * reader sees only what this plan changes. It also means a slider added in a
 * later batch arrives here with its default already in place, so these
 * fixtures describe the same plans they described before it existed.
 */
const plan = (
  name: string,
  pins: string,
  {
    sliders = {},
    inputs = {},
    toggles = {},
  }: {
    sliders?: Record<string, number>;
    inputs?: Record<string, string>;
    toggles?: Partial<TogglesState>;
  },
): PlanFixture => ({
  name,
  pins,
  state: {
    theme: DEFAULT_THEME,
    sliders: { ...DEFAULT_SLIDERS, ...sliders },
    inputs: { ...DEFAULT_INPUTS, ...inputs },
    toggles: { ...DEFAULT_TOGGLES, ...toggles },
    stock: { holdings: [] },
    budgetItems: [],
    scenarios: [],
    activePage: "f",
  },
});

/**
 * (a) BASIC MODE, and every tool switched on.
 *
 * $100,000 at 8% for 20 years. The plan also STORES a $1,000 monthly
 * contribution, a $500 monthly withdrawal, a 1% annual fee and every tool
 * toggle — none of which basic mode runs. buildLane resolves the mode at the
 * boundary, so the ending balance must be pure compound growth, lane B must
 * not be drawn, no tool panel may appear, and Monte Carlo must not run.
 *
 * That is the whole point of storing them: a fixture whose stored values are
 * already zero cannot tell a resolved boundary from a forgotten one.
 */
export const BASIC_MODE_PLAN = plan(
  "basic mode ignores every stored advanced input",
  "the advanced-mode boundary: buildLane zeroes the cash flows and isTool gates every tool",
  {
    inputs: { currentAmountA: "100000", currentAmountB: "50000" },
    sliders: {
      projectedGainA: 8,
      yearsOfGrowthA: 20,
      monthlyContributionA: 1000,
      monthlyWithdrawalA: 500,
      withdrawalStartYearA: 5,
      annualFeeA: 1,
      yearlyInflation: 2.5,
    },
    toggles: {
      advanced: false,
      rollover: true,
      fees: true,
      portfolio: true,
      monteCarlo: true,
      fire: true,
      scenarios: true,
      budget: true,
    },
  },
);

/**
 * (b) ADVANCED, fixed withdrawals starting in year 10, with fees on.
 *
 * Lane A: $250,000 at 7% for 30 years, contributing $500/mo until year 10 and
 * then drawing $2,000/mo — a plan that survives its horizon.
 * Lane B: $80,000 at 5% drawing $1,500/mo from day one — a plan that RUNS
 * OUT, which is what pins the depletion wiring: getDepletedAtMonth() feeds
 * "(B) Runs Out", and the Monte Carlo band's cumulative depletedPct feeds
 * "(B) Chance of Running Out".
 *
 * Monte Carlo is in "individual" mode so both lanes get their own bands.
 */
export const FIXED_WITHDRAWAL_PLAN = plan(
  "advanced fixed withdrawal from year 10, with a lane that runs out",
  "withdrawal/contribution windows, depletion reporting, per-lane fees, and per-lane Monte Carlo bands",
  {
    inputs: { currentAmountA: "250000", currentAmountB: "80000" },
    sliders: {
      projectedGainA: 7,
      yearsOfGrowthA: 30,
      monthlyContributionA: 500,
      contributionStopYearA: 10,
      monthlyWithdrawalA: 2000,
      withdrawalStartYearA: 10,
      targetValueA: 500_000,
      annualFeeA: 0.5,
      volatilityA: 12,
      projectedGainB: 5,
      yearsOfGrowthB: 20,
      monthlyContributionB: 0,
      monthlyWithdrawalB: 1500,
      withdrawalStartYearB: 0,
      annualFeeB: 0.25,
      volatilityB: 18,
      yearlyInflation: 2.5,
    },
    toggles: {
      advanced: true,
      fees: true,
      monteCarlo: true,
      monteCarloMode: "individual",
    },
  },
);

/**
 * (c) DYNAMIC WITHDRAWAL POLICY with guardrails, non-zero inflation, read in
 * TODAY'S DOLLARS.
 *
 * Lane A draws 5% of the balance a year, floored at $1,000/mo and capped at
 * $3,000/mo; lane B draws 4% from year 5, floored at $500 and capped at
 * $2,000. Inflation is 3% and the Inflated toggle is ON, so every displayed
 * balance is the single nominal balance deflated by (1 + i)^-t while the
 * withdrawal range stays nominal and the guardrails are indexed.
 *
 * This is the fixture that would catch a refactor reading the display track
 * where nominal is meant, or vice versa.
 */
export const DYNAMIC_POLICY_PLAN = plan(
  "dynamic withdrawal policy in today's dollars",
  "the Fisher deflator, the nominal/display split, and the indexed guardrail range",
  {
    inputs: { currentAmountA: "600000", currentAmountB: "200000" },
    sliders: {
      projectedGainA: 6,
      yearsOfGrowthA: 25,
      monthlyContributionA: 0,
      withdrawalRateA: 5,
      withdrawalFloorA: 1000,
      withdrawalCeilingA: 3000,
      withdrawalStartYearA: 0,
      volatilityA: 12,
      projectedGainB: 6,
      yearsOfGrowthB: 25,
      monthlyContributionB: 0,
      withdrawalRateB: 4,
      withdrawalFloorB: 500,
      withdrawalCeilingB: 2000,
      withdrawalStartYearB: 5,
      volatilityB: 12,
      yearlyInflation: 3,
    },
    toggles: {
      advanced: true,
      dynamicWithdrawal: true,
      showInflation: true,
      monteCarlo: true,
      monteCarloMode: "combined",
    },
  },
);

/**
 * (d) ROLLOVER from A into B, with A's horizon SHORTER than B's, so the roll
 * actually lands.
 *
 * Lane A: $150,000 at 8% for 10 years, contributing $1,000/mo. At year 10 its
 * whole NOMINAL ending balance is injected into lane B ($60,000 at 6% for 30
 * years, contributing $250/mo), which compounds it for the remaining 20.
 *
 * Neither lane withdraws, so the depletion row must be ABSENT: "0% chance of
 * running out" is an answer to a question nobody asked. Monte Carlo resolves
 * to rollover mode, whose bands are labelled "Portfolio".
 */
export const ROLLOVER_PLAN = plan(
  "rollover from A into B, A finishing first",
  "the rollover injection (nominal, at A's finish year) and the Portfolio-labelled Monte Carlo bands",
  {
    inputs: { currentAmountA: "150000", currentAmountB: "60000" },
    sliders: {
      projectedGainA: 8,
      yearsOfGrowthA: 10,
      monthlyContributionA: 1000,
      monthlyWithdrawalA: 0,
      volatilityA: 12,
      projectedGainB: 6,
      yearsOfGrowthB: 30,
      monthlyContributionB: 250,
      monthlyWithdrawalB: 0,
      volatilityB: 12,
      yearlyInflation: 2.5,
    },
    toggles: {
      advanced: true,
      rollover: true,
      monteCarlo: true,
    },
  },
);

/**
 * (e) A TARGET the plan cannot reach: $100,000,000 on a $25,000 pot.
 *
 * The Target Value control spans up to maxAchievable() — every lever at its
 * most favourable bound — so the stored goal is CLAMPED to that ceiling on
 * screen, and no year of the plan ever reaches it ("> 20 yrs").
 *
 * Lane A also carries a non-zero withdrawal and contribution so that a solve
 * against this target has all three levers to move and reports every one of
 * them, rather than skipping the ones already sitting on their bound.
 */
export const CLAMPED_TARGET_PLAN = plan(
  "a target above everything the levers can reach",
  "maxAchievable as the target ceiling, and the solver cascade the hub hands it",
  {
    inputs: { currentAmountA: "25000", currentAmountB: "25000" },
    sliders: {
      projectedGainA: 7,
      yearsOfGrowthA: 20,
      monthlyContributionA: 200,
      monthlyWithdrawalA: 1000,
      withdrawalStartYearA: 10,
      targetValueA: 100_000_000,
      projectedGainB: 5,
      yearsOfGrowthB: 20,
      yearlyInflation: 2.5,
    },
    toggles: { advanced: true },
  },
);

/** Every fixture, in the order the suite walks them */
export const PLAN_FIXTURES: readonly PlanFixture[] = [
  BASIC_MODE_PLAN,
  FIXED_WITHDRAWAL_PLAN,
  DYNAMIC_POLICY_PLAN,
  ROLLOVER_PLAN,
  CLAMPED_TARGET_PLAN,
];
