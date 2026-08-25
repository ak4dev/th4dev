import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import Hub from "../InvestmentCalculatorModern";
import {
  DEFAULT_STATE,
  DEFAULT_TOGGLES,
} from "../../common/helpers/state-manager";

const render = (toggles: Partial<typeof DEFAULT_TOGGLES>) =>
  renderToStaticMarkup(
    createElement(Hub, {
      theme: "gruvbox",
      setTheme: () => {},
      sliders: DEFAULT_STATE.sliders,
      setSliders: () => {},
      inputs: DEFAULT_STATE.inputs,
      setInputs: () => {},
      toggles: { ...DEFAULT_TOGGLES, ...toggles },
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

/**
 * The Target Value control was once nested inside the advanced-mode block and
 * silently disappeared from basic mode. It is a core feature in every mode, so
 * its presence is pinned here.
 */
describe("Target Value control is present in every mode", () => {
  for (const [name, t] of [
    ["basic", {}],
    ["advanced (fixed withdrawals)", { advanced: true }],
    [
      "advanced + dynamic withdrawal",
      { advanced: true, dynamicWithdrawal: true },
    ],
  ] as const) {
    it(name, () => {
      const html = render(t);
      expect(html).toContain("Target Value");
      expect(html).toMatch(/aria-label="Investment A Target Value"/);
    });
  }
});
