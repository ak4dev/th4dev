/* ==================================================
 * FIRE Calculator Panel
 *
 * Collapsible panel that shows FIRE (Financial
 * Independence, Retire Early) metrics derived from
 * the user's existing investment inputs.
 * ================================================== */

import { useMemo } from "react";
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

const InputRow = styled("div", {
  display: "flex",
  gap: "12px",
  alignItems: "center",
  marginBottom: "8px",
});

const InputLabel = styled("label", {
  fontSize: "0.8rem",
  color: "$comment",
  fontWeight: 500,
  minWidth: "120px",
});

const Input = styled("input", {
  ...compactModernInputStyles,
  width: "100px",
  minWidth: 0,
  maxWidth: "120px",
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
      : result.isCoastFire
        ? "onTrack"
        : "needsWork";

  const statusLabel =
    result.progressPct >= 100
      ? "FIRE Achieved"
      : result.isCoastFire
        ? "Coast FIRE"
        : "Building";

  return (
    <Container>
      <Title>
        FIRE Calculator
        <BadgeTag variant={overallStatus}>{statusLabel}</BadgeTag>
      </Title>

      {/* Editable inputs */}
      <InputRow>
        <InputLabel>Annual Expenses</InputLabel>
        <Input
          type="text"
          inputMode="numeric"
          value={annualExpenses || ""}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^0-9]/g, "");
            onAnnualExpensesChange(Number(cleaned) || 0);
          }}
        />
      </InputRow>
      <InputRow>
        <InputLabel>SWR (%)</InputLabel>
        <Input
          type="text"
          inputMode="decimal"
          value={safeWithdrawalRate || ""}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^0-9.]/g, "");
            const parsed = parseFloat(cleaned);
            if (!Number.isNaN(parsed)) {
              onSafeWithdrawalRateChange(Math.min(10, Math.max(1, parsed)));
            }
          }}
        />
      </InputRow>
      <InputRow>
        <InputLabel>Current Age</InputLabel>
        <Input
          type="text"
          inputMode="numeric"
          value={currentAge || ""}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^0-9]/g, "");
            if (cleaned) onCurrentAgeChange(Math.min(100, Math.max(18, Number(cleaned))));
          }}
        />
      </InputRow>
      <InputRow>
        <InputLabel>Retire at Age</InputLabel>
        <Input
          type="text"
          inputMode="numeric"
          value={targetRetirementAge || ""}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^0-9]/g, "");
            if (cleaned) onTargetRetirementAgeChange(Math.min(100, Math.max(18, Number(cleaned))));
          }}
        />
      </InputRow>

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
