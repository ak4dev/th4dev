/* ==================================================
 * State Manager Tests
 *
 * Validates normalisation, type guard, and round-trip
 * integrity of the state-manager module.
 * ================================================== */

import { describe, it, expect } from "vitest"
import {
  isValidTH4State,
  normalizeState,
  DEFAULT_STATE,
  DEFAULT_TOGGLES,
  DEFAULT_SLIDERS,
  DEFAULT_INPUTS,
} from "../state-manager"
import type { TH4State } from "../../types/types"

/* ---------- Helpers ---------- */

/** Minimal valid state — only required fields populated */
const minimalState: TH4State = {
  theme: "nord",
  sliders: { projectedGainA: 7 },
  inputs: { currentAmountA: "5000" },
  toggles: {
    advanced: true,
    rollover: false,
    showInflation: false,
    portfolio: false,
    fees: false,
    monteCarlo: false,
    fire: true,
    scenarios: false,
    budget: false,
    monteCarloMode: "combined",
  },
}

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
    advanced: true,
    rollover: false,
    showInflation: false,
    portfolio: false,
    fees: false,
    monteCarlo: true,
    fire: true,
    scenarios: false,
    budget: true,
    monteCarloMode: "combined",
  },
  stock: {
    apiUrl: "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey=demo",
    holdings: [],
  },
  budgetItems: [],
  scenarios: [],
  activePage: "f",
}

/* ---------- isValidTH4State ---------- */

describe("isValidTH4State", () => {
  it("accepts a full valid state", () => {
    expect(isValidTH4State(fullExport)).toBe(true)
  })

  it("accepts a minimal state with required toggle booleans", () => {
    expect(isValidTH4State(minimalState)).toBe(true)
  })

  it("accepts old exports missing optional toggle fields", () => {
    const legacy = {
      theme: "gruvbox",
      sliders: {},
      inputs: {},
      toggles: {
        advanced: false,
        rollover: false,
        showInflation: false,
        portfolio: false,
      },
    }
    expect(isValidTH4State(legacy)).toBe(true)
  })

  it("rejects null", () => {
    expect(isValidTH4State(null)).toBe(false)
  })

  it("rejects missing theme", () => {
    expect(isValidTH4State({ sliders: {}, inputs: {}, toggles: { advanced: false, rollover: false, showInflation: false, portfolio: false } })).toBe(false)
  })

  it("rejects non-boolean toggle value", () => {
    const bad = {
      theme: "gruvbox",
      sliders: {},
      inputs: {},
      toggles: { advanced: "yes", rollover: false, showInflation: false, portfolio: false },
    }
    expect(isValidTH4State(bad)).toBe(false)
  })

  it("rejects invalid monteCarloMode", () => {
    const bad = {
      theme: "gruvbox",
      sliders: {},
      inputs: {},
      toggles: {
        advanced: false,
        rollover: false,
        showInflation: false,
        portfolio: false,
        monteCarloMode: "unknown",
      },
    }
    expect(isValidTH4State(bad)).toBe(false)
  })

  it("rejects invalid budgetItems", () => {
    const bad = {
      ...fullExport,
      budgetItems: [{ id: "x", name: 123, amount: 50, category: "Food" }],
    }
    expect(isValidTH4State(bad)).toBe(false)
  })
})

/* ---------- normalizeState ---------- */

describe("normalizeState", () => {
  it("fills missing toggles with defaults", () => {
    const raw = {
      theme: "nord",
      sliders: {},
      inputs: {},
      toggles: {
        advanced: true,
        rollover: false,
        showInflation: false,
        portfolio: false,
      },
    } as TH4State

    const result = normalizeState(raw)
    expect(result.toggles.advanced).toBe(true)
    expect(result.toggles.fire).toBe(false)
    expect(result.toggles.budget).toBe(false)
    expect(result.toggles.monteCarloMode).toBe("combined")
  })

  it("preserves all fields from a full export", () => {
    const result = normalizeState(fullExport)
    expect(result.theme).toBe("oneDark")
    expect(result.toggles.fire).toBe(true)
    expect(result.toggles.monteCarlo).toBe(true)
    expect(result.toggles.budget).toBe(true)
    expect(result.toggles.monteCarloMode).toBe("combined")
    expect(result.activePage).toBe("f")
    expect(result.sliders.fireAnnualExpenses).toBe(0)
  })

  it("fills missing sliders from defaults", () => {
    const raw = {
      theme: "nord",
      sliders: { projectedGainA: 7 },
      inputs: {},
      toggles: DEFAULT_TOGGLES,
    } as TH4State

    const result = normalizeState(raw)
    expect(result.sliders.projectedGainA).toBe(7)
    expect(result.sliders.yearsOfGrowthA).toBe(DEFAULT_SLIDERS.yearsOfGrowthA)
  })

  it("fills missing inputs from defaults", () => {
    const raw = {
      theme: "nord",
      sliders: {},
      inputs: {},
      toggles: DEFAULT_TOGGLES,
    } as TH4State

    const result = normalizeState(raw)
    expect(result.inputs.currentAmountA).toBe(DEFAULT_INPUTS.currentAmountA)
  })

  it("fills missing stock with default", () => {
    const raw = {
      theme: "nord",
      sliders: {},
      inputs: {},
      toggles: DEFAULT_TOGGLES,
    } as TH4State

    const result = normalizeState(raw)
    expect(result.stock).toBeDefined()
    expect(result.stock!.holdings).toEqual([])
  })

  it("fills missing activePage with default", () => {
    const raw = {
      theme: "nord",
      sliders: {},
      inputs: {},
      toggles: DEFAULT_TOGGLES,
    } as TH4State

    const result = normalizeState(raw)
    expect(result.activePage).toBe("f")
  })

  it("fills empty budgetItems and scenarios arrays", () => {
    const raw = {
      theme: "nord",
      sliders: {},
      inputs: {},
      toggles: DEFAULT_TOGGLES,
    } as TH4State

    const result = normalizeState(raw)
    expect(result.budgetItems).toEqual([])
    expect(result.scenarios).toEqual([])
  })

  it("handles legacy stock with symbols array", () => {
    const raw = {
      theme: "nord",
      sliders: {},
      inputs: {},
      toggles: DEFAULT_TOGGLES,
      stock: { apiUrl: "https://example.com", symbols: ["AAPL", "GOOG"] } as unknown,
    } as TH4State

    const result = normalizeState(raw)
    expect(result.stock!.holdings).toHaveLength(2)
    expect(result.stock!.holdings[0].symbol).toBe("AAPL")
  })
})

/* ---------- Round-trip ---------- */

describe("state round-trip", () => {
  it("full export survives JSON serialize + normalize", () => {
    const json = JSON.stringify(fullExport)
    const parsed = JSON.parse(json) as TH4State
    expect(isValidTH4State(parsed)).toBe(true)

    const normalized = normalizeState(parsed)
    expect(normalized.theme).toBe("oneDark")
    expect(normalized.toggles.fire).toBe(true)
    expect(normalized.toggles.monteCarlo).toBe(true)
    expect(normalized.toggles.budget).toBe(true)
    expect(normalized.activePage).toBe("f")
  })

  it("DEFAULT_STATE is already normalized", () => {
    const normalized = normalizeState(DEFAULT_STATE)
    expect(normalized).toEqual(DEFAULT_STATE)
  })

  it("old export without new fields normalizes cleanly", () => {
    const old = {
      theme: "dracula",
      sliders: { projectedGainA: 8 },
      inputs: { currentAmountA: "20000" },
      toggles: {
        advanced: false,
        rollover: false,
        showInflation: true,
        portfolio: false,
      },
    } as TH4State

    expect(isValidTH4State(old)).toBe(true)
    const result = normalizeState(old)
    expect(result.toggles.fire).toBe(false)
    expect(result.toggles.monteCarloMode).toBe("combined")
    expect(result.stock).toBeDefined()
    expect(result.activePage).toBe("f")
  })
})

/* ---------- Bug fix coverage ---------- */

describe("DEFAULT_SLIDERS completeness", () => {
  it("includes FIRE slider defaults", () => {
    expect(DEFAULT_SLIDERS.fireAnnualExpenses).toBe(40000)
    expect(DEFAULT_SLIDERS.fireSWR).toBe(4)
    expect(DEFAULT_SLIDERS.fireCurrentAge).toBe(30)
    expect(DEFAULT_SLIDERS.fireRetirementAge).toBe(65)
  })

  it("includes fee slider defaults", () => {
    expect(DEFAULT_SLIDERS.annualFeeA).toBe(0)
    expect(DEFAULT_SLIDERS.annualFeeB).toBe(0)
  })

  it("includes volatility slider defaults", () => {
    expect(DEFAULT_SLIDERS.volatilityA).toBe(12)
    expect(DEFAULT_SLIDERS.volatilityB).toBe(12)
  })

  it("normalizeState fills missing FIRE/fee/volatility sliders", () => {
    const old = {
      theme: "dracula",
      sliders: { projectedGainA: 8 },
      inputs: {},
      toggles: {
        advanced: false,
        rollover: false,
        showInflation: false,
        portfolio: false,
      },
    } as TH4State

    const result = normalizeState(old)
    expect(result.sliders.fireAnnualExpenses).toBe(40000)
    expect(result.sliders.annualFeeA).toBe(0)
    expect(result.sliders.volatilityA).toBe(12)
  })
})

describe("stock validation in isValidTH4State", () => {
  it("rejects stock with non-object value", () => {
    const bad = {
      ...fullExport,
      stock: "not-an-object",
    }
    expect(isValidTH4State(bad)).toBe(false)
  })

  it("rejects stock with non-string apiUrl", () => {
    const bad = {
      ...fullExport,
      stock: { apiUrl: 123, holdings: [] },
    }
    expect(isValidTH4State(bad)).toBe(false)
  })

  it("rejects stock with non-array holdings", () => {
    const bad = {
      ...fullExport,
      stock: { apiUrl: "https://example.com", holdings: "not-array" },
    }
    expect(isValidTH4State(bad)).toBe(false)
  })

  it("accepts stock with valid structure", () => {
    const good = {
      ...fullExport,
      stock: { apiUrl: "https://example.com", holdings: [{ symbol: "AAPL", allocationPct: 100 }] },
    }
    expect(isValidTH4State(good)).toBe(true)
  })

  it("accepts state without stock field (backward compat)", () => {
    const noStock = { ...fullExport }
    delete (noStock as Record<string, unknown>).stock
    expect(isValidTH4State(noStock)).toBe(true)
  })
})

describe("holdings clone isolation", () => {
  it("normalizeState clones holdings array", () => {
    const original = {
      ...fullExport,
      stock: {
        apiUrl: "https://example.com",
        holdings: [{ symbol: "AAPL", allocationPct: 50 }],
      },
    }

    const result = normalizeState(original)
    result.stock!.holdings[0].allocationPct = 100

    expect(original.stock!.holdings[0].allocationPct).toBe(50)
  })
})
