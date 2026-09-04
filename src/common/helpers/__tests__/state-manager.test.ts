/* ==================================================
 * State Manager Tests
 *
 * Validates normalisation, type guard, and round-trip
 * integrity of the state-manager module.
 * ================================================== */

import { parseAmountInput } from "../format";
import { describe, it, expect, expectTypeOf } from "vitest";
import {
  isValidTH4State,
  normalizeState,
  clampSlider,
  DEFAULT_STATE,
  DEFAULT_TOGGLES,
  DEFAULT_SLIDERS,
  DEFAULT_INPUTS,
} from "../state-manager";
import {
  DEFAULT_THEME,
  DEFAULT_WITHDRAWAL_RATE,
  DEFAULT_WITHDRAWAL_FLOOR,
  DEFAULT_WITHDRAWAL_CEILING,
  MAX_YEARS_OF_GROWTH,
  MAX_WITHDRAWAL_RATE,
  MAX_MONTHLY_WITHDRAWAL,
  MAX_MONTHLY_WITHDRAWAL_LIMIT,
  MAX_PROJECTED_GAIN,
  DEFAULT_YEARS_OF_GROWTH,
  LANE_IDS,
  SLIDER_KEYS,
  SLIDER_LIMITS,
  laneKey,
} from "../../constants/app-constants";
import { getMonthlyTotal } from "../budget-manager";
import type { SliderKey } from "../../constants/app-constants";
import type { SliderValues, TH4State, TogglesState } from "../../types/types";
import type { PortfolioHolding } from "../../types/portfolio-types";
import type { ScenarioSnapshot } from "../scenario-manager";

/* ---------- Fixtures ---------- */

/** Copy of `obj` without the given keys */
const without = (obj: object, ...keys: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

/** The four toggles every export has carried since the first release */
const LEGACY_TOGGLES = {
  advanced: false,
  rollover: false,
  showInflation: false,
  portfolio: false,
};

/** Bare state — only the required fields, nothing to normalise but defaults */
const bareState = {
  theme: "nord",
  sliders: {},
  inputs: {},
  toggles: DEFAULT_TOGGLES,
} as TH4State;

/** Minimal valid state — only required fields populated */
const minimalState: TH4State = {
  theme: "nord",
  sliders: { projectedGainA: 7 },
  inputs: { currentAmountA: "5000" },
  toggles: { ...DEFAULT_TOGGLES, advanced: true, fire: true },
};

/** Full state matching the user's exported JSON shape */
const fullExport: TH4State = {
  theme: "oneDark",
  sliders: {
    investmentA: 10000,
    investmentB: 10000,
    projectedGainA: 10,
    projectedGainB: 10,
    yearsOfGrowthA: 30,
    yearsOfGrowthB: 30,
    monthlyContributionA: 0,
    monthlyContributionB: 0,
    monthlyWithdrawalA: 0,
    monthlyWithdrawalB: 0,
    withdrawalStartYearA: 0,
    withdrawalStartYearB: 0,
    yearlyInflation: 2.5,
    targetValueA: 0,
    targetValueB: 0,
    fireAnnualExpenses: 0,
  },
  inputs: { currentAmountA: "10000", currentAmountB: "10000" },
  toggles: {
    ...DEFAULT_TOGGLES,
    advanced: true,
    monteCarlo: true,
    fire: true,
    budget: true,
  },
  stock: {
    apiUrl:
      "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey=demo",
    holdings: [],
  },
  budgetItems: [],
  scenarios: [],
  activePage: "f",
};

const validSnapshot: ScenarioSnapshot = {
  id: "s1",
  name: "Conservative",
  createdAt: "2025-01-01T00:00:00.000Z",
  state: { ...minimalState, sliders: { projectedGainA: 6 } },
};

/* ---------- isValidTH4State ---------- */

describe("isValidTH4State", () => {
  it("accepts a full valid state", () => {
    expect(isValidTH4State(fullExport)).toBe(true);
  });

  it("accepts a minimal state with required toggle booleans", () => {
    expect(isValidTH4State(minimalState)).toBe(true);
  });

  it("accepts old exports missing optional toggle fields", () => {
    expect(
      isValidTH4State({
        ...bareState,
        theme: "gruvbox",
        toggles: LEGACY_TOGGLES,
      }),
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidTH4State(null)).toBe(false);
  });

  it("rejects missing theme", () => {
    expect(isValidTH4State(without(bareState, "theme"))).toBe(false);
  });

  it("rejects a missing required toggle", () => {
    const toggles = without(LEGACY_TOGGLES, "advanced");
    expect(isValidTH4State({ ...bareState, toggles })).toBe(false);
  });

  it("rejects non-boolean toggle value", () => {
    const toggles = { ...LEGACY_TOGGLES, advanced: "yes" };
    expect(isValidTH4State({ ...bareState, toggles })).toBe(false);
  });

  it("rejects a non-boolean dynamicWithdrawal toggle", () => {
    const toggles = { ...LEGACY_TOGGLES, dynamicWithdrawal: 1 };
    expect(isValidTH4State({ ...bareState, toggles })).toBe(false);
    expect(
      isValidTH4State({
        ...bareState,
        toggles: { ...LEGACY_TOGGLES, dynamicWithdrawal: true },
      }),
    ).toBe(true);
  });

  it("rejects invalid monteCarloMode", () => {
    const toggles = { ...LEGACY_TOGGLES, monteCarloMode: "unknown" };
    expect(isValidTH4State({ ...bareState, toggles })).toBe(false);
  });

  it("rejects non-array budgetItems but tolerates malformed rows (normalizeState drops them)", () => {
    expect(isValidTH4State({ ...fullExport, budgetItems: "rent" })).toBe(false);
    expect(
      isValidTH4State({
        ...fullExport,
        budgetItems: [{ id: "x", name: 123, amount: 50, category: "Food" }],
      }),
    ).toBe(true);
  });
});

/* ---------- normalizeState ---------- */

describe("normalizeState", () => {
  it("fills missing toggles with defaults", () => {
    const result = normalizeState({
      ...bareState,
      toggles: { ...LEGACY_TOGGLES, advanced: true } as TH4State["toggles"],
    });
    expect(result.toggles.advanced).toBe(true);
    expect(result.toggles.fire).toBe(false);
    expect(result.toggles.budget).toBe(false);
    expect(result.toggles.dynamicWithdrawal).toBe(false);
    expect(result.toggles.monteCarloMode).toBe("combined");
  });

  it("preserves all fields from a full export", () => {
    const result = normalizeState(fullExport);
    expect(result.theme).toBe("oneDark");
    expect(result.toggles.fire).toBe(true);
    expect(result.toggles.monteCarlo).toBe(true);
    expect(result.toggles.budget).toBe(true);
    expect(result.toggles.monteCarloMode).toBe("combined");
    expect(result.activePage).toBe("f");
    expect(result.sliders.fireAnnualExpenses).toBe(0);
  });

  it("fills missing sliders and inputs from defaults", () => {
    const result = normalizeState({
      ...bareState,
      sliders: { projectedGainA: 7 },
    });
    expect(result.sliders.projectedGainA).toBe(7);
    expect(result.sliders.yearsOfGrowthA).toBe(DEFAULT_SLIDERS.yearsOfGrowthA);
    expect(result.inputs.currentAmountA).toBe(DEFAULT_INPUTS.currentAmountA);
  });

  it("fills stock, activePage, budgetItems and scenarios with defaults", () => {
    const result = normalizeState(bareState);
    expect(result.stock.holdings).toEqual([]);
    expect(result.stock.apiUrl).toBe(DEFAULT_STATE.stock.apiUrl);
    expect(result.activePage).toBe("f");
    expect(result.budgetItems).toEqual([]);
    expect(result.scenarios).toEqual([]);
  });

  it("handles legacy stock with symbols array", () => {
    const result = normalizeState({
      ...bareState,
      stock: {
        apiUrl: "https://example.com",
        symbols: ["AAPL", "GOOG"],
      } as unknown as TH4State["stock"],
    });
    expect(result.stock.holdings).toHaveLength(2);
    expect(result.stock.holdings[0].symbol).toBe("AAPL");
  });

  it("falls back to the default theme for an unknown theme key", () => {
    expect(normalizeState({ ...bareState, theme: "solarized" }).theme).toBe(
      DEFAULT_THEME,
    );
    expect(normalizeState({ ...bareState, theme: "toString" }).theme).toBe(
      DEFAULT_THEME,
    );
    expect(normalizeState({ ...bareState, theme: "dracula" }).theme).toBe(
      "dracula",
    );
  });

  it("keeps only valid scenario snapshots and normalises their nested state", () => {
    const result = normalizeState({
      ...bareState,
      scenarios: [
        null,
        {},
        { id: "x", name: "y", createdAt: "z" },
        { id: "x", name: "y", createdAt: "z", state: {} },
        validSnapshot,
      ] as unknown as ScenarioSnapshot[],
    });
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].name).toBe("Conservative");
    expect(result.scenarios[0].state.sliders.projectedGainA).toBe(6);
    expect(result.scenarios[0].state.sliders.yearsOfGrowthA).toBe(
      DEFAULT_SLIDERS.yearsOfGrowthA,
    );
    expect(result.scenarios[0].state.toggles.fees).toBe(false);
    expect(result.scenarios[0].state.stock?.holdings).toEqual([]);
  });
});

/* ---------- Round-trip ---------- */

describe("state round-trip", () => {
  it("full export survives JSON serialize + normalize", () => {
    const parsed = JSON.parse(JSON.stringify(fullExport)) as TH4State;
    expect(isValidTH4State(parsed)).toBe(true);

    const normalized = normalizeState(parsed);
    expect(normalized.theme).toBe("oneDark");
    expect(normalized.toggles.fire).toBe(true);
    expect(normalized.toggles.monteCarlo).toBe(true);
    expect(normalized.toggles.budget).toBe(true);
    expect(normalized.activePage).toBe("f");
  });

  it("DEFAULT_STATE is already normalized", () => {
    expect(normalizeState(DEFAULT_STATE)).toEqual(DEFAULT_STATE);
  });

  it("old export without new fields normalizes cleanly", () => {
    const old = {
      theme: "dracula",
      sliders: { projectedGainA: 8 },
      inputs: { currentAmountA: "20000" },
      toggles: { ...LEGACY_TOGGLES, showInflation: true },
    } as unknown as TH4State;

    expect(isValidTH4State(old)).toBe(true);
    const result = normalizeState(old);
    expect(result.toggles.fire).toBe(false);
    expect(result.toggles.monteCarloMode).toBe("combined");
    expect(result.stock).toBeDefined();
    expect(result.activePage).toBe("f");
  });
});

/* ---------- Slider defaults ---------- */

describe("DEFAULT_SLIDERS completeness", () => {
  it("includes FIRE slider defaults", () => {
    expect(DEFAULT_SLIDERS.fireAnnualExpenses).toBe(40000);
    expect(DEFAULT_SLIDERS.fireSWR).toBe(4);
    expect(DEFAULT_SLIDERS.fireCurrentAge).toBe(30);
    expect(DEFAULT_SLIDERS.fireRetirementAge).toBe(65);
  });

  it("includes fee and volatility slider defaults", () => {
    expect(DEFAULT_SLIDERS.annualFeeA).toBe(0);
    expect(DEFAULT_SLIDERS.annualFeeB).toBe(0);
    expect(DEFAULT_SLIDERS.volatilityA).toBe(12);
    expect(DEFAULT_SLIDERS.volatilityB).toBe(12);
  });

  it("includes dynamic withdrawal defaults for both lanes", () => {
    for (const lane of LANE_IDS) {
      expect(DEFAULT_SLIDERS[laneKey("withdrawalRate", lane)]).toBe(
        DEFAULT_WITHDRAWAL_RATE,
      );
      expect(DEFAULT_SLIDERS[laneKey("withdrawalFloor", lane)]).toBe(
        DEFAULT_WITHDRAWAL_FLOOR,
      );
      expect(DEFAULT_SLIDERS[laneKey("withdrawalCeiling", lane)]).toBe(
        DEFAULT_WITHDRAWAL_CEILING,
      );
    }
  });

  it("carries no keys nothing reads", () => {
    expect(DEFAULT_SLIDERS).not.toHaveProperty("investmentA");
    expect(DEFAULT_SLIDERS).not.toHaveProperty("investmentB");
  });

  it("keeps a FIRE slider the user set to 0", () => {
    // 0 is an answer, not a gap: a budget of zero-amount items pushes an
    // annual total of 0 into fireAnnualExpenses, and it used to be shown and
    // computed as the $40,000 default
    const result = normalizeState({
      ...bareState,
      sliders: {
        fireAnnualExpenses: 0,
        fireSWR: 0,
        fireCurrentAge: 0,
        fireRetirementAge: 0,
      },
    });
    expect(result.sliders.fireAnnualExpenses).toBe(0);
    expect(result.sliders.fireSWR).toBe(0);
    expect(result.sliders.fireCurrentAge).toBe(0);
    expect(result.sliders.fireRetirementAge).toBe(0);
  });

  it("normalizeState fills missing FIRE/fee/volatility/withdrawal sliders", () => {
    const result = normalizeState({
      ...bareState,
      sliders: { projectedGainA: 8 },
      toggles: LEGACY_TOGGLES as TH4State["toggles"],
    });
    expect(result.sliders.fireAnnualExpenses).toBe(40000);
    expect(result.sliders.annualFeeA).toBe(0);
    expect(result.sliders.volatilityA).toBe(12);
    expect(result.sliders.withdrawalRateB).toBe(DEFAULT_WITHDRAWAL_RATE);
    expect(result.sliders.withdrawalCeilingB).toBe(DEFAULT_WITHDRAWAL_CEILING);
  });
});

/* ---------- Contribution stop year ---------- */

/** The `value` attribute of the input carrying `name` as its accessible name */
const inputValue = (html: string, name: string): string | undefined => {
  const tag = new RegExp(`<input[^>]*aria-label="${name}"[^>]*>`).exec(
    html,
  )?.[0];
  return tag === undefined ? undefined : /value="([^"]*)"/.exec(tag)?.[1];
};

describe("contribution stop year is deliberately undefaulted", () => {
  it("is absent from DEFAULT_SLIDERS and stays absent through normalizeState", () => {
    // The absence IS the feature: unset means "contribute for this lane's
    // whole horizon". DefaultedSliderKey cannot catch a default being added,
    // because an object built by spreads is not excess-property-checked, so
    // this test is the only thing standing between the app and a stop year
    // frozen at DEFAULT_YEARS_OF_GROWTH.
    for (const lane of LANE_IDS) {
      const key = laneKey("contributionStopYear", lane);
      expect(Object.hasOwn(DEFAULT_SLIDERS, key)).toBe(false);
      expect(Object.hasOwn(normalizeState(bareState).sliders, key)).toBe(false);
    }
  });

  it("lets the hub's stop year follow a Years slider moved past the default", async () => {
    // The regression this guards: give contributionStopYear a default and a
    // 40-year plan silently stops contributing at year 30. The hub is
    // imported lazily so the rest of this file does not pay for the charting
    // stack it pulls in.
    const [{ default: Hub }, { renderToStaticMarkup }, { createElement }] =
      await Promise.all([
        import("../../../components/InvestmentCalculatorModern"),
        import("react-dom/server"),
        import("react"),
      ]);
    const years = DEFAULT_YEARS_OF_GROWTH + 10;
    const state = normalizeState({
      ...bareState,
      sliders: { yearsOfGrowthA: years },
      toggles: { ...DEFAULT_TOGGLES, advanced: true },
    });
    const html = renderToStaticMarkup(
      createElement(Hub, {
        theme: DEFAULT_THEME,
        setTheme: () => {},
        sliders: state.sliders,
        setSliders: () => {},
        inputs: state.inputs,
        setInputs: () => {},
        toggles: state.toggles,
        setToggles: () => {},
        stockApiUrl: "",
        stockHoldings: [],
        setStockHoldings: () => {},
        budgetItems: [],
        setBudgetItems: () => {},
        scenarios: [],
        setScenarios: () => {},
      } as never),
    );
    expect(inputValue(html, "Investment A Contribution Stop Year")).toBe(
      String(years),
    );
  });
});

/* ---------- Key vocabulary ---------- */

describe("slider key vocabulary", () => {
  it("admits every real key and rejects a typo", () => {
    // Erased at runtime: these are checked by `tsc -b`, which is the only
    // place a mistyped key can be caught before it reads as a silent 0.
    expectTypeOf<"projectedGainA">().toExtend<SliderKey>();
    expectTypeOf<"contributionStopYearB">().toExtend<SliderKey>();
    expectTypeOf<"yearlyInflation">().toExtend<SliderKey>();
    expectTypeOf<"projectdGainA">().not.toExtend<SliderKey>();
    expectTypeOf<"projectedGainC">().not.toExtend<SliderKey>();
    expectTypeOf<"currentAmountA">().not.toExtend<SliderKey>();
    // SLIDER_LIMITS is the map every stored value is re-read through, so its
    // keys and the union must be the same set in both directions
    expectTypeOf<keyof typeof SLIDER_LIMITS>().toEqualTypeOf<SliderKey>();
    // The one asymmetry the app depends on, stated as a type
    expectTypeOf<SliderValues["projectedGainA"]>().toEqualTypeOf<number>();
    expectTypeOf<SliderValues["contributionStopYearA"]>().toEqualTypeOf<
      number | undefined
    >();
    // A runtime assertion so the case is not vacuous when types are stripped
    expect(SLIDER_KEYS).toContain("projectedGainA");
  });

  it("keeps the runtime allow-list and SLIDER_LIMITS in step", () => {
    expect([...SLIDER_KEYS].sort()).toEqual(Object.keys(SLIDER_LIMITS).sort());
    // Every default names a key the app knows; the reverse does not hold,
    // which is exactly the contributionStopYear case above
    expect(
      Object.keys(DEFAULT_SLIDERS).filter(
        (key) => !SLIDER_KEYS.includes(key as SliderKey),
      ),
    ).toEqual([]);
  });
});

/* ---------- Stock ---------- */

describe("stock validation in isValidTH4State", () => {
  it("rejects stock with non-object value", () => {
    expect(isValidTH4State({ ...fullExport, stock: "not-an-object" })).toBe(
      false,
    );
  });

  it("rejects stock with non-string apiUrl", () => {
    expect(
      isValidTH4State({ ...fullExport, stock: { apiUrl: 123, holdings: [] } }),
    ).toBe(false);
  });

  it("rejects stock with non-array holdings", () => {
    expect(
      isValidTH4State({
        ...fullExport,
        stock: { apiUrl: "https://example.com", holdings: "not-array" },
      }),
    ).toBe(false);
  });

  it("accepts stock with valid structure", () => {
    expect(
      isValidTH4State({
        ...fullExport,
        stock: {
          apiUrl: "https://example.com",
          holdings: [{ symbol: "AAPL", allocationPct: 100 }],
        },
      }),
    ).toBe(true);
  });

  it("accepts state without stock field (backward compat)", () => {
    expect(isValidTH4State(without(fullExport, "stock"))).toBe(true);
  });
});

describe("holdings clone isolation", () => {
  it("normalizeState clones holdings array", () => {
    const original = {
      ...fullExport,
      stock: {
        apiUrl: "https://example.com",
        holdings: [{ symbol: "AAPL", allocationPct: 50 }],
      },
    };

    const result = normalizeState(original);
    result.stock.holdings[0].allocationPct = 100;

    expect(original.stock.holdings[0].allocationPct).toBe(50);
  });
});

/* ---------- Import sanitisation ---------- */

describe("import sanitisation", () => {
  it("drops non-numeric slider values from imported state", () => {
    const dirty = {
      ...fullExport,
      sliders: {
        ...fullExport.sliders,
        projectedGainA: "not-a-number" as unknown as number,
        yearsOfGrowthA: NaN,
        monthlyContributionA: Infinity,
        monthlyWithdrawalA: 250,
      },
    };
    const result = normalizeState(dirty);
    // Corrupt values are replaced by defaults; valid ones survive
    expect(result.sliders.projectedGainA).toBe(DEFAULT_SLIDERS.projectedGainA);
    expect(result.sliders.yearsOfGrowthA).toBe(DEFAULT_SLIDERS.yearsOfGrowthA);
    expect(result.sliders.monthlyContributionA).toBe(
      DEFAULT_SLIDERS.monthlyContributionA,
    );
    expect(result.sliders.monthlyWithdrawalA).toBe(250);
  });

  it("clamps out-of-range slider values into SLIDER_LIMITS", () => {
    const result = normalizeState({
      ...bareState,
      sliders: {
        yearsOfGrowthA: 1e7,
        projectedGainA: -50,
        volatilityB: 1e6,
        withdrawalRateA: 99,
        withdrawalStartYearB: -3,
        yearlyInflation: 4,
      },
    });
    expect(result.sliders.yearsOfGrowthA).toBe(MAX_YEARS_OF_GROWTH);
    expect(result.sliders.projectedGainA).toBe(0);
    expect(result.sliders.volatilityB).toBe(30);
    expect(result.sliders.withdrawalRateA).toBe(MAX_WITHDRAWAL_RATE);
    expect(result.sliders.withdrawalStartYearB).toBe(0);
    expect(result.sliders.yearlyInflation).toBe(4);
  });

  it("lifts a withdrawal ceiling that sits below its floor, per lane", () => {
    const result = normalizeState({
      ...bareState,
      sliders: {
        withdrawalFloorA: 3000,
        withdrawalCeilingA: 1000,
        withdrawalFloorB: 500,
        withdrawalCeilingB: 4000,
      },
    });
    expect(result.sliders.withdrawalFloorA).toBe(3000);
    expect(result.sliders.withdrawalCeilingA).toBe(3000);
    expect(result.sliders.withdrawalFloorB).toBe(500);
    expect(result.sliders.withdrawalCeilingB).toBe(4000);
  });

  it("keeps a withdrawal guardrail above the slider span and lifts its ceiling to match", () => {
    // $50,000/mo is beyond what the slider can show but well within what a
    // large portfolio spends. It used to come back as $10,000 - a plan the
    // user never wrote - so the survival of the stored figure is pinned here
    const saved = normalizeState({
      ...bareState,
      sliders: { withdrawalFloorA: 50000, withdrawalCeilingA: 0 },
    });
    expect(50000).toBeGreaterThan(MAX_MONTHLY_WITHDRAWAL);
    expect(saved.sliders.withdrawalFloorA).toBe(50000);
    expect(saved.sliders.withdrawalCeilingA).toBe(50000);
    expect(
      normalizeState({ ...bareState, sliders: { monthlyWithdrawalA: 50000 } })
        .sliders.monthlyWithdrawalA,
    ).toBe(50000);
  });

  it("still clamps a withdrawal figure past the sanity bound", () => {
    const absurd = normalizeState({
      ...bareState,
      sliders: {
        withdrawalFloorA: 5_000_000,
        withdrawalCeilingA: 0,
        monthlyWithdrawalB: 9e9,
      },
    });
    expect(absurd.sliders.withdrawalFloorA).toBe(MAX_MONTHLY_WITHDRAWAL_LIMIT);
    expect(absurd.sliders.withdrawalCeilingA).toBe(
      MAX_MONTHLY_WITHDRAWAL_LIMIT,
    );
    expect(absurd.sliders.monthlyWithdrawalB).toBe(
      MAX_MONTHLY_WITHDRAWAL_LIMIT,
    );
  });

  it("drops non-string input values from imported state", () => {
    const dirty = {
      ...fullExport,
      inputs: {
        currentAmountA: 12345 as unknown as string,
        currentAmountB: "7500",
      },
    };
    const result = normalizeState(dirty);
    expect(result.inputs.currentAmountA).toBe(DEFAULT_INPUTS.currentAmountA);
    expect(result.inputs.currentAmountB).toBe("7500");
  });

  it("drops malformed holdings from imported state", () => {
    const dirty = {
      ...fullExport,
      stock: {
        apiUrl: "https://example.com",
        holdings: [
          { symbol: "AAPL", allocationPct: 50 },
          { symbol: "", allocationPct: 25 },
          { symbol: "MSFT", allocationPct: "50" },
          { notASymbol: true },
          null,
          // A row whose only defect is its price keeps its position and
          // loses the price — see "unusable holding prices" below
          { symbol: "GOOG", allocationPct: 50, currentPrice: NaN },
          { symbol: "AMZN", allocationPct: 25, currentPrice: 180.5 },
        ] as unknown as PortfolioHolding[],
      },
    };
    const result = normalizeState(dirty);
    expect(result.stock.holdings.map((h) => h.symbol)).toEqual([
      "AAPL",
      "GOOG",
      "AMZN",
    ]);
    expect(result.stock.holdings[1].currentPrice).toBeUndefined();
  });

  it("drops malformed budget items from imported state", () => {
    const dirty = {
      ...fullExport,
      budgetItems: [
        { id: "a", name: "Rent", amount: 1200, category: "Housing" },
        { id: "b", name: "Bad", amount: "1200", category: "Housing" },
        "junk",
      ] as unknown as TH4State["budgetItems"],
    };
    const result = normalizeState(dirty);
    expect(result.budgetItems).toHaveLength(1);
    expect(result.budgetItems[0].name).toBe("Rent");
  });

  it("drops non-finite budget amounts and clamps a negative one to zero", () => {
    const result = normalizeState({
      ...fullExport,
      budgetItems: [
        { id: "a", name: "Rent", amount: 1200, category: "Housing" },
        { id: "b", name: "Broken", amount: NaN, category: "Food" },
        { id: "c", name: "Runaway", amount: Infinity, category: "Food" },
        { id: "d", name: "Refund", amount: -500, category: "Other" },
      ],
    });
    // The named expense line survives; only its sign is corrected
    expect(result.budgetItems.map((i) => i.name)).toEqual(["Rent", "Refund"]);
    expect(result.budgetItems[1].amount).toBe(0);
    // The FIRE number is computed off this total, so it must stay finite
    expect(getMonthlyTotal(result.budgetItems)).toBe(1200);
  });

  it("supports fractional year slider values", () => {
    const result = normalizeState({
      ...fullExport,
      sliders: {
        ...fullExport.sliders,
        yearsOfGrowthA: 10.5,
        withdrawalStartYearA: 2.5,
      },
    });
    expect(result.sliders.yearsOfGrowthA).toBe(10.5);
    expect(result.sliders.withdrawalStartYearA).toBe(2.5);
  });
});

/* ---------- Legacy shapes ---------- */

describe("legacy shape migration", () => {
  /** What a build before the { stock } nesting exported and persisted */
  const legacyState = {
    theme: "nord",
    sliders: {},
    inputs: {},
    toggles: LEGACY_TOGGLES,
    stockApiUrl: "https://legacy.example.com/quote?symbol={symbol}",
    stockHoldings: [
      { symbol: "AAPL", allocationPct: 100, currentPrice: 10 },
    ] as PortfolioHolding[],
  } as unknown as TH4State;

  it("lifts top-level stockApiUrl/stockHoldings into stock", () => {
    // The guard has always accepted this shape — normalizeState used to
    // substitute DEFAULT_STATE.stock, so a file import silently dropped the
    // whole portfolio while localStorage hydration kept it
    expect(isValidTH4State(legacyState)).toBe(true);
    const result = normalizeState(legacyState);
    expect(result.stock.apiUrl).toBe(
      "https://legacy.example.com/quote?symbol={symbol}",
    );
    expect(result.stock.holdings).toEqual([
      { symbol: "AAPL", allocationPct: 100, currentPrice: 10 },
    ]);
  });

  it("ignores the legacy keys once the nested stock is present", () => {
    const result = normalizeState({
      ...legacyState,
      stock: { apiUrl: "https://current.example.com", holdings: [] },
    } as unknown as TH4State);
    expect(result.stock.apiUrl).toBe("https://current.example.com");
    expect(result.stock.holdings).toEqual([]);
  });

  it("falls back to defaults when a legacy key is malformed", () => {
    const result = normalizeState({
      ...legacyState,
      stockApiUrl: 42,
      stockHoldings: "AAPL",
    } as unknown as TH4State);
    expect(result.stock.apiUrl).toBe(DEFAULT_STATE.stock.apiUrl);
    expect(result.stock.holdings).toEqual([]);
  });
});

/* ---------- Holding repair ---------- */

describe("holding sanitisation", () => {
  /** Builds a state carrying exactly these holdings */
  const withHoldings = (holdings: unknown[]): TH4State =>
    ({
      ...fullExport,
      stock: { apiUrl: "https://example.com", holdings },
    }) as unknown as TH4State;

  it("keeps a holding whose only defect is an unusable price", () => {
    const result = normalizeState(
      withHoldings([
        { symbol: "AAPL", allocationPct: 25, currentPrice: -3, startPrice: 90 },
        { symbol: "MSFT", allocationPct: 25, currentPrice: NaN, startPrice: 0 },
      ]),
    );
    expect(result.stock.holdings.map((h) => h.symbol)).toEqual([
      "AAPL",
      "MSFT",
    ]);
    expect(result.stock.holdings[0].currentPrice).toBeUndefined();
    expect(result.stock.holdings[0].startPrice).toBe(90);
    expect(result.stock.holdings[1].currentPrice).toBeUndefined();
    expect(result.stock.holdings[1].startPrice).toBeUndefined();
  });

  it("blanks an unparseable projectionStartDate and keeps the holding", () => {
    const result = normalizeState(
      withHoldings([
        {
          symbol: "AAPL",
          allocationPct: 50,
          currentPrice: 100,
          startPrice: 90,
          projectionStartDate: "not-a-date",
        },
        {
          symbol: "MSFT",
          allocationPct: 50,
          projectionStartDate: "2025-01-01T00:00:00.000Z",
        },
      ]),
    );
    expect(result.stock.holdings).toHaveLength(2);
    // A NaN elapsed time would render "$NaN" as the required price today
    expect(result.stock.holdings[0].projectionStartDate).toBeUndefined();
    expect(result.stock.holdings[0].currentPrice).toBe(100);
    expect(result.stock.holdings[1].projectionStartDate).toBe(
      "2025-01-01T00:00:00.000Z",
    );
  });

  it("collapses case-variant duplicates into the first occurrence", () => {
    const result = normalizeState(
      withHoldings([
        { symbol: "aapl", allocationPct: 60 },
        { symbol: "MSFT", allocationPct: 10 },
        {
          symbol: " AAPL ",
          allocationPct: 70,
          currentPrice: 180,
          projectionStartDate: "2025-01-01T00:00:00.000Z",
        },
      ]),
    );
    // One row per symbol, in first-occurrence order, upper-cased
    expect(result.stock.holdings.map((h) => h.symbol)).toEqual([
      "AAPL",
      "MSFT",
    ]);
    // Allocations sum, capped at the whole portfolio
    expect(result.stock.holdings[0].allocationPct).toBe(100);
    // The duplicate only fills in what the first occurrence lacked
    expect(result.stock.holdings[0].currentPrice).toBe(180);
    expect(result.stock.holdings[0].projectionStartDate).toBe(
      "2025-01-01T00:00:00.000Z",
    );
  });

  it("de-duplicates the legacy symbols list too", () => {
    const result = normalizeState({
      ...bareState,
      stock: {
        apiUrl: "https://example.com",
        symbols: ["aapl", "AAPL", " goog "],
      } as unknown as TH4State["stock"],
    });
    expect(result.stock.holdings.map((h) => h.symbol)).toEqual([
      "AAPL",
      "GOOG",
    ]);
  });
});

/* ---------- Key allow-lists ---------- */

describe("state key allow-lists", () => {
  it("drops unknown and prototype-named slider keys, keeping contributionStopYear", () => {
    // JSON.parse makes "__proto__" an own property, exactly as a file import would
    const sliders = JSON.parse(
      '{"junkKey":1e300,"__proto__":5,"constructor":7,"toString":9,"contributionStopYearA":12,"projectedGainA":9}',
    ) as Record<string, number>;
    const result = normalizeState({ ...bareState, sliders });

    expect(Object.hasOwn(result.sliders, "junkKey")).toBe(false);
    expect(Object.hasOwn(result.sliders, "__proto__")).toBe(false);
    expect(Object.hasOwn(result.sliders, "constructor")).toBe(false);
    expect(Object.hasOwn(result.sliders, "toString")).toBe(false);
    // A prototype-named key used to resolve against Object.prototype and
    // write NaN into React state
    expect(Object.values(result.sliders).every(Number.isFinite)).toBe(true);
    expect(Object.getPrototypeOf(result.sliders)).toBe(Object.prototype);

    // contributionStopYear lives only in SLIDER_LIMITS — the union that
    // builds the allow-list is what keeps the user's value
    expect(result.sliders.contributionStopYearA).toBe(12);
    expect(result.sliders.projectedGainA).toBe(9);
  });

  it("drops unknown input and toggle keys", () => {
    const result = normalizeState({
      ...bareState,
      inputs: { currentAmountA: "500", junkInput: "x" },
      toggles: {
        ...DEFAULT_TOGGLES,
        evil: { big: "xxxxxxxxxx" },
      } as unknown as TogglesState,
    });
    expect(result.inputs.currentAmountA).toBe("500");
    expect(Object.hasOwn(result.inputs, "junkInput")).toBe(false);
    expect(Object.hasOwn(result.toggles, "evil")).toBe(false);
    expect(Object.keys(result.toggles).sort()).toEqual(
      Object.keys(DEFAULT_TOGGLES).sort(),
    );
  });

  it("keeps every key the app actually reads on a full round trip", () => {
    const sliders: SliderValues = {
      ...DEFAULT_SLIDERS,
      contributionStopYearB: 8,
    };
    const result = normalizeState({ ...bareState, sliders });
    for (const key of Object.keys(sliders) as SliderKey[])
      expect(result.sliders[key]).toBe(sliders[key]);
  });
});

/* ---------- Value gates ---------- */

describe("clampSlider", () => {
  it("returns a key with no declared range untouched", () => {
    // SliderKey no longer admits these, so the casts are the point: they are
    // how a key from a hand-edited file reaches the runtime guard. Every one
    // of them must pass through rather than collapse to NaN against a missing
    // limit — contributionStopYear, by contrast, does have a range.
    const junk = (key: string) => clampSlider(key as SliderKey, 7);
    expect(clampSlider("noSuchSlider" as SliderKey, 1e9)).toBe(1e9);
    expect(clampSlider("noSuchSlider" as SliderKey, -42)).toBe(-42);
    // A prototype-named key resolves to an Object.prototype member, whose
    // `.max` is undefined and whose Math.min is NaN
    expect(junk("constructor")).toBe(7);
    expect(junk("__proto__")).toBe(7);
  });

  it("clamps both ends of a key that has one", () => {
    expect(clampSlider("projectedGainA", 999)).toBe(MAX_PROJECTED_GAIN);
    expect(clampSlider("projectedGainA", -1)).toBe(0);
    expect(clampSlider("projectedGainA", 7.5)).toBe(7.5);
    expect(clampSlider("yearsOfGrowthB", 1e7)).toBe(MAX_YEARS_OF_GROWTH);
  });

  it("is the rule normalizeState applies, key for key", () => {
    const dirty = { projectedGainA: 99, monthlyWithdrawalA: 50000 };
    const result = normalizeState({ ...bareState, sliders: dirty });
    for (const [key, value] of Object.entries(dirty) as [SliderKey, number][])
      expect(result.sliders[key]).toBe(clampSlider(key, value));
  });
});

describe("parseAmountInput", () => {
  it("reads a pasted, fully decorated amount as itself", () => {
    // Stripping the decimal point concatenated the digits either side of it:
    // a quarter of a million dollars became twenty-five million
    expect(parseAmountInput("$250,000.00")).toBe(250000);
    expect(parseAmountInput("$250,000.00")).not.toBe(25000000);
    expect(parseAmountInput("10000")).toBe(10000);
    expect(parseAmountInput("1,234")).toBe(1234);
    expect(parseAmountInput("0")).toBe(0);
  });

  it("stops at a second decimal point instead of corrupting the number", () => {
    expect(parseAmountInput("1.2.3")).toBe(1.2);
    expect(parseAmountInput("250000.75")).toBe(250000.75);
  });

  it("reports text holding no number as NaN, leaving the fallback to the caller", () => {
    // Every call site commits `parseAmountInput(text) || 0`, so a blank box
    // is a $0 plan; the box itself renders empty rather than "$NaN"
    expect(parseAmountInput("")).toBeNaN();
    expect(parseAmountInput("abc")).toBeNaN();
    expect(parseAmountInput("$")).toBeNaN();
    expect(parseAmountInput("abc") || 0).toBe(0);
  });

  it("keeps a negative amount negative so the caller can reject it", () => {
    // Stripping the sign would turn a typed "-500" into a $500 plan, which is
    // the same class of silent rewrite as the $250,000.00 paste bug.
    expect(parseAmountInput("-500")).toBe(-500);
    expect(parseAmountInput("$-1,200.50")).toBe(-1200.5);
  });
});
