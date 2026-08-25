import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { InvestmentCalculator } from "../investment-growth-calculator";
import type { InvestmentCalculatorProps } from "../../types/types";
import { MAX_PROJECTED_GAIN } from "../../constants/app-constants";

// ── helpers ──────────────────────────────────────────────────────────────────

const makeProps = (
  overrides: Partial<InvestmentCalculatorProps> = {},
): InvestmentCalculatorProps => ({
  currentAmount: "10000",
  projectedGain: 10,
  yearsOfGrowth: 1,
  monthlyContribution: 0,
  monthlyWithdrawal: 0,
  yearWithdrawalsBegin: 0,
  maxMonthlyWithdrawal: 10000,
  depreciationRate: 0,
  ...overrides,
});

const repeat = (value: number, n: number) => Array<number>(n).fill(value);

const numeric = (
  overrides: Partial<InvestmentCalculatorProps>,
  showInflation = false,
) =>
  new InvestmentCalculator(makeProps(overrides)).calculateGrowth(showInflation)
    .numeric;

// Freeze time to 1 Jan 2026 (month=0) so year-0 always processes all 12 months.
// Without this, exact results vary depending on when the test runs.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 15)); // Jan 15 local time → month = 0
});

afterAll(() => {
  vi.useRealTimers();
});

// ── invalid input ─────────────────────────────────────────────────────────────

describe("invalid input", () => {
  it("returns 0 for undefined currentAmount", () => {
    expect(numeric({ currentAmount: undefined })).toBe(0);
  });

  it("returns 0 for empty currentAmount string", () => {
    expect(numeric({ currentAmount: "" })).toBe(0);
  });

  it("returns 0 for non-numeric currentAmount", () => {
    expect(numeric({ currentAmount: "abc" })).toBe(0);
  });

  it("returns 0 for negative currentAmount", () => {
    expect(numeric({ currentAmount: "-500" })).toBe(0);
  });

  it("returns 0 when projectedGain exceeds MAX", () => {
    expect(numeric({ projectedGain: MAX_PROJECTED_GAIN + 1 })).toBe(0);
  });
});

// ── basic growth ──────────────────────────────────────────────────────────────

describe("basic growth", () => {
  it("0% gain preserves the initial amount", () => {
    expect(numeric({ projectedGain: 0, yearsOfGrowth: 1 })).toBe(10000);
  });

  it("positive gain grows above initial amount", () => {
    expect(numeric({ projectedGain: 10, yearsOfGrowth: 1 })).toBeGreaterThan(
      10000,
    );
  });

  // Exact check: $10 000, 12 % annual (1 % / month) → (1.01)^12 months
  // = 10 000 × 1.12682… → floor = 11 268
  it("exact compound result: 10000 × (1.01)^12 at 12% for 1 year", () => {
    expect(numeric({ projectedGain: 12, yearsOfGrowth: 1 })).toBe(11268);
  });

  it("more years produce a higher value", () => {
    const calc = (y: number) =>
      numeric({ projectedGain: 12, yearsOfGrowth: y });
    expect(calc(1)).toBeLessThan(calc(2));
    expect(calc(2)).toBeLessThan(calc(5));
  });

  it("formatted result includes dollar sign and commas", () => {
    const c = new InvestmentCalculator(makeProps({ yearsOfGrowth: 10 }));
    expect(c.calculateGrowth(false).formatted).toMatch(/^\$\d{1,3}(,\d{3})+$/);
  });
});

// ── growth matrix ─────────────────────────────────────────────────────────────

describe("getGrowthMatrix", () => {
  it("has yearsOfGrowth entries after calculateGrowth (one per full year)", () => {
    for (const y of [0, 1, 5, 10]) {
      const c = new InvestmentCalculator(
        makeProps({ yearsOfGrowth: y, projectedGain: 0 }),
      );
      c.calculateGrowth(false);
      expect(c.getGrowthMatrix()).toHaveLength(y);
    }
  });

  it("year-0 entry matches the initial amount when gain is 0%", () => {
    // With 0% gain the balance never changes across the first full year.
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: 0, yearsOfGrowth: 1 }),
    );
    c.calculateGrowth(false);
    expect(c.getGrowthMatrix()[0].y).toBe(10000);
  });

  it("entries are dated whole years after today", () => {
    const c = new InvestmentCalculator(makeProps({ yearsOfGrowth: 3 }));
    c.calculateGrowth(false);
    expect(c.getGrowthMatrix().map((e) => e.x)).toEqual([
      new Date(2027, 0, 15),
      new Date(2028, 0, 15),
      new Date(2029, 0, 15),
    ]);
  });

  it("matrix values are monotonically increasing with positive gain", () => {
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: 10, yearsOfGrowth: 5 }),
    );
    c.calculateGrowth(false);
    const ys = c.getGrowthMatrix().map((e) => e.y);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    }
  });

  it("is empty before calculateGrowth is called", () => {
    const c = new InvestmentCalculator(makeProps());
    expect(c.getGrowthMatrix()).toHaveLength(0);
  });

  it("is reset on each calculateGrowth call", () => {
    const c = new InvestmentCalculator(makeProps({ yearsOfGrowth: 2 }));
    c.calculateGrowth(false);
    c.calculateGrowth(false);
    expect(c.getGrowthMatrix()).toHaveLength(2); // not 4
  });
});

// ── monthly contributions ─────────────────────────────────────────────────────

describe("monthly contributions", () => {
  // With 0% gain contributions are additive: 10000 + 12*100 = 11200
  it("exact: $100/month at 0% gain for 1 year → 11200", () => {
    expect(
      numeric({ projectedGain: 0, monthlyContribution: 100, yearsOfGrowth: 1 }),
    ).toBe(11200);
  });

  it("contributions earn growth in the month they are made", () => {
    // 12% gain (1%/month), one $100 contribution per month over 1 year:
    // annuity-due FV = 100 × 1.01 × ((1.01^12 − 1) / 0.01) = 1281.0
    const expected = Math.floor(
      10000 * Math.pow(1.01, 12) +
        100 * 1.01 * ((Math.pow(1.01, 12) - 1) / 0.01),
    );
    expect(
      numeric({
        projectedGain: 12,
        monthlyContribution: 100,
        yearsOfGrowth: 1,
      }),
    ).toBe(expected);
  });

  it("contributions stop when yearContributionsStop is reached (advanced)", () => {
    // Stop at year 1 → only year 0 contributes → 10000 + 12*100 = 11200
    expect(
      numeric({
        projectedGain: 0,
        monthlyContribution: 100,
        yearsOfGrowth: 2,
        advanced: true,
        yearContributionsStop: 1,
      }),
    ).toBe(11200);
  });

  it("the stop year is ignored outside advanced mode", () => {
    expect(
      numeric({
        projectedGain: 0,
        monthlyContribution: 100,
        yearsOfGrowth: 2,
        yearContributionsStop: 1,
      }),
    ).toBe(12400);
  });
});

// ── withdrawals ───────────────────────────────────────────────────────────────

describe("withdrawals (advanced mode)", () => {
  it("withdrawals reduce the final balance", () => {
    const base = numeric({ advanced: true, monthlyWithdrawal: 0 });
    const withDraw = numeric({ advanced: true, monthlyWithdrawal: 200 });
    expect(withDraw).toBeLessThan(base);
  });

  it("withdrawal before start year has no effect", () => {
    // yearWithdrawalsBegin=5 with yearsOfGrowth=1 → no withdrawals applied
    const noWithdraw = numeric({ advanced: true, yearWithdrawalsBegin: 5 });
    const deferred = numeric({
      advanced: true,
      monthlyWithdrawal: 500,
      yearWithdrawalsBegin: 5,
    });
    expect(deferred).toBe(noWithdraw);
  });

  it("withdrawals are ignored outside advanced mode", () => {
    expect(numeric({ projectedGain: 0, monthlyWithdrawal: 500 })).toBe(10000);
  });

  it("getWithdrawalSchedule has one entry per simulated month", () => {
    const c = new InvestmentCalculator(
      makeProps({
        advanced: true,
        monthlyWithdrawal: 100,
        yearWithdrawalsBegin: 0.5,
        yearsOfGrowth: 1.5,
      }),
    );
    c.calculateGrowth(false);
    expect(c.getWithdrawalSchedule()).toEqual([
      ...repeat(0, 6),
      ...repeat(100, 12),
    ]);
  });
});

// ── dynamic withdrawals ───────────────────────────────────────────────────────

describe("dynamic withdrawals (percentage of balance)", () => {
  const dynamic = (
    overrides: Partial<InvestmentCalculatorProps> = {},
    policy = { ratePct: 4, floor: 0, ceiling: 10000 },
  ) =>
    makeProps({
      currentAmount: "120000",
      projectedGain: 0,
      advanced: true,
      dynamicWithdrawal: policy,
      ...overrides,
    });

  it("withdraws ratePct of the balance per year, spread over 12 months", () => {
    // 4% of 120 000 = 4 800 / year = 400 / month
    const c = new InvestmentCalculator(dynamic());
    expect(c.calculateGrowth(false).numeric).toBe(115200);
    expect(c.getWithdrawalSchedule()).toEqual(repeat(400, 12));
  });

  it("re-evaluates the amount from the balance every 12 withdrawal months", () => {
    // Year 2 starts at 115 200 → 4% / 12 = 384 per month
    const c = new InvestmentCalculator(dynamic({ yearsOfGrowth: 2 }));
    expect(c.calculateGrowth(false).numeric).toBe(110592);
    const schedule = c.getWithdrawalSchedule();
    expect(schedule[11]).toBe(400);
    expect(schedule[12]).toBe(384);
    expect(schedule[23]).toBe(384);
  });

  it("starts at yearWithdrawalsBegin like fixed withdrawals", () => {
    const c = new InvestmentCalculator(dynamic({ yearWithdrawalsBegin: 0.5 }));
    expect(c.calculateGrowth(false).numeric).toBe(117600);
    expect(c.getWithdrawalSchedule()).toEqual([
      ...repeat(0, 6),
      ...repeat(400, 6),
    ]);
  });

  it("replaces monthlyWithdrawal entirely", () => {
    expect(
      new InvestmentCalculator(
        dynamic({ monthlyWithdrawal: 999 }),
      ).calculateGrowth(false).numeric,
    ).toBe(115200);
  });

  it("ratePct 0 with a floor withdraws the floor; with no floor withdraws nothing", () => {
    const withFloor = dynamic({}, { ratePct: 0, floor: 500, ceiling: 10000 });
    expect(
      new InvestmentCalculator(withFloor).calculateGrowth(false).numeric,
    ).toBe(114000);
    const noFloor = dynamic({}, { ratePct: 0, floor: 0, ceiling: 10000 });
    expect(
      new InvestmentCalculator(noFloor).calculateGrowth(false).numeric,
    ).toBe(120000);
  });

  it("clamps to the ceiling, and the floor wins when it exceeds the ceiling", () => {
    // 20% of 1 000 000 = 16 667 / month → capped at 10 000
    const capped = dynamic(
      { currentAmount: "1000000" },
      { ratePct: 20, floor: 0, ceiling: 10000 },
    );
    expect(
      new InvestmentCalculator(capped).calculateGrowth(false).numeric,
    ).toBe(880000);
    const crossed = dynamic({}, { ratePct: 4, floor: 600, ceiling: 100 });
    expect(
      new InvestmentCalculator(crossed).calculateGrowth(false).numeric,
    ).toBe(112800);
  });

  it("is inert outside advanced mode", () => {
    const c = new InvestmentCalculator(dynamic({ advanced: false }));
    expect(c.calculateGrowth(false).numeric).toBe(120000);
    expect(c.getWithdrawalSchedule()).toEqual(repeat(0, 12));
  });

  it("subtracts the same amount from the inflation-adjusted track", () => {
    // 10% inflation: (120 000 − 4 800) × 0.9 = 103 680
    const c = new InvestmentCalculator(dynamic({ depreciationRate: 10 }));
    expect(c.calculateGrowth(true).numeric).toBe(103680);
  });
});

// ── inflation ─────────────────────────────────────────────────────────────────

describe("inflation adjustment", () => {
  // With 10% inflation and 0% gain over 1 year:
  // inflAdj → 10000 * (1 - 0.1) = 9000
  it("exact: 10% inflation, 0% gain, 1 year → inflation-adjusted = 9000", () => {
    expect(
      numeric(
        { projectedGain: 0, depreciationRate: 10, yearsOfGrowth: 1 },
        true,
      ),
    ).toBe(9000);
  });

  it("inflation-adjusted value is less than nominal", () => {
    const c = new InvestmentCalculator(
      makeProps({ depreciationRate: 5, yearsOfGrowth: 5 }),
    );
    const nominal = c.calculateGrowth(false).numeric;
    const adjusted = c.calculateGrowth(true).numeric;
    expect(adjusted).toBeLessThan(nominal);
  });
});

// ── rollover ──────────────────────────────────────────────────────────────────

describe("rollover", () => {
  const rollover = (overrides: Partial<InvestmentCalculatorProps> = {}) =>
    numeric({
      projectedGain: 0,
      yearsOfGrowth: 1,
      rollOver: true,
      investmentToRoll: 5000,
      yearOfRollover: 1,
      ...overrides,
    });

  // With 0% gain: year 0 = 10000, at end of year 1 + 5000 rollover = 15000
  it("exact: rollover of 5000 at year 1 → 15000 with 0% gain", () => {
    expect(rollover()).toBe(15000);
  });

  it("rollover beyond the horizon is not applied", () => {
    // yearOfRollover=2 with yearsOfGrowth=1 → rollover never fires
    expect(rollover({ yearOfRollover: 2 })).toBe(10000);
  });

  it("rollover at year 0 lands before the first month", () => {
    expect(rollover({ yearOfRollover: 0 })).toBe(15000);
    expect(rollover({ yearOfRollover: 0, yearsOfGrowth: 0 })).toBe(15000);
  });

  it("fires mid-chunk for a fractional rollover year", () => {
    expect(rollover({ yearsOfGrowth: 1.5, yearOfRollover: 1.5 })).toBe(15000);
    expect(rollover({ yearsOfGrowth: 2, yearOfRollover: 1.5 })).toBe(15000);
  });

  it("a whole-year rollover is not deflated by that year's inflation step", () => {
    // B starts at 0 with 10% inflation; the 5000 arriving at the end of
    // year 1 must land after the year-1 retention, so it stays 5000
    expect(
      numeric(
        {
          currentAmount: "0",
          projectedGain: 0,
          yearsOfGrowth: 1,
          depreciationRate: 10,
          rollOver: true,
          investmentToRoll: 5000,
          yearOfRollover: 1,
        },
        true,
      ),
    ).toBe(5000);
  });

  it("adds each track's own figure when both are supplied", () => {
    // A: 10 000 at 0% for 10 years with 10% inflation → 3486 inflation-adjusted
    const a = new InvestmentCalculator(
      makeProps({ projectedGain: 0, yearsOfGrowth: 10, depreciationRate: 10 }),
    );
    const nominal = a.calculateGrowth(false).numeric;
    const inflationAdjusted = a.calculateGrowth(true).numeric;
    expect(inflationAdjusted).toBe(3486);

    const b = new InvestmentCalculator(
      makeProps({
        currentAmount: "0",
        projectedGain: 0,
        yearsOfGrowth: 10,
        depreciationRate: 10,
        rollOver: true,
        investmentToRoll: { nominal, inflationAdjusted },
        yearOfRollover: 10,
      }),
    );
    expect(b.calculateGrowth(true).numeric).toBe(inflationAdjusted);
    expect(b.calculateGrowth(false).numeric).toBe(nominal);
    const lastPoint = b.getGrowthMatrix()[9];
    expect(lastPoint.y).toBe(nominal);
    expect(lastPoint.alternateY).toBe(inflationAdjusted);
  });
});

// ── additional edge cases ─────────────────────────────────────────────────────

describe("edge cases – zero years, large amounts, mixed cashflows", () => {
  it("zero years of growth returns the initial amount with 0% gain", () => {
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: 0, yearsOfGrowth: 0 }),
    );
    expect(c.calculateGrowth(false).numeric).toBe(10000);
    // No months are simulated for a 0-year horizon, so no data points.
    expect(c.getGrowthMatrix()).toHaveLength(0);
    expect(c.getWithdrawalSchedule()).toHaveLength(0);
  });

  it("very large initial amount (1 billion) does not overflow", () => {
    const result = numeric({
      currentAmount: "1000000000",
      projectedGain: 5,
      yearsOfGrowth: 1,
    });
    expect(result).toBeGreaterThan(1_000_000_000);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("contributions and withdrawals applied simultaneously", () => {
    // 0% gain: each month +200 contribution and -100 withdrawal → net +100/month
    // 1 year → 12 months → 10000 + 12*200 - 12*100 = 11200
    expect(
      numeric({
        projectedGain: 0,
        monthlyContribution: 200,
        monthlyWithdrawal: 100,
        yearsOfGrowth: 1,
        advanced: true,
      }),
    ).toBe(11200);
  });

  it("yearContributionsStop of 0 is treated as no-stop (falsy guard)", () => {
    const withStop0 = numeric({
      projectedGain: 0,
      monthlyContribution: 500,
      yearsOfGrowth: 2,
      advanced: true,
      yearContributionsStop: 0,
    });
    const withoutStop = numeric({
      projectedGain: 0,
      monthlyContribution: 500,
      yearsOfGrowth: 2,
      advanced: true,
    });
    expect(withStop0).toBe(withoutStop);
  });
});

/* ====================================================================
 * Partial (Fractional) Year Tests
 * ==================================================================== */

describe("partial years", () => {
  it("0% gain with 0.5 years preserves the initial amount", () => {
    expect(numeric({ projectedGain: 0, yearsOfGrowth: 0.5 })).toBe(10000);
  });

  it("fractional years produce a value between the floor and ceil years", () => {
    const calc = (y: number) =>
      numeric({ projectedGain: 12, yearsOfGrowth: y });
    expect(calc(1.5)).toBeGreaterThan(calc(1));
    expect(calc(1.5)).toBeLessThan(calc(2));
  });

  it("exact: 12% gain for 1.5 years compounds 18 months", () => {
    // 1 full year = 12 months, partial = 6 months → (1.01)^18
    expect(numeric({ projectedGain: 12, yearsOfGrowth: 1.5 })).toBe(
      Math.floor(10000 * Math.pow(1.01, 18)),
    );
  });

  it("growth matrix gains one extra point for the partial year", () => {
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: 0, yearsOfGrowth: 2.5 }),
    );
    c.calculateGrowth(false);
    // Full years 1, 2 plus the trailing 6-month partial point
    expect(c.getGrowthMatrix()).toHaveLength(3);
  });

  it("final matrix point lands 6 months after the last full year", () => {
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: 0, yearsOfGrowth: 1.5 }),
    );
    c.calculateGrowth(false);
    const matrix = c.getGrowthMatrix();
    expect(matrix[0].x).toEqual(new Date(2027, 0, 15));
    expect(matrix[1].x).toEqual(new Date(2027, 6, 15));
  });

  it("fractional contribution stop year stops after the right month count", () => {
    // Stop at 0.5 years → 6 contributions of $100 at 0% gain
    expect(
      numeric({
        projectedGain: 0,
        monthlyContribution: 100,
        yearsOfGrowth: 1,
        advanced: true,
        yearContributionsStop: 0.5,
      }),
    ).toBe(10600);
  });

  it("fractional withdrawal start year begins after the right month count", () => {
    // Start at 0.5 years within a 1-year (12-month) horizon →
    // withdrawals for months 6..11 = 6 × $100
    expect(
      numeric({
        projectedGain: 0,
        monthlyWithdrawal: 100,
        yearWithdrawalsBegin: 0.5,
        yearsOfGrowth: 1,
        advanced: true,
      }),
    ).toBe(9400);
  });

  it("partial-year inflation adjustment is pro-rated", () => {
    // 10% inflation, 0% gain, 0.5 years → a single 6-month partial
    // adjustment, pro-rated as ×0.9^0.5 (no full-year chunk is processed)
    expect(
      numeric(
        { projectedGain: 0, depreciationRate: 10, yearsOfGrowth: 0.5 },
        true,
      ),
    ).toBe(Math.floor(10000 * Math.pow(0.9, 0.5)));
  });
});

/* ====================================================================
 * Annual Fee (Expense Ratio) Tests
 * ==================================================================== */

describe("Annual fee (expense ratio)", () => {
  it("0% fee produces identical results to no fee", () => {
    expect(numeric({ yearsOfGrowth: 10, annualFee: 0 })).toBe(
      numeric({ yearsOfGrowth: 10 }),
    );
  });

  it("fee reduces the final value compared to no fee", () => {
    expect(numeric({ yearsOfGrowth: 30, annualFee: 1 })).toBeLessThan(
      numeric({ yearsOfGrowth: 30 }),
    );
  });

  it("higher fee results in lower final value", () => {
    expect(numeric({ yearsOfGrowth: 20, annualFee: 1.5 })).toBeLessThan(
      numeric({ yearsOfGrowth: 20, annualFee: 0.5 }),
    );
  });

  it("tracks cumulative fees paid", () => {
    const calc = new InvestmentCalculator(
      makeProps({ yearsOfGrowth: 10, annualFee: 1 }),
    );
    calc.calculateGrowth(false);
    expect(calc.getCumulativeFees()).toBeGreaterThan(0);
  });

  it("cumulative fees are 0 when annualFee is 0", () => {
    const calc = new InvestmentCalculator(
      makeProps({ yearsOfGrowth: 10, annualFee: 0 }),
    );
    calc.calculateGrowth(false);
    expect(calc.getCumulativeFees()).toBe(0);
  });

  it("fee is mathematically correct for 1 year at 1%", () => {
    // $10k at 10% return with 1% fee over 1 year is very close to 9% with
    // no fee (not exact due to compounding differences)
    const withFee = numeric({
      yearsOfGrowth: 1,
      projectedGain: 10,
      annualFee: 1,
    });
    const atNinePercent = numeric({ yearsOfGrowth: 1, projectedGain: 9 });
    expect(Math.abs(withFee - atNinePercent)).toBeLessThan(10);
  });
});
