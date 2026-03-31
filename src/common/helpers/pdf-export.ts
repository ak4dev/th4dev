/* ==================================================
 * PDF Report Export
 *
 * Generates a client-side PDF capturing the user's
 * investment assumptions, key metrics, and an image
 * of the growth chart.
 * ================================================== */

import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

/* ---------- Types ---------- */

export interface PdfReportData {
  title?: string;
  generatedAt: string;
  assumptions: {
    label: string;
    value: string;
  }[];
  metrics: {
    label: string;
    value: string;
  }[];
  /** DOM element containing the Recharts chart */
  chartElement?: HTMLElement | null;
}

/* ---------- Constants ---------- */

const PAGE_MARGIN = 20;
const LINE_HEIGHT = 7;
const HEADER_FONT_SIZE = 18;
const SECTION_FONT_SIZE = 13;
const BODY_FONT_SIZE = 10;
const PAGE_WIDTH = 210; // A4 mm

/* ---------- Helpers ---------- */

function addSection(
  doc: jsPDF,
  title: string,
  y: number,
): number {
  doc.setFontSize(SECTION_FONT_SIZE);
  doc.setFont("helvetica", "bold");
  doc.text(title, PAGE_MARGIN, y);
  return y + LINE_HEIGHT + 2;
}

function addKeyValue(
  doc: jsPDF,
  label: string,
  value: string,
  y: number,
): number {
  doc.setFontSize(BODY_FONT_SIZE);
  doc.setFont("helvetica", "bold");
  doc.text(`${label}:`, PAGE_MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.text(value, PAGE_MARGIN + 60, y);
  return y + LINE_HEIGHT;
}

/* ---------- Main Export ---------- */

export async function generatePdfReport(
  data: PdfReportData,
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let y = PAGE_MARGIN;

  // Title
  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setFont("helvetica", "bold");
  doc.text(data.title ?? "Investment Report", PAGE_MARGIN, y);
  y += LINE_HEIGHT + 2;

  // Generated timestamp
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${data.generatedAt}`, PAGE_MARGIN, y);
  y += LINE_HEIGHT + 6;

  // Assumptions section
  if (data.assumptions.length > 0) {
    y = addSection(doc, "Assumptions", y);
    for (const a of data.assumptions) {
      y = addKeyValue(doc, a.label, a.value, y);
      if (y > 270) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
    }
    y += 4;
  }

  // Metrics section
  if (data.metrics.length > 0) {
    y = addSection(doc, "Key Metrics", y);
    for (const m of data.metrics) {
      y = addKeyValue(doc, m.label, m.value, y);
      if (y > 270) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
    }
    y += 4;
  }

  // Chart image
  if (data.chartElement) {
    try {
      const canvas = await html2canvas(data.chartElement, {
        backgroundColor: "#282a36",
        scale: 2,
      });
      const imgData = canvas.toDataURL("image/png");
      const chartWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
      const aspectRatio = canvas.height / canvas.width;
      const chartHeight = chartWidth * aspectRatio;

      if (y + chartHeight > 280) {
        doc.addPage();
        y = PAGE_MARGIN;
      }

      y = addSection(doc, "Growth Chart", y);
      doc.addImage(imgData, "PNG", PAGE_MARGIN, y, chartWidth, chartHeight);
    } catch {
      // Chart capture failed; skip image
    }
  }

  // Save
  const filename = `investment-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
