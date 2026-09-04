/* ==================================================
 * Investment Calculator Component
 * ================================================== */
import { useState, useMemo, useCallback, useDeferredValue } from "react";
import type { Dispatch, SetStateAction } from "react";
import * as Popover from "@radix-ui/react-popover";
import { addMonths } from "date-fns/addMonths";
import { differenceInCalendarMonths } from "date-fns/differenceInCalendarMonths";
import { styled, keyframes } from "../../stitches.config";
import { planAnchor } from "../common/helpers/investment-growth-calculator";
import type { TargetLever } from "../common/helpers/solve-for-target";
import { formatCurrency } from "../common/helpers/format";
import {
  buildLanes,
  isDynamic,
  isRollover,
  isTool,
  solveLaneTarget,
  NO_SOLVE,
  type Lane,
  type TargetOutcome,
} from "../common/helpers/lane-model";
import { PanelContainer } from "./ui/primitives";
import {
  dynamicWithdrawalAssumptions,
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
import type {
  InputKey,
  LaneId,
  SliderKey,
} from "../common/constants/app-constants";
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
];

/* ---------------- Target Solver Reporting ---------------- */

/** Control name of each lever the target solver is allowed to move */
const LEVER_NAMES: Record<TargetLever, string> = {
  monthlyWithdrawal: "Monthly Withdrawal",
  monthlyContribution: "Monthly Contribution",
  projectedGain: "Return (%)",
};

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
 * What a dynamic policy actually paid, per month, in NOMINAL dollars - which
 * is what the schedule records whichever display mode the panel is in.
 *
 * The two ends of the range each moved in meaning once guardrails became
 * inflation-indexed and a drained plan started recording the part-payment it
 * could afford: a floor equal to the ceiling still spans a range (the
 * guardrails rise with inflation), and the last payment before the money ran
 * out is the balance, not the policy's amount. So the range is taken over
 * the full payments only, collapses to a single figure when the policy never
 * moved, and says which of the two is on show.
 */
const dynamicWithdrawalRange = (
  l: Lane,
  { ratePct }: NonNullable<PlanInputs["dynamicWithdrawal"]>,
): string => {
  const depletedAt = l.calc.getDepletedAtMonth();
  const beforeRunningDry =
    depletedAt === undefined
      ? l.withdrawals
      : l.calc
          .getWithdrawalSchedule()
          .slice(0, depletedAt)
          .filter((m) => m > 0);
  const paid = beforeRunningDry.length > 0 ? beforeRunningDry : l.withdrawals;
  const low = formatCurrency(Math.min(...paid));
  const high = formatCurrency(Math.max(...paid));
  const notes = [`${ratePct}% of balance`];
  if (l.plan.inflationPct > 0) notes.push("guardrails indexed");
  const amount = low === high ? `${low}/mo` : `${low}–${high}/mo`;
  return `${amount} nominal (${notes.join(", ")})`;
};

/**
 * Percentile summary of one band set at its horizon.
 *
 * The depletion row is only printed for a portfolio that actually withdraws:
 * for one that never spends, "0%" is not information, it is an answer to a
 * question nobody asked. When it is printed, a real but small risk is shown
 * as "<1%" rather than rounded to a "0%" that reads as impossible.
 */
const mcRows = (
  label: string,
  bands: PercentileBand[],
  withdrawing: boolean,
): PdfKeyValue[] => {
  const last = bands.at(-1);
  if (!last) return [];
  const risk = last.depletedPct;
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
      value: `${formatCurrency(last.p10)} (1 in 10 end below)`,
    },
    ...(withdrawing
      ? [
          {
            label: `(${label}) Chance of Running Out`,
            value:
              risk > 0 && risk < 0.005 ? "<1%" : `${Math.round(risk * 100)}%`,
          },
        ]
      : []),
  ];
};

// The A band set is the whole portfolio in combined and rollover mode, so
// the question "can this run out" is asked of every lane it contains
const spends = (ls: Lane[]) => ls.some((l) => l.withdrawals.length > 0);

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
  // The solver's own account of the last target it solved per lane. It is UI
  // state rather than a stored slider: the stored target is always the
  // achievable one, so only the "(capped)" annotation and the "Target Solved
  // By" row reset on reload.
  const [targetOutcome, setTargetOutcome] = useState<
    Record<LaneId, TargetOutcome>
  >({ A: NO_SOLVE, B: NO_SOLVE });

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
          a: toMcParams(
            laneA,
            sliders.volatilityA ?? DEFAULT_VOLATILITY,
            MONTE_CARLO_SEED,
          ),
          b: toMcParams(
            laneB,
            sliders.volatilityB ?? DEFAULT_VOLATILITY,
            MONTE_CARLO_SEED,
          ),
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
   * Commits the lane's goal along with every input the solver had to move to
   * reach it, atomically. The decision itself is solveLaneTarget's, in
   * lane-model; this is the state write it produces.
   */
  const solveTarget = useCallback(
    (lane: Lane, target: number) => {
      const { outcome, sliders: solved } = solveLaneTarget(
        lane,
        target,
        toggles,
      );
      setTargetOutcome((prev) => ({ ...prev, [lane.id]: outcome }));
      setSliders((prev) => ({ ...prev, ...solved }));
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
  // metrics. Rebuilt only when a lane, a toggle, a solve outcome or a fresh
  // set of bands actually changes it.
  const infoItems = useMemo<PdfKeyValue[]>(() => {
    const laneRows = (l: Lane): PdfKeyValue[] => {
      const { id, plan: p } = l;
      const stop = p.contributionStopYear;
      const withdrawing = l.withdrawals.length > 0;
      const depletedAt = l.calc.getDepletedAtMonth();
      const { clamped, moved } = targetOutcome[l.id];
      // A capped target is the most the solver could reach, not the request
      const capped = l.displayTarget > 0 && clamped ? " (capped)" : "";
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
                // an unset one is N/A
                label: `(${id}) Contributions End`,
                value: stop === undefined ? "N/A" : dateAfterYears(today, stop),
              },
              {
                // A plan with no withdrawals cannot run out; one that does and
                // survives says so rather than going quiet
                label: `(${id}) Runs Out`,
                value:
                  depletedAt !== undefined
                    ? dateAfterMonths(today, depletedAt)
                    : withdrawing
                      ? "Not within horizon"
                      : "N/A",
              },
              ...(p.dynamicWithdrawal
                ? [
                    {
                      label: `(${id}) Withdrawal`,
                      value: withdrawing
                        ? dynamicWithdrawalRange(l, p.dynamicWithdrawal)
                        : "N/A",
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
        // Which control the solve actually moved. Basic mode has only the
        // assumed return to offer, and raising an assumption is not a plan
        // anyone can carry out, so the row names the lever instead of letting a
        // slider move unannounced. Absent until a solve happens in this session.
        ...(moved.length > 0
          ? [
              {
                label: `(${id}) Target Solved By`,
                value: moved.map((lever) => LEVER_NAMES[lever]).join(", "),
              },
            ]
          : []),
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

    const mcLabel = isRollover(toggles)
      ? "Portfolio"
      : toggles.advanced && toggles.monteCarloMode === "combined"
        ? "A+B"
        : "A";

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
        value: rolloverApplied
          ? formatCurrency(laneA.total)
          : isRollover(toggles)
            ? "Not applied"
            : "N/A",
      },
      {
        label: "Inflation Rate",
        value: `${laneA.plan.inflationPct}%`,
      },
      ...mcRows(mcLabel, mcBandsA, spends(mcLabel === "A" ? [laneA] : lanes)),
      ...mcRows("B", mcBandsB, spends([laneB])),
    ];
  }, [
    lanes,
    laneA,
    laneB,
    today,
    toggles,
    targetOutcome,
    rolloverApplied,
    mcBandsA,
    mcBandsB,
  ]);

  /* ---------------- PDF Report ---------------- */

  const assumptions = useMemo<PdfKeyValue[]>(
    () => [
      {
        label: "Initial Amount (A)",
        value: formatCurrency(laneA.initialAmount),
      },
      { label: "Return Rate (A)", value: `${laneA.plan.projectedGain}%` },
      { label: "Years (A)", value: `${laneA.plan.yearsOfGrowth}` },
      {
        label: "Monthly Contribution (A)",
        value: formatCurrency(laneA.plan.monthlyContribution),
      },
      ...(laneA.plan.dynamicWithdrawal
        ? dynamicWithdrawalAssumptions("A", laneA.plan.dynamicWithdrawal)
        : [
            {
              label: "Monthly Withdrawal (A)",
              value: formatCurrency(laneA.plan.monthlyWithdrawal),
            },
          ]),
      {
        label: "Inflation Rate",
        value: `${laneA.plan.inflationPct}%`,
      },
      ...(isTool(toggles, "fees")
        ? [
            {
              label: "Annual Fee (A)",
              value: `${laneA.plan.annualFeePct ?? 0}%`,
            },
          ]
        : []),
    ],
    [laneA, toggles],
  );

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
              <VolatilityRow>
                <InvestmentSlider
                  label="Volatility A (σ %)"
                  value={sliders.volatilityA ?? DEFAULT_VOLATILITY}
                  min={1}
                  max={MAX_VOLATILITY}
                  onChange={(v) => updateSlider("volatilityA", v)}
                />
                <InvestmentSlider
                  label="Volatility B (σ %)"
                  value={sliders.volatilityB ?? DEFAULT_VOLATILITY}
                  min={1}
                  max={MAX_VOLATILITY}
                  onChange={(v) => updateSlider("volatilityB", v)}
                />
              </VolatilityRow>
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
          annualReturn={laneA.plan.projectedGain}
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
