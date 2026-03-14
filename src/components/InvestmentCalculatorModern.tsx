/* ==================================================
 * Investment Calculator Component
 * ================================================== */
import { useState } from "react";
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
import { addYears } from "date-fns";
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
  MIN_VALUE,
} from "../common/constants/app-constants";
import type { PortfolioHolding } from "../common/types/portfolio-types";

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
  backgroundColor: "$currentLine",
  color: "$foreground",
  border: "1px solid $green",
  borderRadius: "6px",
  padding: "8px 12px",
  fontSize: "1rem",
  width: "100%",
  transition: "all 0.2s ease",
  "&:focus": {
    borderColor: "$cyan",
    outline: "none",
    boxShadow: "0 0 0 3px $cyan",
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
  width: "100%",
  height: "24px",
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
  display: "flex",
  gap: "12px",
  alignItems: "center",
});

/* ---------------- Helpers ---------------- */
function CurrencyInput({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const display = editing
    ? draft
    : value
      ? `$${parseInt(value).toLocaleString()}`
      : "";

  return (
    <InputField
      type="text"
      value={display}
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label>
        {label}: {value}
      </Label>
      <SliderRoot
        value={[value]}
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
    </div>
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
}

interface InvestmentCalculatorModernProps {
  sliders: Record<string, number>;
  setSliders: Dispatch<SetStateAction<Record<string, number>>>;
  inputs: Record<string, string>;
  setInputs: Dispatch<SetStateAction<Record<string, string>>>;
  toggles: TogglesState;
  setToggles: Dispatch<SetStateAction<TogglesState>>;
  stockApiUrl: string;
  stockHoldings: PortfolioHolding[];
  setStockHoldings: Dispatch<SetStateAction<PortfolioHolding[]>>;
}

/* ---------------- Main Component ---------------- */
export default function InvestmentCalculatorRadixModern({
  sliders,
  setSliders,
  inputs,
  setInputs,
  toggles,
  setToggles,
  stockApiUrl,
  stockHoldings,
  setStockHoldings,
}: InvestmentCalculatorModernProps) {
  const updateSlider = (key: string, val: number) =>
    setSliders({ ...sliders, [key]: val });
  const updateInput = (key: string, val: string) =>
    setInputs({ ...inputs, [key]: val });
  const updateToggle = (key: keyof typeof toggles, val: boolean) =>
    setToggles({ ...toggles, [key]: val });

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
    setYearContributionsStop: (v: number | undefined) =>
      updateSlider("contributionStopYearA", v ?? 0),
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
    setYearContributionsStop: (v: number | undefined) =>
      updateSlider("contributionStopYearB", v ?? 0),
    maxMonthlyWithdrawal: MAX_MONTHLY_WITHDRAWAL,
  };
  const calcB = new InvestmentCalculator(invBProps);
  const totalB = calcB.calculateGrowth(toggles.showInflation).numeric;

  // ---------------- Target Value Handlers ----------------

  /**
   * When the user sets a target value, solve for the monthly withdrawal that
   * results in that ending balance (at the current return % and withdrawal start
   * year). Both slider values are committed atomically to avoid stale-closure
   * clobbering.
   */
  const handleTargetA = (target: number) => {
    if (target > 0) {
      const withdrawal = solveForWithdrawal(
        invAProps,
        target,
        toggles.showInflation,
      );
      setSliders((prev) => ({
        ...prev,
        targetValueA: target,
        monthlyWithdrawalA: withdrawal,
      }));
    } else {
      setSliders((prev) => ({ ...prev, targetValueA: 0 }));
    }
  };

  const handleTargetB = (target: number) => {
    if (target > 0) {
      const withdrawal = solveForWithdrawal(
        invBProps,
        target,
        toggles.showInflation,
      );
      setSliders((prev) => ({
        ...prev,
        targetValueB: target,
        monthlyWithdrawalB: withdrawal,
      }));
    } else {
      setSliders((prev) => ({ ...prev, targetValueB: 0 }));
    }
  };

  /* ---------------- Compute Info Panel Values ---------------- */

  // Scan growth matrix for the first year the portfolio meets/exceeds the target
  const matrixA = calcA.getGrowthMatrix();
  const targetReachedA =
    sliders.targetValueA > 0
      ? matrixA.find((e) => e.y >= sliders.targetValueA)
      : null;

  const matrixB = calcB.getGrowthMatrix();
  const targetReachedB =
    toggles.advanced && sliders.targetValueB > 0
      ? matrixB.find((e) => e.y >= sliders.targetValueB)
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

  // Slider max = the ending balance if no withdrawal is taken (true ceiling)
  const maxTargetA = new InvestmentCalculator({
    ...invAProps,
    monthlyWithdrawal: 0,
  }).calculateGrowth(toggles.showInflation).numeric;
  const maxTargetB = new InvestmentCalculator({
    ...invBProps,
    monthlyWithdrawal: 0,
  }).calculateGrowth(toggles.showInflation).numeric;

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
        : sliders.targetValueA > 0
          ? `> ${sliders.yearsOfGrowthA || DEFAULT_YEARS_OF_GROWTH} yrs`
          : "N/A",
    },
    ...(toggles.advanced
      ? [
          {
            label: "(B) Target Reached",
            value: targetReachedB
              ? `${targetReachedB.x.getFullYear()} (yr ${matrixB.indexOf(targetReachedB)})`
              : sliders.targetValueB > 0
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
  ];

  return (
    <Container>
      <Grid>
        {/* Investment A Panel */}
        <Panel>
          <CurrencyInput
            value={inputs.currentAmountA}
            onChange={(v) => updateInput("currentAmountA", v)}
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
                onChange={(v) => updateSlider("withdrawalStartYearA", v)}
              />
            </>
          )}
          {/* Target value — sets the monthly withdrawal to reach this balance */}
          <div>
            <Label>Target Value (sets Withdrawal)</Label>
            <CurrencyInput
              value={String(sliders.targetValueA || 0)}
              onChange={(v) => handleTargetA(Number(v))}
            />
            <SliderRoot
              value={[Math.min(sliders.targetValueA || 0, maxTargetA)]}
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
          </div>
        </Panel>

        {/* Investment B Panel */}
        {toggles.advanced && (
          <Panel>
            <CurrencyInput
              value={inputs.currentAmountB}
              onChange={(v) => updateInput("currentAmountB", v)}
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
              onChange={(v) => updateSlider("withdrawalStartYearB", v)}
            />
            {/* Target value for Investment B */}
            <div>
              <Label>Target Value (sets Withdrawal)</Label>
              <CurrencyInput
                value={String(sliders.targetValueB || 0)}
                onChange={(v) => handleTargetB(Number(v))}
              />
              <SliderRoot
                value={[Math.min(sliders.targetValueB || 0, maxTargetB)]}
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
            </div>
          </Panel>
        )}

        {/* Info / Global Settings Panel */}
        <Panel>
          <SwitchRow>
            <Label>Advanced:</Label>
            <SwitchButton
              checked={toggles.advanced}
              onCheckedChange={(v) => updateToggle("advanced", v)}
            />
          </SwitchRow>
          <SwitchRow>
            <Label>Rollover:</Label>
            <SwitchButton
              checked={toggles.rollover}
              onCheckedChange={(v) => updateToggle("rollover", v)}
            />
          </SwitchRow>
          <SwitchRow>
            <Label>Inflated:</Label>
            <SwitchButton
              checked={toggles.showInflation}
              onCheckedChange={(v) => updateToggle("showInflation", v)}
            />
          </SwitchRow>
          <SwitchRow>
            <Label>Portfolio:</Label>
            <SwitchButton
              checked={toggles.portfolio}
              onCheckedChange={(v) => updateToggle("portfolio", v)}
            />
          </SwitchRow>
          <InvestmentSlider
            label="Inflation (%)"
            value={sliders.yearlyInflation || DEFAULT_INFLATION_RATE}
            min={MIN_VALUE}
            max={MAX_INFLATION_RATE}
            step={0.1}
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
        targetValueA={sliders.targetValueA || undefined}
        targetValueB={
          toggles.advanced ? sliders.targetValueB || undefined : undefined
        }
      />

      {/* Portfolio Capital Preservation Panel */}
      {toggles.portfolio && (
        <PortfolioPanel
          holdings={stockHoldings}
          setHoldings={setStockHoldings}
          stockApiUrl={stockApiUrl}
          defaultPortfolioValue={totalA}
          monthlyWithdrawal={sliders.monthlyWithdrawalA || MIN_VALUE}
          withdrawalStartYear={sliders.withdrawalStartYearA || 0}
          yearsForward={sliders.yearsOfGrowthA || DEFAULT_YEARS_OF_GROWTH}
          growthMatrix={calcA.getGrowthMatrix()}
          withdrawalStartYearB={
            toggles.advanced ? sliders.withdrawalStartYearB || 0 : undefined
          }
          growthMatrixB={toggles.advanced ? calcB.getGrowthMatrix() : undefined}
        />
      )}
    </Container>
  );
}
