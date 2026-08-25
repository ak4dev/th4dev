/* ==================================================
 * State Export/Import Tests
 *
 * Exercises the real export -> file -> import path:
 * JSON serialisation, the optional encrypted envelope,
 * the isValidTH4State guard and normalizeState.  A fully
 * populated state must come back byte-for-byte equal.
 * ================================================== */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_SLIDERS,
  DEFAULT_STATE,
  DEFAULT_TOGGLES,
  isValidTH4State,
  normalizeState,
} from "../state-manager";
import {
  encryptToEnvelope,
  decryptFromEnvelope,
  isEncryptedEnvelope,
} from "../crypto-manager";
import type { NormalizedState } from "../state-manager";

/** Every tool's values populated, all in range, so normalizeState is the identity */
const fullState: NormalizedState = {
  theme: "dracula",
  sliders: {
    ...DEFAULT_SLIDERS,
    projectedGainA: 8,
    projectedGainB: 12,
    yearsOfGrowthA: 25,
    yearsOfGrowthB: 15,
    monthlyContributionA: 500,
    monthlyContributionB: 300,
    monthlyWithdrawalA: 200,
    withdrawalStartYearA: 10,
    yearlyInflation: 3,
    targetValueA: 500000,
    annualFeeA: 0.5,
    annualFeeB: 0.25,
    volatilityA: 15,
    volatilityB: 10,
    withdrawalRateA: 3.5,
    withdrawalFloorA: 1500,
    withdrawalCeilingA: 6000,
    fireAnnualExpenses: 48000,
    fireSWR: 3.5,
    fireCurrentAge: 35,
    fireRetirementAge: 55,
  },
  inputs: { currentAmountA: "50000", currentAmountB: "25000" },
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
    dynamicWithdrawal: true,
    monteCarloMode: "individual",
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
  ],
  scenarios: [
    {
      id: "s1",
      name: "Conservative",
      createdAt: "2025-01-01T00:00:00.000Z",
      state: {
        ...DEFAULT_STATE,
        sliders: { ...DEFAULT_SLIDERS, projectedGainA: 6 },
        inputs: { currentAmountA: "30000", currentAmountB: "0" },
        toggles: { ...DEFAULT_TOGGLES, showInflation: true },
      },
    },
  ],
  activePage: "f",
};

/** Mirrors what a file import sees: parsed JSON of unknown shape */
const parseFile = (contents: string): unknown => JSON.parse(contents);

/** Copy of `obj` without the given keys */
const without = (obj: object, ...keys: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

describe("state export/import round trip", () => {
  it("plain export passes the guard and normalises back to the same state", () => {
    const parsed = parseFile(JSON.stringify(fullState));
    expect(isEncryptedEnvelope(parsed)).toBe(false);
    expect(isValidTH4State(parsed)).toBe(true);
    if (!isValidTH4State(parsed)) return;
    expect(normalizeState(parsed)).toEqual(fullState);
  });

  it("encrypted export is unreadable as state and round-trips through the envelope", async () => {
    const envelope = await encryptToEnvelope(JSON.stringify(fullState), "pw");
    const parsedEnvelope = parseFile(JSON.stringify(envelope));
    expect(isValidTH4State(parsedEnvelope)).toBe(false);
    expect(isEncryptedEnvelope(parsedEnvelope)).toBe(true);
    if (!isEncryptedEnvelope(parsedEnvelope)) return;

    const parsed = parseFile(await decryptFromEnvelope(parsedEnvelope, "pw"));
    expect(isValidTH4State(parsed)).toBe(true);
    if (!isValidTH4State(parsed)) return;
    expect(normalizeState(parsed)).toEqual(fullState);
  });

  it("an export from an older build imports with the new fields defaulted", () => {
    const { toggles, sliders } = fullState;
    const parsed = parseFile(
      JSON.stringify({
        ...fullState,
        toggles: without(toggles, "dynamicWithdrawal", "monteCarloMode"),
        sliders: without(
          sliders,
          "withdrawalRateA",
          "withdrawalFloorA",
          "withdrawalCeilingA",
        ),
      }),
    );
    expect(isValidTH4State(parsed)).toBe(true);
    if (!isValidTH4State(parsed)) return;
    expect(normalizeState(parsed)).toEqual({
      ...fullState,
      toggles: {
        ...toggles,
        dynamicWithdrawal: false,
        monteCarloMode: "combined",
      },
      sliders: {
        ...sliders,
        withdrawalRateA: DEFAULT_SLIDERS.withdrawalRateA,
        withdrawalFloorA: DEFAULT_SLIDERS.withdrawalFloorA,
        withdrawalCeilingA: DEFAULT_SLIDERS.withdrawalCeilingA,
      },
    });
  });
});
