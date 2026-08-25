/* ==================================================
 * Type Definitions
 * ================================================== */

/**
 * Represents a single data point in the investment line graph
 */
export interface LineGraphEntry {
  /** The date of the data point */
  x: Date;
  /** The primary value (nominal or inflation-adjusted) */
  y: number;
  /** The alternate value for comparison */
  alternateY: number;
}

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
 * Inputs for InvestmentCalculator (a plain object, no setter callbacks)
 */
export interface InvestmentCalculatorProps {
  /** Current investment amount as a string */
  currentAmount?: string;
  /** Projected annual gain percentage */
  projectedGain: number;
  /** Number of years for growth calculation */
  yearsOfGrowth: number;
  /** Monthly contribution amount */
  monthlyContribution: number;
  /** Monthly withdrawal amount */
  monthlyWithdrawal: number;
  /** Year when withdrawals begin */
  yearWithdrawalsBegin: number;
  /** Year when contributions stop */
  yearContributionsStop?: number;
  /** Whether advanced mode is enabled */
  advanced?: boolean;
  /** Whether rollover is enabled */
  rollOver?: boolean;
  /** Amount rolled in from another investment; a bare number is added to both tracks */
  investmentToRoll?: number | RolloverAmounts;
  /** Year when rollover occurs */
  yearOfRollover?: number;
  /** Maximum monthly withdrawal allowed */
  maxMonthlyWithdrawal: number;
  /** Annual depreciation (inflation) rate */
  depreciationRate: number;
  /** Annual expense ratio / management fee as a percentage (e.g. 0.5 = 0.5%) */
  annualFee?: number;
  /** Percentage-of-balance withdrawal policy; overrides monthlyWithdrawal when set */
  dynamicWithdrawal?: DynamicWithdrawal;
}

/**
 * Feature toggles. Core toggles (advanced, showInflation) are always visible;
 * tool toggles are only shown in advanced mode.
 */
export interface TogglesState {
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
  /** Monte Carlo display mode: "combined" (A+B summed) or "individual" (separate bands) */
  monteCarloMode: "combined" | "individual";
}

/**
 * Top-level application state shape, used for persistence and routing
 */
export interface TH4State {
  /** Active theme key */
  theme: string;
  /** All slider values keyed by slider name */
  sliders: Record<string, number>;
  /** All text-input values keyed by input name */
  inputs: Record<string, string>;
  /** Boolean toggle switches */
  toggles: TogglesState;
  /** Stock API configuration and portfolio holdings */
  stock?: {
    /** API URL template — use {symbol} as the ticker placeholder */
    apiUrl: string;
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
