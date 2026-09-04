import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import SubdomainRouter from "../SubdomainRouter";
import {
  DEFAULT_STATE,
  DEFAULT_TOGGLES,
} from "../../common/helpers/state-manager";

/**
 * The calculator is behind React.lazy so the landing route — the default on
 * th4.dev — does not pay for it. That split is otherwise a SILENT invariant:
 * a static import of the calculator anywhere in the entry graph would put
 * ~430 kB back with no signal from the suite or the type checker.
 *
 * renderToStaticMarkup emits a Suspense boundary's fallback synchronously
 * when the lazy child has not resolved, so the split is observable here with
 * no DOM: the calculator branch renders the fallback and nothing else.
 */
const render = (activePage: string) =>
  renderToStaticMarkup(
    createElement(SubdomainRouter, {
      activePage,
      onNavigate: () => {},
      localStorageEnabled: false,
      onLocalStorageToggle: () => {},
      theme: "gruvbox",
      setTheme: () => {},
      sliders: DEFAULT_STATE.sliders,
      setSliders: () => {},
      inputs: DEFAULT_STATE.inputs,
      setInputs: () => {},
      toggles: DEFAULT_TOGGLES,
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

describe("SubdomainRouter", () => {
  it("keeps the calculator behind a lazy boundary, not in the entry graph", () => {
    const html = render("f");
    // The fallback, not the calculator: proof the module is still deferred.
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading the calculator");
    // A hallmark of the real hub. Its presence here would mean the calculator
    // resolved synchronously, i.e. it is back in the entry chunk.
    expect(html).not.toContain("Investment A Current Amount");
  });

  it("renders the landing page for any other page, with no calculator", () => {
    const html = render("th4");
    expect(html).not.toContain("Loading the calculator");
    expect(html).not.toContain("Investment A Current Amount");
    expect(html.length).toBeGreaterThan(200);
  });
});
