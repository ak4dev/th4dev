/* ==================================================
 * FIRE Calculator Panel
 *
 * Collapsible panel that shows FIRE (Financial
 * Independence, Retire Early) metrics derived from
 * the user's existing investment inputs.
 * ================================================== */

import { useId, useState } from "react";
import { styled } from "../../../stitches.config";
import { compactModernInputStyles } from "../../common/constants/input-styles";
import {
  MAX_AGE,
  MAX_ANNUAL_EXPENSES,
} from "../../common/constants/app-constants";
import { calculateFire } from "../../common/helpers/fire-calculator";
import { formatCurrency } from "../../common/helpers/format";
import { PanelContainer, PanelTitle, Separator } from "../ui/primitives";

/* ---------- Props ---------- */

interface FirePanelProps {
  currentSavings: number;
  monthlySavings: number;
  annualReturn: number;
  inflationRate: number;
  annualExpenses: number;
  safeWithdrawalRate: number;
  currentAge: number;
  targetRetirementAge: number;
  onAnnualExpensesChange: (v: number) => void;
  onSafeWithdrawalRateChange: (v: number) => void;
  onCurrentAgeChange: (v: number) => void;
  onTargetRetirementAgeChange: (v: number) => void;
}

/* ---------- Styled Components ---------- */

const MetricsGrid = styled("div", {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "1fr 1fr",
  "@media(max-width:600px)": {
    gridTemplateColumns: "1fr",
  },
});

const MetricCard = styled("div", {
  backgroundColor: "$background",
  borderRadius: "8px",
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
});

const MetricLabel = styled("span", {
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "$comment",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
});

const MetricValue = styled("span", {
  fontSize: "1.1rem",
  fontWeight: 700,
  color: "$foreground",
  variants: {
    color: {
      green: { color: "$green" },
      orange: { color: "$orange" },
      red: { color: "$red" },
      cyan: { color: "$cyan" },
      purple: { color: "$purple" },
    },
  },
});

const ProgressBarContainer = styled("div", {
  width: "100%",
  height: "8px",
  backgroundColor: "$background",
  borderRadius: "4px",
  overflow: "hidden",
  marginTop: "4px",
});

const ProgressBarFill = styled("div", {
  height: "100%",
  borderRadius: "4px",
  transition: "width 0.4s ease",
  backgroundColor: "$green",
  variants: {
    status: {
      low: { backgroundColor: "$red" },
      mid: { backgroundColor: "$orange" },
      high: { backgroundColor: "$green" },
    },
  },
});

const InputGrid = styled("div", {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "10px",
});

const InputCell = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
});

const InputLabel = styled("label", {
  fontSize: "0.72rem",
  color: "$comment",
  fontWeight: 500,
});

const Input = styled("input", {
  ...compactModernInputStyles,
  width: "100%",
  minWidth: 0,
  textAlign: "right",
});

const BadgeTag = styled("span", {
  fontSize: "0.65rem",
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: "9999px",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  variants: {
    variant: {
      achieved: { backgroundColor: "$green", color: "$background" },
      onTrack: { backgroundColor: "$cyan", color: "$background" },
      needsWork: { backgroundColor: "$orange", color: "$background" },
      shortfall: { backgroundColor: "$red", color: "$foreground" },
    },
  },
});

const STATUS_LABEL = {
  achieved: "FIRE Achieved",
  shortfall: "Shortfall",
  onTrack: "Coast FIRE",
  needsWork: "Building",
} as const;

/* ---------- Numeric field ---------- */

interface NumFieldProps {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  min: number;
  max: number;
  /** Committed when the field is blank or unparseable */
  fallback: number;
  decimal?: boolean;
}

/**
 * Free-typing numeric input: keeps a local draft while focused and
 * commits the clamped value on blur / Enter, then falls back to
 * displaying the prop so external updates (e.g. scenario load) show
 * through without a sync effect.
 */
function NumField({
  label,
  value,
  onCommit,
  min,
  max,
  fallback,
  decimal = false,
}: NumFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const n = decimal ? parseFloat(draft) : parseInt(draft, 10);
    onCommit(Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n)));
    setDraft(null);
  };

  return (
    <InputCell>
      <InputLabel htmlFor={id}>{label}</InputLabel>
      <Input
        id={id}
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        value={draft ?? String(value)}
        onChange={(e) =>
          setDraft(e.target.value.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, ""))
        }
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </InputCell>
  );
}

/* ---------- Component ---------- */

export default function FirePanel({
  onAnnualExpensesChange,
  onSafeWithdrawalRateChange,
  onCurrentAgeChange,
  onTargetRetirementAgeChange,
  ...fireInputs
}: FirePanelProps) {
  const {
    monthlySavings,
    annualExpenses,
    safeWithdrawalRate,
    currentAge,
    targetRetirementAge,
  } = fireInputs;
  const result = calculateFire(fireInputs);

  const status =
    result.progressPct >= 100
      ? "achieved"
      : result.isShortfall
        ? "shortfall"
        : result.isCoastFire
          ? "onTrack"
          : "needsWork";
  const achieved = status === "achieved";

  const progressStatus =
    result.progressPct >= 75
      ? "high"
      : result.progressPct >= 30
        ? "mid"
        : "low";

  return (
    <PanelContainer>
      <PanelTitle>
        FIRE Calculator
        <BadgeTag variant={status}>{STATUS_LABEL[status]}</BadgeTag>
      </PanelTitle>

      {/* Editable inputs — 2x2 grid */}
      <InputGrid>
        <NumField
          label="Annual Expenses"
          value={annualExpenses}
          onCommit={onAnnualExpensesChange}
          min={0}
          max={MAX_ANNUAL_EXPENSES}
          fallback={0}
        />
        <NumField
          label="SWR (%)"
          value={safeWithdrawalRate}
          onCommit={onSafeWithdrawalRateChange}
          decimal
          min={1}
          max={10}
          fallback={4}
        />
        <NumField
          label="Current Age"
          value={currentAge}
          onCommit={onCurrentAgeChange}
          min={18}
          max={MAX_AGE}
          fallback={30}
        />
        <NumField
          label="Retire at Age"
          value={targetRetirementAge}
          onCommit={onTargetRetirementAgeChange}
          min={18}
          max={MAX_AGE}
          fallback={65}
        />
      </InputGrid>

      <Separator />

      {/* Progress */}
      <MetricCard>
        <MetricLabel>Progress to FIRE</MetricLabel>
        <MetricValue color={achieved ? "green" : "cyan"}>
          {result.progressPct}%
        </MetricValue>
        <ProgressBarContainer>
          <ProgressBarFill
            status={progressStatus}
            css={{ width: `${result.progressPct}%` }}
          />
        </ProgressBarContainer>
      </MetricCard>

      <Separator />

      {/* Metrics grid */}
      <MetricsGrid>
        <MetricCard>
          <MetricLabel>FIRE Number</MetricLabel>
          <MetricValue color="cyan">
            {formatCurrency(result.fireNumber)}
          </MetricValue>
        </MetricCard>
        <MetricCard>
          <MetricLabel>Years to FIRE</MetricLabel>
          <MetricValue color={result.yearsToFire === 0 ? "green" : "orange"}>
            {result.yearsToFire !== null
              ? `${result.yearsToFire} yrs`
              : "> 100 yrs"}
          </MetricValue>
        </MetricCard>
        <MetricCard>
          <MetricLabel>FIRE Age</MetricLabel>
          <MetricValue
            color={
              result.fireAge !== null && result.fireAge <= targetRetirementAge
                ? "green"
                : "orange"
            }
          >
            {result.fireAge !== null ? result.fireAge : "N/A"}
          </MetricValue>
        </MetricCard>
        <MetricCard>
          <MetricLabel>Coast FIRE Number</MetricLabel>
          <MetricValue color={result.isCoastFire ? "green" : "orange"}>
            {formatCurrency(result.coastFireNumber)}
          </MetricValue>
        </MetricCard>
        {result.monthlySavingsNeeded !== null && (
          <MetricCard>
            <MetricLabel>Monthly Needed (by {targetRetirementAge})</MetricLabel>
            <MetricValue
              color={
                result.monthlySavingsNeeded <= monthlySavings
                  ? "green"
                  : "orange"
              }
            >
              {formatCurrency(result.monthlySavingsNeeded)}/mo
            </MetricValue>
          </MetricCard>
        )}
      </MetricsGrid>
    </PanelContainer>
  );
}
