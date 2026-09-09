/* ==================================================
 * PDF Report Data
 *
 * The rows a PDF report is built from, and the helpers
 * that shape them. Deliberately free of jspdf and
 * html2canvas: the hub reads these types and helpers on
 * every render, and importing them used to pin ~584 kB
 * of renderer into the entry chunk for every visitor.
 * The renderer itself lives in pdf-export.ts, which is
 * loaded on demand when Export PDF is pressed.
 * ================================================== */

import type {
  DynamicWithdrawal,
  FeatureToggles,
  PlanInputs,
  SliderValues,
  TogglesState,
} from "../types/types";
import {
  DEFAULT_VOLATILITY,
  MONTHS_PER_YEAR,
  PERCENTAGE_DIVISOR,
  laneKey,
} from "../constants/app-constants";
import type { LaneId } from "../constants/app-constants";
import { formatCurrency } from "./format";
import { LANE_CORRELATION } from "./monte-carlo";

/* ---------- Types ---------- */

export interface PdfKeyValue {
  label: string;
  value: string;
}

/**
 * What planAssumptions needs of a lane, which is strictly less than a Lane:
 * naming the three fields keeps this module free of lane-model and lets a
 * test state a plan rather than build one.
 */
export interface AssumptionLane {
  id: LaneId;
  initialAmount: number;
  plan: PlanInputs;
  /**
   * The balance this lane holds when its first withdrawal is taken, which is
   * what an initial draw rate has to be measured against. Optional because it
   * is a simulated quantity rather than a setting: a caller that has not built
   * the lane simply gets no rate row.
   */
  balanceAtFirstWithdrawal?: number;
  /**
   * The first withdrawal the engine actually made, in nominal dollars - the
   * same figure the Key Metrics "Withdrawal" row prints as the bottom of its
   * drawn range, and the only correct numerator for a rate whose denominator
   * is a nominal balance.
   *
   * It cannot be reconstructed from the slider. Under a tax the slider holds
   * spending and the draw is grossed up; under indexed spending the slider is
   * a TODAY'S-DOLLARS instruction and the draw is escalated by inflation to
   * the withdrawal date. Rebuilding it here got the first right and the second
   * wrong, which put a real numerator over a nominal denominator and
   * understated a 20-year-deferred draw by 45%.
   */
  firstWithdrawal?: number;
}

/* ---------- Report data helpers ---------- */

/**
 * Assumption rows describing a lane's dynamic withdrawal policy.
 *
 * The guardrails are printed as entered, which under a withdrawal tax means
 * they are SPENDABLE figures while the clamp the plan applies is each of them
 * divided by (1 - t). Saying so matters because the Key Metrics section of the
 * same report prints the drawn range, which at a 25% rate legitimately exceeds
 * the ceiling stated here by a third: a reader with only the PDF would
 * otherwise conclude the draw was capped at the printed figure with the tax
 * taken out of it, which is the wrong reading in both directions.
 *
 * The RATE carries no such qualifier because it needs none - it is a draw on
 * the balance and is deliberately not grossed up.
 */
export function dynamicWithdrawalAssumptions(
  lane: string,
  policy: DynamicWithdrawal,
  taxPct = 0,
): PdfKeyValue[] {
  const guardrail = (amount: number) =>
    taxPct > 0
      ? `${formatCurrency(amount)}/mo spendable (${formatCurrency(amount / (1 - taxPct / PERCENTAGE_DIVISOR))}/mo drawn)`
      : `${formatCurrency(amount)}/mo`;
  return [
    {
      label: `Withdrawal Rate (${lane})`,
      value: `${policy.ratePct}% of balance`,
    },
    {
      label: `Withdrawal Floor (${lane})`,
      value: guardrail(policy.floor),
    },
    {
      label: `Withdrawal Ceiling (${lane})`,
      value: guardrail(policy.ceiling),
    },
  ];
}

/**
 * The entered return rate, plus what it actually compounds to when they
 * differ.
 *
 * Both engines apply an annual rate X as twelve months of X/12, so X is a
 * NOMINAL rate and a year returns (1 + X/1200)^12 - 1. That convention is
 * deliberate and is what DEFAULT_VOLATILITY is calibrated against - changing
 * it would silently recalibrate every band - but it was stated only in source
 * comments, so nothing the user ever saw distinguished the 10% they typed
 * from the 10.47% the plan grew at.
 */
const effectiveRateLabel = (annualPct: number): string => {
  const effective =
    (Math.pow(
      1 + annualPct / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR,
      MONTHS_PER_YEAR,
    ) -
      1) *
    PERCENTAGE_DIVISOR;
  // A rate of 0 compounds to 0, and rounding hides the difference below about
  // 0.1%; printing "0% nominal (0.00% effective)" would be noise, not
  // disclosure
  return Math.abs(effective - annualPct) < 0.005
    ? `${annualPct}%`
    : `${annualPct}% nominal (${effective.toFixed(2)}% effective)`;
};

/** Whether money actually leaves this plan, by either withdrawal mechanism */
const withdraws = (p: PlanInputs): boolean =>
  p.dynamicWithdrawal !== undefined || p.monthlyWithdrawal > 0;

/**
 * The opening draw rate of a FIXED withdrawal, which a dynamic policy states
 * for itself and a dollar figure cannot.
 *
 * Measured on what leaves the PORTFOLIO against the balance the plan is
 * holding when the first withdrawal is taken - so under a tax it is the
 * grossed-up draw, not the spendable figure, because sustainability is a
 * question about the portfolio. Absent rather than zero when the lane never
 * withdraws or the balance is not known.
 */
const initialWithdrawalRateRow = (l: AssumptionLane): PdfKeyValue[] => {
  const {
    plan: p,
    balanceAtFirstWithdrawal: balance,
    firstWithdrawal: drawn,
  } = l;
  if (
    !(p.monthlyWithdrawal > 0) ||
    balance === undefined ||
    !(balance > 0) ||
    drawn === undefined ||
    !(drawn > 0)
  ) {
    return [];
  }
  // BOTH SIDES NOMINAL, and the numerator is the engine's own figure rather
  // than anything rebuilt from the slider - see AssumptionLane.firstWithdrawal
  // for what rebuilding it got wrong.
  const rate = ((drawn * MONTHS_PER_YEAR) / balance) * PERCENTAGE_DIVISOR;
  return [
    {
      label: `Initial Withdrawal Rate (${l.id})`,
      value: `${rate.toFixed(2)}% of ${formatCurrency(Math.round(balance))} at first withdrawal`,
    },
  ];
};

/**
 * The tools that were available and did not run, named for the report.
 *
 * Only the three whose absence removes rows silently. Rollover already prints
 * "Not applied" in its own rows, and the spending rule is now stated in both
 * of its states, so neither belongs here.
 */
const notModelled = (toggles: TogglesState): string[] =>
  (
    [
      ["fees", "fees"],
      ["taxes", "withdrawal tax"],
      ["monteCarlo", "Monte Carlo"],
    ] as const
  )
    .filter(([key]) => !toggles[key])
    .map(([, name]) => name);

/**
 * Every Assumptions row of a PDF report: what the plan was, per lane, plus
 * the whole-plan settings that shaped it.
 *
 * It lives HERE, as a pure function of a built plan, rather than inside the
 * hub's render. The rows never reach the DOM - they are handed straight to
 * the renderer - so a component test cannot see them, and four of them are
 * the only place an exported report says what a simulated figure rests on.
 * The volatility row in particular exists because a ruin percentage exported
 * with no sigma beside it cannot be reproduced by whoever reads the PDF next,
 * and a row nothing can assert is a row that can quietly stop being printed.
 *
 * The block lists SETTINGS IN FORCE, not the quantities they happen to bite
 * on: Fees prints "0%", Taxes prints "0% of every dollar drawn", and a lane
 * that never withdraws still prints "$0". That is why nothing here hides
 * itself when its setting does no work.
 */
export function planAssumptions(
  lanes: readonly AssumptionLane[],
  toggles: TogglesState,
  sliders: SliderValues,
): PdfKeyValue[] {
  const on = (key: keyof FeatureToggles) => toggles.advanced && toggles[key];
  const laneRows = (l: AssumptionLane): PdfKeyValue[] => {
    const { id, plan: p } = l;
    return [
      {
        label: `Initial Amount (${id})`,
        value: formatCurrency(l.initialAmount),
      },
      {
        // Both engines apply an annual rate X as twelve months of X/12, so the
        // figure the user typed is a NOMINAL rate and the plan compounds at
        // (1 + X/1200)^12 - 1. At 10% that is 10.47%, and it is worth 12% of
        // the ending balance over 30 years. The convention is deliberate and
        // load-bearing - DEFAULT_VOLATILITY is calibrated against it - but it
        // was documented only where developers read, so a reader reconciling
        // this report against their own spreadsheet had no way to know which
        // of the two rates the plan had used. The effective figure is printed
        // only when it differs from the entered one, so a 0% plan says "0%".
        label: `Return Rate (${id})`,
        value: effectiveRateLabel(p.projectedGain),
      },
      { label: `Years (${id})`, value: `${p.yearsOfGrowth}` },
      {
        label: `Monthly Contribution (${id})`,
        value: formatCurrency(p.monthlyContribution),
      },
      ...(p.dynamicWithdrawal
        ? dynamicWithdrawalAssumptions(
            id,
            p.dynamicWithdrawal,
            p.withdrawalTaxPct,
          )
        : [
            {
              // Says which of the two figures it is whenever they differ:
              // under a tax the slider holds spending, not the draw, and the
              // Key Metrics row on the same page prints the draw
              label: `Monthly Withdrawal (${id})`,
              value: p.withdrawalTaxPct
                ? `${formatCurrency(p.monthlyWithdrawal)} spendable`
                : formatCurrency(p.monthlyWithdrawal),
            },
            // The same figure a dynamic policy prints as "Withdrawal Rate", for
            // the lane that states its draw in dollars instead. A dollar
            // withdrawal carries no scale: $3,414/mo is prudent against one
            // balance and 9% a year against another, and only the second
            // reading answers whether the plan is drawing too hard. The report
            // had no way to say which without the reader dividing by hand.
            //
            // Stated, not judged. There is no threshold and no warning icon:
            // this app deliberately stopped labelling any figure a safe
            // withdrawal rate (see Lane.growthCoversDraw), because safety
            // depends on horizon, sequence and spending flexibility that a
            // ratio does not carry. The rows that DO answer sustainability -
            // "Runs Out" and "Chance of Running Out" - are already on the page.
            ...initialWithdrawalRateRow(l),
          ]),
      ...(on("fees")
        ? [{ label: `Annual Fee (${id})`, value: `${p.annualFeePct ?? 0}%` }]
        : []),
      ...(on("taxes")
        ? [
            {
              label: `Withdrawal Tax (${id})`,
              value: `${p.withdrawalTaxPct ?? 0}% of every dollar drawn`,
            },
          ]
        : []),
      ...(on("monteCarlo")
        ? [
            {
              label: `Volatility (${id})`,
              value: `${sliders[laneKey("volatility", id)] ?? DEFAULT_VOLATILITY}% \u03c3`,
            },
          ]
        : []),
    ];
  };
  return [
    ...lanes.flatMap(laneRows),
    { label: "Inflation Rate", value: `${lanes[0]?.plan.inflationPct ?? 0}%` },
    // Printed in BOTH states, unlike the tool rows above it, and the exception
    // is deliberate. Fees and Taxes off mean a quantity of zero, which the
    // withdrawal figures already show. Indexed spending off is not zero of
    // anything - it is the other model, and a materially different one:
    // holding a fixed withdrawal flat in nominal dollars rather than raising
    // it with inflation is worth about 45% of a 30-year plan's ending balance,
    // and moves ruin on a stressed plan from 20.8% to 52.7%. With the row
    // absent, the two runs printed identical withdrawal figures and a reader
    // could not tell which of them had produced the outcome beside it.
    //
    // Gated on advanced mode AND a lane actually withdrawing, because with
    // nothing going out there is no spending to index and the row would
    // describe nothing. Basic mode resolves every withdrawal to zero, so an
    // exported basic report must not claim a spending rule it never applied.
    ...(toggles.advanced && lanes.some((l) => withdraws(l.plan))
      ? [
          {
            label: "Spending",
            value: on("spendingKeepsPace")
              ? "Fixed withdrawals rise with inflation"
              : "Fixed withdrawals stay flat in nominal dollars",
          },
        ]
      : []),
    // What the report does NOT rest on, named once rather than left as an
    // absence for the reader to notice.
    //
    // The block's rule is that it lists settings IN FORCE, and for a quantity
    // that rule is right: a 0% fee changes no figure, and its row appearing
    // only with the tool on costs the reader nothing. Monte Carlo is not a
    // quantity. Switching it off removes the volatility, the return model, the
    // correlation, three percentiles and every chance-of-running-out row - the
    // report's whole statement about risk - and an absence of eight rows reads
    // exactly like an app that cannot model risk at all. That was the
    // complaint behind the spending row, arriving on a different set of
    // fields.
    //
    // One row rather than a "not applied" line per tool: the point is to close
    // the gap between "did not run" and "cannot run", which one sentence does.
    ...(toggles.advanced && notModelled(toggles).length > 0
      ? [
          {
            label: "Not Modelled",
            value: notModelled(toggles).join(", "),
          },
        ]
      : []),
    ...(on("monteCarlo")
      ? [
          {
            label: "Return Model",
            value:
              toggles.returnModel === "clustered"
                ? "Clustered (bad years arrive in runs)"
                : "Independent (each year drawn on its own)",
          },
        ]
      : []),
    // The one assumption on this page the user never chose, printed for
    // exactly that reason.
    //
    // A combined 10th percentile is a claim about how two accounts fail
    // TOGETHER, and it is not reproducible from anything else on the page.
    // The engine used to draw the two lanes from unrelated markets - nobody
    // chose that either; it fell out of simulating one lane after the other -
    // and the figure it produced was not a portfolio floor but a
    // diversification artifact: on the taxed two-lane plan this suite pins,
    // the 10th percentile it printed was $146,165 where the correlated answer
    // is $0. It also moves the any-account ruin row by up to nine points,
    // downwards, because two accounts in one market run dry in the same runs.
    // A reader holding only the PDF cannot tell those two readings apart
    // without this row, which is the same argument the Volatility row above
    // is here for.
    //
    // Gated on two lanes because one account has nothing to move with - not
    // on the Monte Carlo MODE, even though individual mode never sums the two
    // and the number does no work there. This block lists settings in force,
    // not the quantities they happen to bite on; that is why Fees prints "0%".
    ...(on("monteCarlo") && lanes.length > 1
      ? [
          {
            label: "Account Correlation",
            value: `${LANE_CORRELATION} - both accounts move with one market, not independently`,
          },
        ]
      : []),
  ];
}
