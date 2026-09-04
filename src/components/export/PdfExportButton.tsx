/* ==================================================
 * PDF Export Button
 *
 * Gathers the current assumptions and metrics from
 * the DOM and generates a downloadable PDF report.
 * ================================================== */

import { useState } from "react";
import { styled } from "../../../stitches.config";
import type { PdfKeyValue } from "../../common/helpers/pdf-report-data";
import { ErrorText } from "../ui/primitives";

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

/* ---------- Renderer ---------- */

/**
 * Fetches the PDF renderer on demand.
 *
 * jspdf and html2canvas are ~584 kB that only this button ever needs, so they
 * are a lazy chunk rather than part of the entry bundle every visitor pays
 * for. That chunk can fail to arrive - the user is offline, or the hashed
 * asset 404s - and the message a module loader throws for that names a URL,
 * which is not something a user can act on. So it is restated as advice and
 * reported through the same ErrorText as any other export failure.
 */
async function loadPdfRenderer() {
  try {
    const { generatePdfReport } =
      await import("../../common/helpers/pdf-export");
    return generatePdfReport;
  } catch {
    throw new Error(
      "the report tools could not be downloaded. Check your connection, reload the page and try again.",
    );
  }
}

/* ---------- Component ---------- */

export default function PdfExportButton({
  chartSelector,
  assumptions,
  metrics,
}: PdfExportButtonProps) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setGenerating(true);
    setError(null);
    try {
      const generatePdfReport = await loadPdfRenderer();
      await generatePdfReport({
        title: "TH4 Investment Report",
        generatedAt: new Date().toLocaleString(),
        assumptions,
        metrics,
        chartElement: chartSelector
          ? document.querySelector<HTMLElement>(chartSelector)
          : null,
      });
    } catch (err) {
      // Without this the button just slides back to "Export PDF" and the only
      // trace of the failure is an unhandled rejection in the console.
      setError(
        err instanceof Error && err.message
          ? `PDF export failed: ${err.message}`
          : "PDF export failed. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Button onClick={() => void handleExport()} disabled={generating}>
        {generating ? "Generating..." : "Export PDF"}
      </Button>
      {error && <ErrorText css={{ marginTop: "6px" }}>{error}</ErrorText>}
    </>
  );
}
