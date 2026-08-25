import { describe, it, expect } from "vitest";
import {
  calculateFireNumber,
  realReturn,
  yearsToFire,
  coastFireNumber,
  monthlySavingsNeeded,
  calculateFire,
  type FireInputs,
} from "../fire-calculator";

describe("calculateFireNumber", () => {
  it("$40k expenses at 4% SWR = $1,000,000", () => {
    expect(calculateFireNumber(40000, 4)).toBe(1000000);
  });

  it("$60k expenses at 3% SWR = $2,000,000", () => {
    expect(calculateFireNumber(60000, 3)).toBe(2000000);
  });

  it("$0 expenses = $0 FIRE number", () => {
    expect(calculateFireNumber(0, 4)).toBe(0);
  });

  it("0% SWR returns Infinity", () => {
    expect(calculateFireNumber(40000, 0)).toBe(Infinity);
  });

  it("negative SWR returns Infinity", () => {
    expect(calculateFireNumber(40000, -5)).toBe(Infinity);
  });

  it("negative expenses returns negative FIRE number", () => {
    expect(calculateFireNumber(-40000, 4)).toBe(-1000000);
  });
});

describe("realReturn", () => {
  it("equals the nominal return when inflation is 0", () => {
    expect(realReturn(8, 0)).toBeCloseTo(8, 10);
  });

  it("uses the Fisher relation, not simple subtraction", () => {
    // (1.08 / 1.025) - 1 = 5.366%
    expect(realReturn(8, 2.5)).toBeCloseTo(5.366, 3);
    expect(realReturn(8, 2.5)).toBeLessThan(8 - 2.5);
  });

  it("is negative when inflation exceeds the return", () => {
    expect(realReturn(2, 5)).toBeLessThan(0);
  });
});

describe("yearsToFire", () => {
  it("already at target returns 0", () => {
    expect(yearsToFire(1000000, 500, 10, 1000000)).toBe(0);
  });

  it("above target returns 0", () => {
    expect(yearsToFire(2000000, 0, 10, 1000000)).toBe(0);
  });

  it("reasonable scenario returns expected range", () => {
    // $100k savings, $2k/mo contribution, 10% return, $1M target
    const years = yearsToFire(100000, 2000, 10, 1000000);
    expect(years).not.toBeNull();
    expect(years!).toBeGreaterThan(5);
    expect(years!).toBeLessThan(30);
  });

  it("$0 savings $500/mo at 10% to $1M takes ~28-30 years", () => {
    const years = yearsToFire(0, 500, 10, 1000000);
    expect(years).not.toBeNull();
    expect(years!).toBeGreaterThanOrEqual(27);
    expect(years!).toBeLessThanOrEqual(31);
  });

  it("returns null for unreachable target with no contributions/growth", () => {
    expect(yearsToFire(100, 0, 0, 1000000)).toBeNull();
  });
});

describe("coastFireNumber", () => {
  it("0 years until retirement = full FIRE number", () => {
    expect(coastFireNumber(1000000, 10, 0)).toBe(1000000);
  });

  it("35 years of growth significantly reduces required amount", () => {
    const coast = coastFireNumber(1000000, 7, 35);
    expect(coast).toBeGreaterThan(50000);
    expect(coast).toBeLessThan(200000);
  });

  it("higher return = lower coast number", () => {
    const low = coastFireNumber(1000000, 5, 30);
    const high = coastFireNumber(1000000, 10, 30);
    expect(high).toBeLessThan(low);
  });
});

describe("monthlySavingsNeeded", () => {
  it("returns null when already at target", () => {
    expect(monthlySavingsNeeded(1000000, 10, 1000000, 30)).toBeNull();
  });

  it("returns null when years is 0", () => {
    expect(monthlySavingsNeeded(0, 10, 1000000, 0)).toBeNull();
  });

  it("returns positive for reasonable scenario", () => {
    const needed = monthlySavingsNeeded(50000, 8, 1000000, 25);
    expect(needed).not.toBeNull();
    expect(needed!).toBeGreaterThan(0);
    expect(needed!).toBeLessThan(5000);
  });

  it("handles 0% return correctly", () => {
    // Pure saving: ($1M - $100k) / (10 * 12) = $7500/mo
    const needed = monthlySavingsNeeded(100000, 0, 1000000, 10);
    expect(needed).toBe(7500);
  });

  it("returns 0 when growth alone covers the gap", () => {
    // $500k at 10% over 30 years grows well past $1M
    const needed = monthlySavingsNeeded(500000, 10, 1000000, 30);
    expect(needed).toBe(0);
  });

  it("returns null when target is Infinity", () => {
    expect(monthlySavingsNeeded(100000, 8, Infinity, 30)).toBeNull();
  });
});

describe("calculateFire (combined)", () => {
  const baseInputs: FireInputs = {
    currentSavings: 250000,
    monthlySavings: 2000,
    annualReturn: 8,
    inflationRate: 2.5,
    annualExpenses: 40000,
    safeWithdrawalRate: 4,
    currentAge: 30,
    targetRetirementAge: 65,
  };

  it("computes all fields without error", () => {
    const result = calculateFire(baseInputs);
    expect(result.fireNumber).toBe(1000000);
    expect(result.progressPct).toBe(25);
    expect(result.yearsToFire).not.toBeNull();
    expect(result.fireAge).not.toBeNull();
    expect(result.coastFireNumber).toBeGreaterThan(0);
    expect(typeof result.isCoastFire).toBe("boolean");
  });

  it("already at FIRE shows 100% progress and 0 years", () => {
    const result = calculateFire({
      ...baseInputs,
      currentSavings: 1500000,
    });
    expect(result.progressPct).toBe(100);
    expect(result.yearsToFire).toBe(0);
    expect(result.fireAge).toBe(30);
    expect(result.monthlySavingsNeeded).toBeNull();
  });

  it("exactly at the FIRE number reports 100%", () => {
    const result = calculateFire({ ...baseInputs, currentSavings: 1000000 });
    expect(result.progressPct).toBe(100);
    expect(result.yearsToFire).toBe(0);
  });

  it("just below the FIRE number does not round up to 100%", () => {
    // 99.6% of the target: still one year away, still needs contributions
    const result = calculateFire({
      ...baseInputs,
      currentSavings: 996000,
      currentAge: 55,
      targetRetirementAge: 55,
    });
    expect(result.progressPct).toBe(99);
    expect(result.yearsToFire).toBe(1);
    expect(result.isShortfall).toBe(true);
  });

  it("just below the FIRE number keeps monthlySavingsNeeded non-null", () => {
    const result = calculateFire({ ...baseInputs, currentSavings: 996000 });
    expect(result.progressPct).toBe(99);
    expect(result.monthlySavingsNeeded).not.toBeNull();
  });

  it("coast FIRE flag is set correctly", () => {
    // $250k at age 30, retire at 65, 8% return
    // Coast number should be well below $250k
    const result = calculateFire(baseInputs);
    expect(result.isCoastFire).toBe(true);
    expect(result.coastFireNumber).toBeLessThan(250000);
  });

  it("isShortfall when retireAge equals currentAge and underfunded", () => {
    const result = calculateFire({
      ...baseInputs,
      currentSavings: 200000,
      currentAge: 55,
      targetRetirementAge: 55,
    });
    expect(result.isShortfall).toBe(true);
    expect(result.progressPct).toBeLessThan(100);
  });

  it("isShortfall is false when at FIRE even if retiring now", () => {
    const result = calculateFire({
      ...baseInputs,
      currentSavings: 1500000,
      currentAge: 55,
      targetRetirementAge: 55,
    });
    expect(result.isShortfall).toBe(false);
    expect(result.progressPct).toBe(100);
  });

  it("isShortfall is false when retirement is in the future", () => {
    const result = calculateFire(baseInputs);
    expect(result.isShortfall).toBe(false);
  });

  it("handles Infinity fireNumber when SWR is 0", () => {
    const result = calculateFire({
      ...baseInputs,
      safeWithdrawalRate: 0,
    });
    expect(result.fireNumber).toBe(Infinity);
    expect(result.progressPct).toBe(0);
    expect(result.monthlySavingsNeeded).toBeNull();
  });

  describe("inflation (today's-dollar FIRE number, real-return growth)", () => {
    const inputs: FireInputs = { ...baseInputs, currentSavings: 100000 };

    it("with 0% inflation the metrics compound at the nominal return", () => {
      const result = calculateFire({ ...inputs, inflationRate: 0 });
      expect(result.coastFireNumber).toBe(coastFireNumber(1000000, 8, 35));
      expect(result.coastFireNumber).toBe(61378);
      expect(result.isCoastFire).toBe(true);
    });

    it("higher inflation raises the coast number and can clear the coast flag", () => {
      const nominal = calculateFire({ ...inputs, inflationRate: 0 });
      const real = calculateFire({ ...inputs, inflationRate: 2.5 });
      expect(real.coastFireNumber).toBe(153530);
      expect(real.coastFireNumber).toBeGreaterThan(nominal.coastFireNumber);
      expect(real.isCoastFire).toBe(false);
    });

    it("higher inflation lengthens years to FIRE and raises monthly savings needed", () => {
      const nominal = calculateFire({ ...inputs, inflationRate: 0 });
      const real = calculateFire({ ...inputs, inflationRate: 2.5 });
      expect(real.yearsToFire!).toBeGreaterThan(nominal.yearsToFire!);
      expect(real.monthlySavingsNeeded!).toBeGreaterThan(
        nominal.monthlySavingsNeeded!,
      );
    });

    it("inflation does not change the FIRE number or progress", () => {
      const nominal = calculateFire({ ...inputs, inflationRate: 0 });
      const real = calculateFire({ ...inputs, inflationRate: 2.5 });
      expect(real.fireNumber).toBe(nominal.fireNumber);
      expect(real.progressPct).toBe(nominal.progressPct);
    });
  });
});
