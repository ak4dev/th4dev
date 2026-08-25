/* ==================================================
 * PDF Export Button
 *
 * Gathers the current assumptions and metrics from
 * the DOM and generates a downloadable PDF report.
 * ================================================== */

import { useState } from "react";
import { styled } from "../../../stitches.config";
import {
  generatePdfReport,
  type PdfKeyValue,
} from "../../common/helpers/pdf-export";

/* ---------- Props ---------- */

interface PdfExportButtonProps {
  /** Selector for the chart container element */
  chartSelector?: string;
  /** Assumptions to include in the report */
  assumptions: PdfKeyValue[];
  /** Key metrics to include in the report */
  metrics: PdfKeyValue[];
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

  const handleExport = async () => {
    setGenerating(true);
    try {
      await generatePdfReport({
        title: "TH4 Investment Report",
        generatedAt: new Date().toLocaleString(),
        assumptions,
        metrics,
        chartElement: chartSelector
          ? document.querySelector<HTMLElement>(chartSelector)
          : null,
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button onClick={() => void handleExport()} disabled={generating}>
      {generating ? "Generating..." : "Export PDF"}
    </Button>
  );
}
