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
  PERCENTAGE_DIVISOR,
  laneKey,
} from "../constants/app-constants";
import type { LaneId } from "../constants/app-constants";
import { formatCurrency } from "./format";

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
      { label: `Return Rate (${id})`, value: `${p.projectedGain}%` },
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
    ...(on("spendingKeepsPace")
      ? [
          {
            label: "Spending",
            value: "Fixed withdrawals rise with inflation",
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
  ];
}
