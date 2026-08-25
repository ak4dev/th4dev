import { describe, it, expect } from "vitest";
import {
  saveScenario,
  deleteScenario,
  renameScenario,
  getSnapshotPreview,
  MAX_SCENARIOS,
  type ScenarioSnapshot,
} from "../scenario-manager";
import { DEFAULT_TOGGLES } from "../state-manager";
import type { TH4State } from "../../types/types";

/* ---------- Helpers ---------- */

function makeMockState(overrides?: Partial<TH4State>): TH4State {
  return {
    theme: "nord",
    sliders: { projectedGainA: 10, yearsOfGrowthA: 30 },
    inputs: { currentAmountA: "100000" },
    toggles: DEFAULT_TOGGLES,
    ...overrides,
  };
}

/* ---------- Tests ---------- */

describe("saveScenario", () => {
  it("saves a new scenario to empty array", () => {
    const state = makeMockState();
    const result = saveScenario("My Scenario", state, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("My Scenario");
    expect(result[0].state.inputs?.currentAmountA).toBe("100000");
  });

  it("appends to existing scenarios", () => {
    const state = makeMockState();
    const first = saveScenario("First", state, []);
    const result = saveScenario("Second", state, first);
    expect(result).toHaveLength(2);
    expect(result[1].name).toBe("Second");
  });

  it("throws when max scenarios reached", () => {
    const state = makeMockState();
    const existing: ScenarioSnapshot[] = Array.from(
      { length: MAX_SCENARIOS },
      (_, i) => ({
        id: `s${i}`,
        name: `Scenario ${i}`,
        createdAt: new Date().toISOString(),
        state: makeMockState(),
      }),
    );
    expect(() => saveScenario("One too many", state, existing)).toThrow(
      /Maximum/,
    );
  });

  it("deep clones state so mutations do not propagate", () => {
    const state = makeMockState();
    const result = saveScenario("Clone test", state, []);
    state.sliders.projectedGainA = 99;
    expect(result[0].state.sliders.projectedGainA).toBe(10);
  });
});

describe("deleteScenario", () => {
  it("removes a scenario by id", () => {
    const state = makeMockState();
    const saved = saveScenario("ToDelete", state, []);
    const id = saved[0].id;
    const result = deleteScenario(id, saved);
    expect(result).toHaveLength(0);
  });

  it("does nothing if id not found", () => {
    const state = makeMockState();
    const saved = saveScenario("Keep", state, []);
    const result = deleteScenario("nonexistent", saved);
    expect(result).toHaveLength(1);
  });
});

describe("renameScenario", () => {
  it("renames an existing scenario", () => {
    const state = makeMockState();
    const saved = saveScenario("OldName", state, []);
    const id = saved[0].id;
    const result = renameScenario(id, "NewName", saved);
    expect(result[0].name).toBe("NewName");
    expect(result[0].id).toBe(id);
  });

  it("leaves other scenarios unchanged", () => {
    const state = makeMockState();
    const first = saveScenario("First", state, []);
    const both = saveScenario("Second", state, first);
    const result = renameScenario(both[1].id, "Renamed", both);
    expect(result[0].name).toBe("First");
    expect(result[1].name).toBe("Renamed");
  });
});

describe("getSnapshotPreview", () => {
  it("extracts preview data from snapshot", () => {
    const snap: ScenarioSnapshot = {
      id: "s1",
      name: "Preview",
      createdAt: "2024-01-01T00:00:00.000Z",
      state: makeMockState(),
    };
    const preview = getSnapshotPreview(snap);
    expect(preview.investmentA).toBe("100000");
    expect(preview.returnPct).toBe(10);
    expect(preview.years).toBe(30);
  });

  it("returns defaults for missing values", () => {
    const snap: ScenarioSnapshot = {
      id: "s1",
      name: "Empty",
      createdAt: "2024-01-01T00:00:00.000Z",
      state: { sliders: {}, inputs: {}, toggles: {} } as unknown as TH4State,
    };
    const preview = getSnapshotPreview(snap);
    expect(preview.investmentA).toBe("0");
    expect(preview.returnPct).toBe(10);
    expect(preview.years).toBe(30);
  });
});
