/* ==================================================
 * State Manager
 *
 * Centralised module for TH4State validation, normalisation,
 * and default values.  Used by file import, localStorage
 * hydration and scenario load to guarantee every state field
 * is present, correctly typed and within its valid range.
 * ================================================== */

import type {
  InputValues,
  SliderValues,
  TH4State,
  TogglesState,
} from "../types/types";
import type { BudgetItem } from "./budget-manager";
import type { ScenarioSnapshot } from "./scenario-manager";
import type { PortfolioHolding } from "../types/portfolio-types";
import { normalizeStockSymbol } from "./stock-client";
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
  DEFAULT_FIRE_ANNUAL_EXPENSES,
  DEFAULT_FIRE_SWR,
  DEFAULT_FIRE_CURRENT_AGE,
  DEFAULT_FIRE_RETIREMENT_AGE,
  SLIDER_LIMITS,
  SLIDER_KEYS,
  INPUT_KEYS,
  LANE_IDS,
  laneKey,
} from "../constants/app-constants";
import type {
  DefaultedSliderKey,
  InputKey,
  LaneId,
  SliderBaseKey,
  SliderKey,
} from "../constants/app-constants";

/* ---------- Default state ---------- */

/**
 * A TH4State with every optional field filled in — what normalizeState
 * produces.
 *
 * Three fields are replaced outright rather than intersected in, because an
 * intersection would keep the open boundary map alongside the narrow one and
 * a typo would type-check again.  `Required` also only reaches the top level.
 * `stock.apiUrl` is optional one level down: a file (or a scenario snapshot,
 * which carries holdings only) may omit the endpoint, but normalizeState
 * always supplies one, so every consumer can read it as a string.  `sliders`
 * and `inputs` narrow the open boundary maps of TH4State to the checked key
 * vocabulary, which is what makes a mistyped key downstream a compile error
 * rather than an `undefined` read as 0.
 */
export type NormalizedState = Omit<
  Required<TH4State>,
  "sliders" | "inputs" | "stock"
> & {
  sliders: SliderValues;
  inputs: InputValues;
  stock: { apiUrl: string; holdings: PortfolioHolding[] };
};

/**
 * Alpha Vantage needs a personal API key.  The `demo` key this used to ship
 * answers GLOBAL_QUOTE for IBM alone, so a first fetch of the user's own
 * holdings always failed — and failed opaquely.  The placeholder states the
 * requirement in the field the user edits, and the provider answers it with
 * "the parameter apikey is invalid or missing…", which describeFetchFailures
 * now quotes verbatim.  Free key: https://www.alphavantage.co/support/#api-key
 */
const DEFAULT_STOCK_API_URL =
  "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey=YOUR_API_KEY";

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
const lanes = <B extends SliderBaseKey>(base: B, value: number) =>
  ({
    [laneKey(base, "A")]: value,
    [laneKey(base, "B")]: value,
  }) as Record<`${B}${LaneId}`, number>;

/**
 * The starting value of every slider that has one — and, deliberately, of no
 * others.  contributionStopYear is absent on purpose: unset means
 * "contributions run to this lane's CURRENT yearsOfGrowth", so the stop year
 * follows the Years slider wherever the user drags it.  Generating this map
 * from SLIDER_BASE_KEYS would give it a default, freezing the stop year at
 * DEFAULT_YEARS_OF_GROWTH, and moving Years to 40 would then silently stop
 * contributions at year 30.  Hence the hand-written list, the
 * DefaultedSliderKey annotation (which is what keeps this list complete), and
 * the state-manager test that pins the absence — a spread cannot be
 * excess-property-checked, so only the test catches an added stop year.
 */
export const DEFAULT_SLIDERS: Record<DefaultedSliderKey, number> = {
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
  fireAnnualExpenses: DEFAULT_FIRE_ANNUAL_EXPENSES,
  fireSWR: DEFAULT_FIRE_SWR,
  fireCurrentAge: DEFAULT_FIRE_CURRENT_AGE,
  fireRetirementAge: DEFAULT_FIRE_RETIREMENT_AGE,
};

export const DEFAULT_INPUTS: InputValues = {
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
    isFiniteNumber(o["amount"]) &&
    isString(o["category"])
  );
}

/**
 * Validates a single portfolio holding from an imported file, dropping
 * malformed entries instead of letting them crash the UI later.
 *
 * Only the fields whose *type* makes a row a holding are required here: the
 * optional decorations are checked for type, not for value, because a type
 * guard returns a boolean and cannot strip a field.  An unusable price or an
 * unparseable date is repaired by sanitizeHolding instead, so one bad
 * decoration never costs the user the whole position.
 */
function isValidHolding(value: unknown): value is PortfolioHolding {
  if (typeof value !== "object" || value === null) return false;
  const h = value as Record<string, unknown>;
  const optionalNumber = (key: string) =>
    h[key] === undefined || typeof h[key] === "number";
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

/**
 * Slider keys the app is allowed to carry, taken straight from the one key
 * inventory in app-constants rather than from DEFAULT_SLIDERS.  The
 * distinction is load-bearing: contributionStopYearA/B have no default — a
 * lane with no stop year contributes for its whole horizon — so allow-listing
 * Object.keys(DEFAULT_SLIDERS) would silently drop the user's
 * contribution-stop year on every import and every page reload.
 */
const SLIDER_KEY_SET: ReadonlySet<string> = new Set<string>(SLIDER_KEYS);

const INPUT_KEY_SET: ReadonlySet<string> = new Set<string>(INPUT_KEYS);

const TOGGLE_KEYS: ReadonlySet<string> = new Set(Object.keys(DEFAULT_TOGGLES));

/**
 * Copies the entries of `raw` whose key is in `allowed` and whose value
 * satisfies `keep`; tolerates a missing map.
 *
 * The key allow-list is what makes this validation rather than filtering:
 * without it any junk key in an imported file survives into localStorage and
 * every future export, and a prototype-named key ('__proto__', 'constructor')
 * resolves against Object.prototype in clampSliders and writes NaN into React
 * state.
 */
function pickWhere<K extends string, T>(
  raw: object | undefined,
  allowed: ReadonlySet<string>,
  keep: (v: unknown) => v is T,
): Partial<Record<K, T>> {
  return Object.fromEntries(
    Object.entries(raw ?? {}).filter(([k, v]) => allowed.has(k) && keep(v)),
  ) as Partial<Record<K, T>>;
}

/**
 * Clamps one slider into its SLIDER_LIMITS range, leaving a key with no
 * declared range alone.
 *
 * This is the only definition of what a slider value is allowed to be, and
 * both writers go through it: normalizeState on the way in from a file,
 * localStorage or a scenario, and the hub's own updateSlider on every edit.
 * When only the import path clamped, a panel could write a value the range
 * forbids — the plan then ran on that value until a reload quietly replaced
 * it with a different one.
 */
export function clampSlider(key: SliderKey, value: number): number {
  // Own-property lookup only: a prototype-named key must not resolve to
  // an Object.prototype member whose `.max` is undefined (Math.min(
  // undefined, ...) is NaN).  SliderKey no longer admits one, but the values
  // this runs over arrive from a file, so the runtime guard stays.
  const limit = Object.hasOwn(SLIDER_LIMITS, key)
    ? SLIDER_LIMITS[key]
    : undefined;
  return limit ? Math.min(limit.max, Math.max(limit.min, value)) : value;
}

/**
 * Clamps every slider into its SLIDER_LIMITS range so the math pipeline
 * stays bounded, and lifts a withdrawal ceiling that sits below its floor
 * (the engines treat the floor as authoritative).
 */
function clampSliders(sliders: SliderValues): SliderValues {
  const result = Object.fromEntries(
    // Every key reaching here has already been through the allow-list, so the
    // cast restates what pickWhere guarantees rather than widening anything.
    Object.entries(sliders).map(([key, value]) => [
      key,
      clampSlider(key as SliderKey, value),
    ]),
  ) as SliderValues;
  for (const lane of LANE_IDS) {
    result[laneKey("withdrawalCeiling", lane)] = Math.max(
      result[laneKey("withdrawalCeiling", lane)],
      result[laneKey("withdrawalFloor", lane)],
    );
  }
  return result;
}

/* ---------- Portfolio ---------- */

/** Allocations are shares of one portfolio, so a merged position cannot exceed the whole. */
const MAX_ALLOCATION_PCT = 100;

/** The portfolio as a file may carry it: current, pre-nesting, or pre-holdings. */
interface RawStock {
  apiUrl?: unknown;
  holdings?: unknown;
  /** Exports that predate holdings carried a bare ticker list */
  symbols?: unknown;
}

/**
 * Reads the portfolio out of a raw state, tolerating the pre-nesting
 * `{ stockApiUrl, stockHoldings }` shape older builds persisted.  This lives
 * here rather than in App's localStorage hydration so a file import of the
 * same JSON gets the same treatment — it used to import "successfully" with
 * an empty portfolio and the demo API URL.
 */
function resolveRawStock(raw: TH4State): RawStock {
  if (raw.stock !== undefined) return raw.stock;
  const legacy = raw as unknown as {
    stockApiUrl?: unknown;
    stockHoldings?: unknown;
  };
  if (legacy.stockApiUrl === undefined && legacy.stockHoldings === undefined)
    return DEFAULT_STATE.stock;
  return {
    apiUrl: isString(legacy.stockApiUrl) ? legacy.stockApiUrl : undefined,
    holdings: Array.isArray(legacy.stockHoldings)
      ? legacy.stockHoldings
      : undefined,
  };
}

/** Narrows an unknown field to its rows; anything that is not an array reads as absent. */
const toRows = (value: unknown): unknown[] | undefined =>
  Array.isArray(value) ? (value as unknown[]) : undefined;

/** A price is only usable when it is finite and positive; anything else is dropped. */
const usablePrice = (price: number | undefined): number | undefined =>
  price !== undefined && Number.isFinite(price) && price > 0
    ? price
    : undefined;

/**
 * Clones one validated holding with its symbol normalised and its unusable
 * decorations blanked: a zero/negative/NaN price, and a projectionStartDate
 * that does not parse (the panel divides by the elapsed time since that date,
 * so a non-date string renders "$NaN" as the required price today).  The
 * holding itself always survives — losing a fetched price costs the user
 * nothing, losing the position costs them their plan.
 */
function sanitizeHolding(h: PortfolioHolding): PortfolioHolding {
  const startedAt = h.projectionStartDate;
  return {
    ...h,
    symbol: normalizeStockSymbol(h.symbol),
    currentPrice: usablePrice(h.currentPrice),
    startPrice: usablePrice(h.startPrice),
    projectionStartDate:
      startedAt !== undefined && Number.isNaN(Date.parse(startedAt))
        ? undefined
        : startedAt,
  };
}

/**
 * Collapses repeated and case-variant symbols into one position each.
 * Duplicates render duplicate React keys, and every edit path matches by
 * symbol, so a second "aapl" row would make editing one row silently edit the
 * other.  The first occurrence keeps its position and its own decorations; a
 * later duplicate only adds its allocation and fills fields the first lacks.
 *
 * Takes ownership of the rows it is given — they are fresh clones.
 */
function dedupeHoldings(holdings: PortfolioHolding[]): PortfolioHolding[] {
  const bySymbol = new Map<string, PortfolioHolding>();
  for (const holding of holdings) {
    if (holding.symbol === "") continue;
    const first = bySymbol.get(holding.symbol);
    if (first === undefined) {
      bySymbol.set(holding.symbol, holding);
      continue;
    }
    first.allocationPct = Math.min(
      MAX_ALLOCATION_PCT,
      first.allocationPct + holding.allocationPct,
    );
    first.currentPrice ??= holding.currentPrice;
    first.startPrice ??= holding.startPrice;
    first.projectionStartDate ??= holding.projectionStartDate;
  }
  return [...bySymbol.values()];
}

/** Every holding a raw state carries, in either shape, cleaned and de-duplicated. */
function normalizeHoldings(stock: RawStock): PortfolioHolding[] {
  const rows = toRows(stock.holdings);
  if (rows !== undefined)
    return dedupeHoldings(rows.filter(isValidHolding).map(sanitizeHolding));

  const symbols = toRows(stock.symbols);
  if (symbols !== undefined)
    return dedupeHoldings(
      symbols
        .filter((v): v is string => isString(v) && v.trim() !== "")
        .map((symbol) => ({
          symbol: normalizeStockSymbol(symbol),
          allocationPct: 0,
        })),
    );

  return [];
}

/**
 * Fills any missing or undefined fields in a raw TH4State with their
 * defaults, drops malformed rows and out-of-range values, and returns a
 * fully populated state object safe for direct assignment to React state
 * setters.
 *
 * This is the single source of backward-compatibility handling — old
 * exports that predate new fields (e.g. monteCarloMode, budget toggle) are
 * seamlessly filled in, and old shapes (the top-level stock keys, the bare
 * symbols list) are lifted here so file import, localStorage hydration and
 * scenario load all share one gate.
 */
export function normalizeState(raw: TH4State): NormalizedState {
  const stock = resolveRawStock(raw);

  return {
    theme: Object.hasOwn(themeClasses, raw.theme) ? raw.theme : DEFAULT_THEME,
    sliders: clampSliders({
      ...DEFAULT_SLIDERS,
      ...pickWhere<SliderKey, number>(
        raw.sliders,
        SLIDER_KEY_SET,
        isFiniteNumber,
      ),
    }),
    inputs: {
      ...DEFAULT_INPUTS,
      ...pickWhere<InputKey, string>(raw.inputs, INPUT_KEY_SET, isString),
    },
    toggles: {
      ...DEFAULT_TOGGLES,
      ...(pickWhere(
        raw.toggles,
        TOGGLE_KEYS,
        isDefined,
      ) as Partial<TogglesState>),
    },
    stock: {
      apiUrl:
        isString(stock.apiUrl) && stock.apiUrl !== ""
          ? stock.apiUrl
          : DEFAULT_STATE.stock.apiUrl,
      holdings: normalizeHoldings(stock),
    },
    // Clamp, do not destroy: an amount below zero loses its sign (as the
    // in-app editor already enforces), not the expense line the user named.
    budgetItems: (raw.budgetItems ?? [])
      .filter(isValidBudgetItem)
      .map((item) => (item.amount >= 0 ? item : { ...item, amount: 0 })),
    scenarios: (raw.scenarios ?? [])
      .filter(isValidScenario)
      .map((s) => ({ ...s, state: normalizeState(s.state) })),
    activePage: raw.activePage ?? DEFAULT_STATE.activePage,
  };
}
