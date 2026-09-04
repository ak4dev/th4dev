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

import type { DynamicWithdrawal } from "../types/types";
import { formatCurrency } from "./format";

/* ---------- Types ---------- */

export interface PdfKeyValue {
  label: string;
  value: string;
}

/* ---------- Report data helpers ---------- */

/** Assumption rows describing a lane's dynamic withdrawal policy */
export function dynamicWithdrawalAssumptions(
  lane: string,
  policy: DynamicWithdrawal,
): PdfKeyValue[] {
  return [
    {
      label: `Withdrawal Rate (${lane})`,
      value: `${policy.ratePct}% of balance`,
    },
    {
      label: `Withdrawal Floor (${lane})`,
      value: `${formatCurrency(policy.floor)}/mo`,
    },
    {
      label: `Withdrawal Ceiling (${lane})`,
      value: `${formatCurrency(policy.ceiling)}/mo`,
    },
  ];
}
