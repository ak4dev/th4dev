import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BudgetPanel from "../budget/BudgetPanel";
import type { BudgetItem } from "../../common/helpers/budget-manager";

/**
 * Rendered through react-dom/server in the default "node" environment, the
 * same way InvestmentCalculatorModern.test.ts and LandingReadme.test.ts do it.
 * No DOM environment and no testing-library dependency is needed for the two
 * things pinned here: that every row carries a keyboard-reachable Edit
 * control, and that the category bar sizes itself with a real inline width.
 */

const items: BudgetItem[] = [
  { id: "1", name: "Rent", amount: 2000, category: "Housing" },
  { id: "2", name: "Groceries", amount: 500, category: "Food" },
  { id: "3", name: "Petrol", amount: 1000, category: "Transport" },
];

const markup = (list: BudgetItem[] = items) =>
  renderToStaticMarkup(
    createElement(BudgetPanel, { items: list, setItems: () => {} }),
  );

describe("BudgetPanel", () => {
  it("gives every row an Edit control a keyboard user can reach", () => {
    const html = markup();
    for (const item of items) {
      expect(html).toContain(`aria-label="Edit ${item.name}"`);
    }
  });

  it("gives every row a Remove control", () => {
    const html = markup();
    for (const item of items) {
      expect(html).toContain(`aria-label="Remove ${item.name}"`);
    }
  });

  it("sizes each category bar with an inline width, not a class", () => {
    // The share is computed per render, so it cannot live in a static class.
    // Housing is 2000 of 3500, i.e. 57.14%.
    const html = markup();
    const widths = [...html.matchAll(/style="width:([\d.]+)%"/g)].map((m) =>
      Number(m[1]),
    );
    expect(widths.length).toBeGreaterThan(0);
    expect(Math.max(...widths)).toBeCloseTo((2000 / 3500) * 100, 4);
  });

  it("renders no rows and no bars for an empty budget", () => {
    const html = markup([]);
    expect(html).not.toContain('aria-label="Edit ');
    expect(html).not.toMatch(/style="width:[\d.]+%"/);
  });
});
