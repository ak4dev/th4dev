/* ==================================================
 * State Export/Import Tests
 *
 * Verifies that all tool values (FIRE, budget, fees,
 * Monte Carlo, scenarios) are captured in the
 * TH4State shape and survive round-trip
 * serialisation.
 * ================================================== */

import { describe, it, expect } from "vitest"
import type { TH4State } from "../../types/types"
import type { BudgetItem } from "../budget-manager"
import type { ScenarioSnapshot } from "../scenario-manager"

describe("TH4State round-trip serialisation", () => {
  const fullState: TH4State = {
    theme: "dracula",
    sliders: {
      investmentA: 50000,
      investmentB: 25000,
      projectedGainA: 8,
      projectedGainB: 12,
      yearsOfGrowthA: 25,
      yearsOfGrowthB: 15,
      monthlyContributionA: 500,
      monthlyContributionB: 300,
      monthlyWithdrawalA: 200,
      monthlyWithdrawalB: 0,
      withdrawalStartYearA: 10,
      withdrawalStartYearB: 0,
      yearlyInflation: 3,
      targetValueA: 500000,
      targetValueB: 0,
      annualFeeA: 0.5,
      annualFeeB: 0.25,
      volatilityA: 15,
      fireAnnualExpenses: 48000,
      fireSWR: 3.5,
      fireCurrentAge: 35,
      fireRetirementAge: 55,
    },
    inputs: {
      currentAmountA: "50000",
      currentAmountB: "25000",
    },
    toggles: {
      advanced: true,
      rollover: false,
      showInflation: true,
      portfolio: true,
      fees: true,
      monteCarlo: true,
      fire: true,
      scenarios: true,
      budget: true,
    },
    stock: {
      apiUrl: "https://example.com/api?symbol={symbol}",
      holdings: [
        { symbol: "AAPL", allocationPct: 60, currentPrice: 180, startPrice: 170 },
        { symbol: "MSFT", allocationPct: 40, currentPrice: 400, startPrice: 380 },
      ],
    },
    budgetItems: [
      { id: "b1", name: "Rent", amount: 1500, category: "Housing" },
      { id: "b2", name: "Groceries", amount: 400, category: "Food" },
      { id: "b3", name: "Untitled", amount: 50, category: "Other" },
    ],
    scenarios: [
      {
        id: "s1",
        name: "Conservative",
        createdAt: "2025-01-01T00:00:00.000Z",
        state: {
          theme: "dracula",
          sliders: { projectedGainA: 6 },
          inputs: { currentAmountA: "30000" },
          toggles: { advanced: false, rollover: false, showInflation: false, portfolio: false },
        } as TH4State,
      },
    ],
    activePage: "fire",
  }

  it("survives JSON round-trip without data loss", () => {
    const json = JSON.stringify(fullState)
    const parsed = JSON.parse(json) as TH4State

    expect(parsed.theme).toBe("dracula")
    expect(parsed.sliders.annualFeeA).toBe(0.5)
    expect(parsed.sliders.volatilityA).toBe(15)
    expect(parsed.sliders.fireAnnualExpenses).toBe(48000)
    expect(parsed.sliders.fireSWR).toBe(3.5)
    expect(parsed.sliders.fireCurrentAge).toBe(35)
    expect(parsed.sliders.fireRetirementAge).toBe(55)
    expect(parsed.toggles.fees).toBe(true)
    expect(parsed.toggles.monteCarlo).toBe(true)
    expect(parsed.toggles.fire).toBe(true)
    expect(parsed.toggles.scenarios).toBe(true)
    expect(parsed.toggles.budget).toBe(true)
    expect(parsed.stock?.holdings).toHaveLength(2)
    expect(parsed.budgetItems).toHaveLength(3)
    expect(parsed.scenarios).toHaveLength(1)
    expect(parsed.activePage).toBe("fire")
  })

  it("captures all FIRE slider values", () => {
    const json = JSON.stringify(fullState)
    const parsed = JSON.parse(json) as TH4State

    expect(parsed.sliders.fireAnnualExpenses).toBe(48000)
    expect(parsed.sliders.fireSWR).toBe(3.5)
    expect(parsed.sliders.fireCurrentAge).toBe(35)
    expect(parsed.sliders.fireRetirementAge).toBe(55)
  })

  it("captures fee slider values for both tracks", () => {
    const json = JSON.stringify(fullState)
    const parsed = JSON.parse(json) as TH4State

    expect(parsed.sliders.annualFeeA).toBe(0.5)
    expect(parsed.sliders.annualFeeB).toBe(0.25)
  })

  it("captures Monte Carlo volatility", () => {
    const json = JSON.stringify(fullState)
    const parsed = JSON.parse(json) as TH4State

    expect(parsed.sliders.volatilityA).toBe(15)
  })

  it("captures budget items with all fields", () => {
    const json = JSON.stringify(fullState)
    const parsed = JSON.parse(json) as TH4State

    expect(parsed.budgetItems).toBeDefined()
    const items = parsed.budgetItems as BudgetItem[]
    expect(items).toHaveLength(3)
    expect(items[0].name).toBe("Rent")
    expect(items[0].amount).toBe(1500)
    expect(items[0].category).toBe("Housing")
    expect(items[2].name).toBe("Untitled")
  })

  it("handles missing optional fields gracefully (backward compat)", () => {
    const minimalState: TH4State = {
      theme: "gruvbox",
      sliders: { investmentA: 10000 },
      inputs: { currentAmountA: "10000" },
      toggles: {
        advanced: false,
        rollover: false,
        showInflation: false,
        portfolio: false,
        fees: false,
        monteCarlo: false,
        fire: false,
        scenarios: false,
        budget: false,
      },
    }

    const json = JSON.stringify(minimalState)
    const parsed = JSON.parse(json) as TH4State

    expect(parsed.stock).toBeUndefined()
    expect(parsed.budgetItems).toBeUndefined()
    expect(parsed.scenarios).toBeUndefined()
    expect(parsed.activePage).toBeUndefined()
    expect(parsed.sliders.annualFeeA).toBeUndefined()
    expect(parsed.sliders.volatilityA).toBeUndefined()
    expect(parsed.sliders.fireAnnualExpenses).toBeUndefined()
  })

  it("all toggle fields survive round-trip", () => {
    const json = JSON.stringify(fullState)
    const parsed = JSON.parse(json) as TH4State

    const toggleKeys: (keyof TH4State["toggles"])[] = [
      "advanced", "rollover", "showInflation", "portfolio",
      "fees", "monteCarlo", "fire", "scenarios", "budget",
    ]
    for (const key of toggleKeys) {
      expect(typeof parsed.toggles[key]).toBe("boolean")
    }
  })

  it("captures scenarios with nested state", () => {
    const json = JSON.stringify(fullState)
    const parsed = JSON.parse(json) as TH4State

    expect(parsed.scenarios).toBeDefined()
    const scenarios = parsed.scenarios as ScenarioSnapshot[]
    expect(scenarios).toHaveLength(1)
    expect(scenarios[0].name).toBe("Conservative")
    expect(scenarios[0].state.sliders.projectedGainA).toBe(6)
    expect(scenarios[0].state.inputs?.currentAmountA).toBe("30000")
  })

  it("captures activePage", () => {
    const json = JSON.stringify(fullState)
    const parsed = JSON.parse(json) as TH4State
    expect(parsed.activePage).toBe("fire")
  })
})
