/* ==================================================
 * State Manager Tests
 *
 * Validates normalisation, type guard, and round-trip
 * integrity of the state-manager module.
 * ================================================== */

import { describe, it, expect } from "vitest";
import {
  isValidTH4State,
  normalizeState,
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
} from "../../constants/app-constants";
import type { TH4State } from "../../types/types";
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
    for (const lane of ["A", "B"]) {
      expect(DEFAULT_SLIDERS[`withdrawalRate${lane}`]).toBe(
        DEFAULT_WITHDRAWAL_RATE,
      );
      expect(DEFAULT_SLIDERS[`withdrawalFloor${lane}`]).toBe(
        DEFAULT_WITHDRAWAL_FLOOR,
      );
      expect(DEFAULT_SLIDERS[`withdrawalCeiling${lane}`]).toBe(
        DEFAULT_WITHDRAWAL_CEILING,
      );
    }
  });

  it("carries no keys nothing reads", () => {
    expect(DEFAULT_SLIDERS).not.toHaveProperty("investmentA");
    expect(DEFAULT_SLIDERS).not.toHaveProperty("investmentB");
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
    // A floor above the slider maximum is clamped first, so the ceiling never exceeds the range
    const capped = normalizeState({
      ...bareState,
      sliders: { withdrawalFloorA: 50000, withdrawalCeilingA: 0 },
    });
    expect(capped.sliders.withdrawalFloorA).toBe(MAX_MONTHLY_WITHDRAWAL);
    expect(capped.sliders.withdrawalCeilingA).toBe(MAX_MONTHLY_WITHDRAWAL);
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
          { symbol: "GOOG", allocationPct: 50, currentPrice: NaN },
          { symbol: "AMZN", allocationPct: 25, currentPrice: 180.5 },
        ] as unknown as PortfolioHolding[],
      },
    };
    const result = normalizeState(dirty);
    expect(result.stock.holdings.map((h) => h.symbol)).toEqual([
      "AAPL",
      "AMZN",
    ]);
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
