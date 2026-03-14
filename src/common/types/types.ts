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
 * Props for the InvestmentCalculator component
 */
export interface InvestmentCalculatorProps {
  /** Current investment amount as a string */
  currentAmount?: string;
  /** Function to update the current amount */
  setCurrentAmount: (value: string | undefined) => void;
  /** Projected annual gain percentage */
  projectedGain: number;
  /** Function to update the projected gain */
  setProjectedGain: (value: number) => void;
  /** Number of years for growth calculation */
  yearsOfGrowth: number;
  /** Function to update years of growth */
  setYearsOfGrowth: (value: number) => void;
  /** Monthly contribution amount */
  monthlyContribution: number;
  /** Function to update monthly contribution */
  setMonthlyContribution: (value: number) => void;
  /** Monthly withdrawal amount */
  monthlyWithdrawal: number;
  /** Function to update monthly withdrawal */
  setMonthlyWithdrawal: (value: number) => void;
  /** Year when withdrawals begin */
  yearWithdrawalsBegin: number;
  /** Function to update withdrawal start year */
  setYearWithdrawalsBegin: (value: number) => void;
  /** Year when contributions stop */
  yearContributionsStop?: number;
  /** Function to update contribution stop year */
  setYearContributionsStop: (value: number | undefined) => void;
  /** Whether advanced mode is enabled */
  advanced?: boolean;
  /** Whether rollover is enabled */
  rollOver?: boolean;
  /** Amount to roll over from another investment */
  investmentToRoll?: number;
  /** Year when rollover occurs */
  yearOfRollover?: number;
  /** Maximum monthly withdrawal allowed */
  maxMonthlyWithdrawal: number;
  /** Annual depreciation (inflation) rate */
  depreciationRate: number;
  /** Unique identifier for this investment */
  investmentId: string;
}

/**
 * Represents a date-amount pair with inflation adjustment
 */
export interface DateAmountPair {
  /** The date of this data point */
  date: Date;
  /** The nominal amount */
  amount: number;
  /** The inflation-adjusted amount */
  inflationAdjustedAmount: number;
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
  toggles: {
    advanced: boolean;
    rollover: boolean;
    showInflation: boolean;
  };
}
