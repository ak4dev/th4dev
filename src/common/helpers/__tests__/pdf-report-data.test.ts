/* ==================================================
 * PDF Report Data
 *
 * The Assumptions block never reaches the DOM - it is
 * handed straight to the renderer - so nothing the
 * component suite can read sees it. These are the only
 * assertions on what an exported report claims the plan
 * was, which matters most for the rows that say what a
 * SIMULATED figure rests on: a ruin percentage exported
 * with no sigma beside it cannot be reproduced by whoever
 * reads the PDF next.
 * ================================================== */

import { describe, it, expect } from "vitest";
import {
  dynamicWithdrawalAssumptions,
  planAssumptions,
  type AssumptionLane,
} from "../pdf-report-data";
import { DEFAULT_SLIDERS, DEFAULT_TOGGLES } from "../state-manager";
import type { PlanInputs, TogglesState } from "../../types/types";

const plan = (o: Partial<PlanInputs> = {}): PlanInputs => ({
  initialAmount: 250_000,
  projectedGain: 7,
  yearsOfGrowth: 30,
  monthlyContribution: 500,
  monthlyWithdrawal: 2000,
  withdrawalStartYear: 10,
  inflationPct: 2.5,
  ...o,
});

const lane = (id: "A" | "B", o: Partial<PlanInputs> = {}): AssumptionLane => ({
  id,
  initialAmount: o.initialAmount ?? 250_000,
  plan: plan(o),
});

const rows = (
  toggles: Partial<TogglesState>,
  lanes: AssumptionLane[] = [lane("A")],
  sliders = DEFAULT_SLIDERS,
) =>
  Object.fromEntries(
    planAssumptions(lanes, { ...DEFAULT_TOGGLES, ...toggles }, sliders).map(
      (r) => [r.label, r.value],
    ),
  );

describe("planAssumptions", () => {
  it("states the plan itself whatever the tools are", () => {
    expect(rows({})).toEqual({
      "Initial Amount (A)": "$250,000",
      "Return Rate (A)": "7%",
      "Years (A)": "30",
      "Monthly Contribution (A)": "$500",
      "Monthly Withdrawal (A)": "$2,000",
      "Inflation Rate": "2.5%",
    });
  });

  it("names the volatility every simulated figure rests on", () => {
    // Sigma moves the depletion figure further than any other single input,
    // and the Key Metrics section prints four figures that depend on it. A
    // ruin percentage exported without it cannot be reproduced.
    const r = rows({ advanced: true, monteCarlo: true });
    expect(r["Volatility (A)"]).toBe("18% σ");
    expect(r["Return Model"]).toBe("Clustered (bad years arrive in runs)");
    expect(
      rows({ advanced: true, monteCarlo: true, returnModel: "normal" })[
        "Return Model"
      ],
    ).toBe("Independent (each year drawn on its own)");
    // ...and neither row appears for a report with no simulation in it
    expect(rows({ advanced: true })["Volatility (A)"]).toBeUndefined();
    expect(rows({ advanced: true })["Return Model"]).toBeUndefined();
  });

  it("says which figure the withdrawal is once a tax makes them differ", () => {
    // The Key Metrics section on the same page prints the DRAWN figure, which
    // is a third larger. Without the qualifier the two sections state two
    // different numbers for the same slider and neither says which is which.
    const taxed = rows({ advanced: true, taxes: true }, [
      lane("A", { withdrawalTaxPct: 25 }),
    ]);
    expect(taxed["Monthly Withdrawal (A)"]).toBe("$2,000 spendable");
    expect(taxed["Withdrawal Tax (A)"]).toBe("25% of every dollar drawn");
    // Unqualified when there is nothing to disambiguate
    expect(rows({ advanced: true })["Monthly Withdrawal (A)"]).toBe("$2,000");
  });

  it("records a spending rule that changes what the plan draws", () => {
    expect(rows({ advanced: true, spendingKeepsPace: true })["Spending"]).toBe(
      "Fixed withdrawals rise with inflation",
    );
  });

  it("runs no tool the plan is not actually running", () => {
    // Basic mode resolves every tool off, so an exported report of a basic
    // plan must not claim fees, taxes or a simulation it never ran
    const basic = rows({
      fees: true,
      taxes: true,
      monteCarlo: true,
      spendingKeepsPace: true,
    });
    for (const label of [
      "Annual Fee (A)",
      "Withdrawal Tax (A)",
      "Volatility (A)",
      "Return Model",
      "Spending",
    ]) {
      expect(basic[label], label).toBeUndefined();
    }
  });

  it("names every lane it was handed, and closes with the plan's inflation", () => {
    const both = planAssumptions(
      [lane("A"), lane("B", { projectedGain: 5 })],
      { ...DEFAULT_TOGGLES, advanced: true },
      DEFAULT_SLIDERS,
    );
    expect(both.filter((r) => r.label.endsWith("(B)"))).not.toHaveLength(0);
    expect(both.at(-1)).toEqual({ label: "Inflation Rate", value: "2.5%" });
  });
});

describe("dynamicWithdrawalAssumptions", () => {
  const policy = { ratePct: 4, floor: 1000, ceiling: 3000 };

  it("prints the guardrails as entered when nothing is taxed", () => {
    expect(dynamicWithdrawalAssumptions("A", policy)).toEqual([
      { label: "Withdrawal Rate (A)", value: "4% of balance" },
      { label: "Withdrawal Floor (A)", value: "$1,000/mo" },
      { label: "Withdrawal Ceiling (A)", value: "$3,000/mo" },
    ]);
  });

  it("says which figure a guardrail is once a tax makes them differ", () => {
    // The clamp the engine applies is the printed figure divided by (1 - t),
    // so the Key Metrics range legitimately exceeds the stated ceiling by a
    // third. A reader with only the PDF would otherwise conclude the draw was
    // capped at $3,000 with the tax taken out of it - wrong in both
    // directions. The RATE needs no qualifier: it is deliberately not grossed.
    const taxed = dynamicWithdrawalAssumptions("A", policy, 25);
    expect(taxed[0].value).toBe("4% of balance");
    expect(taxed[1].value).toBe("$1,000/mo spendable ($1,333/mo drawn)");
    expect(taxed[2].value).toBe("$3,000/mo spendable ($4,000/mo drawn)");
  });
});
