/* ==================================================
 * Scenario Manager
 *
 * CRUD operations for named scenario snapshots stored
 * in localStorage.  Each snapshot captures the full
 * TH4State at a point in time.
 * ================================================== */

import type { TH4State } from "../types/types";

/* ---------- Types ---------- */

export interface ScenarioSnapshot {
  id: string;
  name: string;
  createdAt: string;
  state: TH4State;
}

export interface ScenariosStore {
  scenarios: ScenarioSnapshot[];
}

/* ---------- Constants ---------- */

const STORAGE_KEY = "th4_scenarios";
const MAX_SCENARIOS = 20;

/* ---------- Persistence ---------- */

export function loadScenarios(): ScenarioSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScenariosStore;
    return Array.isArray(parsed.scenarios) ? parsed.scenarios : [];
  } catch {
    return [];
  }
}

function persistScenarios(scenarios: ScenarioSnapshot[]): void {
  const store: ScenariosStore = { scenarios };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/* ---------- CRUD ---------- */

export function saveScenario(
  name: string,
  state: TH4State,
  existing?: ScenarioSnapshot[],
): ScenarioSnapshot[] {
  const scenarios = existing ?? loadScenarios();

  if (scenarios.length >= MAX_SCENARIOS) {
    throw new Error(`Maximum of ${MAX_SCENARIOS} scenarios reached.`);
  }

  const id = `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const snapshot: ScenarioSnapshot = {
    id,
    name,
    createdAt: new Date().toISOString(),
    state: structuredClone(state),
  };

  const updated = [...scenarios, snapshot];
  persistScenarios(updated);
  return updated;
}

export function deleteScenario(
  id: string,
  existing?: ScenarioSnapshot[],
): ScenarioSnapshot[] {
  const scenarios = existing ?? loadScenarios();
  const updated = scenarios.filter((s) => s.id !== id);
  persistScenarios(updated);
  return updated;
}

export function renameScenario(
  id: string,
  newName: string,
  existing?: ScenarioSnapshot[],
): ScenarioSnapshot[] {
  const scenarios = existing ?? loadScenarios();
  const updated = scenarios.map((s) =>
    s.id === id ? { ...s, name: newName } : s,
  );
  persistScenarios(updated);
  return updated;
}

/**
 * Computes the final Investment A value for a snapshot so it can
 * be previewed in the scenario list without loading the full state.
 */
export function getSnapshotPreview(snapshot: ScenarioSnapshot): {
  investmentA: string;
  returnPct: number;
  years: number;
} {
  const s = snapshot.state.sliders;
  return {
    investmentA: snapshot.state.inputs?.currentAmountA ?? "0",
    returnPct: s?.projectedGainA ?? 10,
    years: s?.yearsOfGrowthA ?? 30,
  };
}

export { MAX_SCENARIOS };
