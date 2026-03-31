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

/* ---------- Investment Limits ---------- */
export const MAX_MONTHLY_CONTRIBUTION = 5000;
export const MAX_MONTHLY_WITHDRAWAL = 10000;
export const MAX_YEARS_OF_GROWTH = 100;
export const MAX_PROJECTED_GAIN = 30;
export const MAX_INFLATION_RATE = 10;
export const MAX_ANNUAL_FEE = 3;

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
export const MAX_TARGET_VALUE = 10_000_000; // $10M ceiling for target slider
export const DEFAULT_TARGET_VALUE = 0; // 0 = no target set
