/* ==================================================
 * State Manager
 *
 * Centralised module for TH4State validation, normalisation,
 * and default values.  Used by both file import and scenario
 * load paths to guarantee every state field is present and
 * correctly typed.
 * ================================================== */

import type { TH4State } from "../types/types"
import type { BudgetItem } from "./budget-manager"
import {
  DEFAULT_THEME,
  DEFAULT_INITIAL_AMOUNT,
  DEFAULT_PROJECTED_GAIN,
  DEFAULT_YEARS_OF_GROWTH,
  DEFAULT_MONTHLY_CONTRIBUTION,
  DEFAULT_MONTHLY_WITHDRAWAL,
  DEFAULT_WITHDRAWAL_START_YEAR,
  DEFAULT_INFLATION_RATE,
  DEFAULT_TARGET_VALUE,
  DEFAULT_VOLATILITY,
} from "../constants/app-constants"

/* ---------- Default state ---------- */

const DEFAULT_STOCK_API_URL =
  "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey=demo"

export const DEFAULT_TOGGLES: TH4State["toggles"] = {
  advanced: false,
  rollover: false,
  showInflation: false,
  portfolio: false,
  fees: false,
  monteCarlo: false,
  fire: false,
  scenarios: false,
  budget: false,
  monteCarloMode: "combined",
}

export const DEFAULT_SLIDERS: Record<string, number> = {
  investmentA: DEFAULT_INITIAL_AMOUNT,
  investmentB: DEFAULT_INITIAL_AMOUNT,
  projectedGainA: DEFAULT_PROJECTED_GAIN,
  projectedGainB: DEFAULT_PROJECTED_GAIN,
  yearsOfGrowthA: DEFAULT_YEARS_OF_GROWTH,
  yearsOfGrowthB: DEFAULT_YEARS_OF_GROWTH,
  monthlyContributionA: DEFAULT_MONTHLY_CONTRIBUTION,
  monthlyContributionB: DEFAULT_MONTHLY_CONTRIBUTION,
  monthlyWithdrawalA: DEFAULT_MONTHLY_WITHDRAWAL,
  monthlyWithdrawalB: DEFAULT_MONTHLY_WITHDRAWAL,
  withdrawalStartYearA: DEFAULT_WITHDRAWAL_START_YEAR,
  withdrawalStartYearB: DEFAULT_WITHDRAWAL_START_YEAR,
  yearlyInflation: DEFAULT_INFLATION_RATE,
  targetValueA: DEFAULT_TARGET_VALUE,
  targetValueB: DEFAULT_TARGET_VALUE,
  annualFeeA: 0,
  annualFeeB: 0,
  volatilityA: DEFAULT_VOLATILITY,
  volatilityB: DEFAULT_VOLATILITY,
  fireAnnualExpenses: 40000,
  fireSWR: 4,
  fireCurrentAge: 30,
  fireRetirementAge: 65,
}

export const DEFAULT_INPUTS: Record<string, string> = {
  currentAmountA: String(DEFAULT_INITIAL_AMOUNT),
  currentAmountB: String(DEFAULT_INITIAL_AMOUNT),
}

export const DEFAULT_STATE: TH4State = {
  theme: DEFAULT_THEME,
  sliders: DEFAULT_SLIDERS,
  inputs: DEFAULT_INPUTS,
  toggles: DEFAULT_TOGGLES,
  stock: {
    apiUrl: DEFAULT_STOCK_API_URL,
    holdings: [],
  },
  budgetItems: [],
  scenarios: [],
  activePage: "f",
}

/* ---------- Validation ---------- */

function isValidBudgetItem(item: unknown): item is BudgetItem {
  if (typeof item !== "object" || item === null) return false
  const o = item as Record<string, unknown>
  return (
    typeof o["id"] === "string" &&
    typeof o["name"] === "string" &&
    typeof o["amount"] === "number" &&
    typeof o["category"] === "string"
  )
}

/**
 * Runtime type guard that verifies an unknown value has the minimum
 * required shape of a TH4State.  Allows optional fields for backward
 * compatibility — missing fields are filled by normalizeState().
 */
export function isValidTH4State(value: unknown): value is TH4State {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>

  if (typeof v["theme"] !== "string") return false
  if (typeof v["sliders"] !== "object" || v["sliders"] === null) return false
  if (typeof v["inputs"] !== "object" || v["inputs"] === null) return false
  if (typeof v["toggles"] !== "object" || v["toggles"] === null) return false

  const t = v["toggles"] as Record<string, unknown>
  const boolOrUndefined = (key: string) =>
    t[key] === undefined || typeof t[key] === "boolean"

  if (typeof t["advanced"] !== "boolean") return false
  if (typeof t["rollover"] !== "boolean") return false
  if (typeof t["showInflation"] !== "boolean") return false
  if (typeof t["portfolio"] !== "boolean") return false
  if (!boolOrUndefined("fees")) return false
  if (!boolOrUndefined("monteCarlo")) return false
  if (!boolOrUndefined("fire")) return false
  if (!boolOrUndefined("scenarios")) return false
  if (!boolOrUndefined("budget")) return false
  if (
    t["monteCarloMode"] !== undefined &&
    t["monteCarloMode"] !== "combined" &&
    t["monteCarloMode"] !== "individual"
  )
    return false

  if (
    v["budgetItems"] !== undefined &&
    !(Array.isArray(v["budgetItems"]) && v["budgetItems"].every(isValidBudgetItem))
  )
    return false

  if (v["scenarios"] !== undefined && !Array.isArray(v["scenarios"])) return false
  if (v["activePage"] !== undefined && typeof v["activePage"] !== "string") return false

  // Validate stock field if present
  if (v["stock"] !== undefined) {
    if (typeof v["stock"] !== "object" || v["stock"] === null) return false
    const s = v["stock"] as Record<string, unknown>
    if (s["apiUrl"] !== undefined && typeof s["apiUrl"] !== "string") return false
    if (s["holdings"] !== undefined && !Array.isArray(s["holdings"])) return false
  }

  return true
}

/* ---------- Normalisation ---------- */

/**
 * Fills any missing or undefined fields in a raw TH4State with their
 * defaults, producing a fully populated state object safe for direct
 * assignment to React state setters.
 *
 * This is the single source of backward-compatibility handling — old
 * exports that predate new fields (e.g. monteCarloMode, budget toggle)
 * are seamlessly filled in.
 */
export function normalizeState(raw: TH4State): TH4State {
  const toggles: TH4State["toggles"] = {
    ...DEFAULT_TOGGLES,
    ...stripUndefined(raw.toggles),
  }

  const stock = raw.stock ?? DEFAULT_STATE.stock!
  // Handle legacy format with symbols array
  const legacySymbols = (stock as unknown as { symbols?: string[] }).symbols
  const holdings = stock.holdings
    ? stock.holdings.map((h) => ({ ...h }))
    : legacySymbols
      ? legacySymbols.map((s: string) => ({ symbol: s, allocationPct: 0 }))
      : []

  return {
    theme: raw.theme || DEFAULT_STATE.theme,
    sliders: { ...DEFAULT_SLIDERS, ...raw.sliders },
    inputs: { ...DEFAULT_INPUTS, ...raw.inputs },
    toggles,
    stock: {
      apiUrl: stock.apiUrl || DEFAULT_STATE.stock!.apiUrl,
      holdings,
    },
    budgetItems: raw.budgetItems ?? [],
    scenarios: raw.scenarios ?? [],
    activePage: raw.activePage ?? DEFAULT_STATE.activePage,
  }
}

/** Removes keys whose value is undefined so they don't overwrite defaults in a spread. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) result[key] = val
  }
  return result as Partial<T>
}
