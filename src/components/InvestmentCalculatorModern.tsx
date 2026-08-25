/* ==================================================
 * Investment Calculator Component
 * ================================================== */
import { useState, useMemo, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import { addMonths, differenceInCalendarMonths } from "date-fns";
import { styled, keyframes } from "../../stitches.config";
import { InvestmentCalculator } from "../common/helpers/investment-growth-calculator";
import { solveForWithdrawal } from "../common/helpers/solve-for-withdrawal";
import { formatCurrency } from "../common/helpers/format";
import {
  dynamicWithdrawalAssumptions,
  type PdfKeyValue,
} from "../common/helpers/pdf-export";
import DateAmountTable from "./date-amount-table";
import { InvestmentLineChart } from "./investment-line-chart";
import PortfolioPanel, { type PortfolioLane } from "./portfolio/PortfolioPanel";
import FirePanel from "./fire/FirePanel";
import ScenarioPanel from "./scenarios/ScenarioPanel";
import PdfExportButton from "./export/PdfExportButton";
import BudgetPanel from "./budget/BudgetPanel";
import type { BudgetItem } from "../common/helpers/budget-manager";
import type { ScenarioSnapshot } from "../common/helpers/scenario-manager";
import {
  DEFAULT_INITIAL_AMOUNT,
  DEFAULT_PROJECTED_GAIN,
  DEFAULT_YEARS_OF_GROWTH,
  DEFAULT_INFLATION_RATE,
  DEFAULT_WITHDRAWAL_RATE,
  DEFAULT_WITHDRAWAL_FLOOR,
  DEFAULT_WITHDRAWAL_CEILING,
  MAX_PROJECTED_GAIN,
  MAX_YEARS_OF_GROWTH,
  MAX_MONTHLY_CONTRIBUTION,
  MAX_MONTHLY_WITHDRAWAL,
  MAX_WITHDRAWAL_RATE,
  MAX_INFLATION_RATE,
  MAX_ANNUAL_FEE,
  DEFAULT_VOLATILITY,
  MAX_VOLATILITY,
  MONTE_CARLO_SIM_COUNT,
  MIN_VALUE,
} from "../common/constants/app-constants";
import { compactModernInputStyles } from "../common/constants/input-styles";
import {
  runMonteCarloSimulation,
  runCombinedSimulation,
  runRolloverSimulation,
  type MonteCarloParams,
  type PercentileBand,
} from "../common/helpers/monte-carlo";
import { endingAmounts } from "../common/helpers/growth-rows";
import { normalizeState } from "../common/helpers/state-manager";
import type { PortfolioHolding } from "../common/types/portfolio-types";
import type {
  InvestmentCalculatorProps,
  LineGraphEntry,
  RolloverAmounts,
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
const Panel = styled("div", {
  backgroundColor: "$currentLine",
  borderRadius: "12px",
  padding: "20px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  boxShadow: "0 6px 16px rgba(0,0,0,0.2)",
});
const Label = styled("label", {
  fontSize: "0.875rem",
  color: "$comment",
  fontWeight: 500,
});
const InputField = styled("input", {
  ...compactModernInputStyles,
  width: "24%",
  minWidth: "74px",
  maxWidth: "144px",
  variants: {
    align: {
      left: { textAlign: "left" },
      center: { textAlign: "center" },
      right: { textAlign: "right" },
    },
  },
  defaultVariants: {
    align: "right",
  },
});
const FullWidthInputField = styled(InputField, {
  display: "block",
  width: "100%",
  minWidth: 0,
  maxWidth: "none",
  alignSelf: "stretch",
});
const SliderControlRow = styled("div", {
  display: "flex",
  gap: "10px",
  alignItems: "flex-end",
});
const SliderInputGroup = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  flexShrink: 0,
  minWidth: 0,
  variants: {
    size: {
      default: { width: "24%", minWidth: "78px" },
      narrow: { width: "19%", minWidth: "62px" },
    },
  },
  defaultVariants: { size: "default" },
});
const SliderInlineLabel = styled("label", {
  fontSize: "0.7rem",
  color: "$comment",
  fontWeight: 500,
  whiteSpace: "nowrap",
});
const SliderValueInput = styled("input", {
  ...compactModernInputStyles,
  width: "100%",
  minWidth: 0,
  maxWidth: "none",
  variants: {
    align: {
      left: { textAlign: "left" },
      right: { textAlign: "right" },
    },
  },
  defaultVariants: {
    align: "right",
  },
});
const AmountsGrid = styled("div", {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "24px",
  marginTop: "24px",
});
const AmountBox = styled("div", {
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
const SliderRoot = styled(Slider.Root, {
  position: "relative",
  display: "flex",
  alignItems: "center",
  flex: 1,
  minWidth: 0,
  height: "24px",
  alignSelf: "flex-end",
  marginBottom: "4px",
});
const SliderTrack = styled(Slider.Track, {
  backgroundColor: "$cyan",
  position: "relative",
  flexGrow: 1,
  height: "6px",
  borderRadius: "9999px",
});
const SliderRange = styled(Slider.Range, {
  position: "absolute",
  backgroundColor: "$green",
  height: "100%",
  borderRadius: "9999px",
});
const SliderThumb = styled(Slider.Thumb, {
  width: 20,
  height: 20,
  borderRadius: "50%",
  backgroundColor: "$green",
  boxShadow: "0 3px 8px rgba(0,0,0,0.3)",
});
const SwitchRoot = styled(Switch.Root, {
  all: "unset",
  width: 42,
  height: 24,
  backgroundColor: "$comment",
  borderRadius: "9999px",
  position: "relative",
  cursor: "pointer",
  "&[data-state='checked']": { backgroundColor: "$purple" },
});
const SwitchThumb = styled(Switch.Thumb, {
  display: "block",
  width: 20,
  height: 20,
  backgroundColor: "$foreground",
  borderRadius: "9999px",
  transition: "transform 0.2s",
  transform: "translateX(2px)",
  "[data-state='checked'] &": { transform: "translateX(20px)" },
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
const SwitchRow = styled("div", {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: "12px",
  alignItems: "center",
  minWidth: 0,
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

/* ---------------- Input Controls ---------------- */
function CurrencyInput({
  value,
  onChange,
  placeholder,
  fullWidth = false,
  align = "right",
}: {
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  fullWidth?: boolean;
  align?: "left" | "center" | "right";
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const display = editing
    ? draft
    : value
      ? `$${parseInt(value).toLocaleString()}`
      : "";

  const InputComponent = fullWidth ? FullWidthInputField : InputField;

  return (
    <InputComponent
      align={align}
      type="text"
      value={display}
      placeholder={placeholder}
      onFocus={() => setDraft(value?.replace(/[^0-9]/g, "") ?? "")}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9]/g, "");
        setDraft(raw);
      }}
      onBlur={() => {
        if (draft !== null) {
          onChange(draft);
          setDraft(null);
        }
      }}
    />
  );
}
function InvestmentSlider({
  label,
  name = label,
  value,
  min,
  max,
  step = 1,
  onChange,
  inputAlign = "right",
  inputGroupSize = "default",
}: {
  label: string;
  /** Accessible name; distinguishes identically labelled A/B controls */
  name?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  inputAlign?: "left" | "right";
  inputGroupSize?: "default" | "narrow";
}) {
  const numericValue = Number.isFinite(value) ? value : 0;
  // Draft state lets users type freely (including decimals like "10.5");
  // the value is clamped and committed on blur or Enter.
  const [draft, setDraft] = useState<string | null>(null);

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = parseFloat(draft);
    if (!Number.isNaN(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    }
    setDraft(null);
  };

  return (
    <SliderControlRow>
      <SliderInputGroup size={inputGroupSize}>
        <SliderInlineLabel>{label}</SliderInlineLabel>
        <SliderValueInput
          align={inputAlign}
          type="text"
          inputMode="decimal"
          aria-label={name}
          value={draft ?? String(numericValue)}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ""))}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitDraft();
          }}
        />
      </SliderInputGroup>
      <SliderRoot
        value={[numericValue]}
        min={min}
        max={max}
        step={step}
        onValueChange={(val) => onChange(val[0])}
      >
        <SliderTrack>
          <SliderRange />
        </SliderTrack>
        <SliderThumb aria-label={`${name} slider`} />
      </SliderRoot>
    </SliderControlRow>
  );
}
function SwitchButton({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <SwitchRoot
      aria-label={label}
      checked={checked}
      onCheckedChange={onCheckedChange}
    >
      <SwitchThumb />
    </SwitchRoot>
  );
}

/* ---------------- Lane Model ---------------- */

type LaneId = "A" | "B";

interface LaneContext {
  sliders: Record<string, number>;
  inputs: Record<string, string>;
  toggles: TogglesState;
}

/** Everything derived from one investment lane's inputs */
interface Lane {
  id: LaneId;
  props: InvestmentCalculatorProps;
  initialAmount: number;
  calc: InvestmentCalculator;
  /** Ending balance in the current display mode */
  total: number;
  matrix: LineGraphEntry[];
  /** Ending balance on both tracks, for rolling into the other lane */
  ending: RolloverAmounts;
  /** Positive monthly withdrawals actually applied, in simulation order */
  withdrawals: number[];
  /** Target slider ceiling in display units; 0 while the target control is hidden */
  maxTarget: number;
  /** Stored (nominal) target converted to display units */
  displayTarget: number;
  toNominal: (display: number) => number;
  targetStep: number;
  targetReached?: LineGraphEntry;
  /** First matrix entry whose annual growth covers the withdrawals */
  safeFrom?: LineGraphEntry;
}

interface RolloverInto {
  amounts: RolloverAmounts;
  year: number;
}

/** Tool toggles only take effect in advanced mode, where lane B and withdrawals exist */
const isDynamic = (t: TogglesState) => t.advanced && t.dynamicWithdrawal;
const isRollover = (t: TogglesState) => t.advanced && t.rollover;

function buildLane(
  id: LaneId,
  { sliders: s, inputs, toggles: t }: LaneContext,
  roll?: RolloverInto,
): Lane {
  const key = (name: string) => `${name}${id}`;
  const currentAmount =
    inputs[key("currentAmount")] || String(DEFAULT_INITIAL_AMOUNT);
  const start = parseInt(currentAmount) || 0;
  const years = s[key("yearsOfGrowth")] ?? DEFAULT_YEARS_OF_GROWTH;
  const dynamic = isDynamic(t);
  const props: InvestmentCalculatorProps = {
    currentAmount,
    projectedGain: s[key("projectedGain")] ?? DEFAULT_PROJECTED_GAIN,
    // The receiving lane must outlive the rollover, so its horizon is extended
    yearsOfGrowth: Math.max(years, roll?.year ?? 0),
    monthlyContribution: s[key("monthlyContribution")] ?? MIN_VALUE,
    monthlyWithdrawal: s[key("monthlyWithdrawal")] ?? MIN_VALUE,
    yearContributionsStop:
      s[key("contributionStopYear")] ?? s[key("yearsOfGrowth")],
    yearWithdrawalsBegin: s[key("withdrawalStartYear")] ?? MIN_VALUE,
    advanced: t.advanced,
    depreciationRate: s.yearlyInflation ?? DEFAULT_INFLATION_RATE,
    annualFee: t.fees ? s[key("annualFee")] || 0 : 0,
    rollOver: roll !== undefined,
    investmentToRoll: roll?.amounts ?? 0,
    yearOfRollover: roll?.year,
    maxMonthlyWithdrawal: MAX_MONTHLY_WITHDRAWAL,
    dynamicWithdrawal: dynamic
      ? {
          ratePct: s[key("withdrawalRate")] ?? DEFAULT_WITHDRAWAL_RATE,
          floor: s[key("withdrawalFloor")] ?? DEFAULT_WITHDRAWAL_FLOOR,
          ceiling: s[key("withdrawalCeiling")] ?? DEFAULT_WITHDRAWAL_CEILING,
        }
      : undefined,
  };
  const calc = new InvestmentCalculator(props);
  const total = calc.calculateGrowth(t.showInflation).numeric;
  const matrix = calc.getGrowthMatrix();
  const ending = endingAmounts(matrix, t.showInflation, start);
  const withdrawals = calc.getWithdrawalSchedule().filter((m) => m > 0);

  // The target slider spans up to the no-withdrawal ending balance. Targets
  // are stored nominal; the inflated/nominal ratio converts to display units.
  // Targets only drive the fixed-withdrawal solver, so dynamic mode has none.
  let nominalMax = 1;
  let inflatedMax = 0;
  const targetable = t.advanced && !dynamic;
  if (targetable) {
    const base0 = new InvestmentCalculator({ ...props, monthlyWithdrawal: 0 });
    nominalMax = base0.calculateGrowth(false).numeric || 1;
    inflatedMax = base0.calculateGrowth(true).numeric;
  }
  const toDisplay = (nominal: number) =>
    t.showInflation
      ? Math.round(nominal * (inflatedMax / nominalMax))
      : nominal;
  const toNominal = (display: number) =>
    t.showInflation
      ? Math.round(display * (inflatedMax > 0 ? nominalMax / inflatedMax : 1))
      : display;
  const displayTarget = targetable ? toDisplay(s[key("targetValue")] || 0) : 0;
  const annualWithdrawal = (withdrawals[0] ?? 0) * 12;

  return {
    id,
    props,
    initialAmount: start,
    calc,
    total,
    matrix,
    ending,
    withdrawals,
    maxTarget: targetable ? (t.showInflation ? inflatedMax : nominalMax) : 0,
    displayTarget,
    toNominal,
    // One order of magnitude below the balance so the slider stays usable at any scale
    targetStep:
      10 ** Math.max(2, Math.floor(Math.log10(Math.max(total, 1000))) - 1),
    targetReached:
      displayTarget > 0 ? matrix.find((e) => e.y >= displayTarget) : undefined,
    safeFrom:
      annualWithdrawal > 0
        ? matrix.find(
            (e) => (e.y * props.projectedGain) / 100 >= annualWithdrawal,
          )
        : undefined,
  };
}

/** A's ending balance rolls into B at the end of A's horizon */
function buildLanes(ctx: LaneContext): { A: Lane; B: Lane } {
  const A = buildLane("A", ctx);
  const roll = isRollover(ctx.toggles)
    ? { amounts: A.ending, year: A.props.yearsOfGrowth }
    : undefined;
  return { A, B: buildLane("B", ctx, roll) };
}

const portfolioLane = (l: Lane): PortfolioLane => ({
  portfolioValue: l.initialAmount,
  monthlyWithdrawal: l.withdrawals[0] ?? 0,
  projectedGain: l.props.projectedGain,
  withdrawalStartYear: l.props.yearWithdrawalsBegin,
  years: l.props.yearsOfGrowth,
  growthMatrix: l.matrix,
});

/* ---------------- Monte Carlo ---------------- */

type McMode = "off" | "single" | "combined" | "individual" | "rollover";

interface McInput {
  a: MonteCarloParams;
  b: MonteCarloParams;
  mode: McMode;
  rolloverYear: number;
}

/** Monte Carlo has no advanced flag: pass the cash flows the calculator actually applies */
function toMcParams(
  lane: Lane,
  showInflation: boolean,
  volatility: number,
  seed: number,
): MonteCarloParams {
  const p = lane.props;
  return {
    initialAmount: lane.initialAmount,
    projectedGain: p.projectedGain,
    yearsOfGrowth: p.yearsOfGrowth,
    monthlyContribution: p.monthlyContribution,
    monthlyWithdrawal: p.advanced ? p.monthlyWithdrawal : 0,
    withdrawalStartYear: p.yearWithdrawalsBegin,
    contributionStopYear: p.advanced ? p.yearContributionsStop : undefined,
    depreciationRate: p.depreciationRate,
    annualFee: p.annualFee,
    showInflation,
    volatility,
    simCount: MONTE_CARLO_SIM_COUNT,
    dynamicWithdrawal: p.dynamicWithdrawal,
    seed,
  };
}

function runMonteCarlo({ a, b, mode, rolloverYear }: McInput): {
  mcBandsA: PercentileBand[];
  mcBandsB: PercentileBand[];
} {
  switch (mode) {
    case "off":
      return { mcBandsA: [], mcBandsB: [] };
    case "rollover":
      return {
        mcBandsA: runRolloverSimulation(a, b, rolloverYear),
        mcBandsB: [],
      };
    case "combined":
      return { mcBandsA: runCombinedSimulation(a, b), mcBandsB: [] };
    case "individual":
      // Each lane's bands index its own path, so B's cone tracks B's own line
      return {
        mcBandsA: runMonteCarloSimulation(a),
        mcBandsB: runMonteCarloSimulation(b),
      };
    default:
      return { mcBandsA: runMonteCarloSimulation(a), mcBandsB: [] };
  }
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

/** Returns a value whose identity only changes when its JSON form does */
function useJsonMemo<T>(value: T): T {
  const json = JSON.stringify(value);
  return useMemo(() => JSON.parse(json) as T, [json]);
}

/* ---------------- Lane Panel ---------------- */

function TargetControl({
  lane,
  onTarget,
}: {
  lane: Lane;
  onTarget: (target: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const name = `Investment ${lane.id} Target Value`;

  const commitDraft = () => {
    if (draft === null) return;
    onTarget(Number(draft) || 0);
    setDraft(null);
  };

  return (
    <SliderControlRow>
      <SliderInputGroup>
        <SliderInlineLabel>Target Value</SliderInlineLabel>
        <SliderValueInput
          type="text"
          inputMode="numeric"
          aria-label={name}
          value={
            draft ?? (lane.displayTarget ? String(lane.displayTarget) : "")
          }
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitDraft();
          }}
        />
      </SliderInputGroup>
      <SliderRoot
        value={[Math.min(lane.displayTarget, lane.maxTarget)]}
        min={0}
        max={lane.maxTarget}
        step={lane.targetStep}
        onValueChange={(val) => onTarget(val[0])}
      >
        <SliderTrack>
          <SliderRange />
        </SliderTrack>
        <SliderThumb aria-label={`${name} slider`} />
      </SliderRoot>
    </SliderControlRow>
  );
}

interface LanePanelProps extends LaneContext {
  lane: Lane;
  updateSlider: (key: string, val: number) => void;
  updateInput: (key: string, val: string) => void;
  onTarget: (target: number) => void;
}

function LanePanel({
  lane,
  sliders,
  inputs,
  toggles,
  updateSlider,
  updateInput,
  onTarget,
}: LanePanelProps) {
  const { id } = lane;
  const years = sliders[`yearsOfGrowth${id}`];
  const dynamic = lane.props.dynamicWithdrawal;

  const slider = (
    key: string,
    label: string,
    max: number,
    step = 1,
    value = sliders[`${key}${id}`],
  ) => (
    <InvestmentSlider
      label={label}
      name={`Investment ${id} ${label}`}
      value={value}
      min={MIN_VALUE}
      max={max}
      step={step}
      onChange={(v) => updateSlider(`${key}${id}`, v)}
    />
  );

  return (
    <Panel>
      <CurrencyInput
        value={inputs[`currentAmount${id}`]}
        onChange={(v) => updateInput(`currentAmount${id}`, v)}
        fullWidth
        align="center"
      />
      {slider("projectedGain", "Return (%)", MAX_PROJECTED_GAIN)}
      {slider("yearsOfGrowth", "Years", MAX_YEARS_OF_GROWTH, 0.5)}
      {toggles.advanced && (
        <>
          {slider(
            "monthlyContribution",
            "Monthly Contribution",
            MAX_MONTHLY_CONTRIBUTION,
          )}
          {slider(
            "contributionStopYear",
            "Contribution Stop Year",
            years,
            0.5,
            sliders[`contributionStopYear${id}`] ?? years,
          )}
          {dynamic ? (
            <>
              {slider(
                "withdrawalRate",
                "Withdrawal Rate (%)",
                MAX_WITHDRAWAL_RATE,
                0.1,
                dynamic.ratePct,
              )}
              {slider(
                "withdrawalFloor",
                "Withdrawal Floor",
                MAX_MONTHLY_WITHDRAWAL,
                1,
                dynamic.floor,
              )}
              {slider(
                "withdrawalCeiling",
                "Withdrawal Ceiling",
                MAX_MONTHLY_WITHDRAWAL,
                1,
                dynamic.ceiling,
              )}
            </>
          ) : (
            slider(
              "monthlyWithdrawal",
              "Monthly Withdrawal",
              MAX_MONTHLY_WITHDRAWAL,
            )
          )}
          {slider(
            "withdrawalStartYear",
            "Withdrawal Start Year",
            years,
            0.5,
            sliders[`withdrawalStartYear${id}`] || MIN_VALUE,
          )}
          {toggles.fees &&
            slider(
              "annualFee",
              "Annual Fee (%)",
              MAX_ANNUAL_FEE,
              0.01,
              sliders[`annualFee${id}`] || 0,
            )}
          {/* Sets the fixed monthly withdrawal that ends at this balance */}
          {!dynamic && <TargetControl lane={lane} onTarget={onTarget} />}
        </>
      )}
    </Panel>
  );
}

/* ---------------- Toggles ---------------- */

type BooleanToggle = {
  [K in keyof TogglesState]: TogglesState[K] extends boolean ? K : never;
}[keyof TogglesState];

const TOOL_TOGGLES: [BooleanToggle, string][] = [
  ["rollover", "Rollover"],
  ["fees", "Fees"],
  ["portfolio", "Portfolio"],
  ["monteCarlo", "Monte Carlo"],
  ["fire", "FIRE"],
  ["scenarios", "Scenarios"],
  ["budget", "Budget"],
  ["dynamicWithdrawal", "Dynamic Withdrawal"],
];

/* ---------------- Types ---------------- */

interface InvestmentCalculatorModernProps {
  theme: string;
  setTheme: (theme: string) => void;
  sliders: Record<string, number>;
  setSliders: Dispatch<SetStateAction<Record<string, number>>>;
  inputs: Record<string, string>;
  setInputs: Dispatch<SetStateAction<Record<string, string>>>;
  toggles: TogglesState;
  setToggles: Dispatch<SetStateAction<TogglesState>>;
  stockApiUrl: string;
  stockHoldings: PortfolioHolding[];
  setStockHoldings: Dispatch<SetStateAction<PortfolioHolding[]>>;
  budgetItems: BudgetItem[];
  setBudgetItems: Dispatch<SetStateAction<BudgetItem[]>>;
  scenarios: ScenarioSnapshot[];
  setScenarios: Dispatch<SetStateAction<ScenarioSnapshot[]>>;
}

/* ---------------- Main Component ---------------- */
export default function InvestmentCalculatorRadixModern({
  theme,
  setTheme,
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
}: InvestmentCalculatorModernProps) {
  const updateSlider = (key: string, val: number) =>
    setSliders((prev) => ({ ...prev, [key]: val }));
  const updateInput = (key: string, val: string) =>
    setInputs((prev) => ({ ...prev, [key]: val }));
  const updateToggle = <K extends keyof TogglesState>(
    key: K,
    val: TogglesState[K],
  ) => setToggles((prev) => ({ ...prev, [key]: val }));
  // Fixed per mount so Monte Carlo bands only change when their inputs do
  const [seed] = useState(randomSeed);

  // Scenario snapshot support
  const currentTH4State = useMemo(
    (): TH4State => ({
      theme,
      sliders,
      inputs,
      toggles,
      stock: { apiUrl: stockApiUrl, holdings: stockHoldings },
      budgetItems,
    }),
    [theme, sliders, inputs, toggles, stockApiUrl, stockHoldings, budgetItems],
  );

  const handleLoadScenario = useCallback(
    (raw: TH4State) => {
      const state = normalizeState(raw);
      setTheme(state.theme);
      setSliders(state.sliders);
      setInputs(state.inputs);
      setToggles(state.toggles);
      setStockHoldings(state.stock.holdings);
      setBudgetItems(state.budgetItems);
    },
    [
      setTheme,
      setSliders,
      setInputs,
      setToggles,
      setStockHoldings,
      setBudgetItems,
    ],
  );

  /* ---------------- Lanes ---------------- */

  const { A: laneA, B: laneB } = buildLanes({ sliders, inputs, toggles });
  const lanes = toggles.advanced ? [laneA, laneB] : [laneA];

  /* ---------------- Monte Carlo Simulation ---------------- */

  const mcInput = useJsonMemo<McInput>({
    a: toMcParams(
      laneA,
      toggles.showInflation,
      sliders.volatilityA ?? DEFAULT_VOLATILITY,
      seed,
    ),
    b: toMcParams(
      laneB,
      toggles.showInflation,
      sliders.volatilityB ?? DEFAULT_VOLATILITY,
      seed,
    ),
    mode: !toggles.monteCarlo
      ? "off"
      : isRollover(toggles)
        ? "rollover"
        : toggles.advanced
          ? toggles.monteCarloMode
          : "single",
    rolloverYear: laneA.props.yearsOfGrowth,
  });
  const { mcBandsA, mcBandsB } = useMemo(
    () => runMonteCarlo(mcInput),
    [mcInput],
  );

  /* ---------------- Target Value Handlers ---------------- */

  /**
   * Solves the fixed monthly withdrawal that ends at `target` (in display
   * units) and commits target and withdrawal atomically; 0 clears both.
   */
  const handleTarget = (lane: Lane) => (target: number) => {
    const withdrawal = target
      ? solveForWithdrawal(lane.props, target, toggles.showInflation)
      : 0;
    setSliders((prev) => ({
      ...prev,
      [`targetValue${lane.id}`]: target ? lane.toNominal(target) : 0,
      [`monthlyWithdrawal${lane.id}`]: withdrawal,
    }));
  };

  /**
   * Targets are stored nominal, so switching display mode re-solves each
   * lane's withdrawal against its target converted into the new mode.
   */
  const handleInflationToggle = (showInflation: boolean) => {
    setToggles((prev) => ({ ...prev, showInflation }));
    setSliders((prev) => {
      const next = buildLanes({
        sliders: prev,
        inputs,
        toggles: { ...toggles, showInflation },
      });
      const updates: Record<string, number> = {};
      for (const lane of [next.A, next.B]) {
        if (lane.displayTarget > 0) {
          updates[`monthlyWithdrawal${lane.id}`] = solveForWithdrawal(
            lane.props,
            lane.displayTarget,
            showInflation,
          );
        }
      }
      return { ...prev, ...updates };
    });
  };

  /* ---------------- Info Panel ---------------- */

  // Fractional year offsets are converted to whole months so partial years
  // (e.g. 10.5) render the correct mid-year date.
  const dateAfterYears = (years: number): string =>
    addMonths(new Date(), Math.round(years * 12)).toDateString();
  const yearsFromToday = (d: Date): number =>
    differenceInCalendarMonths(d, new Date()) / 12;

  const laneRows = (l: Lane): PdfKeyValue[] => {
    const { id, props: p } = l;
    const stop = sliders[`contributionStopYear${id}`];
    const withdrawing = l.withdrawals.length > 0;
    return [
      ...(toggles.advanced
        ? [
            {
              label: `(${id}) Withdrawal Start`,
              value: withdrawing
                ? dateAfterYears(p.yearWithdrawalsBegin)
                : "N/A",
            },
            {
              label: `(${id}) Contributions End`,
              value: stop ? dateAfterYears(stop) : "N/A",
            },
            ...(p.dynamicWithdrawal
              ? [
                  {
                    label: `(${id}) Withdrawal`,
                    value: withdrawing
                      ? `${formatCurrency(Math.min(...l.withdrawals))}–${formatCurrency(Math.max(...l.withdrawals))}/mo (${p.dynamicWithdrawal.ratePct}% of balance)`
                      : "N/A",
                  },
                ]
              : []),
            {
              label: `(${id}) Target Reached`,
              value: l.targetReached
                ? `${l.targetReached.x.getFullYear()} (yr ${yearsFromToday(l.targetReached.x)})`
                : l.displayTarget > 0
                  ? `> ${p.yearsOfGrowth} yrs`
                  : "N/A",
            },
            {
              label: `(${id}) Safe Withdrawal from`,
              value: l.safeFrom
                ? `${l.safeFrom.x.getFullYear()} (${formatCurrency(Math.floor((l.safeFrom.y * p.projectedGain) / 100 / 12))}/mo covered)`
                : withdrawing
                  ? "Not within horizon"
                  : "N/A",
            },
          ]
        : []),
      ...(toggles.fees
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
  const mcRows = (label: string, bands: PercentileBand[]): PdfKeyValue[] => {
    const last = bands.at(-1);
    return last
      ? [
          {
            label: `(${label}) Median Outcome`,
            value: formatCurrency(last.p50),
          },
          { label: `(${label}) Best 10%`, value: formatCurrency(last.p90) },
          { label: `(${label}) Worst 10%`, value: formatCurrency(last.p10) },
        ]
      : [];
  };

  const infoItems: PdfKeyValue[] = [
    ...lanes.flatMap(laneRows),
    {
      label: "Rollover Date",
      value: isRollover(toggles)
        ? dateAfterYears(laneA.props.yearsOfGrowth)
        : "N/A",
    },
    {
      label: "Rollover Amount",
      value: isRollover(toggles) ? formatCurrency(laneA.total) : "N/A",
    },
    {
      label: "Inflation Rate",
      value: `${laneA.props.depreciationRate}%`,
    },
    ...mcRows(mcLabel, mcBandsA),
    ...mcRows("B", mcBandsB),
  ];

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
            onTarget={handleTarget(lane)}
          />
        ))}

        {/* Info / Global Settings Panel */}
        <Panel>
          <ToggleSection>
            <SectionLabel>Core</SectionLabel>
            <TogglesGrid>
              <SwitchRow>
                <Label>Advanced:</Label>
                <SwitchButton
                  label="Advanced"
                  checked={toggles.advanced}
                  onCheckedChange={(v) => updateToggle("advanced", v)}
                />
              </SwitchRow>
              <SwitchRow>
                <Label>Inflated:</Label>
                <SwitchButton
                  label="Inflated"
                  checked={toggles.showInflation}
                  onCheckedChange={handleInflationToggle}
                />
              </SwitchRow>
            </TogglesGrid>

            {toggles.advanced && (
              <>
                <SectionLabel>Tools</SectionLabel>
                <TogglesGrid>
                  {TOOL_TOGGLES.map(([key, label]) => (
                    <SwitchRow key={key}>
                      <Label>{label}:</Label>
                      <SwitchButton
                        label={label}
                        checked={toggles[key]}
                        onCheckedChange={(v) => updateToggle(key, v)}
                      />
                    </SwitchRow>
                  ))}
                </TogglesGrid>
              </>
            )}
          </ToggleSection>
          {toggles.monteCarlo && (
            <ToggleSection>
              <VolatilityRow>
                <InvestmentSlider
                  label={
                    toggles.advanced ? "Volatility A (σ %)" : "Volatility (σ %)"
                  }
                  value={sliders.volatilityA ?? DEFAULT_VOLATILITY}
                  min={1}
                  max={MAX_VOLATILITY}
                  onChange={(v) => updateSlider("volatilityA", v)}
                />
                {toggles.advanced && (
                  <InvestmentSlider
                    label="Volatility B (σ %)"
                    value={sliders.volatilityB ?? DEFAULT_VOLATILITY}
                    min={1}
                    max={MAX_VOLATILITY}
                    onChange={(v) => updateSlider("volatilityB", v)}
                  />
                )}
              </VolatilityRow>
              {toggles.advanced && (
                <SwitchRow>
                  <Label>
                    MC:{" "}
                    {toggles.monteCarloMode === "combined"
                      ? "Combined"
                      : "Individual"}
                  </Label>
                  <SwitchButton
                    label="Monte Carlo mode: individual"
                    checked={toggles.monteCarloMode === "individual"}
                    onCheckedChange={(v) =>
                      updateToggle(
                        "monteCarloMode",
                        v ? "individual" : "combined",
                      )
                    }
                  />
                </SwitchRow>
              )}
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
        </Panel>
      </Grid>

      {/* Totals */}
      <AmountsGrid>
        {lanes.map((lane) => (
          <Popover.Root key={lane.id}>
            <Popover.Trigger>
              <AmountBox>{formatCurrency(lane.total)}</AmountBox>
            </Popover.Trigger>
            <PopoverContent side="bottom">
              <DateAmountTable
                investmentCalc={lane.calc}
                showInflation={toggles.showInflation}
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
        assumptions={[
          {
            label: "Initial Amount (A)",
            value: formatCurrency(laneA.initialAmount),
          },
          { label: "Return Rate (A)", value: `${laneA.props.projectedGain}%` },
          { label: "Years (A)", value: `${laneA.props.yearsOfGrowth}` },
          {
            label: "Monthly Contribution (A)",
            value: formatCurrency(laneA.props.monthlyContribution),
          },
          ...(laneA.props.dynamicWithdrawal
            ? dynamicWithdrawalAssumptions("A", laneA.props.dynamicWithdrawal)
            : [
                {
                  label: "Monthly Withdrawal (A)",
                  value: formatCurrency(laneA.props.monthlyWithdrawal),
                },
              ]),
          {
            label: "Inflation Rate",
            value: `${laneA.props.depreciationRate}%`,
          },
          ...(toggles.fees
            ? [
                {
                  label: "Annual Fee (A)",
                  value: `${laneA.props.annualFee ?? 0}%`,
                },
              ]
            : []),
        ]}
        metrics={infoItems}
      />

      {/* Portfolio Capital Preservation Panel */}
      {toggles.portfolio && (
        <PortfolioPanel
          holdings={stockHoldings}
          setHoldings={setStockHoldings}
          stockApiUrl={stockApiUrl}
          lanes={{
            A: portfolioLane(laneA),
            B: toggles.advanced ? portfolioLane(laneB) : undefined,
          }}
        />
      )}

      {/* FIRE Calculator Panel */}
      {toggles.fire && (
        <FirePanel
          currentSavings={lanes.reduce((sum, l) => sum + l.initialAmount, 0)}
          monthlySavings={lanes.reduce(
            (sum, l) => sum + l.props.monthlyContribution,
            0,
          )}
          annualReturn={laneA.props.projectedGain}
          inflationRate={laneA.props.depreciationRate}
          annualExpenses={sliders.fireAnnualExpenses || 40000}
          safeWithdrawalRate={sliders.fireSWR || 4}
          currentAge={sliders.fireCurrentAge || 30}
          targetRetirementAge={sliders.fireRetirementAge || 65}
          onAnnualExpensesChange={(v) => updateSlider("fireAnnualExpenses", v)}
          onSafeWithdrawalRateChange={(v) => updateSlider("fireSWR", v)}
          onCurrentAgeChange={(v) => updateSlider("fireCurrentAge", v)}
          onTargetRetirementAgeChange={(v) =>
            updateSlider("fireRetirementAge", v)
          }
        />
      )}

      {/* Scenario Snapshots Panel */}
      {toggles.scenarios && (
        <ScenarioPanel
          currentState={currentTH4State}
          onLoadScenario={handleLoadScenario}
          scenarios={scenarios}
          setScenarios={setScenarios}
        />
      )}

      {/* Budget Panel */}
      {toggles.budget && (
        <BudgetPanel
          items={budgetItems}
          setItems={setBudgetItems}
          onAnnualTotalChange={
            toggles.fire
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
