import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import { addMonths } from "date-fns/addMonths";
import {
  InvestmentCalculator,
  planAnchor,
  toMonths,
} from "../investment-growth-calculator";
import type { InvestmentCalculatorProps } from "../../types/types";
import { MAX_PROJECTED_GAIN } from "../../constants/app-constants";

// ── helpers ──────────────────────────────────────────────────────────────────

const makeProps = (
  overrides: Partial<InvestmentCalculatorProps> = {},
): InvestmentCalculatorProps => ({
  initialAmount: 10000,
  projectedGain: 10,
  yearsOfGrowth: 1,
  monthlyContribution: 0,
  monthlyWithdrawal: 0,
  withdrawalStartYear: 0,
  inflationPct: 0,
  ...overrides,
});

const repeat = (value: number, n: number) => Array<number>(n).fill(value);

/**
 * The ending balance on one of the two tracks the engine always returns.
 * `real` is the same balance in today's dollars; nothing about the engine
 * changes when a caller asks for it.
 */
const numeric = (
  overrides: Partial<InvestmentCalculatorProps>,
  showInflation = false,
) =>
  new InvestmentCalculator(makeProps(overrides)).calculateGrowth()[
    showInflation ? "real" : "nominal"
  ];

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
  // initialAmount is a NUMBER the caller has already read out of whatever
  // text box or file it came from, so the cases that used to be spelled
  // "", " " and "abc" are now the one case an unreadable amount produces.
  it("returns 0 on both tracks for an unreadable initial amount", () => {
    for (const amount of [NaN, Infinity, -Infinity]) {
      const c = new InvestmentCalculator(makeProps({ initialAmount: amount }));
      expect(c.calculateGrowth()).toEqual({ nominal: 0, real: 0 });
      expect(c.getGrowthMatrix()).toHaveLength(0);
    }
  });

  it("returns 0 for a negative initial amount rather than simulating a debt", () => {
    const c = new InvestmentCalculator(makeProps({ initialAmount: -500 }));
    expect(c.calculateGrowth()).toEqual({ nominal: 0, real: 0 });
    expect(c.getGrowthMatrix()).toHaveLength(0);
  });

  it("accepts an initial amount of exactly 0", () => {
    expect(numeric({ initialAmount: 0, projectedGain: 0 })).toBe(0);
    expect(
      numeric({ initialAmount: 0, projectedGain: 0, monthlyContribution: 100 }),
    ).toBe(1200);
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

  it("returns both tracks from one call, taking no display flag", () => {
    // The signature is the assertion: calculateGrowth() has no argument to
    // pass a toggle to, and it never formats - the view does that.
    const c = new InvestmentCalculator(
      makeProps({ yearsOfGrowth: 10, inflationPct: 3 }),
    );
    const result = c.calculateGrowth();
    expect(c.calculateGrowth.bind(c)).toHaveLength(0);
    expect(Object.keys(result).sort()).toEqual(["nominal", "real"]);
    expect(result.nominal).toBeGreaterThan(10000);
    expect(result.real).toBeGreaterThan(0);
    expect(result.real).toBeLessThan(result.nominal);
  });

  it("populates both tracks even when there is no inflation to apply", () => {
    const { nominal, real } = new InvestmentCalculator(
      makeProps({ yearsOfGrowth: 10, inflationPct: 0 }),
    ).calculateGrowth();
    expect(real).toBe(nominal);
  });
});

// ── growth matrix ─────────────────────────────────────────────────────────────

describe("getGrowthMatrix", () => {
  it("has yearsOfGrowth entries after calculateGrowth (one per full year)", () => {
    for (const y of [0, 1, 5, 10]) {
      const c = new InvestmentCalculator(
        makeProps({ yearsOfGrowth: y, projectedGain: 0 }),
      );
      c.calculateGrowth();
      expect(c.getGrowthMatrix()).toHaveLength(y);
    }
  });

  it("year-0 entry matches the initial amount when gain is 0%", () => {
    // With 0% gain the balance never changes across the first full year.
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: 0, yearsOfGrowth: 1 }),
    );
    c.calculateGrowth();
    expect(c.getGrowthMatrix()[0].nominal).toBe(10000);
  });

  it("entries are dated whole years after today", () => {
    const c = new InvestmentCalculator(makeProps({ yearsOfGrowth: 3 }));
    c.calculateGrowth();
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
    c.calculateGrowth();
    const balances = c.getGrowthMatrix().map((e) => e.nominal);
    for (let i = 1; i < balances.length; i++) {
      expect(balances[i]).toBeGreaterThan(balances[i - 1]);
    }
  });

  it("is empty before calculateGrowth is called", () => {
    const c = new InvestmentCalculator(makeProps());
    expect(c.getGrowthMatrix()).toHaveLength(0);
  });

  it("is reset on each calculateGrowth call", () => {
    const c = new InvestmentCalculator(makeProps({ yearsOfGrowth: 2 }));
    c.calculateGrowth();
    c.calculateGrowth();
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

  it("contributions stop when contributionStopYear is reached (advanced)", () => {
    // Stop at year 1 → only year 0 contributes → 10000 + 12*100 = 11200
    expect(
      numeric({
        projectedGain: 0,
        monthlyContribution: 100,
        yearsOfGrowth: 2,
        contributionStopYear: 1,
      }),
    ).toBe(11200);
  });

  // Basic mode is resolved by the hub, which passes no contribution and no
  // stop year at all; the engine honours whatever it is handed
  it("applies neither contribution nor stop year for a basic-mode plan", () => {
    expect(
      numeric({
        projectedGain: 0,
        monthlyContribution: 0,
        yearsOfGrowth: 2,
        contributionStopYear: undefined,
      }),
    ).toBe(10000);
  });

  it("honours a stop year whatever mode the plan came from", () => {
    // Basic and advanced mode are a UI concern resolved before the props are
    // built; there is no mode flag on them for the engine to read. Stop at
    // year 1 over a 2-year horizon contributes 12 x 100.
    expect(
      numeric({
        projectedGain: 0,
        monthlyContribution: 100,
        yearsOfGrowth: 2,
        contributionStopYear: 1,
      }),
    ).toBe(11200);
  });

  it("an unset stop year never stops; a stop year of 0 stops immediately", () => {
    const contributing = {
      projectedGain: 0,
      monthlyContribution: 500,
      yearsOfGrowth: 2,
    };
    expect(numeric(contributing)).toBe(22000);
    expect(numeric({ ...contributing, contributionStopYear: undefined })).toBe(
      22000,
    );
    expect(numeric({ ...contributing, contributionStopYear: 0 })).toBe(10000);
    // 0 is continuous with the rest of the range rather than a hole in it
    expect(numeric({ ...contributing, contributionStopYear: 0.5 })).toBe(13000);
  });
});

// ── withdrawals ───────────────────────────────────────────────────────────────

describe("withdrawals", () => {
  it("withdrawals reduce the final balance", () => {
    const base = numeric({ monthlyWithdrawal: 0 });
    const withDraw = numeric({ monthlyWithdrawal: 200 });
    expect(withDraw).toBeLessThan(base);
  });

  it("withdrawal before start year has no effect", () => {
    // withdrawalStartYear=5 with yearsOfGrowth=1 → no withdrawals applied
    const noWithdraw = numeric({ withdrawalStartYear: 5 });
    const deferred = numeric({
      monthlyWithdrawal: 500,
      withdrawalStartYear: 5,
    });
    expect(deferred).toBe(noWithdraw);
  });

  it("applies exactly the withdrawal it is handed", () => {
    // Basic mode suppresses withdrawals at the boundary (the hub passes 0),
    // never in here. There is no longer a mode flag on the props to consult:
    // 12 x 500 comes out of 10 000 because that is what was asked for.
    expect(numeric({ projectedGain: 0, monthlyWithdrawal: 500 })).toBe(4000);
    expect(numeric({ projectedGain: 0, monthlyWithdrawal: 0 })).toBe(10000);
  });

  it("getWithdrawalSchedule has one entry per simulated month", () => {
    const c = new InvestmentCalculator(
      makeProps({
        monthlyWithdrawal: 100,
        withdrawalStartYear: 0.5,
        yearsOfGrowth: 1.5,
      }),
    );
    c.calculateGrowth();
    expect(c.getWithdrawalSchedule()).toEqual([
      ...repeat(0, 6),
      ...repeat(100, 12),
    ]);
  });
});

// ── depletion ─────────────────────────────────────────────────────────────────

describe("depletion (the balance floors at zero)", () => {
  /** $1 000 drawn down at $300/month with no growth: dry in month 3 */
  const drained = (overrides: Partial<InvestmentCalculatorProps> = {}) =>
    new InvestmentCalculator(
      makeProps({
        initialAmount: 1000,
        projectedGain: 0,
        monthlyWithdrawal: 300,
        yearsOfGrowth: 1,
        ...overrides,
      }),
    );

  it("caps the last withdrawal at the balance and stops withdrawing after it", () => {
    const c = drained();
    expect(c.calculateGrowth().nominal).toBe(0);
    // Month 3 could only fund 100 of the 300 asked for; months 4-11 fund none
    expect(c.getWithdrawalSchedule()).toEqual([
      300,
      300,
      300,
      100,
      ...repeat(0, 8),
    ]);
  });

  it("reports the first month the plan could not fund its withdrawal", () => {
    const c = drained();
    c.calculateGrowth();
    expect(c.getDepletedAtMonth()).toBe(3);
  });

  it("has no depletion month before calculateGrowth, or for a funded plan", () => {
    const untouched = drained();
    expect(untouched.getDepletedAtMonth()).toBeUndefined();
    const funded = drained({ initialAmount: 100000 });
    funded.calculateGrowth();
    expect(funded.getDepletedAtMonth()).toBeUndefined();
  });

  it("does not call a plan that never withdraws depleted, even at zero", () => {
    const c = new InvestmentCalculator(
      makeProps({ initialAmount: 0, projectedGain: 0, yearsOfGrowth: 1 }),
    );
    expect(c.calculateGrowth().nominal).toBe(0);
    expect(c.getDepletedAtMonth()).toBeUndefined();
  });

  it("never compounds a negative balance, however long the horizon", () => {
    // The regression this pins: a dynamic floor kept paying out past zero and
    // the debt compounded at the growth rate (year 30 reached -$9.4m)
    const c = new InvestmentCalculator(
      makeProps({
        initialAmount: 100000,
        projectedGain: 10,
        yearsOfGrowth: 30,
        dynamicWithdrawal: { ratePct: 4, floor: 5000, ceiling: 10000 },
      }),
    );
    expect(c.calculateGrowth().nominal).toBe(0);
    for (const entry of c.getGrowthMatrix()) {
      expect(entry.nominal).toBeGreaterThanOrEqual(0);
      expect(entry.real).toBeGreaterThanOrEqual(0);
    }
    for (const withdrawal of c.getWithdrawalSchedule()) {
      expect(withdrawal).toBeGreaterThanOrEqual(0);
    }
    expect(c.getWithdrawalSchedule().at(-1)).toBe(0);
    expect(c.getDepletedAtMonth()).toBeLessThan(360);
  });

  it("recovers when contributions keep funding a drained plan", () => {
    // Contributions are NOT gated on a positive balance: $300 out and $200 in
    // each month empties the plan in month 7 and then refills it every month
    const c = drained({ monthlyContribution: 200 });
    expect(c.calculateGrowth().nominal).toBe(200);
    expect(c.getDepletedAtMonth()).toBe(7);
    expect(c.getWithdrawalSchedule()).toEqual([
      ...repeat(300, 8),
      ...repeat(200, 4),
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
      initialAmount: 120000,
      projectedGain: 0,
      dynamicWithdrawal: policy,
      ...overrides,
    });

  it("withdraws ratePct of the balance per year, spread over 12 months", () => {
    // 4% of 120 000 = 4 800 / year = 400 / month
    const c = new InvestmentCalculator(dynamic());
    expect(c.calculateGrowth().nominal).toBe(115200);
    expect(c.getWithdrawalSchedule()).toEqual(repeat(400, 12));
  });

  it("re-evaluates the amount from the balance every 12 withdrawal months", () => {
    // Year 2 starts at 115 200 → 4% / 12 = 384 per month
    const c = new InvestmentCalculator(dynamic({ yearsOfGrowth: 2 }));
    expect(c.calculateGrowth().nominal).toBe(110592);
    const schedule = c.getWithdrawalSchedule();
    expect(schedule[11]).toBe(400);
    expect(schedule[12]).toBe(384);
    expect(schedule[23]).toBe(384);
  });

  it("starts at withdrawalStartYear like fixed withdrawals", () => {
    const c = new InvestmentCalculator(dynamic({ withdrawalStartYear: 0.5 }));
    expect(c.calculateGrowth().nominal).toBe(117600);
    expect(c.getWithdrawalSchedule()).toEqual([
      ...repeat(0, 6),
      ...repeat(400, 6),
    ]);
  });

  it("replaces monthlyWithdrawal entirely", () => {
    expect(
      new InvestmentCalculator(
        dynamic({ monthlyWithdrawal: 999 }),
      ).calculateGrowth().nominal,
    ).toBe(115200);
  });

  it("ratePct 0 with a floor withdraws the floor; with no floor withdraws nothing", () => {
    const withFloor = dynamic({}, { ratePct: 0, floor: 500, ceiling: 10000 });
    expect(new InvestmentCalculator(withFloor).calculateGrowth().nominal).toBe(
      114000,
    );
    const noFloor = dynamic({}, { ratePct: 0, floor: 0, ceiling: 10000 });
    expect(new InvestmentCalculator(noFloor).calculateGrowth().nominal).toBe(
      120000,
    );
  });

  it("clamps to the ceiling, and the floor wins when it exceeds the ceiling", () => {
    // 20% of 1 000 000 = 16 667 / month → capped at 10 000
    const capped = dynamic(
      { initialAmount: 1000000 },
      { ratePct: 20, floor: 0, ceiling: 10000 },
    );
    expect(new InvestmentCalculator(capped).calculateGrowth().nominal).toBe(
      880000,
    );
    const crossed = dynamic({}, { ratePct: 4, floor: 600, ceiling: 100 });
    expect(new InvestmentCalculator(crossed).calculateGrowth().nominal).toBe(
      112800,
    );
  });

  it("runs exactly the policy it is handed", () => {
    // A dynamic policy only reaches the engine when the hub decides the plan
    // has one; the engine simply runs what arrives.
    const c = new InvestmentCalculator(dynamic({}));
    expect(c.calculateGrowth().nominal).toBe(115200);
    expect(c.getWithdrawalSchedule()).toEqual(repeat(400, 12));
    const none = new InvestmentCalculator(
      makeProps({ initialAmount: 120000, projectedGain: 0 }),
    );
    expect(none.calculateGrowth().nominal).toBe(120000);
    expect(none.getWithdrawalSchedule()).toEqual(repeat(0, 12));
  });

  it("indexes the guardrails to inflation so they hold today's dollars", () => {
    // 3% inflation, 0% gain, a floor and ceiling pinned together at 1000: the
    // nominal draw must rise by 3% a year to stay worth 1000 today
    const c = new InvestmentCalculator(
      dynamic(
        { yearsOfGrowth: 3, inflationPct: 3 },
        { ratePct: 0, floor: 1000, ceiling: 1000 },
      ),
    );
    c.calculateGrowth();
    const schedule = c.getWithdrawalSchedule();
    for (const year of [0, 1, 2]) {
      const nominal = schedule[year * 12];
      expect(nominal).toBeCloseTo(1000 * Math.pow(1.03, year), 6);
      // Deflated back to today, every year's guardrail is the same 1000
      expect(nominal * Math.pow(1.03, -year)).toBeCloseTo(1000, 6);
    }
  });

  it("leaves the guardrails alone when there is no inflation", () => {
    const c = new InvestmentCalculator(
      dynamic({ yearsOfGrowth: 3 }, { ratePct: 0, floor: 1000, ceiling: 1000 }),
    );
    c.calculateGrowth();
    expect(c.getWithdrawalSchedule()).toEqual(repeat(1000, 36));
  });

  it("deflates the nominal balance the withdrawals were taken from", () => {
    // 10% inflation: (120 000 − 4 800) ÷ 1.1 = 104 727
    const c = new InvestmentCalculator(dynamic({ inflationPct: 10 }));
    expect(c.calculateGrowth().real).toBe(104727);
  });
});

// ── inflation ─────────────────────────────────────────────────────────────────

describe("inflation adjustment", () => {
  // With 10% inflation and 0% gain over 1 year:
  // inflAdj → 10000 / 1.1 = 9090.90… → 9090
  it("exact: 10% inflation, 0% gain, 1 year → inflation-adjusted = 9090", () => {
    expect(
      numeric({ projectedGain: 0, inflationPct: 10, yearsOfGrowth: 1 }, true),
    ).toBe(9090);
  });

  it("deflates by (1 + i)^-t, not (1 - i)^t", () => {
    // 10 000 at 0% gain over 30 years with 10% inflation is
    // 10 000 / 1.1^30 = 573, not the 423 that 10 000 × 0.9^30 gives
    expect(
      numeric({ projectedGain: 0, inflationPct: 10, yearsOfGrowth: 30 }, true),
    ).toBe(Math.floor(10000 * Math.pow(1.1, -30)));
  });

  it("inflation-adjusted value is less than nominal", () => {
    const c = new InvestmentCalculator(
      makeProps({ inflationPct: 5, yearsOfGrowth: 5 }),
    );
    const nominal = c.calculateGrowth().nominal;
    const adjusted = c.calculateGrowth().real;
    expect(adjusted).toBeLessThan(nominal);
  });

  /**
   * A plan whose cash flows all land mid-chunk: a 20 000 rollover and the
   * first withdrawal at 1.5 years, contributions stopping at 2.5 years, over
   * a 3.5-year horizon. The old parallel accumulator charged each of those
   * flows a different, plan-dependent deflator; pure deflation cannot.
   */
  const mixedPlan = (inflationPct: number) =>
    makeProps({
      initialAmount: 50000,
      projectedGain: 7,
      yearsOfGrowth: 3.5,
      monthlyContribution: 500,
      contributionStopYear: 2.5,
      monthlyWithdrawal: 200,
      withdrawalStartYear: 1.5,
      annualFeePct: 0.5,
      inflationPct,
      rollOver: true,
      investmentToRoll: 20000,
      yearOfRollover: 1.5,
    });

  /** Months from today at each of mixedPlan's four checkpoints */
  const checkpointMonths = [12, 24, 36, 42];

  /**
   * Both tracks are floored integers, so the closed form can only ever be off
   * by the flooring itself: |floor(N x f) - floor(N) x f| <= 1 for f <= 1.
   */
  const expectDeflated = (real: number, nominal: number, months: number) =>
    expect(
      Math.abs(real - nominal * Math.pow(1.03, -months / 12)),
    ).toBeLessThanOrEqual(1);

  it("the real track is exactly the nominal track deflated", () => {
    const c = new InvestmentCalculator(mixedPlan(3));
    c.calculateGrowth();
    const matrix = c.getGrowthMatrix();
    expect(matrix).toHaveLength(checkpointMonths.length);
    matrix.forEach((entry, i) =>
      expectDeflated(entry.real, entry.nominal, checkpointMonths[i]),
    );
  });

  it("ends on the same pair the last checkpoint carries", () => {
    // There is no toggle left to swap the slots: the returned pair and the
    // final row are the same two numbers under the same two names.
    const c = new InvestmentCalculator(mixedPlan(3));
    const result = c.calculateGrowth();
    const last = c.getGrowthMatrix().at(-1)!;
    expect(result).toEqual({ nominal: last.nominal, real: last.real });
  });

  it("leaves both tracks identical when the inflation rate is 0", () => {
    const c = new InvestmentCalculator(mixedPlan(0));
    expect(c.calculateGrowth().real).toBe(
      new InvestmentCalculator(mixedPlan(0)).calculateGrowth().nominal,
    );
    const matrix = c.getGrowthMatrix();
    expect(matrix).toHaveLength(checkpointMonths.length);
    for (const entry of matrix) expect(entry.real).toBe(entry.nominal);
  });
});

// ── the plan's anchor ─────────────────────────────────────────────────────────

describe("planAnchor", () => {
  it("is today at local midnight", () => {
    const anchor = planAnchor();
    expect(anchor).toEqual(new Date(2026, 0, 15));
    expect([
      anchor.getHours(),
      anchor.getMinutes(),
      anchor.getSeconds(),
    ]).toEqual([0, 0, 0]);
  });

  it("is what the constructor falls back to", () => {
    const withDefault = new InvestmentCalculator(
      makeProps({ yearsOfGrowth: 2 }),
    );
    const explicit = new InvestmentCalculator(
      makeProps({ yearsOfGrowth: 2 }),
      planAnchor(),
    );
    withDefault.calculateGrowth();
    explicit.calculateGrowth();
    expect(withDefault.getGrowthMatrix()).toEqual(explicit.getGrowthMatrix());
  });
});

describe("injected anchor", () => {
  // These move the clock, so every case puts it back where beforeAll left it
  afterEach(() => vi.setSystemTime(new Date(2026, 0, 15)));

  const beforeMidnight = new Date(2026, 0, 31, 23, 59, 59, 900);
  const afterMidnight = new Date(2026, 1, 1, 0, 0, 0, 100);

  /** One year of flat growth, so only the DATES can differ */
  const dates = (calc: InvestmentCalculator) => {
    calc.calculateGrowth();
    return calc.getGrowthMatrix().map((e) => e.x);
  };

  it("dates two calculators built either side of midnight identically", () => {
    vi.setSystemTime(beforeMidnight);
    const anchor = planAnchor();
    const a = new InvestmentCalculator(makeProps({ yearsOfGrowth: 3 }), anchor);
    const beforeDates = dates(a);

    vi.setSystemTime(afterMidnight);
    const b = new InvestmentCalculator(makeProps({ yearsOfGrowth: 3 }), anchor);

    expect(dates(b)).toEqual(beforeDates);
    expect(beforeDates[0]).toEqual(new Date(2027, 0, 31));
  });

  it("is the skew a per-calculator clock produces", () => {
    // The same two constructions WITHOUT a shared anchor: the second reads a
    // clock that has rolled over into February, and addMonths carries that
    // difference into every row. This is the failure the injection removes.
    vi.setSystemTime(beforeMidnight);
    const beforeDates = dates(
      new InvestmentCalculator(makeProps({ yearsOfGrowth: 3 })),
    );
    vi.setSystemTime(afterMidnight);
    const afterDates = dates(
      new InvestmentCalculator(makeProps({ yearsOfGrowth: 3 })),
    );
    expect(afterDates).not.toEqual(beforeDates);
  });

  it("dates every checkpoint as the anchor plus whole months", () => {
    const anchor = new Date(2030, 5, 10);
    const c = new InvestmentCalculator(
      makeProps({ yearsOfGrowth: 1.5 }),
      anchor,
    );
    c.calculateGrowth();
    expect(c.getGrowthMatrix().map((e) => e.x)).toEqual([
      new Date(2031, 5, 10),
      new Date(2031, 11, 10),
    ]);
    expect(c.getMonthlyMatrix().at(-1)!.x).toEqual(new Date(2031, 11, 10));
  });
});

// ── monthly matrix ────────────────────────────────────────────────────────────

describe("getMonthlyMatrix", () => {
  const anchor = new Date(2026, 0, 15);

  const run = (overrides: Partial<InvestmentCalculatorProps> = {}) => {
    const c = new InvestmentCalculator(makeProps(overrides), anchor);
    c.calculateGrowth();
    return c;
  };

  it("has one row per simulated month", () => {
    for (const years of [0, 1, 5, 10.5]) {
      expect(run({ yearsOfGrowth: years }).getMonthlyMatrix()).toHaveLength(
        toMonths(years),
      );
    }
  });

  it("dates row k at the anchor plus k+1 months (no today row)", () => {
    const monthly = run({ yearsOfGrowth: 1 }).getMonthlyMatrix();
    expect(monthly[0].x).toEqual(addMonths(anchor, 1));
    expect(monthly[11].x).toEqual(addMonths(anchor, 12));
  });

  it("is empty before calculateGrowth and reset on each call", () => {
    const c = new InvestmentCalculator(makeProps({ yearsOfGrowth: 2 }), anchor);
    expect(c.getMonthlyMatrix()).toHaveLength(0);
    c.calculateGrowth();
    c.calculateGrowth();
    expect(c.getMonthlyMatrix()).toHaveLength(24); // not 48
  });

  it("row 12k - 1 is the very same checkpoint as year row k - 1", () => {
    // A plan with cash flows on both sides, so the two matrices agree on
    // something harder than plain compounding
    const c = run({
      yearsOfGrowth: 3,
      projectedGain: 7,
      inflationPct: 3,
      monthlyContribution: 500,
      monthlyWithdrawal: 200,
      withdrawalStartYear: 1.5,
      annualFeePct: 0.5,
    });
    const monthly = c.getMonthlyMatrix();
    c.getGrowthMatrix().forEach((yearRow, k) =>
      expect(monthly[12 * (k + 1) - 1]).toEqual(yearRow),
    );
  });

  it("every row's real track is its own nominal deflated by its own months", () => {
    const monthly = run({
      yearsOfGrowth: 3,
      projectedGain: 7,
      inflationPct: 3,
      monthlyContribution: 500,
    }).getMonthlyMatrix();
    monthly.forEach((row, k) => {
      const months = k + 1;
      // Both tracks are floored integers, so the closed form can only ever be
      // off by the flooring itself
      expect(
        Math.abs(row.real - row.nominal * Math.pow(1.03, -months / 12)),
      ).toBeLessThanOrEqual(1);
    });
  });

  it("records a mid-year rollover in the month it lands", () => {
    // Interpolating year ends would spread this 5000 over twelve rows; the
    // recorded matrix shows it arriving in month 6 and nowhere else
    const monthly = run({
      projectedGain: 0,
      yearsOfGrowth: 1,
      rollOver: true,
      investmentToRoll: 5000,
      yearOfRollover: 0.5,
    }).getMonthlyMatrix();
    expect(monthly[4].nominal).toBe(10000);
    expect(monthly[5].nominal).toBe(15000);
    expect(monthly.at(-1)!.nominal).toBe(15000);
  });

  it("records the month a withdrawal starts as a step, not a slope", () => {
    const monthly = run({
      projectedGain: 0,
      yearsOfGrowth: 1,
      monthlyWithdrawal: 1000,
      withdrawalStartYear: 0.5,
    }).getMonthlyMatrix();
    const balances = monthly.map((row) => row.nominal);
    expect(balances.slice(0, 6)).toEqual(Array<number>(6).fill(10000));
    expect(balances.slice(6)).toEqual([9000, 8000, 7000, 6000, 5000, 4000]);
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

  it("a rollover is deflated by its own elapsed time, once", () => {
    // B starts at 0 with 10% inflation; the 5000 arriving at the end of
    // year 1 is one year old, so it is worth 5000 / 1.1 = 4545 today
    expect(
      numeric(
        {
          initialAmount: 0,
          projectedGain: 0,
          yearsOfGrowth: 1,
          inflationPct: 10,
          rollOver: true,
          investmentToRoll: 5000,
          yearOfRollover: 1,
        },
        true,
      ),
    ).toBe(4545);
  });

  it("rolls in the nominal figure and re-derives the real value", () => {
    // A: 10 000 at 0% for 10 years with 10% inflation
    // → 10 000 / 1.1^10 = 3855 inflation-adjusted
    const a = new InvestmentCalculator(
      makeProps({ projectedGain: 0, yearsOfGrowth: 10, inflationPct: 10 }),
    );
    const nominal = a.calculateGrowth().nominal;
    const inflationAdjusted = a.calculateGrowth().real;
    expect(inflationAdjusted).toBe(3855);

    const b = new InvestmentCalculator(
      makeProps({
        initialAmount: 0,
        projectedGain: 0,
        yearsOfGrowth: 10,
        inflationPct: 10,
        rollOver: true,
        investmentToRoll: { nominal, inflationAdjusted },
        yearOfRollover: 10,
      }),
    );
    expect(b.calculateGrowth().real).toBe(inflationAdjusted);
    expect(b.calculateGrowth().nominal).toBe(nominal);
    const lastPoint = b.getGrowthMatrix()[9];
    expect(lastPoint.nominal).toBe(nominal);
    expect(lastPoint.real).toBe(inflationAdjusted);
  });
});

// ── additional edge cases ─────────────────────────────────────────────────────

describe("edge cases – zero years, large amounts, mixed cashflows", () => {
  it("zero years of growth returns the initial amount with 0% gain", () => {
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: 0, yearsOfGrowth: 0 }),
    );
    expect(c.calculateGrowth().nominal).toBe(10000);
    // No months are simulated for a 0-year horizon, so no data points.
    expect(c.getGrowthMatrix()).toHaveLength(0);
    expect(c.getWithdrawalSchedule()).toHaveLength(0);
  });

  it("very large initial amount (1 billion) does not overflow", () => {
    const result = numeric({
      initialAmount: 1000000000,
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
      }),
    ).toBe(11200);
  });

  it("contributionStopYear of 0 stops immediately, unlike an unset one", () => {
    const withStop0 = numeric({
      projectedGain: 0,
      monthlyContribution: 500,
      yearsOfGrowth: 2,
      contributionStopYear: 0,
    });
    const withoutStop = numeric({
      projectedGain: 0,
      monthlyContribution: 500,
      yearsOfGrowth: 2,
    });
    expect(withStop0).toBe(10000);
    expect(withoutStop).toBe(22000);
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
    c.calculateGrowth();
    // Full years 1, 2 plus the trailing 6-month partial point
    expect(c.getGrowthMatrix()).toHaveLength(3);
  });

  it("final matrix point lands 6 months after the last full year", () => {
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: 0, yearsOfGrowth: 1.5 }),
    );
    c.calculateGrowth();
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
        contributionStopYear: 0.5,
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
        withdrawalStartYear: 0.5,
        yearsOfGrowth: 1,
      }),
    ).toBe(9400);
  });

  it("partial-year inflation adjustment is pro-rated", () => {
    // 10% inflation, 0% gain, 0.5 years → the single 6-month checkpoint is
    // deflated by ÷ 1.1^0.5 (no full-year chunk is processed)
    expect(
      numeric({ projectedGain: 0, inflationPct: 10, yearsOfGrowth: 0.5 }, true),
    ).toBe(Math.floor(10000 * Math.pow(1.1, -0.5)));
  });
});

/* ====================================================================
 * Annual Fee (Expense Ratio) Tests
 * ==================================================================== */

describe("Annual fee (expense ratio)", () => {
  it("0% fee produces identical results to no fee", () => {
    expect(numeric({ yearsOfGrowth: 10, annualFeePct: 0 })).toBe(
      numeric({ yearsOfGrowth: 10 }),
    );
  });

  it("fee reduces the final value compared to no fee", () => {
    expect(numeric({ yearsOfGrowth: 30, annualFeePct: 1 })).toBeLessThan(
      numeric({ yearsOfGrowth: 30 }),
    );
  });

  it("higher fee results in lower final value", () => {
    expect(numeric({ yearsOfGrowth: 20, annualFeePct: 1.5 })).toBeLessThan(
      numeric({ yearsOfGrowth: 20, annualFeePct: 0.5 }),
    );
  });

  it("tracks cumulative fees paid", () => {
    const calc = new InvestmentCalculator(
      makeProps({ yearsOfGrowth: 10, annualFeePct: 1 }),
    );
    calc.calculateGrowth();
    expect(calc.getCumulativeFees()).toBeGreaterThan(0);
  });

  it("cumulative fees are 0 when annualFeePct is 0", () => {
    const calc = new InvestmentCalculator(
      makeProps({ yearsOfGrowth: 10, annualFeePct: 0 }),
    );
    calc.calculateGrowth();
    expect(calc.getCumulativeFees()).toBe(0);
  });

  it("fee is mathematically correct for 1 year at 1%", () => {
    // $10k at 10% return with 1% fee over 1 year is very close to 9% with
    // no fee (not exact due to compounding differences)
    const withFee = numeric({
      yearsOfGrowth: 1,
      projectedGain: 10,
      annualFeePct: 1,
    });
    const atNinePercent = numeric({ yearsOfGrowth: 1, projectedGain: 9 });
    expect(Math.abs(withFee - atNinePercent)).toBeLessThan(10);
  });
});
