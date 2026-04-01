/* ==================================================
 * FIRE Calculator Panel
 *
 * Collapsible panel that shows FIRE (Financial
 * Independence, Retire Early) metrics derived from
 * the user's existing investment inputs.
 * ================================================== */

import { useState, useMemo, useCallback, useEffect } from "react";
import { styled } from "../../../stitches.config";
import { compactModernInputStyles } from "../../common/constants/input-styles";
import { calculateFire, type FireResult } from "../../common/helpers/fire-calculator";

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

const Container = styled("div", {
  backgroundColor: "$currentLine",
  borderRadius: "12px",
  padding: "20px",
  marginTop: "24px",
  boxShadow: "0 6px 16px rgba(0,0,0,0.2)",
});

const Title = styled("h4", {
  margin: 0,
  marginBottom: "16px",
  fontSize: "0.95rem",
  fontWeight: 600,
  color: "$cyan",
  display: "flex",
  alignItems: "center",
  gap: "8px",
});

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

const Separator = styled("hr", {
  border: "none",
  borderTop: "1px solid $comment",
  opacity: 0.2,
  margin: "14px 0",
});

/* ---------- Component ---------- */

function formatCurrency(n: number): string {
  if (!isFinite(n)) return "∞";
  return `$${n.toLocaleString()}`;
}

export default function FirePanel(props: FirePanelProps) {
  const {
    currentSavings,
    monthlySavings,
    annualReturn,
    inflationRate,
    annualExpenses,
    safeWithdrawalRate,
    currentAge,
    targetRetirementAge,
    onAnnualExpensesChange,
    onSafeWithdrawalRateChange,
    onCurrentAgeChange,
    onTargetRetirementAgeChange,
  } = props;

  // Local text state so users can type freely; commit on blur/Enter
  const [expensesText, setExpensesText] = useState(String(annualExpenses || ""));
  const [swrText, setSwrText] = useState(String(safeWithdrawalRate || ""));
  const [ageText, setAgeText] = useState(String(currentAge || ""));
  const [retireText, setRetireText] = useState(String(targetRetirementAge || ""));

  // Sync local state when props change externally (e.g. scenario load)
  useEffect(() => { setExpensesText(String(annualExpenses || "")) }, [annualExpenses]);
  useEffect(() => { setSwrText(String(safeWithdrawalRate || "")) }, [safeWithdrawalRate]);
  useEffect(() => { setAgeText(String(currentAge || "")) }, [currentAge]);
  useEffect(() => { setRetireText(String(targetRetirementAge || "")) }, [targetRetirementAge]);

  const commitExpenses = useCallback(() => {
    const n = parseInt(expensesText, 10);
    const val = Number.isNaN(n) ? 0 : Math.max(0, n);
    onAnnualExpensesChange(val);
    setExpensesText(String(val || ""));
  }, [expensesText, onAnnualExpensesChange]);

  const commitSwr = useCallback(() => {
    const n = parseFloat(swrText);
    const val = Number.isNaN(n) ? 4 : Math.min(10, Math.max(1, n));
    onSafeWithdrawalRateChange(val);
    setSwrText(String(val));
  }, [swrText, onSafeWithdrawalRateChange]);

  const commitAge = useCallback(() => {
    const n = parseInt(ageText, 10);
    const val = Number.isNaN(n) ? 30 : Math.min(100, Math.max(18, n));
    onCurrentAgeChange(val);
    setAgeText(String(val));
  }, [ageText, onCurrentAgeChange]);

  const commitRetire = useCallback(() => {
    const n = parseInt(retireText, 10);
    const val = Number.isNaN(n) ? 65 : Math.min(100, Math.max(18, n));
    onTargetRetirementAgeChange(val);
    setRetireText(String(val));
  }, [retireText, onTargetRetirementAgeChange]);

  const result: FireResult = useMemo(
    () =>
      calculateFire({
        currentSavings,
        monthlySavings,
        annualReturn,
        inflationRate,
        annualExpenses,
        safeWithdrawalRate,
        currentAge,
        targetRetirementAge,
      }),
    [
      currentSavings,
      monthlySavings,
      annualReturn,
      inflationRate,
      annualExpenses,
      safeWithdrawalRate,
      currentAge,
      targetRetirementAge,
    ],
  );

  const progressStatus =
    result.progressPct >= 75 ? "high" : result.progressPct >= 30 ? "mid" : "low";

  const overallStatus =
    result.progressPct >= 100
      ? "achieved"
      : result.isShortfall
        ? "shortfall"
        : result.isCoastFire
          ? "onTrack"
          : "needsWork";

  const statusLabel =
    result.progressPct >= 100
      ? "FIRE Achieved"
      : result.isShortfall
        ? "Shortfall"
        : result.isCoastFire
          ? "Coast FIRE"
          : "Building";

  return (
    <Container>
      <Title>
        FIRE Calculator
        <BadgeTag variant={overallStatus}>{statusLabel}</BadgeTag>
      </Title>

      {/* Editable inputs — 2x2 grid */}
      <InputGrid>
        <InputCell>
          <InputLabel>Annual Expenses</InputLabel>
          <Input
            type="text"
            inputMode="numeric"
            value={expensesText}
            onChange={(e) => setExpensesText(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={commitExpenses}
            onKeyDown={(e) => e.key === "Enter" && commitExpenses()}
          />
        </InputCell>
        <InputCell>
          <InputLabel>SWR (%)</InputLabel>
          <Input
            type="text"
            inputMode="decimal"
            value={swrText}
            onChange={(e) => setSwrText(e.target.value.replace(/[^0-9.]/g, ""))}
            onBlur={commitSwr}
            onKeyDown={(e) => e.key === "Enter" && commitSwr()}
          />
        </InputCell>
        <InputCell>
          <InputLabel>Current Age</InputLabel>
          <Input
            type="text"
            inputMode="numeric"
            value={ageText}
            onChange={(e) => setAgeText(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={commitAge}
            onKeyDown={(e) => e.key === "Enter" && commitAge()}
          />
        </InputCell>
        <InputCell>
          <InputLabel>Retire at Age</InputLabel>
          <Input
            type="text"
            inputMode="numeric"
            value={retireText}
            onChange={(e) => setRetireText(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={commitRetire}
            onKeyDown={(e) => e.key === "Enter" && commitRetire()}
          />
        </InputCell>
      </InputGrid>

      <Separator />

      {/* Progress */}
      <MetricCard>
        <MetricLabel>Progress to FIRE</MetricLabel>
        <MetricValue color={result.progressPct >= 100 ? "green" : "cyan"}>
          {result.progressPct}%
        </MetricValue>
        <ProgressBarContainer>
          <ProgressBarFill
            status={progressStatus}
            css={{ width: `${Math.min(100, result.progressPct)}%` }}
          />
        </ProgressBarContainer>
      </MetricCard>

      <Separator />

      {/* Metrics grid */}
      <MetricsGrid>
        <MetricCard>
          <MetricLabel>FIRE Number</MetricLabel>
          <MetricValue color="cyan">{formatCurrency(result.fireNumber)}</MetricValue>
        </MetricCard>
        <MetricCard>
          <MetricLabel>Years to FIRE</MetricLabel>
          <MetricValue color={result.yearsToFire === 0 ? "green" : "orange"}>
            {result.yearsToFire !== null ? `${result.yearsToFire} yrs` : "> 100 yrs"}
          </MetricValue>
        </MetricCard>
        <MetricCard>
          <MetricLabel>FIRE Age</MetricLabel>
          <MetricValue color={result.fireAge !== null && result.fireAge <= targetRetirementAge ? "green" : "orange"}>
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
                result.monthlySavingsNeeded <= monthlySavings ? "green" : "orange"
              }
            >
              {formatCurrency(result.monthlySavingsNeeded)}/mo
            </MetricValue>
          </MetricCard>
        )}
      </MetricsGrid>
    </Container>
  );
}
