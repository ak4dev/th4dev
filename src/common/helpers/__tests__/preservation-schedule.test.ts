import { describe, it, expect } from "vitest";
import { addYears } from "date-fns";
import {
  buildScheduleMatrix,
  withdrawalRowIndex,
} from "../preservation-schedule";
import type { LineGraphEntry } from "../../types/types";

const today = new Date(2026, 0, 15);

/** Mimics getGrowthMatrix(): entry i is dated today + (i + 1) years. */
const yearly = (n: number): LineGraphEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    x: addYears(today, i + 1),
    y: 1000 * (i + 2),
    alternateY: 900 * (i + 2),
  }));

describe("buildScheduleMatrix", () => {
  it("prepends a today row so that yearly index == years elapsed", () => {
    const m = buildScheduleMatrix(yearly(3), 1000, "yearly", today);
    expect(m).toHaveLength(4);
    expect(m[0]).toEqual({ x: today, y: 1000, alternateY: 1000 });
    expect(m[2]).toEqual({ x: addYears(today, 2), y: 3000, alternateY: 2700 });
  });

  it("places monthly index 12 * k on today + k years", () => {
    const m = buildScheduleMatrix(yearly(3), 1000, "monthly", today);
    expect(m).toHaveLength(37);
    expect(m[0]).toEqual({ x: today, y: 1000, alternateY: 1000 });
    expect(m[12].x).toEqual(addYears(today, 1));
    expect(m[12].y).toBe(2000);
    expect(m[24].x).toEqual(addYears(today, 2));
    expect(m[36]).toEqual(yearly(3)[2]);
  });

  it("does not mutate the calculator matrix", () => {
    const source = yearly(2);
    buildScheduleMatrix(source, 1000, "monthly", today);
    expect(source).toEqual(yearly(2));
  });
});

describe("withdrawalRowIndex", () => {
  it("maps a start year to the matching yearly or monthly row", () => {
    expect(withdrawalRowIndex(5, "yearly", 11)).toBe(5);
    expect(withdrawalRowIndex(5, "monthly", 121)).toBe(60);
    expect(withdrawalRowIndex(10.5, "monthly", 127)).toBe(126);
    expect(withdrawalRowIndex(10.5, "yearly", 12)).toBe(11);
  });

  it("returns -1 when withdrawals never start", () => {
    expect(withdrawalRowIndex(0, "yearly", 11)).toBe(-1);
    expect(withdrawalRowIndex(undefined, "monthly", 121)).toBe(-1);
  });

  it("clamps to the last row", () => {
    expect(withdrawalRowIndex(50, "yearly", 11)).toBe(10);
  });
});
