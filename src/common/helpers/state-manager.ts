/* ==================================================
 * State Manager
 *
 * Centralised module for TH4State validation, normalisation,
 * and default values.  Used by file import, localStorage
 * hydration and scenario load to guarantee every state field
 * is present, correctly typed and within its valid range.
 * ================================================== */

import type { TH4State, TogglesState } from "../types/types";
import type { BudgetItem } from "./budget-manager";
import type { ScenarioSnapshot } from "./scenario-manager";
import type { PortfolioHolding } from "../types/portfolio-types";
import { themeClasses } from "../../../stitches.config";
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
  DEFAULT_WITHDRAWAL_RATE,
  DEFAULT_WITHDRAWAL_FLOOR,
  DEFAULT_WITHDRAWAL_CEILING,
  SLIDER_LIMITS,
} from "../constants/app-constants";

/* ---------- Default state ---------- */

/** A TH4State with every optional field filled in — what normalizeState produces */
export type NormalizedState = Required<TH4State>;

const DEFAULT_STOCK_API_URL =
  "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey=demo";

export const DEFAULT_TOGGLES: TogglesState = {
  advanced: false,
  rollover: false,
  showInflation: false,
  portfolio: false,
  fees: false,
  monteCarlo: false,
  fire: false,
  scenarios: false,
  budget: false,
  dynamicWithdrawal: false,
  monteCarloMode: "combined",
};

/** Same default for the A and B lanes of a slider */
const lanes = (key: string, value: number): Record<string, number> => ({
  [`${key}A`]: value,
  [`${key}B`]: value,
});

export const DEFAULT_SLIDERS: Record<string, number> = {
  ...lanes("projectedGain", DEFAULT_PROJECTED_GAIN),
  ...lanes("yearsOfGrowth", DEFAULT_YEARS_OF_GROWTH),
  ...lanes("monthlyContribution", DEFAULT_MONTHLY_CONTRIBUTION),
  ...lanes("monthlyWithdrawal", DEFAULT_MONTHLY_WITHDRAWAL),
  ...lanes("withdrawalStartYear", DEFAULT_WITHDRAWAL_START_YEAR),
  ...lanes("withdrawalRate", DEFAULT_WITHDRAWAL_RATE),
  ...lanes("withdrawalFloor", DEFAULT_WITHDRAWAL_FLOOR),
  ...lanes("withdrawalCeiling", DEFAULT_WITHDRAWAL_CEILING),
  ...lanes("targetValue", DEFAULT_TARGET_VALUE),
  ...lanes("annualFee", 0),
  ...lanes("volatility", DEFAULT_VOLATILITY),
  yearlyInflation: DEFAULT_INFLATION_RATE,
  fireAnnualExpenses: 40000,
  fireSWR: 4,
  fireCurrentAge: 30,
  fireRetirementAge: 65,
};

export const DEFAULT_INPUTS: Record<string, string> = {
  currentAmountA: String(DEFAULT_INITIAL_AMOUNT),
  currentAmountB: String(DEFAULT_INITIAL_AMOUNT),
};

export const DEFAULT_STATE: NormalizedState = {
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
};

/* ---------- Validation ---------- */

/** Toggles every export has carried since the first release; the rest are back-filled by normalizeState */
const REQUIRED_TOGGLES: ReadonlySet<string> = new Set([
  "advanced",
  "rollover",
  "showInflation",
  "portfolio",
]);

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isDefined = (v: unknown): v is NonNullable<unknown> => v !== undefined;

function isValidBudgetItem(item: unknown): item is BudgetItem {
  if (typeof item !== "object" || item === null) return false;
  const o = item as Record<string, unknown>;
  return (
    isString(o["id"]) &&
    isString(o["name"]) &&
    typeof o["amount"] === "number" &&
    isString(o["category"])
  );
}

/**
 * Validates a single portfolio holding from an imported file, dropping
 * malformed entries instead of letting them crash the UI later.
 */
function isValidHolding(value: unknown): value is PortfolioHolding {
  if (typeof value !== "object" || value === null) return false;
  const h = value as Record<string, unknown>;
  const optionalNumber = (key: string) =>
    h[key] === undefined || isFiniteNumber(h[key]);
  return (
    isString(h["symbol"]) &&
    h["symbol"].trim() !== "" &&
    isFiniteNumber(h["allocationPct"]) &&
    optionalNumber("currentPrice") &&
    optionalNumber("startPrice") &&
    (h["projectionStartDate"] === undefined ||
      isString(h["projectionStartDate"]))
  );
}

/** A scenario snapshot is only usable when its nested state passes the same guard as an import. */
function isValidScenario(value: unknown): value is ScenarioSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    isString(s["id"]) &&
    isString(s["name"]) &&
    isString(s["createdAt"]) &&
    isValidTH4State(s["state"])
  );
}

/**
 * Runtime type guard that verifies an unknown value has the minimum
 * required shape of a TH4State.  Allows optional fields for backward
 * compatibility — missing fields are filled by normalizeState(), and
 * malformed rows in the array fields are dropped there too.
 */
export function isValidTH4State(value: unknown): value is TH4State {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  if (!isString(v["theme"])) return false;
  if (typeof v["sliders"] !== "object" || v["sliders"] === null) return false;
  if (typeof v["inputs"] !== "object" || v["inputs"] === null) return false;
  if (typeof v["toggles"] !== "object" || v["toggles"] === null) return false;

  const t = v["toggles"] as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_TOGGLES)) {
    const val = t[key];
    if (val === undefined) {
      if (REQUIRED_TOGGLES.has(key)) return false;
      continue;
    }
    const ok =
      key === "monteCarloMode"
        ? val === "combined" || val === "individual"
        : typeof val === "boolean";
    if (!ok) return false;
  }

  if (v["budgetItems"] !== undefined && !Array.isArray(v["budgetItems"]))
    return false;
  if (v["scenarios"] !== undefined && !Array.isArray(v["scenarios"]))
    return false;
  if (v["activePage"] !== undefined && !isString(v["activePage"])) return false;

  if (v["stock"] !== undefined) {
    if (typeof v["stock"] !== "object" || v["stock"] === null) return false;
    const s = v["stock"] as Record<string, unknown>;
    if (s["apiUrl"] !== undefined && !isString(s["apiUrl"])) return false;
    if (s["holdings"] !== undefined && !Array.isArray(s["holdings"]))
      return false;
  }

  return true;
}

/* ---------- Normalisation ---------- */

/** Copies the entries of `raw` whose value satisfies `keep`; tolerates a missing map. */
function pickWhere<T>(
  raw: object | undefined,
  keep: (v: unknown) => v is T,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(raw ?? {}).filter(([, v]) => keep(v)),
  ) as Record<string, T>;
}

/**
 * Clamps every slider into its SLIDER_LIMITS range so the math pipeline
 * stays bounded, and lifts a withdrawal ceiling that sits below its floor
 * (the engines treat the floor as authoritative).
 */
function clampSliders(sliders: Record<string, number>): Record<string, number> {
  const result = Object.fromEntries(
    Object.entries(sliders).map(([key, value]) => {
      const limit = SLIDER_LIMITS[key];
      return [
        key,
        limit ? Math.min(limit.max, Math.max(limit.min, value)) : value,
      ];
    }),
  );
  for (const lane of ["A", "B"]) {
    result[`withdrawalCeiling${lane}`] = Math.max(
      result[`withdrawalCeiling${lane}`],
      result[`withdrawalFloor${lane}`],
    );
  }
  return result;
}

/**
 * Fills any missing or undefined fields in a raw TH4State with their
 * defaults, drops malformed rows and out-of-range values, and returns a
 * fully populated state object safe for direct assignment to React state
 * setters.
 *
 * This is the single source of backward-compatibility handling — old
 * exports that predate new fields (e.g. monteCarloMode, budget toggle)
 * are seamlessly filled in.
 */
export function normalizeState(raw: TH4State): NormalizedState {
  const stock = raw.stock ?? DEFAULT_STATE.stock;
  // Handle legacy format with symbols array
  const legacySymbols = (stock as unknown as { symbols?: string[] }).symbols;
  const holdings = stock.holdings
    ? stock.holdings.filter(isValidHolding).map((h) => ({ ...h }))
    : legacySymbols
      ? legacySymbols
          .filter((s): s is string => isString(s) && s.trim() !== "")
          .map((s) => ({ symbol: s, allocationPct: 0 }))
      : [];

  return {
    theme: Object.hasOwn(themeClasses, raw.theme) ? raw.theme : DEFAULT_THEME,
    sliders: clampSliders({
      ...DEFAULT_SLIDERS,
      ...pickWhere(raw.sliders, isFiniteNumber),
    }),
    inputs: { ...DEFAULT_INPUTS, ...pickWhere(raw.inputs, isString) },
    toggles: {
      ...DEFAULT_TOGGLES,
      ...(pickWhere(raw.toggles, isDefined) as Partial<TogglesState>),
    },
    stock: {
      apiUrl: stock.apiUrl || DEFAULT_STATE.stock.apiUrl,
      holdings,
    },
    budgetItems: (raw.budgetItems ?? []).filter(isValidBudgetItem),
    scenarios: (raw.scenarios ?? [])
      .filter(isValidScenario)
      .map((s) => ({ ...s, state: normalizeState(s.state) })),
    activePage: raw.activePage ?? DEFAULT_STATE.activePage,
  };
}
