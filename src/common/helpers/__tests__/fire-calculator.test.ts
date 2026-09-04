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
import { InvestmentCalculator } from "../investment-growth-calculator";
import type { InvestmentCalculatorProps } from "../../types/types";

/**
 * Closed form of the yearsToFire loop. Contributions are credited at the START
 * of the month (annuity-due), so after n months the balance is
 *   PV(1 + r)^n + C(1 + r)((1 + r)^n - 1) / r
 * and the (fractional) month at which it first reaches FV is
 *   n = ln((FV + k) / (PV + k)) / ln(1 + r),  k = C(1 + r) / r
 * The tests below assert the implementation against this rather than against
 * re-baselined magic numbers.
 */
const monthsToTarget = (
  pv: number,
  monthly: number,
  annualPct: number,
  fv: number,
): number => {
  const r = annualPct / 100 / 12;
  const k = (monthly * (1 + r)) / r;
  return Math.log((fv + k) / (pv + k)) / Math.log(1 + r);
};

/** Same closed form solved for PMT: an annuity-DUE payment. */
const pmtForTarget = (
  pv: number,
  annualPct: number,
  fv: number,
  years: number,
): number => {
  const r = annualPct / 100 / 12;
  const n = years * 12;
  return (
    (fv - pv * Math.pow(1 + r, n)) / (((Math.pow(1 + r, n) - 1) / r) * (1 + r))
  );
};

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

  it("$100k + $2k/mo at 10% to $1M takes exactly 13 years", () => {
    // Annuity-due closed form: 155.404 months -> month 156 -> ceil(156/12) = 13
    expect(monthsToTarget(100000, 2000, 10, 1000000)).toBeCloseTo(155.404, 3);
    expect(yearsToFire(100000, 2000, 10, 1000000)).toBe(13);
  });

  it("$0 savings + $500/mo at 10% to $1M takes exactly 29 years", () => {
    // Annuity-due with PV = 0: n = ln(1 + FV*r / (C(1 + r))) / ln(1 + r)
    // = 345.092 months -> month 346 -> ceil(346/12) = 29
    expect(monthsToTarget(0, 500, 10, 1000000)).toBeCloseTo(345.092, 3);
    expect(yearsToFire(0, 500, 10, 1000000)).toBe(29);
  });

  it("credits contributions at the start of the month, not the end", () => {
    // $100/mo at 12% for 12 months: 1280.93 start-of-month (annuity-due) vs
    // 1268.25 end-of-month. A target between the two separates the conventions.
    expect(yearsToFire(0, 100, 12, 1280)).toBe(1);
    expect(yearsToFire(0, 100, 12, 1281)).toBe(2);
  });

  it("returns null for unreachable target with no contributions/growth", () => {
    expect(yearsToFire(100, 0, 0, 1000000)).toBeNull();
  });
});

describe("coastFireNumber", () => {
  it("0 years until retirement = full FIRE number", () => {
    expect(coastFireNumber(1000000, 10, 0)).toBe(1000000);
  });

  it("35 years at 7% discounts $1M to exactly $86,910", () => {
    expect(coastFireNumber(1000000, 7, 35)).toBe(86910);
  });

  it("compounds back up to the FIRE number it was discounted from", () => {
    // The inverse check, rather than a restatement of the formula: leaving the
    // coast number alone for 35 years at 7% must land on $1M.
    const coast = coastFireNumber(1000000, 7, 35);
    const compounded = coast * Math.pow(1 + 0.07 / 12, 420);
    expect(compounded).toBeCloseTo(1000000, -1);
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

  it("$50k at 8% to $1M in 25 years needs exactly $662/mo", () => {
    // PMT = (FV - PV(1 + r)^n) / (((1 + r)^n - 1)/r * (1 + r)), r = 0.08/12,
    // n = 300 -> 661.18 -> ceil = 662 (annuity-DUE, contributions grow in month)
    expect(pmtForTarget(50000, 8, 1000000, 25)).toBeCloseTo(661.18, 2);
    expect(monthlySavingsNeeded(50000, 8, 1000000, 25)).toBe(662);
  });

  it("is the exact inverse of yearsToFire at the same rate", () => {
    // $662/mo lands inside year 25; one dollar less slips into year 26
    expect(yearsToFire(50000, 662, 8, 1000000)).toBe(25);
    expect(yearsToFire(50000, 661, 8, 1000000)).toBe(26);
  });

  it("needs more than pure saving when the real return is negative", () => {
    const rate = realReturn(2, 5); // -2.857%
    const pureSavings = Math.ceil((1000000 - 100000) / (35 * 12));
    const needed = monthlySavingsNeeded(100000, rate, 1000000, 35);
    expect(needed).toBe(3635);
    expect(needed!).toBeGreaterThan(pureSavings);
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

    it("a negative real return pushes coast above the FIRE number", () => {
      // 2% nominal against 5% inflation: realReturn = -2.857%, so growth alone
      // shrinks the pot and the coast number has to exceed the target
      const result = calculateFire({
        ...inputs,
        annualReturn: 2,
        inflationRate: 5,
      });
      expect(result.coastFireNumber).toBe(2721525);
      expect(result.coastFireNumber).toBeGreaterThan(result.fireNumber);
      expect(result.isCoastFire).toBe(false);
    });

    it("a negative real return can make FIRE unreachable", () => {
      // $2k/mo at -2.857% asymptotes near $838k, below the $1M target
      const result = calculateFire({
        ...inputs,
        annualReturn: 2,
        inflationRate: 5,
      });
      expect(result.yearsToFire).toBeNull();
      expect(result.fireAge).toBeNull();
      expect(result.monthlySavingsNeeded).toBe(3635);
    });
  });
});

/* ==================================================
 * Cross-engine parity
 *
 * FIRE and InvestmentCalculator are fed the same contribution slider, so with
 * inflation, fees and withdrawals switched off they must agree month for month
 * (see the timing convention in fire-calculator.ts). This fails loudly if
 * either engine drifts back to crediting contributions at the end of the month.
 * ================================================== */

describe("parity with InvestmentCalculator", () => {
  const engineProps = (
    overrides: Partial<InvestmentCalculatorProps>,
  ): InvestmentCalculatorProps => ({
    initialAmount: 10000,
    projectedGain: 7,
    yearsOfGrowth: 10,
    monthlyContribution: 500,
    monthlyWithdrawal: 0,
    withdrawalStartYear: 0,
    inflationPct: 0,
    ...overrides,
  });

  /** Nominal end-of-year balances, index 0 = end of year 1 (no "today" row). */
  const nominalYearEnds = (
    overrides: Partial<InvestmentCalculatorProps>,
  ): number[] => {
    const calc = new InvestmentCalculator(engineProps(overrides));
    calc.calculateGrowth();
    return calc.getGrowthMatrix().map((entry) => entry.nominal);
  };

  const cases: {
    label: string;
    initial: number;
    monthly: number;
    gain: number;
    years: number;
  }[] = [
    {
      label: "$10k + $500/mo at 7%",
      initial: 10000,
      monthly: 500,
      gain: 7,
      years: 10,
    },
    {
      label: "$0 + $1k/mo at 6%",
      initial: 0,
      monthly: 1000,
      gain: 6,
      years: 15,
    },
    {
      label: "$100k + $2k/mo at 10%",
      initial: 100000,
      monthly: 2000,
      gain: 10,
      years: 13,
    },
  ];

  cases.forEach(({ label, initial, monthly, gain, years }) => {
    it(`${label}: yearsToFire hits each engine year-end in that same year`, () => {
      const yearEnds = nominalYearEnds({
        initialAmount: initial,
        projectedGain: gain,
        yearsOfGrowth: years,
        monthlyContribution: monthly,
      });
      expect(yearEnds).toHaveLength(years);
      // Targeting the engine's balance at the end of year k must resolve to
      // exactly k years; an off-by-one-month convention shifts every row.
      expect(
        yearEnds.map((target) => yearsToFire(initial, monthly, gain, target)),
      ).toEqual(yearEnds.map((_, index) => index + 1));
    });
  });

  it("monthlySavingsNeeded funds the engine to the target", () => {
    const needed = monthlySavingsNeeded(50000, 8, 1000000, 25)!;
    const [finalYear] = nominalYearEnds({
      initialAmount: 50000,
      projectedGain: 8,
      yearsOfGrowth: 25,
      monthlyContribution: needed,
    }).slice(-1);
    expect(finalYear).toBeGreaterThanOrEqual(1000000);
    // and one dollar per month less would not have got there
    const [shortYear] = nominalYearEnds({
      initialAmount: 50000,
      projectedGain: 8,
      yearsOfGrowth: 25,
      monthlyContribution: needed - 1,
    }).slice(-1);
    expect(shortYear).toBeLessThan(1000000);
  });
});
