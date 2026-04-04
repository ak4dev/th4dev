/* ==================================================
 * Investment Calculator Component
 * ================================================== */
import { useState, useMemo, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import { styled, keyframes } from "../../stitches.config";
import { InvestmentCalculator } from "../common/helpers/investment-growth-calculator";
import { solveForWithdrawal } from "../common/helpers/solve-for-withdrawal";
import DateAmountTable from "./date-amount-table";
import { InvestmentLineChart } from "./investment-line-chart";
import PortfolioPanel from "./portfolio/PortfolioPanel";
import FirePanel from "./fire/FirePanel";
import ScenarioPanel from "./scenarios/ScenarioPanel";
import PdfExportButton from "./export/PdfExportButton";
import BudgetPanel from "./budget/BudgetPanel";
import { addYears } from "date-fns";
import type { BudgetItem } from "../common/helpers/budget-manager";
import type { ScenarioSnapshot } from "../common/helpers/scenario-manager";
import {
  DEFAULT_INITIAL_AMOUNT,
  DEFAULT_PROJECTED_GAIN,
  DEFAULT_YEARS_OF_GROWTH,
  DEFAULT_INFLATION_RATE,
  MAX_PROJECTED_GAIN,
  MAX_YEARS_OF_GROWTH,
  MAX_MONTHLY_CONTRIBUTION,
  MAX_MONTHLY_WITHDRAWAL,
  MAX_INFLATION_RATE,
  MAX_ANNUAL_FEE,
  DEFAULT_VOLATILITY,
  MAX_VOLATILITY,
  MONTE_CARLO_SIM_COUNT,
  MIN_VALUE,
} from "../common/constants/app-constants";
import { compactModernInputStyles } from "../common/constants/input-styles";
import { runMonteCarloSimulation, runCombinedSimulation, runRolloverSimulation, type PercentileBand } from "../common/helpers/monte-carlo";
import { normalizeState } from "../common/helpers/state-manager";
import type { PortfolioHolding } from "../common/types/portfolio-types";
import type { TH4State } from "../common/types/types";

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

/* ---------------- Helpers ---------------- */
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
  value,
  min,
  max,
  step = 1,
  onChange,
  inputAlign = "right",
  inputGroupSize = "default",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  inputAlign?: "left" | "right";
  inputGroupSize?: "default" | "narrow";
}) {
  const numericValue = Number.isFinite(value) ? value : 0;

  return (
    <SliderControlRow>
      <SliderInputGroup size={inputGroupSize}>
        <SliderInlineLabel>{label}</SliderInlineLabel>
        <SliderValueInput
          align={inputAlign}
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={String(numericValue)}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^0-9.]/g, "");
            const parsed = parseFloat(cleaned);
            if (Number.isNaN(parsed)) return;
            const clamped = Math.min(max, Math.max(min, parsed));
            onChange(clamped);
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
        <SliderThumb />
      </SliderRoot>
    </SliderControlRow>
  );
}
function SwitchButton({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <SwitchRoot checked={checked} onCheckedChange={onCheckedChange}>
      <SwitchThumb />
    </SwitchRoot>
  );
}

/* ---------------- Types ---------------- */
interface TogglesState {
  advanced: boolean;
  rollover: boolean;
  showInflation: boolean;
  portfolio: boolean;
  fees: boolean;
  monteCarlo: boolean;
  fire: boolean;
  scenarios: boolean;
  budget: boolean;
  monteCarloMode: "combined" | "individual";
}

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
    setSliders({ ...sliders, [key]: val });
  const updateInput = (key: string, val: string) =>
    setInputs({ ...inputs, [key]: val });
  const updateToggle = (key: keyof typeof toggles, val: boolean | string) =>
    setToggles({ ...toggles, [key]: val } as typeof toggles);

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
      setStockHoldings(state.stock!.holdings);
      setBudgetItems(state.budgetItems ?? []);
    },
    [setTheme, setSliders, setInputs, setToggles, setStockHoldings, setBudgetItems],
  );

  // ---------------- Investment A ----------------
  const invAProps = {
    currentAmount: inputs.currentAmountA || String(DEFAULT_INITIAL_AMOUNT),
    projectedGain: sliders.projectedGainA || DEFAULT_PROJECTED_GAIN,
    yearsOfGrowth: sliders.yearsOfGrowthA || DEFAULT_YEARS_OF_GROWTH,
    monthlyContribution: sliders.monthlyContributionA || MIN_VALUE,
    monthlyWithdrawal: sliders.monthlyWithdrawalA || MIN_VALUE,
    yearContributionsStop:
      sliders.contributionStopYearA ?? sliders.yearsOfGrowthA,
    yearWithdrawalsBegin: sliders.withdrawalStartYearA || MIN_VALUE,
    advanced: toggles.advanced,
    depreciationRate: sliders.yearlyInflation || DEFAULT_INFLATION_RATE,
    annualFee: toggles.fees ? sliders.annualFeeA || 0 : 0,
    rollOver: false,
    investmentId: "investmentA",
    setCurrentAmount: (v: string | undefined) =>
      updateInput("currentAmountA", v ?? ""),
    setProjectedGain: (v: number) => updateSlider("projectedGainA", v),
    setYearsOfGrowth: (v: number) => updateSlider("yearsOfGrowthA", v),
    setMonthlyContribution: (v: number) =>
      updateSlider("monthlyContributionA", v),
    setMonthlyWithdrawal: (v: number) => updateSlider("monthlyWithdrawalA", v),
    setYearWithdrawalsBegin: (v: number) =>
      updateSlider("withdrawalStartYearA", v),
    setYearContributionsStop: (v: number | undefined) => {
      if (v !== undefined) updateSlider("contributionStopYearA", v);
    },
    maxMonthlyWithdrawal: MAX_MONTHLY_WITHDRAWAL,
  };
  const calcA = new InvestmentCalculator(invAProps);
  const totalA = calcA.calculateGrowth(toggles.showInflation).numeric;

  // ---------------- Investment B ----------------
  const invBProps = {
    currentAmount: inputs.currentAmountB || String(DEFAULT_INITIAL_AMOUNT),
    projectedGain: sliders.projectedGainB || DEFAULT_PROJECTED_GAIN,
    yearsOfGrowth: sliders.yearsOfGrowthB || DEFAULT_YEARS_OF_GROWTH,
    monthlyContribution: sliders.monthlyContributionB || MIN_VALUE,
    monthlyWithdrawal: sliders.monthlyWithdrawalB || MIN_VALUE,
    yearContributionsStop:
      sliders.contributionStopYearB ?? sliders.yearsOfGrowthB,
    yearWithdrawalsBegin: sliders.withdrawalStartYearB || MIN_VALUE,
    advanced: toggles.advanced,
    depreciationRate: sliders.yearlyInflation || DEFAULT_INFLATION_RATE,
    annualFee: toggles.fees ? sliders.annualFeeB || 0 : 0,
    rollOver: toggles.rollover,
    investmentToRoll: toggles.rollover ? totalA : 0,
    yearOfRollover: toggles.rollover ? sliders.yearsOfGrowthA : undefined,
    investmentId: "investmentB",
    setCurrentAmount: (v: string | undefined) =>
      updateInput("currentAmountB", v ?? ""),
    setProjectedGain: (v: number) => updateSlider("projectedGainB", v),
    setYearsOfGrowth: (v: number) => updateSlider("yearsOfGrowthB", v),
    setMonthlyContribution: (v: number) =>
      updateSlider("monthlyContributionB", v),
    setMonthlyWithdrawal: (v: number) => updateSlider("monthlyWithdrawalB", v),
    setYearWithdrawalsBegin: (v: number) =>
      updateSlider("withdrawalStartYearB", v),
    setYearContributionsStop: (v: number | undefined) => {
      if (v !== undefined) updateSlider("contributionStopYearB", v);
    },
    maxMonthlyWithdrawal: MAX_MONTHLY_WITHDRAWAL,
  };
  const calcB = new InvestmentCalculator(invBProps);
  const totalB = calcB.calculateGrowth(toggles.showInflation).numeric;

  // ---------------- Monte Carlo Simulation ----------------

  const mcParamsA = {
    initialAmount: parseInt(invAProps.currentAmount || "0") || 0,
    projectedGain: invAProps.projectedGain,
    yearsOfGrowth: invAProps.yearsOfGrowth,
    monthlyContribution: invAProps.monthlyContribution,
    monthlyWithdrawal: invAProps.monthlyWithdrawal,
    withdrawalStartYear: invAProps.yearWithdrawalsBegin,
    contributionStopYear: invAProps.yearContributionsStop,
    depreciationRate: invAProps.depreciationRate,
    annualFee: invAProps.annualFee,
    showInflation: toggles.showInflation,
    volatility: sliders.volatilityA || DEFAULT_VOLATILITY,
    simCount: MONTE_CARLO_SIM_COUNT,
  };

  const mcParamsB = {
    initialAmount: parseInt(invBProps.currentAmount || "0") || 0,
    projectedGain: invBProps.projectedGain,
    yearsOfGrowth: invBProps.yearsOfGrowth,
    monthlyContribution: invBProps.monthlyContribution,
    monthlyWithdrawal: invBProps.monthlyWithdrawal,
    withdrawalStartYear: invBProps.yearWithdrawalsBegin,
    contributionStopYear: invBProps.yearContributionsStop,
    depreciationRate: invBProps.depreciationRate,
    annualFee: invBProps.annualFee,
    showInflation: toggles.showInflation,
    volatility: sliders.volatilityB || DEFAULT_VOLATILITY,
    simCount: MONTE_CARLO_SIM_COUNT,
  };

  let mcBandsA: PercentileBand[] = [];
  let mcBandsB: PercentileBand[] = [];
  if (toggles.monteCarlo) {
    if (toggles.rollover) {
      // Rollover ON: single bloom with A's value injected into B
      mcBandsA = runRolloverSimulation(
        mcParamsA,
        mcParamsB,
        sliders.yearsOfGrowthA || DEFAULT_YEARS_OF_GROWTH,
      );
    } else if (toggles.advanced && toggles.monteCarloMode === "combined") {
      mcBandsA = runCombinedSimulation(mcParamsA, mcParamsB);
    } else if (toggles.advanced && toggles.monteCarloMode === "individual") {
      mcBandsA = runMonteCarloSimulation(mcParamsA);
      const rawBandsB = runMonteCarloSimulation(mcParamsB);
      const offsetYears = mcParamsA.yearsOfGrowth;
      mcBandsB = rawBandsB.map((b) => ({ ...b, year: b.year + offsetYears }));
    } else {
      mcBandsA = runMonteCarloSimulation(mcParamsA);
    }
  }

  // ---------------- Target Value Handlers ----------------

  /**
   * When the user sets a target value, solve for the monthly withdrawal that
   * results in that ending balance (at the current return % and withdrawal start
   * year). Both slider values are committed atomically to avoid stale-closure
   * clobbering.
   */
  const handleTargetA = (target: number) => {
    // target arrives in current display units; store as nominal so it is
    // stable across inflation-toggle round-trips.
    const nominalTarget = toggles.showInflation
      ? Math.round(target * (inflatedMaxA > 0 ? nominalMaxA / inflatedMaxA : 1))
      : target;
    const withdrawal = solveForWithdrawal(
      invAProps,
      target,
      toggles.showInflation,
    );
    setSliders((prev) => ({
      ...prev,
      targetValueA: nominalTarget,
      monthlyWithdrawalA: withdrawal,
    }));
  };

  const handleTargetB = (target: number) => {
    const nominalTarget = toggles.showInflation
      ? Math.round(target * (inflatedMaxB > 0 ? nominalMaxB / inflatedMaxB : 1))
      : target;
    const withdrawal = solveForWithdrawal(
      invBProps,
      target,
      toggles.showInflation,
    );
    setSliders((prev) => ({
      ...prev,
      targetValueB: nominalTarget,
      monthlyWithdrawalB: withdrawal,
    }));
  };

  /**
   * When the inflation toggle changes, re-solve the monthly withdrawal that
   * achieves the stored (always-nominal) target in the new display mode.
   * The target value itself is never modified — it is always stored as nominal
   * and converted to display units by the render layer.
   */
  const handleInflationToggle = (nextShowInflation: boolean) => {
    setToggles((prev) => ({ ...prev, showInflation: nextShowInflation }));
    setSliders((prev) => {
      const updates: Record<string, number> = {};

      const invAPropsFromPrev = {
        ...invAProps,
        projectedGain: prev.projectedGainA || DEFAULT_PROJECTED_GAIN,
        yearsOfGrowth: prev.yearsOfGrowthA || DEFAULT_YEARS_OF_GROWTH,
        monthlyContribution: prev.monthlyContributionA || MIN_VALUE,
        monthlyWithdrawal: prev.monthlyWithdrawalA || MIN_VALUE,
        yearContributionsStop:
          prev.contributionStopYearA ?? prev.yearsOfGrowthA,
        yearWithdrawalsBegin: prev.withdrawalStartYearA || MIN_VALUE,
      };

      const baseA0ForMax = new InvestmentCalculator({
        ...invAPropsFromPrev,
        monthlyWithdrawal: 0,
      });
      const nominalMaxAForToggle =
        baseA0ForMax.calculateGrowth(false).numeric || 1;
      const inflatedMaxAForToggle = baseA0ForMax.calculateGrowth(true).numeric;

      if (prev.targetValueA) {
        const displayTargetAForToggle = nextShowInflation
          ? Math.round(
              prev.targetValueA *
                (inflatedMaxAForToggle / nominalMaxAForToggle),
            )
          : prev.targetValueA;
        updates.monthlyWithdrawalA = solveForWithdrawal(
          invAPropsFromPrev,
          displayTargetAForToggle,
          nextShowInflation,
        );
      }

      const totalAForRollover = new InvestmentCalculator(
        invAPropsFromPrev,
      ).calculateGrowth(nextShowInflation).numeric;

      const invBPropsFromPrev = {
        ...invBProps,
        projectedGain: prev.projectedGainB || DEFAULT_PROJECTED_GAIN,
        yearsOfGrowth: prev.yearsOfGrowthB || DEFAULT_YEARS_OF_GROWTH,
        monthlyContribution: prev.monthlyContributionB || MIN_VALUE,
        monthlyWithdrawal: prev.monthlyWithdrawalB || MIN_VALUE,
        yearContributionsStop:
          prev.contributionStopYearB ?? prev.yearsOfGrowthB,
        yearWithdrawalsBegin: prev.withdrawalStartYearB || MIN_VALUE,
        investmentToRoll: toggles.rollover ? totalAForRollover : 0,
      };

      const baseB0ForMax = new InvestmentCalculator({
        ...invBPropsFromPrev,
        monthlyWithdrawal: 0,
      });
      const nominalMaxBForToggle =
        baseB0ForMax.calculateGrowth(false).numeric || 1;
      const inflatedMaxBForToggle = baseB0ForMax.calculateGrowth(true).numeric;

      if (prev.targetValueB) {
        const displayTargetBForToggle = nextShowInflation
          ? Math.round(
              prev.targetValueB *
                (inflatedMaxBForToggle / nominalMaxBForToggle),
            )
          : prev.targetValueB;
        updates.monthlyWithdrawalB = solveForWithdrawal(
          invBPropsFromPrev,
          displayTargetBForToggle,
          nextShowInflation,
        );
      }

      return { ...prev, ...updates };
    });
  };

  /* ---------------- Compute Info Panel Values ---------------- */

  // Slider max = the ending balance if no withdrawal is taken (true ceiling).
  // We need both nominal and inflated maxes: nominal is the stable base for
  // storing targets; inflated is used when the inflation toggle is on.
  const baseA0ForMax = new InvestmentCalculator({
    ...invAProps,
    monthlyWithdrawal: 0,
  });
  const nominalMaxA = baseA0ForMax.calculateGrowth(false).numeric || 1;
  const inflatedMaxA = baseA0ForMax.calculateGrowth(true).numeric;
  const maxTargetA = toggles.showInflation ? inflatedMaxA : nominalMaxA;

  const baseB0ForMax = new InvestmentCalculator({
    ...invBProps,
    monthlyWithdrawal: 0,
  });
  const nominalMaxB = baseB0ForMax.calculateGrowth(false).numeric || 1;
  const inflatedMaxB = baseB0ForMax.calculateGrowth(true).numeric;
  const maxTargetB = toggles.showInflation ? inflatedMaxB : nominalMaxB;

  // Display targets: targetValueA/B are always stored as nominal; convert to
  // current display mode for sliders, inputs, and chart annotations.
  const displayTargetA = sliders.targetValueA
    ? toggles.showInflation
      ? Math.round(sliders.targetValueA * (inflatedMaxA / nominalMaxA))
      : sliders.targetValueA
    : 0;
  const displayTargetB = sliders.targetValueB
    ? toggles.showInflation
      ? Math.round(sliders.targetValueB * (inflatedMaxB / nominalMaxB))
      : sliders.targetValueB
    : 0;

  // Scan growth matrix for the first year the portfolio meets/exceeds the target
  const matrixA = calcA.getGrowthMatrix();
  const targetReachedA =
    displayTargetA > 0 ? matrixA.find((e) => e.y >= displayTargetA) : null;

  const matrixB = calcB.getGrowthMatrix();
  const targetReachedB =
    toggles.advanced && displayTargetB > 0
      ? matrixB.find((e) => e.y >= displayTargetB)
      : null;

  // Earliest year where annual growth alone covers all monthly withdrawals
  const annualWithdrawalA = (sliders.monthlyWithdrawalA || 0) * 12;
  const earliestSafeWithdrawalA =
    annualWithdrawalA > 0
      ? matrixA.find(
          (e) =>
            e.y * ((sliders.projectedGainA || DEFAULT_PROJECTED_GAIN) / 100) >=
            annualWithdrawalA,
        )
      : null;

  const annualWithdrawalB = (sliders.monthlyWithdrawalB || 0) * 12;
  const earliestSafeWithdrawalB =
    annualWithdrawalB > 0 && toggles.advanced
      ? matrixB.find(
          (e) =>
            e.y * ((sliders.projectedGainB || DEFAULT_PROJECTED_GAIN) / 100) >=
            annualWithdrawalB,
        )
      : null;

  // Dynamic step for target slider: 1 order of magnitude below the portfolio value
  const targetStepA = Math.pow(
    10,
    Math.max(2, Math.floor(Math.log10(Math.max(totalA, 1000))) - 1),
  );
  const targetStepB = Math.pow(
    10,
    Math.max(2, Math.floor(Math.log10(Math.max(totalB, 1000))) - 1),
  );

  const infoItems = [
    {
      label: "(A) Withdrawal Start",
      value: sliders.withdrawalStartYearA
        ? addYears(new Date(), sliders.withdrawalStartYearA).toDateString()
        : sliders.monthlyWithdrawalA
          ? new Date().toDateString()
          : "N/A",
    },
    {
      label: "(B) Withdrawal Start",
      value: sliders.withdrawalStartYearB
        ? addYears(new Date(), sliders.withdrawalStartYearB).toDateString()
        : sliders.monthlyWithdrawalB
          ? new Date().toDateString()
          : "N/A",
    },
    {
      label: "(A) Contributions End",
      value: sliders.contributionStopYearA
        ? addYears(new Date(), sliders.contributionStopYearA).toDateString()
        : "N/A",
    },
    {
      label: "(B) Contributions End",
      value: sliders.contributionStopYearB
        ? addYears(new Date(), sliders.contributionStopYearB).toDateString()
        : "N/A",
    },
    {
      label: "Rollover Date",
      value:
        toggles.rollover && sliders.yearsOfGrowthA
          ? addYears(new Date(), sliders.yearsOfGrowthA).toDateString()
          : "N/A",
    },
    {
      label: "Rollover Amount",
      value: toggles.rollover ? `$${totalA.toLocaleString()}` : "N/A",
    },
    {
      label: "Inflation Rate",
      value: `${sliders.yearlyInflation || DEFAULT_INFLATION_RATE}%`,
    },
    {
      label: "(A) Target Reached",
      value: targetReachedA
        ? `${targetReachedA.x.getFullYear()} (yr ${matrixA.indexOf(targetReachedA)})`
        : displayTargetA > 0
          ? `> ${sliders.yearsOfGrowthA || DEFAULT_YEARS_OF_GROWTH} yrs`
          : "N/A",
    },
    ...(toggles.advanced
      ? [
          {
            label: "(B) Target Reached",
            value: targetReachedB
              ? `${targetReachedB.x.getFullYear()} (yr ${matrixB.indexOf(targetReachedB)})`
              : displayTargetB > 0
                ? `> ${sliders.yearsOfGrowthB || DEFAULT_YEARS_OF_GROWTH} yrs`
                : "N/A",
          },
        ]
      : []),
    {
      label: "(A) Safe Withdrawal from",
      value: earliestSafeWithdrawalA
        ? `${earliestSafeWithdrawalA.x.getFullYear()} ($${Math.floor((earliestSafeWithdrawalA.y * (sliders.projectedGainA || DEFAULT_PROJECTED_GAIN)) / 100 / 12).toLocaleString()}/mo covered)`
        : annualWithdrawalA > 0
          ? "Not within horizon"
          : "N/A",
    },
    ...(toggles.advanced
      ? [
          {
            label: "(B) Safe Withdrawal from",
            value: earliestSafeWithdrawalB
              ? `${earliestSafeWithdrawalB.x.getFullYear()} ($${Math.floor((earliestSafeWithdrawalB.y * (sliders.projectedGainB || DEFAULT_PROJECTED_GAIN)) / 100 / 12).toLocaleString()}/mo covered)`
              : annualWithdrawalB > 0
                ? "Not within horizon"
                : "N/A",
          },
        ]
      : []),
    ...(toggles.fees
      ? [
          {
            label: "(A) Fees Paid",
            value: `$${calcA.getCumulativeFees().toLocaleString()}`,
          },
          ...(toggles.advanced
            ? [
                {
                  label: "(B) Fees Paid",
                  value: `$${calcB.getCumulativeFees().toLocaleString()}`,
                },
              ]
            : []),
        ]
      : []),
    ...(toggles.monteCarlo && mcBandsA.length > 0
      ? [
          {
            label: "(A) Median Outcome",
            value: `$${mcBandsA[mcBandsA.length - 1].p50.toLocaleString()}`,
          },
          {
            label: "(A) Best 10%",
            value: `$${mcBandsA[mcBandsA.length - 1].p90.toLocaleString()}`,
          },
          {
            label: "(A) Worst 10%",
            value: `$${mcBandsA[mcBandsA.length - 1].p10.toLocaleString()}`,
          },
        ]
      : []),
  ];

  return (
    <Container>
      <Grid>
        {/* Investment A Panel */}
        <Panel>
          <CurrencyInput
            value={inputs.currentAmountA}
            onChange={(v) => updateInput("currentAmountA", v)}
            fullWidth
            align="center"
          />
          <InvestmentSlider
            label="Return (%)"
            value={sliders.projectedGainA}
            min={MIN_VALUE}
            max={MAX_PROJECTED_GAIN}
            onChange={(v) => updateSlider("projectedGainA", v)}
          />
          <InvestmentSlider
            label="Years"
            value={sliders.yearsOfGrowthA}
            min={MIN_VALUE}
            max={MAX_YEARS_OF_GROWTH}
            step={0.5}
            onChange={(v) => updateSlider("yearsOfGrowthA", v)}
          />
          {toggles.advanced && (
            <>
              <InvestmentSlider
                label="Monthly Contribution"
                value={sliders.monthlyContributionA}
                min={MIN_VALUE}
                max={MAX_MONTHLY_CONTRIBUTION}
                onChange={(v) => updateSlider("monthlyContributionA", v)}
              />
              <InvestmentSlider
                label="Contribution Stop Year"
                value={sliders.contributionStopYearA}
                min={MIN_VALUE}
                max={sliders.yearsOfGrowthA}
                step={0.5}
                onChange={(v) => updateSlider("contributionStopYearA", v)}
              />
              <InvestmentSlider
                label="Monthly Withdrawal"
                value={sliders.monthlyWithdrawalA}
                min={MIN_VALUE}
                max={MAX_MONTHLY_WITHDRAWAL}
                onChange={(v) => updateSlider("monthlyWithdrawalA", v)}
              />
              <InvestmentSlider
                label="Withdrawal Start Year"
                value={sliders.withdrawalStartYearA || MIN_VALUE}
                min={MIN_VALUE}
                max={sliders.yearsOfGrowthA}
                step={0.5}
                onChange={(v) => updateSlider("withdrawalStartYearA", v)}
              />
              {toggles.fees && (
                <InvestmentSlider
                  label="Annual Fee (%)"
                  value={sliders.annualFeeA || 0}
                  min={0}
                  max={MAX_ANNUAL_FEE}
                  step={0.01}
                  onChange={(v) => updateSlider("annualFeeA", v)}
                />
              )}
            </>
          )}
          {/* Target value — sets the monthly withdrawal to reach this balance */}
          <SliderControlRow>
            <SliderInputGroup>
              <SliderInlineLabel>Target Value</SliderInlineLabel>
              <SliderValueInput
                type="text"
                inputMode="numeric"
                aria-label="Target Value"
                value={displayTargetA ? String(displayTargetA) : ""}
                onChange={(e) =>
                  handleTargetA(
                    Number(e.target.value.replace(/[^0-9]/g, "")) || 0,
                  )
                }
              />
            </SliderInputGroup>
            <SliderRoot
              value={[Math.min(displayTargetA, maxTargetA)]}
              min={0}
              max={maxTargetA}
              step={targetStepA}
              onValueChange={(val) => handleTargetA(val[0])}
            >
              <SliderTrack>
                <SliderRange />
              </SliderTrack>
              <SliderThumb />
            </SliderRoot>
          </SliderControlRow>
        </Panel>

        {/* Investment B Panel */}
        {toggles.advanced && (
          <Panel>
            <CurrencyInput
              value={inputs.currentAmountB}
              onChange={(v) => updateInput("currentAmountB", v)}
              fullWidth
              align="center"
            />
            <InvestmentSlider
              label="Return (%)"
              value={sliders.projectedGainB}
              min={MIN_VALUE}
              max={MAX_PROJECTED_GAIN}
              onChange={(v) => updateSlider("projectedGainB", v)}
            />
            <InvestmentSlider
              label="Years"
              value={sliders.yearsOfGrowthB}
              min={MIN_VALUE}
              max={MAX_YEARS_OF_GROWTH}
              step={0.5}
              onChange={(v) => updateSlider("yearsOfGrowthB", v)}
            />
            <InvestmentSlider
              label="Monthly Contribution"
              value={sliders.monthlyContributionB}
              min={MIN_VALUE}
              max={MAX_MONTHLY_CONTRIBUTION}
              onChange={(v) => updateSlider("monthlyContributionB", v)}
            />
            <InvestmentSlider
              label="Contribution Stop Year"
              value={sliders.contributionStopYearB}
              min={MIN_VALUE}
              max={sliders.yearsOfGrowthB}
              step={0.5}
              onChange={(v) => updateSlider("contributionStopYearB", v)}
            />
            <InvestmentSlider
              label="Monthly Withdrawal"
              value={sliders.monthlyWithdrawalB}
              min={MIN_VALUE}
              max={MAX_MONTHLY_WITHDRAWAL}
              onChange={(v) => updateSlider("monthlyWithdrawalB", v)}
            />
            <InvestmentSlider
              label="Withdrawal Start Year"
              value={sliders.withdrawalStartYearB || MIN_VALUE}
              min={MIN_VALUE}
              max={sliders.yearsOfGrowthB}
              step={0.5}
              onChange={(v) => updateSlider("withdrawalStartYearB", v)}
            />
            {toggles.fees && (
              <InvestmentSlider
                label="Annual Fee (%)"
                value={sliders.annualFeeB || 0}
                min={0}
                max={MAX_ANNUAL_FEE}
                step={0.01}
                onChange={(v) => updateSlider("annualFeeB", v)}
              />
            )}
            {/* Target value for Investment B */}
            <SliderControlRow>
              <SliderInputGroup>
                <SliderInlineLabel>Target Value</SliderInlineLabel>
                <SliderValueInput
                  type="text"
                  inputMode="numeric"
                  aria-label="Target Value"
                  value={displayTargetB ? String(displayTargetB) : ""}
                  onChange={(e) =>
                    handleTargetB(
                      Number(e.target.value.replace(/[^0-9]/g, "")) || 0,
                    )
                  }
                />
              </SliderInputGroup>
              <SliderRoot
                value={[Math.min(displayTargetB, maxTargetB)]}
                min={0}
                max={maxTargetB}
                step={targetStepB}
                onValueChange={(val) => handleTargetB(val[0])}
              >
                <SliderTrack>
                  <SliderRange />
                </SliderTrack>
                <SliderThumb />
              </SliderRoot>
            </SliderControlRow>
          </Panel>
        )}

        {/* Info / Global Settings Panel */}
        <Panel>
          <ToggleSection>
            <SectionLabel>Core</SectionLabel>
            <TogglesGrid>
              <SwitchRow>
                <Label>Advanced:</Label>
                <SwitchButton
                  checked={toggles.advanced}
                  onCheckedChange={(v) => updateToggle("advanced", v)}
                />
              </SwitchRow>
              <SwitchRow>
                <Label>Inflated:</Label>
                <SwitchButton
                  checked={toggles.showInflation}
                  onCheckedChange={(v) => handleInflationToggle(v)}
                />
              </SwitchRow>
            </TogglesGrid>

            {toggles.advanced && (
              <>
                <SectionLabel>Tools</SectionLabel>
                <TogglesGrid>
                  <SwitchRow>
                    <Label>Rollover:</Label>
                    <SwitchButton
                      checked={toggles.rollover}
                      onCheckedChange={(v) => updateToggle("rollover", v)}
                    />
                  </SwitchRow>
                  <SwitchRow>
                    <Label>Fees:</Label>
                    <SwitchButton
                      checked={toggles.fees}
                      onCheckedChange={(v) => updateToggle("fees", v)}
                    />
                  </SwitchRow>
                  <SwitchRow>
                    <Label>Portfolio:</Label>
                    <SwitchButton
                      checked={toggles.portfolio}
                      onCheckedChange={(v) => updateToggle("portfolio", v)}
                    />
                  </SwitchRow>
                  <SwitchRow>
                    <Label>Monte Carlo:</Label>
                    <SwitchButton
                      checked={toggles.monteCarlo}
                      onCheckedChange={(v) => updateToggle("monteCarlo", v)}
                    />
                  </SwitchRow>
                  <SwitchRow>
                    <Label>FIRE:</Label>
                    <SwitchButton
                      checked={toggles.fire}
                      onCheckedChange={(v) => updateToggle("fire", v)}
                    />
                  </SwitchRow>
                  <SwitchRow>
                    <Label>Scenarios:</Label>
                    <SwitchButton
                      checked={toggles.scenarios}
                      onCheckedChange={(v) => updateToggle("scenarios", v)}
                    />
                  </SwitchRow>
                  <SwitchRow>
                    <Label>Budget:</Label>
                    <SwitchButton
                      checked={toggles.budget}
                      onCheckedChange={(v) => updateToggle("budget", v)}
                    />
                  </SwitchRow>
                </TogglesGrid>
              </>
            )}
          </ToggleSection>
          {toggles.monteCarlo && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <InvestmentSlider
                    label={toggles.advanced ? "Volatility A (σ %)" : "Volatility (σ %)"}
                    value={sliders.volatilityA || DEFAULT_VOLATILITY}
                    min={1}
                    max={MAX_VOLATILITY}
                    step={1}
                    onChange={(v) => updateSlider("volatilityA", v)}
                  />
                </div>
                {toggles.advanced && (
                  <div style={{ flex: 1 }}>
                    <InvestmentSlider
                      label="Volatility B (σ %)"
                      value={sliders.volatilityB || DEFAULT_VOLATILITY}
                      min={1}
                      max={MAX_VOLATILITY}
                      step={1}
                      onChange={(v) => updateSlider("volatilityB", v)}
                    />
                  </div>
                )}
              </div>
              {toggles.advanced && (
                <SwitchRow>
                  <Label>
                    MC: {toggles.monteCarloMode === "combined" ? "Combined" : "Individual"}
                  </Label>
                  <SwitchButton
                    checked={toggles.monteCarloMode === "individual"}
                    onCheckedChange={(v) =>
                      updateToggle("monteCarloMode", v ? "individual" : "combined")
                    }
                  />
                </SwitchRow>
              )}
            </div>
          )}
          <InvestmentSlider
            label="Inflation (%)"
            value={sliders.yearlyInflation || DEFAULT_INFLATION_RATE}
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
        <Popover.Root>
          <Popover.Trigger>
            <AmountBox>${totalA.toLocaleString()}</AmountBox>
          </Popover.Trigger>
          <PopoverContent side="bottom">
            <DateAmountTable investmentCalc={calcA} />
          </PopoverContent>
        </Popover.Root>
        {toggles.advanced && (
          <Popover.Root>
            <Popover.Trigger>
              <AmountBox>${totalB.toLocaleString()}</AmountBox>
            </Popover.Trigger>
            <PopoverContent side="bottom">
              <DateAmountTable investmentCalc={calcB} />
            </PopoverContent>
          </Popover.Root>
        )}
      </AmountsGrid>

      {/* Chart */}
      <InvestmentLineChart
        growthMatrixA={calcA.getGrowthMatrix()}
        growthMatrixB={toggles.advanced ? calcB.getGrowthMatrix() : undefined}
        advanced={toggles.advanced}
        yearOfRollover={toggles.rollover ? sliders.yearsOfGrowthA : undefined}
        targetValueA={displayTargetA || undefined}
        targetValueB={
          toggles.advanced ? displayTargetB || undefined : undefined
        }
        mcBandsA={toggles.monteCarlo ? mcBandsA : undefined}
        mcBandsB={toggles.monteCarlo && mcBandsB.length > 0 ? mcBandsB : undefined}
      />

      {/* PDF Export */}
      <PdfExportButton
        chartSelector=".recharts-wrapper"
        assumptions={[
          { label: "Initial Amount (A)", value: `$${(parseInt(inputs.currentAmountA || "0") || 0).toLocaleString()}` },
          { label: "Return Rate (A)", value: `${sliders.projectedGainA || DEFAULT_PROJECTED_GAIN}%` },
          { label: "Years (A)", value: `${sliders.yearsOfGrowthA || DEFAULT_YEARS_OF_GROWTH}` },
          { label: "Monthly Contribution (A)", value: `$${(sliders.monthlyContributionA || 0).toLocaleString()}` },
          { label: "Monthly Withdrawal (A)", value: `$${(sliders.monthlyWithdrawalA || 0).toLocaleString()}` },
          { label: "Inflation Rate", value: `${sliders.yearlyInflation || DEFAULT_INFLATION_RATE}%` },
          ...(toggles.fees ? [{ label: "Annual Fee (A)", value: `${sliders.annualFeeA || 0}%` }] : []),
        ]}
        metrics={infoItems}
      />

      {/* Portfolio Capital Preservation Panel */}
      {toggles.portfolio && (
        <PortfolioPanel
          holdings={stockHoldings}
          setHoldings={setStockHoldings}
          stockApiUrl={stockApiUrl}
          defaultPortfolioValue={totalA}
          monthlyWithdrawal={sliders.monthlyWithdrawalA || MIN_VALUE}
          projectedGain={sliders.projectedGainA || DEFAULT_PROJECTED_GAIN}
          withdrawalStartYear={sliders.withdrawalStartYearA || 0}
          yearsForward={sliders.yearsOfGrowthA || DEFAULT_YEARS_OF_GROWTH}
          growthMatrix={calcA.getGrowthMatrix()}
          withdrawalStartYearB={
            toggles.advanced ? sliders.withdrawalStartYearB || 0 : undefined
          }
          growthMatrixB={toggles.advanced ? calcB.getGrowthMatrix() : undefined}
          defaultPortfolioValueB={toggles.advanced ? totalB : undefined}
          monthlyWithdrawalB={
            toggles.advanced
              ? sliders.monthlyWithdrawalB || MIN_VALUE
              : undefined
          }
          yearsForwardB={
            toggles.advanced
              ? sliders.yearsOfGrowthB || DEFAULT_YEARS_OF_GROWTH
              : undefined
          }
        />
      )}

      {/* FIRE Calculator Panel */}
      {toggles.fire && (
        <FirePanel
          currentSavings={
            (parseInt(inputs.currentAmountA || "0") || 0) +
            (toggles.advanced ? parseInt(inputs.currentAmountB || "0") || 0 : 0)
          }
          monthlySavings={
            (sliders.monthlyContributionA || 0) +
            (toggles.advanced ? sliders.monthlyContributionB || 0 : 0)
          }
          annualReturn={sliders.projectedGainA || DEFAULT_PROJECTED_GAIN}
          inflationRate={sliders.yearlyInflation || DEFAULT_INFLATION_RATE}
          annualExpenses={sliders.fireAnnualExpenses || 40000}
          safeWithdrawalRate={sliders.fireSWR || 4}
          currentAge={sliders.fireCurrentAge || 30}
          targetRetirementAge={sliders.fireRetirementAge || 65}
          onAnnualExpensesChange={(v) => updateSlider("fireAnnualExpenses", v)}
          onSafeWithdrawalRateChange={(v) => updateSlider("fireSWR", v)}
          onCurrentAgeChange={(v) => updateSlider("fireCurrentAge", v)}
          onTargetRetirementAgeChange={(v) => updateSlider("fireRetirementAge", v)}
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
          onSetMonthlyWithdrawal={(monthly) =>
            updateSlider("monthlyWithdrawalA", monthly)
          }
        />
      )}
    </Container>
  );
}
