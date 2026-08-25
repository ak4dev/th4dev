/* ==================================================
 * Application Constants
 * ================================================== */

/* ---------- Investment Defaults ---------- */
export const DEFAULT_INITIAL_AMOUNT = 10000;
export const DEFAULT_PROJECTED_GAIN = 10;
export const DEFAULT_YEARS_OF_GROWTH = 30;
export const DEFAULT_MONTHLY_CONTRIBUTION = 0;
export const DEFAULT_MONTHLY_WITHDRAWAL = 0;
export const DEFAULT_WITHDRAWAL_START_YEAR = 0;
export const DEFAULT_INFLATION_RATE = 2.5;
/** Dynamic withdrawal: annual % of balance, and monthly guardrails */
export const DEFAULT_WITHDRAWAL_RATE = 4;
export const DEFAULT_WITHDRAWAL_FLOOR = 0;

/* ---------- Investment Limits ---------- */
export const MAX_MONTHLY_CONTRIBUTION = 5000;
export const MAX_MONTHLY_WITHDRAWAL = 10000;
export const MAX_YEARS_OF_GROWTH = 100;
export const MAX_PROJECTED_GAIN = 30;
export const MAX_INFLATION_RATE = 10;
export const MAX_ANNUAL_FEE = 3;
export const DEFAULT_VOLATILITY = 12;
export const MAX_VOLATILITY = 30;
export const MAX_WITHDRAWAL_RATE = 20;
export const DEFAULT_WITHDRAWAL_CEILING = MAX_MONTHLY_WITHDRAWAL;
export const MAX_AGE = 120;
export const MAX_ANNUAL_EXPENSES = 1_000_000;
export const MONTE_CARLO_SIM_COUNT = 500;

/* ---------- Investment Minimums ---------- */
export const MIN_VALUE = 0;

/* ---------- UI Constants ---------- */
export const CHART_HEIGHT = 350;
export const TABLE_MAX_HEIGHT = 320;
export const SCROLLABLE_THEME_ITEMS = 4;
export const THEME_ITEM_HEIGHT = 44;

/* ---------- Number Formatting ---------- */
export const MONTHS_PER_YEAR = 12;
export const PERCENTAGE_DIVISOR = 100;

/* ---------- File Export ---------- */
export const FILE_EXPORT_PREFIX = "th4";
export const FILE_EXPORT_EXTENSION = "json";

/* ---------- Default Theme ---------- */
export const DEFAULT_THEME = "gruvbox";

/* ---------- Target Value ---------- */
export const DEFAULT_TARGET_VALUE = 0; // 0 = no target set

/* ---------- Slider Ranges ---------- */
export interface SliderLimit {
  min: number;
  max: number;
}

/** Same limit for the A and B lanes of a slider */
const lanes = (key: string, max: number): Record<string, SliderLimit> => ({
  [`${key}A`]: { min: MIN_VALUE, max },
  [`${key}B`]: { min: MIN_VALUE, max },
});

/**
 * Valid range for every slider; values outside it (e.g. from an imported
 * file) are clamped by normalizeState so the math pipeline stays bounded.
 */
export const SLIDER_LIMITS: Record<string, SliderLimit> = {
  ...lanes("projectedGain", MAX_PROJECTED_GAIN),
  ...lanes("yearsOfGrowth", MAX_YEARS_OF_GROWTH),
  ...lanes("monthlyContribution", MAX_MONTHLY_CONTRIBUTION),
  ...lanes("monthlyWithdrawal", MAX_MONTHLY_WITHDRAWAL),
  ...lanes("withdrawalStartYear", MAX_YEARS_OF_GROWTH),
  ...lanes("contributionStopYear", MAX_YEARS_OF_GROWTH),
  ...lanes("annualFee", MAX_ANNUAL_FEE),
  ...lanes("volatility", MAX_VOLATILITY),
  ...lanes("withdrawalRate", MAX_WITHDRAWAL_RATE),
  ...lanes("withdrawalFloor", MAX_MONTHLY_WITHDRAWAL),
  ...lanes("withdrawalCeiling", MAX_MONTHLY_WITHDRAWAL),
  ...lanes("targetValue", Number.MAX_SAFE_INTEGER),
  yearlyInflation: { min: MIN_VALUE, max: MAX_INFLATION_RATE },
  fireAnnualExpenses: { min: MIN_VALUE, max: MAX_ANNUAL_EXPENSES },
  fireSWR: { min: MIN_VALUE, max: PERCENTAGE_DIVISOR },
  fireCurrentAge: { min: MIN_VALUE, max: MAX_AGE },
  fireRetirementAge: { min: MIN_VALUE, max: MAX_AGE },
};
