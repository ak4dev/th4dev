/* ==================================================
 * Investment Calculator Component
 * ================================================== */
import { useMemo, useCallback, useDeferredValue } from "react";
import type { Dispatch, SetStateAction } from "react";
import * as Popover from "@radix-ui/react-popover";
import { addMonths } from "date-fns/addMonths";
import { differenceInCalendarMonths } from "date-fns/differenceInCalendarMonths";
import { styled, keyframes } from "../../stitches.config";
import {
  planAnchor,
  toMonths,
} from "../common/helpers/investment-growth-calculator";
import { formatCurrency } from "../common/helpers/format";
import {
  buildLanes,
  isDynamic,
  isRollover,
  isTool,
  solveLaneTarget,
  type Lane,
} from "../common/helpers/lane-model";
import { PanelContainer } from "./ui/primitives";
import {
  planAssumptions,
  type PdfKeyValue,
} from "../common/helpers/pdf-report-data";
import DateAmountTable from "./date-amount-table";
import { InvestmentLineChart } from "./investment-line-chart";
import PortfolioPanel from "./portfolio/PortfolioPanel";
import { portfolioLane } from "./portfolio/portfolio-lane";
import LanePanel from "./calculator/LanePanel";
import {
  HelperText,
  InvestmentSlider,
  ToggleSwitch,
} from "./calculator/NumericInputs";
import FirePanel from "./fire/FirePanel";
import ScenarioPanel from "./scenarios/ScenarioPanel";
import PdfExportButton from "./export/PdfExportButton";
import BudgetPanel from "./budget/BudgetPanel";
import type { BudgetItem } from "../common/helpers/budget-manager";
import type { ScenarioSnapshot } from "../common/helpers/scenario-manager";
import {
  DEFAULT_INFLATION_RATE,
  DEFAULT_FIRE_ANNUAL_EXPENSES,
  DEFAULT_FIRE_SWR,
  DEFAULT_FIRE_CURRENT_AGE,
  DEFAULT_FIRE_RETIREMENT_AGE,
  MAX_INFLATION_RATE,
  DEFAULT_VOLATILITY,
  MAX_VOLATILITY,
  MONTE_CARLO_SEED,
  MIN_VALUE,
} from "../common/constants/app-constants";
import type { InputKey, SliderKey } from "../common/constants/app-constants";
import {
  NO_BANDS,
  resolveMcMode,
  runMonteCarlo,
  toMcParams,
  type McInput,
} from "../common/helpers/lane-monte-carlo";
import { useJsonMemo } from "../common/hooks/useJsonMemo";
import type { PercentileBand } from "../common/helpers/monte-carlo";
import { clampSlider } from "../common/helpers/state-manager";
import type { PortfolioHolding } from "../common/types/portfolio-types";
import type {
  FeatureToggles,
  InputValues,
  PlanInputs,
  SliderValues,
  TH4State,
  TogglesState,
} from "../common/types/types";

/* ---------------- Styles & Animations ---------------- */
const fadeInUp = keyframes({
  "0%": { opacity: 0, transform: "translateY(6px)" },
  "100%": { opacity: 1, transform: "translateY(0)" },
});
const Container = styled("div", {
  backgroundColor: "$background",
  color: "$foreground",
  fontFamily: "$body",
  minHeight: "100vh",
  padding: "24px",
  borderRadius: "16px",
  border: "2px solid $cyan",
  transition: "border-color 0.3s ease",
});
const Grid = styled("div", {
  display: "grid",
  gap: "24px",
  gridTemplateColumns: "1fr",
  "@media(min-width:1024px)": { gridTemplateColumns: "1fr 1fr 1fr" },
});
const AmountsGrid = styled("div", {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "24px",
  marginTop: "24px",
});
/**
 * The totals box IS the popover trigger rather than a <div> inside one: a
 * <button> may not contain a <div>, the wrapper drew UA button chrome around
 * the styled box, and the hover/cursor styling belonged on the element the
 * user actually activates. `all: unset` clears that chrome, so the three
 * properties it also clears are restored explicitly.
 */
const AmountBox = styled(Popover.Trigger, {
  all: "unset",
  boxSizing: "border-box",
  display: "block",
  width: "100%",
  backgroundColor: "$currentLine",
  color: "$foreground",
  borderRadius: "8px",
  padding: "12px 16px",
  fontWeight: 600,
  fontSize: "1.25rem",
  textAlign: "center",
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  cursor: "pointer",
  transition: "all 0.2s ease",
  "&:hover": { boxShadow: "0 6px 16px rgba(0,0,0,0.25)" },
  // `all: unset` also removes the focus ring, which a keyboard user needs
  "&:focus-visible": { outline: "2px solid $purple", outlineOffset: "2px" },
});
const PopoverContent = styled(Popover.Content, {
  backgroundColor: "$currentLine",
  color: "$foreground",
  borderRadius: "12px",
  padding: "16px",
  minWidth: "200px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
  animation: `${fadeInUp.toString()} 0.2s ease`,
});
const InfoGrid = styled("div", {
  display: "grid",
  gap: "8px",
  gridTemplateColumns: "1fr",
  marginTop: "16px",
});
const InfoRow = styled("div", {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "$comment",
});
/** Fixed-width columns so toggle labels and switches align vertically */
const TogglesGrid = styled("div", {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(2, minmax(140px, 1fr))",
});

const ToggleSection = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
});

const SectionLabel = styled("span", {
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "$comment",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.7,
});

const VolatilityRow = styled("div", {
  display: "flex",
  gap: "1rem",
  alignItems: "flex-start",
  "& > *": { flex: 1 },
});

/* ---------------- Toggles ---------------- */

const TOOL_TOGGLES: [keyof FeatureToggles, string][] = [
  ["rollover", "Rollover"],
  ["fees", "Fees"],
  ["portfolio", "Portfolio"],
  ["monteCarlo", "Monte Carlo"],
  ["fire", "FIRE"],
  ["scenarios", "Scenarios"],
  ["budget", "Budget"],
  ["dynamicWithdrawal", "Dynamic Withdrawal"],
  ["taxes", "Taxes"],
  ["spendingKeepsPace", "Indexed Spending"],
];

/* ---------------- Info Panel Rows ---------------- */

// Fractional year offsets are converted to whole months so partial years
// (e.g. 10.5) render the correct mid-year date.
//
// All three take the plan's anchor rather than reading the clock: they used
// to call `new Date()` once apiece, so a row printed either side of midnight
// could disagree with the matrix dates and with the row above it.
const dateAfterMonths = (today: Date, months: number): string =>
  addMonths(today, months).toDateString();
const dateAfterYears = (today: Date, years: number): string =>
  dateAfterMonths(today, Math.round(years * 12));
const yearsFromToday = (today: Date, d: Date): number =>
  differenceInCalendarMonths(d, today) / 12;

/**
 * What a plan actually paid, per month, in NOMINAL dollars - which is what
 * the schedule records whichever display mode the panel is in.
 *
 * The last payment before the money ran out is the BALANCE, not the amount the
 * plan asked for, so it is stripped: leaving it in prints a dying gasp of $107
 * as the bottom of what reads like a policy range. Both callers below share
 * this so that the range means the same thing in both rows - they did not, and
 * the fixed one printed the gasp while the dynamic one filtered it.
 */
const paidRange = (l: Lane): number[] => {
  const depletedAt = l.calc.getDepletedAtMonth();
  const beforeRunningDry =
    depletedAt === undefined
      ? l.withdrawals
      : l.calc
          .getWithdrawalSchedule()
          .slice(0, depletedAt)
          .filter((m) => m > 0);
  return beforeRunningDry.length > 0 ? beforeRunningDry : l.withdrawals;
};

/** "$X/mo", or "$X–$Y/mo" where the two ends differ */
const moRange = (values: number[]): string => {
  const low = formatCurrency(Math.min(...values));
  const high = formatCurrency(Math.max(...values));
  return low === high ? `${low}/mo` : `${low}–${high}/mo`;
};

/**
 * What a tax leaves the user out of a range that LEFT the portfolio.
 *
 * Both rows below print a drawn figure, so both owe the reader the other half
 * of it. Without this the dynamic row was byte-identical at 0% and at 40% tax:
 * a percentage-of-balance rate is deliberately not grossed up, so nothing in
 * the drawn figure moved, and the row never named what was actually spendable.
 */
const spendableNote = (l: Lane, paid: number[]): string[] => {
  const tax = l.plan.withdrawalTaxPct ?? 0;
  if (!tax) return [];
  return [`${moRange(paid.map((m) => m * (1 - tax / 100)))} spendable`];
};

/**
 * The word below is "drawn", never "gross": the "Growth covers draw from" row
 * in the same panel already prints "$X/mo gross" for a growth figure, where
 * gross means before fees and inflation. Two orthogonal senses of one word in
 * one info panel is how a reader ends up confidently misreading both.
 *
 * The two ends of a policy's range each moved in meaning once guardrails
 * became inflation-indexed: a floor equal to the ceiling still spans a range,
 * because the guardrails rise with inflation. So the range collapses to a
 * single figure only when the policy never moved, and the notes say why.
 */
const dynamicWithdrawalRange = (
  l: Lane,
  { ratePct }: NonNullable<PlanInputs["dynamicWithdrawal"]>,
): string => {
  const paid = paidRange(l);
  const notes = [`${ratePct}% of balance`];
  // A binding ceiling has turned the policy into a fixed withdrawal, and the
  // default ceiling is the slider span rather than a figure anyone picked, so
  // the row says so instead of printing a flat number that looks like a policy
  if (l.ceilingBinds) notes.push("held at the ceiling");
  if (l.plan.inflationPct > 0) notes.push("guardrails indexed");
  notes.push(...spendableNote(l, paid));
  return `${moRange(paid)} drawn nominal (${notes.join(", ")})`;
};

/**
 * What a FIXED withdrawal actually costs the portfolio, and what reaches the
 * user, once tax and indexed spending have had their say.
 */
const fixedWithdrawalRange = (l: Lane): string => {
  if (l.withdrawals.length === 0) return "N/A";
  const paid = paidRange(l);
  const notes = [`${formatCurrency(l.plan.monthlyWithdrawal)}/mo spendable`];
  if (l.plan.spendingKeepsPace) notes.push("indexed");
  return `${moRange(paid)} drawn nominal (${notes.join(", ")})`;
};

/**
 * A risk share as a percentage. A real but small risk is shown as "<1%"
 * rather than rounded to a "0%" that reads as impossible.
 */
const riskPct = (risk: number): string =>
  risk > 0 && risk < 0.005 ? "<1%" : `${Math.round(risk * 100)}%`;

/**
 * Percentile summary of one band set at its horizon.
 *
 * These three rows describe ONE POOL - the portfolio the band set was drawn
 * on - and nothing else is allowed to share their label. The depletion figure
 * used to, and that was the whole defect: in combined mode "(A+B) Chance of
 * Running Out" sat under "(A+B) 10th Percentile" while measuring something
 * else entirely (see ruinRows). On a plan whose first lane draws 9% a year
 * beside a second lane that only saves, the two rows read as one story about
 * one pot and were in fact a statement about the small lane's survival next
 * to a percentile made almost entirely of the large lane's money.
 */
const mcRows = (label: string, bands: PercentileBand[]): PdfKeyValue[] => {
  const last = bands.at(-1);
  if (!last) return [];
  return [
    { label: `(${label}) Median Outcome`, value: formatCurrency(last.p50) },
    // A percentile is the boundary of a decile, not the outcome of it:
    // "Worst 10%: $X" reads as "the bad case is $X" when in fact one path in
    // ten ends below X. The gloss goes in the value column, which has room.
    {
      label: `(${label}) 90th Percentile`,
      value: `${formatCurrency(last.p90)} (1 in 10 end above)`,
    },
    {
      label: `(${label}) 10th Percentile`,
      // A P10 of exactly $0 is the one case where "1 in 10 end below" is not
      // just imprecise but backwards: nothing ends below zero, so the gloss
      // reads as "one in ten do badly" for a plan where far more than one in
      // ten ended with nothing at all. It understated the share by over four
      // times on the plan this was found on - 42.8% ending broke, printed
      // beside a figure that implied 10%. Where the decile boundary has hit
      // the floor, the honest statement is the measured share itself.
      value:
        last.p10 <= 0
          ? `${formatCurrency(0)} (${Math.round(last.depletedPct * 100)}% end with nothing)`
          : `${formatCurrency(last.p10)} (1 in 10 end below)`,
    },
  ];
};

/**
 * The depletion rows, which describe ACCOUNTS and say which ones.
 *
 * Four rules, each of them the answer to a way the old single row misled:
 *
 * 1. Every row names the pool it measures. A per-account figure carrying the
 *    portfolio's label is the defect this whole block exists to close.
 * 2. A row is printed only for an account that actually withdraws. One that
 *    never spends cannot run dry, and "0%" there is an answer to a question
 *    nobody asked - the rule the percentile block has always followed.
 * 3. The roll-up is printed only when BOTH accounts spend. When one of them
 *    does, any-account ruin IS that account's ruin, and printing "(A) 21%",
 *    "(B) 0%", "(A or B) 21%" is three rows for one fact.
 * 4. A ROLLOVER is reported differently, because after the roll there are no
 *    longer two accounts to break down: lane B has become the whole portfolio
 *    and a "(B)" row would sit under "(Portfolio)" percentiles describing the
 *    same money by a different name - while latching a failure its own $20,000
 *    side pot had eighteen years before the roll refunded it. So a rollover
 *    prints the union under the portfolio's own name, plus the one
 *    decomposition that stays meaningful: whether the bridge account ran dry
 *    before it could roll.
 *
 * "(A or B)" against "(A+B)" is a two-character difference, so the roll-up
 * sits directly beneath its two components rather than beside the summed
 * percentiles, and its value column spells the distinction out in words.
 */
interface RuinLane {
  id: string;
  withdrawing: boolean;
}

const ruinRows = (
  bands: PercentileBand[],
  lanes: RuinLane[],
  rollover?: { today: Date; month: number },
): PdfKeyValue[] => {
  const last = bands.at(-1);
  if (!last) return [];
  const [a, b] = lanes;
  const legs = last.legDepletion;
  // A single-lane band set has no accounts to break down: the portfolio and
  // the account are the same thing, so the plain figure is already correct.
  //
  // Where a breakdown IS present but only one lane was named, the account's
  // own leg is read rather than the union. Belt and braces: the caller is
  // meant to hand over every lane a portfolio band set was built from, and a
  // mis-sized list is exactly how the union came to be printed under one
  // account's name before. It cannot happen twice for the same reason.
  if (!legs || !b) {
    return a?.withdrawing
      ? [
          {
            label: `(${a.id}) Chance of Running Out`,
            value: riskPct(legs ? legs.a.depletedPct : last.depletedPct),
          },
        ]
      : [];
  }
  if (rollover) {
    return [
      ...(a.withdrawing
        ? [
            {
              label: `(${a.id}) Runs Dry Before Rollover`,
              value: `${riskPct(legs.a.depletedPct)} (by ${dateAfterMonths(rollover.today, rollover.month)})`,
            },
          ]
        : []),
      ...(a.withdrawing || b.withdrawing
        ? [
            {
              label: "(Portfolio) Chance of Running Out",
              value: `${riskPct(last.depletedPct)} (either account, not the total)`,
            },
          ]
        : []),
    ];
  }
  const perLeg = [[a, legs.a] as const, [b, legs.b] as const].flatMap(
    ([lane, leg]) =>
      lane.withdrawing
        ? [
            {
              label: `(${lane.id}) Chance of Running Out`,
              value: riskPct(leg.depletedPct),
            },
          ]
        : [],
  );
  return [
    ...perLeg,
    ...(a.withdrawing && b.withdrawing
      ? [
          {
            label: `(${a.id} or ${b.id}) Chance of Running Out`,
            value: `${riskPct(last.depletedPct)} (either account, not the total)`,
          },
        ]
      : []),
  ];
};

/* ---------------- Types ---------------- */

interface InvestmentCalculatorModernProps {
  sliders: SliderValues;
  setSliders: Dispatch<SetStateAction<SliderValues>>;
  inputs: InputValues;
  setInputs: Dispatch<SetStateAction<InputValues>>;
  toggles: TogglesState;
  setToggles: Dispatch<SetStateAction<TogglesState>>;
  stockApiUrl: string;
  stockHoldings: PortfolioHolding[];
  setStockHoldings: Dispatch<SetStateAction<PortfolioHolding[]>>;
  budgetItems: BudgetItem[];
  setBudgetItems: Dispatch<SetStateAction<BudgetItem[]>>;
  scenarios: ScenarioSnapshot[];
  setScenarios: Dispatch<SetStateAction<ScenarioSnapshot[]>>;
  /**
   * The plan a scenario snapshot is taken of, and the load that applies one.
   *
   * Both come from App, which is the one owner of the state SHAPE. This
   * component used to assemble its own copy of the snapshot and its own copy
   * of the load path, each a subset of App's, and each free to fall behind it
   * whenever a field was added: two components deciding what a plan consists
   * of is the seam that lets them disagree about it.
   */
  currentState: TH4State;
  onLoadScenario: (state: TH4State) => void;
}

/* ---------------- Main Component ---------------- */
export default function InvestmentCalculatorModern({
  sliders,
  setSliders,
  inputs,
  setInputs,
  toggles,
  setToggles,
  stockApiUrl,
  stockHoldings,
  setStockHoldings,
  budgetItems,
  setBudgetItems,
  scenarios,
  setScenarios,
  currentState,
  onLoadScenario,
}: InvestmentCalculatorModernProps) {
  // Every write goes through the same range the import gate applies, so a
  // panel cannot store a value that a later reload would quietly replace:
  // Budget's "Set Withdrawal" and its FIRE feed both push raw totals in here.
  //
  // All three keep one identity for the life of the component: each reads
  // only its own setter, and every one of them is handed to a panel as a
  // prop, so rebuilding them on each render would defeat any memo below.
  const updateSlider = useCallback(
    (key: SliderKey, val: number) =>
      setSliders((prev) => ({ ...prev, [key]: clampSlider(key, val) })),
    [setSliders],
  );
  const updateInput = useCallback(
    (key: InputKey, val: string) =>
      setInputs((prev) => ({ ...prev, [key]: val })),
    [setInputs],
  );
  const updateToggle = useCallback(
    <K extends keyof TogglesState>(key: K, val: TogglesState[K]) =>
      setToggles((prev) => ({ ...prev, [key]: val })),
    [setToggles],
  );
  /* ---------------- Lanes ---------------- */

  // THE clock this whole screen is planned against, read once when the
  // calculator mounts. Both lanes' engines and every date the info panel
  // prints are handed this one value, so a render cannot straddle midnight
  // and describe two different todays; and because it is local midnight, the
  // same plan stamps the same dates all day.
  //
  // Deliberately not a hook that ticks: re-anchoring mid-session would move
  // rows under a reader who changed nothing, in a tool that is reloaded
  // anyway. Mount-scoped is the correct lifetime.
  const today = useMemo(() => planAnchor(), []);

  // Memoized on the three state objects rather than on the ~30 slider and
  // input values they hold: App replaces each of them immutably, so their
  // identities already stand still across an unrelated render, and a list of
  // primitives would be silently wrong the day a slider key is added.
  const {
    A: laneA,
    B: laneB,
    rolloverApplied,
  } = useMemo(
    () => buildLanes({ sliders, inputs, toggles }, today),
    [sliders, inputs, toggles, today],
  );
  const lanes = useMemo(
    () => (toggles.advanced ? [laneA, laneB] : [laneA]),
    [toggles.advanced, laneA, laneB],
  );

  /* ---------------- Monte Carlo Simulation ---------------- */

  const mcMode = resolveMcMode(toggles);

  // The seed is a constant, so the bands are a pure function of the inputs:
  // the same plan draws the same cone on every load and in every export.
  //
  // With the tool off there is no input at all. The parameters used to be
  // assembled, stringified and parsed on every render either way, and
  // runMonteCarlo answered with a fresh pair of empty arrays, which broke the
  // identity of every prop downstream of it.
  const mcInput = useJsonMemo<McInput | null>(
    mcMode === "off"
      ? null
      : {
          a: toMcParams(laneA, {
            volatility: sliders.volatilityA ?? DEFAULT_VOLATILITY,
            seed: MONTE_CARLO_SEED,
            returnModel: toggles.returnModel,
          }),
          b: toMcParams(laneB, {
            volatility: sliders.volatilityB ?? DEFAULT_VOLATILITY,
            seed: MONTE_CARLO_SEED,
            returnModel: toggles.returnModel,
          }),
          mode: mcMode,
          // The Inflated toggle, named. It rides on the INPUT rather than
          // inside the params so the memo re-runs when it flips, and so the
          // engine still never sees a display flag.
          track: laneA.track,
        },
  );
  // Deferring the input lets a slider drag paint the thumb and the
  // deterministic line first and run the simulation on a second,
  // lower-priority render. It buys paint priority, not elimination: a useMemo
  // body cannot be interrupted, so the simulation still blocks the main
  // thread once per deferred render.
  const deferredMcInput = useDeferredValue(mcInput);
  const { mcBandsA, mcBandsB } = useMemo(
    () =>
      deferredMcInput === null ? NO_BANDS : runMonteCarlo(deferredMcInput),
    [deferredMcInput],
  );

  /* ---------------- Target Value Handlers ---------------- */

  /**
   * Commits the lane's goal along with the fixed withdrawal that reaches it,
   * where the mode offers one, atomically. The decision itself is
   * solveLaneTarget's, in lane-model; this is the state write it produces.
   * No other slider is ever part of it.
   */
  const solveTarget = useCallback(
    (lane: Lane, target: number) => {
      const solved = solveLaneTarget(lane, target, toggles);
      // Through the same range the import gate applies, like every other
      // write here: a goal typed past the sanity limit must not come back
      // from a reload as a different number
      setSliders((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(solved).map(([key, value]) => [
            key,
            clampSlider(key as SliderKey, value),
          ]),
        ),
      }));
    },
    [toggles, setSliders],
  );

  // One handler per lane instead of a closure built during render, so a panel
  // is handed the same function until its own lane changes.
  const handleTargetA = useCallback(
    (target: number) => solveTarget(laneA, target),
    [solveTarget, laneA],
  );
  const handleTargetB = useCallback(
    (target: number) => solveTarget(laneB, target),
    [solveTarget, laneB],
  );

  /* ---------------- Info Panel ---------------- */

  // Every row the panel prints, and the same list the PDF takes as its
  // metrics. Rebuilt only when a lane, a toggle or a fresh
  // set of bands actually changes it.
  const infoItems = useMemo<PdfKeyValue[]>(() => {
    const laneRows = (l: Lane): PdfKeyValue[] => {
      const { id, plan: p } = l;
      const stop = p.contributionStopYear;
      const withdrawing = l.withdrawals.length > 0;
      // The contribution twin of `withdrawing`: what the plan actually pays
      // in, not what its stop year says it would pay in if it paid anything
      const contributing = p.monthlyContribution > 0;
      const depletedAt = l.calc.getDepletedAtMonth();
      // Re-derived from the plan on every render (see Lane.targetCapped), so
      // it is never a stale memory of an earlier solve: the withdrawal sits
      // at the bound that would help and the plan still misses the goal
      const capped = l.targetCapped ? " (capped)" : "";
      return [
        ...(toggles.advanced
          ? [
              {
                label: `(${id}) Withdrawal Start`,
                value: withdrawing
                  ? dateAfterYears(today, p.withdrawalStartYear)
                  : "N/A",
              },
              {
                // A stop year of 0 is a real instruction ("stop now"), so only
                // an unset one is N/A - and a lane paying in nothing has no
                // contribution window to close, whatever its stop year says.
                // Without that second gate this row printed a horizon-end date
                // beside "Monthly Contribution: $0", which is the DEFAULT the
                // moment Advanced is switched on, and it sat between
                // "Withdrawal Start: N/A" and "Runs Out: N/A" as the only one
                // of the three declining to say the same thing.
                label: `(${id}) Contributions End`,
                value:
                  !contributing || stop === undefined
                    ? "N/A"
                    : dateAfterYears(today, stop),
              },
              {
                // A plan with no withdrawals cannot run out; one that does and
                // survives says so rather than going quiet.
                //
                // "the plan line" is not decoration. This is the single
                // deterministic path, and in an exported PDF it lands in one
                // flat list of Key Metrics with a simulated "Chance of Running
                // Out" a few rows below it - two correct answers to different
                // questions, reading as one contradiction, with the
                // deterministic one first and therefore authoritative. Naming
                // the engine in the value is what the row can do about that
                // from here; the percentage names its own.
                label: `(${id}) Runs Out`,
                value:
                  depletedAt !== undefined
                    ? `${dateAfterMonths(today, depletedAt)} (plan line)`
                    : withdrawing
                      ? "Not within horizon (plan line)"
                      : "N/A",
              },
              // Printed whenever what LEAVES the portfolio differs from what
              // the user typed - a policy re-reads it from the balance, a tax
              // grosses it up, or both. It used to be gated on the policy
              // alone, which left the commonest taxed case with nothing on
              // screen: a $3,000 slider at a 25% rate draws $4,000 a month and
              // no row, no label and no control said so. Indexed spending is
              // the same case - the payment rises every year and the slider
              // goes on showing the first one.
              ...(p.dynamicWithdrawal ||
              p.withdrawalTaxPct ||
              p.spendingKeepsPace
                ? [
                    {
                      label: `(${id}) Withdrawal`,
                      value: !withdrawing
                        ? "N/A"
                        : p.dynamicWithdrawal
                          ? dynamicWithdrawalRange(l, p.dynamicWithdrawal)
                          : fixedWithdrawalRange(l),
                    },
                  ]
                : []),
            ]
          : []),
        {
          label: `(${id}) Target Reached`,
          value: l.targetReached
            ? `${l.targetReached.x.getFullYear()} (yr ${yearsFromToday(today, l.targetReached.x)})${capped}`
            : l.displayTarget > 0
              ? `> ${p.yearsOfGrowth} yrs${capped}`
              : "N/A",
        },
        ...(toggles.advanced
          ? [
              {
                // Named for what it measures: the first year the plan's gross
                // growth reaches the first year's draw. That is not a safe
                // withdrawal rate - it ignores fees, inflation and the order
                // returns arrive in - so it no longer claims to be one.
                label: `(${id}) Growth covers draw from`,
                value: l.growthCoversDraw
                  ? `${l.growthCoversDraw.year} (${formatCurrency(l.growthCoversDraw.monthlyGross)}/mo gross, nominal)`
                  : withdrawing
                    ? "Not within horizon"
                    : "N/A",
              },
            ]
          : []),
        ...(isTool(toggles, "fees")
          ? [
              {
                label: `(${id}) Fees Paid`,
                value: formatCurrency(l.calc.getCumulativeFees()),
              },
            ]
          : []),
      ];
    };

    // Derived from the simulation that ACTUALLY RAN, never from the toggles
    // that requested it. Two different things used to be read off the switches
    // instead: `isRollover(toggles)` is true even when the roll falls past B's
    // horizon and never fires, and the mode switch still reads "individual"
    // while a rollover overrides it. Between them, a rollover-on-but-cannot-
    // land plan in individual mode labelled the summed A+B portfolio "(A)" and
    // printed the any-account risk as lane A's own - the exact defect this
    // block exists to close, in the one combination nobody had looked at.
    //
    // resolveMcMode already knows which entry point runs, and
    // `rolloverApplied` is the engine's own "does the roll fire" test.
    // Together they name the pool.
    const portfolioBands = mcMode === "combined" || mcMode === "rollover";
    const mcLabel = rolloverApplied
      ? "Portfolio"
      : portfolioBands
        ? "A+B"
        : "A";
    // Which accounts that band set is built from, and which of them spend
    const mcLanes = (portfolioBands ? lanes : [laneA]).map((l) => ({
      id: l.id,
      withdrawing: l.withdrawals.length > 0,
    }));

    return [
      ...lanes.flatMap(laneRows),
      // "Not applied" rather than a date and an amount that never arrive: the
      // roll is switched on but lands after B's horizon, so it does not happen
      {
        label: "Rollover Date",
        value: rolloverApplied
          ? dateAfterYears(today, laneA.plan.yearsOfGrowth)
          : isRollover(toggles)
            ? "Not applied"
            : "N/A",
      },
      {
        label: "Rollover Amount",
        // On the DISPLAY track, like the chart and the totals - but the sum
        // the engine injects into B is nominal, so with Inflated on the two
        // differ by this plan's whole deflator: a $1,925,549 injection prints
        // as $1,050,488 over a 20.5-year lane at 3%. Every other money figure
        // in this block is nominal, so a reader reconciling the rollover
        // against B's balance found a 1.83x gap with nothing explaining it.
        // The figure is not wrong for the track it is on; it never said which
        // track that was.
        value: rolloverApplied
          ? `${formatCurrency(laneA.total)}${laneA.track === "real" ? " (today's dollars)" : ""}`
          : isRollover(toggles)
            ? "Not applied"
            : "N/A",
      },
      {
        label: "Inflation Rate",
        value: `${laneA.plan.inflationPct}%`,
      },
      ...mcRows(mcLabel, mcBandsA),
      ...ruinRows(
        mcBandsA,
        mcLanes,
        rolloverApplied
          ? { today, month: toMonths(laneA.plan.yearsOfGrowth) }
          : undefined,
      ),
      ...mcRows("B", mcBandsB),
      ...ruinRows(mcBandsB, [
        { id: "B", withdrawing: laneB.withdrawals.length > 0 },
      ]),
    ];
  }, [
    lanes,
    laneA,
    laneB,
    today,
    toggles,
    mcMode,
    rolloverApplied,
    mcBandsA,
    mcBandsB,
  ]);

  /* ---------------- PDF Report ---------------- */

  // Per LANE, exactly like the metric rows and the chart: the report used to
  // draw two lines and print "(B)" metrics under a set of assumptions that
  // named only Investment A, so a reader attributed A's amount, rate and
  // horizon to the whole plan. Inflation is the plan's, not a lane's, so it
  // closes the list once.
  const assumptions = useMemo<PdfKeyValue[]>(
    () =>
      planAssumptions(
        lanes.map((l) => ({
          ...l,
          balanceAtFirstWithdrawal: l.balanceAtStart,
          // What the engine actually paid out first, not what the slider says:
          // a tax grosses it up and indexed spending escalates it to the
          // withdrawal date, and only this figure is in the same units as the
          // balance it is divided by
          firstWithdrawal: l.withdrawals[0],
        })),
        toggles,
        sliders,
      ),
    [lanes, toggles, sliders],
  );

  /* ---------------- FIRE ---------------- */

  /**
   * The return that compounds the FIRE pot.
   *
   * The pot below is the SUM over the rendered lanes, so the rate applied to
   * it has to describe all of them: lane A's rate alone discarded lane B's
   * while keeping lane B's money, which told a user whose second lane grows
   * faster that they would never reach FIRE and needed to save another
   * $1,215 a month. Weighted by each lane's opening balance, which is what
   * the pot is made of; a pot of nothing has no blend to take, so lane A's
   * own rate stands in.
   */
  const fireReturn = useMemo(() => {
    const pot = lanes.reduce((sum, l) => sum + l.initialAmount, 0);
    return pot > 0
      ? lanes.reduce(
          (sum, l) => sum + l.initialAmount * l.plan.projectedGain,
          0,
        ) / pot
      : laneA.plan.projectedGain;
  }, [lanes, laneA]);

  /* ---------------- Portfolio ---------------- */

  const portfolioLanes = useMemo(
    () => ({
      A: portfolioLane(laneA),
      B: toggles.advanced ? portfolioLane(laneB) : undefined,
    }),
    [laneA, laneB, toggles.advanced],
  );

  return (
    <Container>
      <Grid>
        {lanes.map((lane) => (
          <LanePanel
            key={lane.id}
            lane={lane}
            sliders={sliders}
            inputs={inputs}
            toggles={toggles}
            updateSlider={updateSlider}
            updateInput={updateInput}
            onTarget={lane.id === "A" ? handleTargetA : handleTargetB}
          />
        ))}

        {/* Info / Global Settings Panel */}
        <PanelContainer surface="column">
          <ToggleSection>
            <SectionLabel>Core</SectionLabel>
            <TogglesGrid>
              <ToggleSwitch
                label="Advanced"
                checked={toggles.advanced}
                onCheckedChange={(v) => updateToggle("advanced", v)}
              />
              {/* Display-only, and now genuinely so: it re-reads the same
                  stored nominal plan in today's dollars. It used to re-solve
                  each lane against the converted target and write the solved
                  levers back, so a look at the real figures moved the user's
                  withdrawal. buildLane's displayTarget does the conversion. */}
              <ToggleSwitch
                label="Inflated"
                checked={toggles.showInflation}
                onCheckedChange={(v) => updateToggle("showInflation", v)}
              />
            </TogglesGrid>

            {toggles.advanced && (
              <>
                <SectionLabel>Tools</SectionLabel>
                <TogglesGrid>
                  {TOOL_TOGGLES.map(([key, label]) => (
                    <ToggleSwitch
                      key={key}
                      label={label}
                      checked={toggles[key]}
                      onCheckedChange={(v) => updateToggle(key, v)}
                    />
                  ))}
                </TogglesGrid>
                {isRollover(toggles) && !rolloverApplied && (
                  <HelperText>
                    Rollover is on but cannot land: Investment A finishes after
                    Investment B's horizon ends, so there is no B left to roll
                    into. Shorten A's Years or lengthen B's.
                  </HelperText>
                )}
              </>
            )}
          </ToggleSection>
          {isTool(toggles, "monteCarlo") && (
            <ToggleSection>
              {/* min is MIN_VALUE, like every other slider in this file: zero
                  volatility is the one setting that collapses the cone onto
                  the plan line, which is both the engine's parity contract
                  with the deterministic calculator and the most useful thing
                  a reader can do to sanity-check a chart. A stored 0 was
                  always legal; only the control forbade it. */}
              <VolatilityRow>
                <InvestmentSlider
                  label="Volatility A (σ %)"
                  value={sliders.volatilityA ?? DEFAULT_VOLATILITY}
                  min={MIN_VALUE}
                  max={MAX_VOLATILITY}
                  onChange={(v) => updateSlider("volatilityA", v)}
                />
                <InvestmentSlider
                  label="Volatility B (σ %)"
                  value={sliders.volatilityB ?? DEFAULT_VOLATILITY}
                  min={MIN_VALUE}
                  max={MAX_VOLATILITY}
                  onChange={(v) => updateSlider("volatilityB", v)}
                />
              </VolatilityRow>
              <ToggleSwitch
                label="Return model"
                suffix={
                  toggles.returnModel === "clustered"
                    ? "Clustered"
                    : "Independent"
                }
                checked={toggles.returnModel === "clustered"}
                onCheckedChange={(v) =>
                  updateToggle("returnModel", v ? "clustered" : "normal")
                }
              />
              <ToggleSwitch
                label="Monte Carlo mode"
                suffix={
                  toggles.monteCarloMode === "combined"
                    ? "Combined"
                    : "Individual"
                }
                checked={toggles.monteCarloMode === "individual"}
                onCheckedChange={(v) =>
                  updateToggle("monteCarloMode", v ? "individual" : "combined")
                }
              />
              <HelperText>
                The return rate is the average annual return, so the simulated
                median sits a little below the plan line: compounding a volatile
                return loses ground to compounding a steady one. The same inputs
                always draw the same cone.
              </HelperText>
              <HelperText>
                Clustered is the default: bad years arrive in runs, the way
                1973–74, 2000–02 and 2008–09 did, which is what actually empties
                a portfolio being drawn down. Independent makes every year a
                fresh coin toss. Both keep the average return and the volatility
                above exactly as set, at every horizon — what changes is when
                the bad years arrive and how deep the worst of them go.
              </HelperText>
              <HelperText>
                σ is the spread of the annual rate the plan compounds monthly,
                so the calendar years it produces are about 1.1× as wide — at a
                10% return, σ 18 gives years averaging 12.1% with a 20-point
                spread, which is the US large-cap record. Set σ to 0 to collapse
                the cone onto the plan line.
              </HelperText>
            </ToggleSection>
          )}
          <InvestmentSlider
            label="Inflation (%)"
            value={sliders.yearlyInflation ?? DEFAULT_INFLATION_RATE}
            min={MIN_VALUE}
            max={MAX_INFLATION_RATE}
            step={0.1}
            inputAlign="left"
            inputGroupSize="narrow"
            onChange={(v) => updateSlider("yearlyInflation", v)}
          />

          <InfoGrid>
            {infoItems.map((item) => (
              <InfoRow key={item.label}>
                <span>{item.label}:</span>
                <span>{item.value}</span>
              </InfoRow>
            ))}
          </InfoGrid>
        </PanelContainer>
      </Grid>

      {/* Totals */}
      <AmountsGrid>
        {lanes.map((lane) => (
          <Popover.Root key={lane.id}>
            <AmountBox>{formatCurrency(lane.total)}</AmountBox>
            <PopoverContent side="bottom">
              <DateAmountTable
                investmentCalc={lane.calc}
                initialAmount={lane.initialAmount}
              />
            </PopoverContent>
          </Popover.Root>
        ))}
      </AmountsGrid>

      {/* Chart */}
      <InvestmentLineChart
        growthMatrixA={laneA.matrix}
        growthMatrixB={toggles.advanced ? laneB.matrix : undefined}
        track={laneA.track}
        advanced={toggles.advanced}
        targetValueA={laneA.displayTarget || undefined}
        targetValueB={laneB.displayTarget || undefined}
        mcBandsA={mcBandsA.length > 0 ? mcBandsA : undefined}
        mcBandsB={mcBandsB.length > 0 ? mcBandsB : undefined}
        initialAmountA={laneA.initialAmount}
        initialAmountB={toggles.advanced ? laneB.initialAmount : undefined}
      />

      {/* PDF Export */}
      <PdfExportButton
        chartSelector=".recharts-wrapper"
        assumptions={assumptions}
        metrics={infoItems}
      />

      {/* Portfolio Capital Preservation Panel */}
      {isTool(toggles, "portfolio") && (
        <PortfolioPanel
          holdings={stockHoldings}
          setHoldings={setStockHoldings}
          stockApiUrl={stockApiUrl}
          lanes={portfolioLanes}
        />
      )}

      {/* FIRE Calculator Panel */}
      {isTool(toggles, "fire") && (
        <FirePanel
          currentSavings={lanes.reduce((sum, l) => sum + l.initialAmount, 0)}
          monthlySavings={lanes.reduce(
            (sum, l) => sum + l.plan.monthlyContribution,
            0,
          )}
          annualReturn={fireReturn}
          inflationRate={laneA.plan.inflationPct}
          annualExpenses={
            sliders.fireAnnualExpenses ?? DEFAULT_FIRE_ANNUAL_EXPENSES
          }
          safeWithdrawalRate={sliders.fireSWR ?? DEFAULT_FIRE_SWR}
          currentAge={sliders.fireCurrentAge ?? DEFAULT_FIRE_CURRENT_AGE}
          targetRetirementAge={
            sliders.fireRetirementAge ?? DEFAULT_FIRE_RETIREMENT_AGE
          }
          onAnnualExpensesChange={(v) => updateSlider("fireAnnualExpenses", v)}
          onSafeWithdrawalRateChange={(v) => updateSlider("fireSWR", v)}
          onCurrentAgeChange={(v) => updateSlider("fireCurrentAge", v)}
          onTargetRetirementAgeChange={(v) =>
            updateSlider("fireRetirementAge", v)
          }
        />
      )}

      {/* Scenario Snapshots Panel */}
      {isTool(toggles, "scenarios") && (
        <ScenarioPanel
          currentState={currentState}
          onLoadScenario={onLoadScenario}
          scenarios={scenarios}
          setScenarios={setScenarios}
        />
      )}

      {/* Budget Panel */}
      {isTool(toggles, "budget") && (
        <BudgetPanel
          items={budgetItems}
          setItems={setBudgetItems}
          onAnnualTotalChange={
            isTool(toggles, "fire")
              ? (annual) => updateSlider("fireAnnualExpenses", annual)
              : undefined
          }
          onSetMonthlyWithdrawal={
            isDynamic(toggles)
              ? undefined
              : (monthly) => updateSlider("monthlyWithdrawalA", monthly)
          }
        />
      )}
    </Container>
  );
}
