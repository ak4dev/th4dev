import { describe, it, expect } from "vitest";
import { scenarioLoadedState } from "../state-load";
import {
  DEFAULT_STATE,
  DEFAULT_TOGGLES,
  normalizeState,
} from "../state-manager";
import type { NormalizedState } from "../state-manager";
import type { ScenarioSnapshot } from "../scenario-manager";
import type { TH4State } from "../../types/types";

/**
 * The regression this file exists for: loading a scenario must not run the
 * whole-session replace path.
 *
 * A snapshot carries no scenario list, no page and no stock endpoint, so
 * normalizeState answers with an empty list, the default page and the default
 * endpoint. Applying those would delete every scenario the user has saved at
 * the very moment they opened one of them - and nothing in the rendered
 * suites can see it happen.
 */
const snapshot: TH4State = {
  theme: "dracula",
  sliders: { projectedGainA: 9, yearsOfGrowthA: 15 },
  inputs: { currentAmountA: "123456" },
  toggles: { ...DEFAULT_TOGGLES, advanced: true, fees: true },
  stock: { holdings: [{ symbol: "VTI", allocationPct: 100 }] },
  budgetItems: [{ id: "1", name: "Rent", amount: 1500, category: "Housing" }],
};

const saved: ScenarioSnapshot[] = [
  {
    id: "s1",
    name: "Retire at 55",
    createdAt: "2026-01-01T00:00:00.000Z",
    state: DEFAULT_STATE,
  },
];

const session: NormalizedState = {
  ...DEFAULT_STATE,
  theme: "gruvbox",
  stock: { apiUrl: "https://example.test/{symbol}?key=MINE", holdings: [] },
  scenarios: saved,
  activePage: "budget",
};

describe("scenarioLoadedState", () => {
  it("keeps the scenario list the snapshot was opened from", () => {
    const next = scenarioLoadedState(snapshot, session);
    // The same array, not a copy and emphatically not an empty one
    expect(next.scenarios).toBe(saved);
    expect(normalizeState(snapshot).scenarios).toEqual([]);
  });

  it("keeps the page the user is on", () => {
    // Loading a plan is not navigation
    expect(scenarioLoadedState(snapshot, session).activePage).toBe("budget");
    expect(normalizeState(snapshot).activePage).toBe(DEFAULT_STATE.activePage);
  });

  it("keeps the stock endpoint the session is configured with", () => {
    // The snapshot deliberately does not carry it, so reading it back off a
    // normalized snapshot would replace the user's own key with the default
    expect(scenarioLoadedState(snapshot, session).stock.apiUrl).toBe(
      session.stock.apiUrl,
    );
  });

  it("applies everything the snapshot does carry", () => {
    const next = scenarioLoadedState(snapshot, session);
    const loaded = normalizeState(snapshot);
    expect(next.theme).toBe("dracula");
    expect(next.sliders).toEqual(loaded.sliders);
    expect(next.inputs).toEqual(loaded.inputs);
    expect(next.toggles).toEqual(loaded.toggles);
    expect(next.stock.holdings).toEqual(loaded.stock.holdings);
    expect(next.budgetItems).toEqual(loaded.budgetItems);
  });

  it("differs from a whole-session replace in exactly three fields", () => {
    const next = scenarioLoadedState(snapshot, session);
    const replaced = normalizeState(snapshot);
    const differing = (Object.keys(next) as (keyof NormalizedState)[]).filter(
      (key) => JSON.stringify(next[key]) !== JSON.stringify(replaced[key]),
    );
    // stock differs by its apiUrl alone; its holdings come from the snapshot
    expect(differing.sort()).toEqual(["activePage", "scenarios", "stock"]);
  });

  it("normalizes the snapshot rather than trusting it", () => {
    const hostile = scenarioLoadedState(
      {
        ...snapshot,
        theme: "not-a-theme",
        sliders: { projectedGainA: 9999, notASlider: 1 },
      },
      session,
    );
    expect(hostile.theme).toBe(DEFAULT_STATE.theme);
    expect(hostile.sliders).not.toHaveProperty("notASlider");
    expect(hostile.sliders.projectedGainA).toBeLessThan(9999);
  });
});
