/* ==================================================
 * PDF Export Button
 *
 * Gathers the current assumptions and metrics from
 * the DOM and generates a downloadable PDF report.
 * ================================================== */

import { useState, useCallback } from "react";
import { styled } from "../../../stitches.config";
import {
  generatePdfReport,
  type PdfReportData,
} from "../../common/helpers/pdf-export";

/* ---------- Props ---------- */

interface PdfExportButtonProps {
  /** Selector or ref for the chart container element */
  chartSelector?: string;
  /** Assumptions to include in the report */
  assumptions: { label: string; value: string }[];
  /** Key metrics to include in the report */
  metrics: { label: string; value: string }[];
}

/* ---------- Styled Components ---------- */

const Button = styled("button", {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  borderRadius: "8px",
  border: "1px solid $comment",
  backgroundColor: "$currentLine",
  color: "$foreground",
  padding: "8px 14px",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
  transition: "all 0.15s",
  marginTop: "12px",
  "&:hover": {
    backgroundColor: "$cyan",
    color: "$background",
    borderColor: "$cyan",
  },
  "&:disabled": {
    opacity: 0.5,
    cursor: "wait",
  },
});

/* ---------- Component ---------- */

export default function PdfExportButton({
  chartSelector,
  assumptions,
  metrics,
}: PdfExportButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleExport = useCallback(async () => {
    setGenerating(true);
    try {
      const chartElement = chartSelector
        ? document.querySelector<HTMLElement>(chartSelector)
        : null;

      const data: PdfReportData = {
        title: "TH4 Investment Report",
        generatedAt: new Date().toLocaleString(),
        assumptions,
        metrics,
        chartElement,
      };

      await generatePdfReport(data);
    } finally {
      setGenerating(false);
    }
  }, [chartSelector, assumptions, metrics]);

  return (
    <Button onClick={handleExport} disabled={generating}>
      📄 {generating ? "Generating…" : "Export PDF"}
    </Button>
  );
}
