/* ==================================================
 * Type Definitions
 * ================================================== */

import type {
  DefaultedSliderKey,
  InputKey,
  OptionalSliderKey,
} from "../constants/app-constants";

/**
 * One point on a projected balance, carried on BOTH of the tracks the app can
 * show it on.
 *
 * A single NOMINAL balance is simulated; `real` is that same balance deflated
 * to today's dollars by the Fisher factor (1 + i)^-t. Which of the two a view
 * prints is a property of the VIEW - the Inflated toggle - so both are always
 * populated and the calculation never takes a display flag. The slots used to
 * be `y` and `alternateY`, whose meanings swapped with that toggle, so every
 * consumer had to know the flag to recover which number it was holding.
 */
export interface LineGraphEntry {
  /** The date of the data point */
  x: Date;
  /** Balance in the dollars of `x` - what the plan will actually hold */
  nominal: number;
  /** The same balance in today's dollars */
  real: number;
}

/**
 * Which of a LineGraphEntry's two tracks a view prints. Resolved from the
 * Inflated toggle at the render boundary (see `displayTrack` in growth-rows),
 * never inside a calculation.
 */
export type DisplayTrack = "nominal" | "real";

/**
 * Dynamic withdrawal policy: each withdrawal year, the annual withdrawal is
 * re-evaluated as ratePct% of the current balance (so spending rises in
 * up-markets and falls in downturns), then clamped to the monthly guardrails.
 */
export interface DynamicWithdrawal {
  /** Annual withdrawal as a percentage of the balance at the start of each withdrawal year */
  ratePct: number;
  /** Minimum monthly withdrawal in USD */
  floor: number;
  /** Maximum monthly withdrawal in USD */
  ceiling: number;
}

/**
 * Both tracks of a rolled-over balance, so the inflation-adjusted figure is
 * not deflated a second time inside the receiving investment.
 */
export interface RolloverAmounts {
  nominal: number;
  inflationAdjusted: number;
}

/**
 * ONE plan, in ONE vocabulary.
 *
 * Every engine in the app simulates these same quantities - the deterministic
 * InvestmentCalculator, the Monte Carlo paths, the target solver - and this is
 * the single authoritative description of each of them. The same field used to
 * carry a different name in every module (`yearWithdrawalsBegin` in the engine
 * against `withdrawalStartYear` in Monte Carlo and in the slider map;
 * `depreciationRate` here against `inflationRate` in the FIRE panel), so a
 * hand-written adapter stood between two engines that were being handed the
 * identical plan, and every new parameter had to be threaded through four
 * shapes before it reached them all.
 *
 * The names are the ones ALREADY PERSISTED as slider keys, so adopting them
 * needed no state migration. Percentages are percentages, never decimal
 * fractions, and carry a Pct suffix wherever the bare name does not already
 * say which unit it is in.
 *
 * NOMINAL throughout: the engines simulate a single nominal balance and derive
 * every today's-dollars figure from it, so a plan input is what the plan will
 * actually pay or hold on the day. The guardrails inside `dynamicWithdrawal`
 * are the one deliberate exception and say so themselves.
 *
 * What is deliberately NOT here:
 * - the withdrawal slider's ceiling (`maxMonthlyWithdrawal`). It bounds the
 *   target solver's search; it is not an input to any simulation, so it
 *   travels as an argument to the solver rather than riding along in every
 *   consumer of a plan.
 * - the Advanced and Inflated switches. The hub resolves the mode once, when
 *   it builds the plan, and names the display track once, when it renders one.
 *   A calculation that takes a display flag is a calculation whose answer
 *   depends on what is on screen.
 */
export interface PlanInputs {
  /**
   * Opening balance in USD, already read from whatever text box or file it
   * came from. The engine takes a NUMBER, not the amount box's string: the
   * hub used to parse that string with parseInt while the engine parsed it
   * with parseAmountInput, so a stored "250,000.00" was $250 to one and
   * $250,000 to the other. A value that is negative or not finite is refused
   * by isValidInput rather than simulated.
   */
  initialAmount: number;
  /**
   * Expected annual return as a PERCENTAGE (10 = 10%/yr), applied as
   * projectedGain / 100 / 12 every month. Monte Carlo reads it as the
   * arithmetic mean of its annual draw (see that engine's drift note).
   */
  projectedGain: number;
  /**
   * Horizon in years from today. Fractional values are allowed and are
   * resolved to whole months (10.5 -> 126), as every year-valued field here is.
   */
  yearsOfGrowth: number;
  /** Contribution in USD paid at the START of each month, so it earns that month's growth */
  monthlyContribution: number;
  /**
   * Years from today after which contributions stop. Unset - and ONLY unset -
   * means they never do, which is why it has no default: an untouched lane
   * contributes for its current horizon and follows the Years slider. 0 stops
   * them immediately, exactly as 0.5 stops them after six months.
   */
  contributionStopYear?: number;
  /** Withdrawal in USD drawn at the start of each month once withdrawals have begun */
  monthlyWithdrawal: number;
  /** Years from today at which withdrawals begin */
  withdrawalStartYear: number;
  /**
   * Annual inflation as a PERCENTAGE (2.5 = 2.5%/yr). It never touches the
   * simulated balance: it is the Fisher deflator (1 + i)^-t that turns a
   * nominal checkpoint into today's dollars, and the index that keeps a
   * dynamic policy's guardrails constant in real terms.
   */
  inflationPct: number;
  /**
   * Annual expense ratio / management fee as a PERCENTAGE (0.5 = 0.5%/yr),
   * charged as annualFeePct / 100 / 12 of the balance every month.
   */
  annualFeePct?: number;
  /** Percentage-of-balance withdrawal policy; replaces monthlyWithdrawal when set */
  dynamicWithdrawal?: DynamicWithdrawal;
  /** Whether a rollover from the other lane lands in this plan */
  rollOver?: boolean;
  /** Amount rolled in from another investment; a bare number is added to both tracks */
  investmentToRoll?: number | RolloverAmounts;
  /** Years from today at which the rollover lands */
  yearOfRollover?: number;
}

/**
 * What InvestmentCalculator is constructed with - which is exactly the plan,
 * and nothing besides. The engine adds no inputs of its own, so this is a name
 * for the argument rather than a second shape that could drift from PlanInputs.
 */
export type InvestmentCalculatorProps = PlanInputs;

/**
 * The feature switches, every one of them a boolean. Core toggles (advanced,
 * showInflation) are always visible; the rest are tool toggles, which are only
 * shown — and only take effect — in advanced mode.
 *
 * Being uniformly boolean is what lets callers iterate the set: the hub's tool
 * grid and its `isTool` predicate are both keyed on `keyof FeatureToggles`, so
 * a new tool is added here and nowhere else.
 */
export interface FeatureToggles {
  advanced: boolean;
  rollover: boolean;
  showInflation: boolean;
  portfolio: boolean;
  fees: boolean;
  monteCarlo: boolean;
  fire: boolean;
  scenarios: boolean;
  budget: boolean;
  /** Percentage-of-balance withdrawals with floor/ceiling guardrails */
  dynamicWithdrawal: boolean;
}

/**
 * Everything the toggles panel persists: the feature switches plus the one
 * member that is not a switch.
 */
export interface TogglesState extends FeatureToggles {
  /**
   * Monte Carlo display mode: "combined" (A+B summed) or "individual"
   * (separate bands). Display-only — it chooses how an already-enabled
   * simulation is drawn, so it is not a feature toggle and must not be
   * treated as one.
   */
  monteCarloMode: "combined" | "individual";
}

/**
 * Every slider the app runs on, keyed by the compile-checked vocabulary in
 * app-constants.
 *
 * Total except for the contribution-stop years, which have no default on
 * purpose: unset means "contribute for this lane's whole horizon", so it
 * tracks the Years slider instead of freezing at whatever Years happened to
 * default to.  That is why they are optional here and why every read of one
 * needs the fallback the compiler now insists on.
 */
export type SliderValues = Record<DefaultedSliderKey, number> &
  Partial<Record<OptionalSliderKey, number>>;

/** Every text input the app runs on; normalizeState always fills both lanes */
export type InputValues = Record<InputKey, string>;

/**
 * Top-level application state shape, used for persistence and routing.
 *
 * This is the BOUNDARY shape — what a file, a scenario snapshot or a
 * localStorage record may contain — so its maps stay open: an export from an
 * older build carries keys this one has retired, and dropping them is
 * normalizeState's job, not the type system's.  What the app then runs on is
 * NormalizedState, whose sliders and inputs are the checked SliderValues and
 * InputValues above.
 */
export interface TH4State {
  /** Active theme key */
  theme: string;
  /** All slider values keyed by slider name, as stored */
  sliders: Record<string, number>;
  /** All text-input values keyed by input name, as stored */
  inputs: Record<string, string>;
  /** Feature switches plus the Monte Carlo display mode */
  toggles: TogglesState;
  /** Stock API configuration and portfolio holdings */
  stock?: {
    /**
     * API URL template — use {symbol} as the ticker placeholder.
     *
     * Optional because it is app configuration rather than plan data: a
     * scenario snapshot carries the holdings alone, and normalizeState fills
     * this in from the default when a file omits it.
     */
    apiUrl?: string;
    /** Portfolio holdings: symbol, allocation %, and optionally fetched price */
    holdings: import("./portfolio-types").PortfolioHolding[];
  };
  /** Budget expense items */
  budgetItems?: import("../helpers/budget-manager").BudgetItem[];
  /** Scenario snapshots */
  scenarios?: import("../helpers/scenario-manager").ScenarioSnapshot[];
  /** Active page/tool identifier */
  activePage?: string;
}
