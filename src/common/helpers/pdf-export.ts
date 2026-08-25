/* ==================================================
 * PDF Report Export
 *
 * Generates a client-side PDF capturing the user's
 * investment assumptions, key metrics, and an image
 * of the growth chart.
 * ================================================== */

import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { DynamicWithdrawal } from "../types/types";
import { formatCurrency } from "./format";

/* ---------- Types ---------- */

export interface PdfKeyValue {
  label: string;
  value: string;
}

export interface PdfReportData {
  title?: string;
  generatedAt: string;
  assumptions: PdfKeyValue[];
  metrics: PdfKeyValue[];
  /** DOM element containing the Recharts chart */
  chartElement?: HTMLElement | null;
}

/* ---------- Constants ---------- */

const PAGE_WIDTH = 210; // A4 mm
const PAGE_HEIGHT = 297;
const PAGE_MARGIN = 20;
const MAX_Y = PAGE_HEIGHT - PAGE_MARGIN;
const LINE_HEIGHT = 7;
const SECTION_HEIGHT = LINE_HEIGHT + 2;
const SECTION_GAP = 4;
const VALUE_INDENT = 60;
const HEADER_FONT_SIZE = 18;
const SECTION_FONT_SIZE = 13;
const BODY_FONT_SIZE = 10;
const FOOTNOTE_FONT_SIZE = 8;

/* ---------- Report data helpers ---------- */

/** Assumption rows describing a lane's dynamic withdrawal policy */
export function dynamicWithdrawalAssumptions(
  lane: string,
  policy: DynamicWithdrawal,
): PdfKeyValue[] {
  return [
    {
      label: `Withdrawal Rate (${lane})`,
      value: `${policy.ratePct}% of balance`,
    },
    {
      label: `Withdrawal Floor (${lane})`,
      value: `${formatCurrency(policy.floor)}/mo`,
    },
    {
      label: `Withdrawal Ceiling (${lane})`,
      value: `${formatCurrency(policy.ceiling)}/mo`,
    },
  ];
}

/* ---------- Layout helpers ---------- */

/** Starts a new page when `needed` mm would run past the bottom margin */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= MAX_Y) return y;
  doc.addPage();
  return PAGE_MARGIN;
}

function addSection(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(SECTION_FONT_SIZE);
  doc.setFont("helvetica", "bold");
  doc.text(title, PAGE_MARGIN, y);
  return y + SECTION_HEIGHT;
}

function addKeyValue(doc: jsPDF, row: PdfKeyValue, y: number): number {
  doc.setFontSize(BODY_FONT_SIZE);
  doc.setFont("helvetica", "bold");
  doc.text(`${row.label}:`, PAGE_MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.text(row.value, PAGE_MARGIN + VALUE_INDENT, y);
  return y + LINE_HEIGHT;
}

function addKeyValueSection(
  doc: jsPDF,
  title: string,
  rows: PdfKeyValue[],
  y: number,
): number {
  if (rows.length === 0) return y;
  y = addSection(doc, title, ensureSpace(doc, y, SECTION_HEIGHT + LINE_HEIGHT));
  for (const row of rows) {
    y = addKeyValue(doc, row, ensureSpace(doc, y, LINE_HEIGHT));
  }
  return y + SECTION_GAP;
}

/**
 * Background the chart is actually drawn on. The captured Recharts wrapper is
 * transparent, so walk up to the nearest painted ancestor (the themed chart
 * container) instead of assuming a particular theme.
 */
function getChartBackground(element: HTMLElement): string | null {
  if (typeof getComputedStyle !== "function") return null;
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return bg;
  }
  return null;
}

/* ---------- Main Export ---------- */

export async function generatePdfReport(data: PdfReportData): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let y = PAGE_MARGIN;

  // Title
  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setFont("helvetica", "bold");
  doc.text(data.title ?? "Investment Report", PAGE_MARGIN, y);
  y += SECTION_HEIGHT;

  // Generated timestamp
  doc.setFontSize(FOOTNOTE_FONT_SIZE);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${data.generatedAt}`, PAGE_MARGIN, y);
  y += LINE_HEIGHT + 6;

  y = addKeyValueSection(doc, "Assumptions", data.assumptions, y);
  y = addKeyValueSection(doc, "Key Metrics", data.metrics, y);

  // Chart image
  if (data.chartElement) {
    try {
      const canvas = await html2canvas(data.chartElement, {
        backgroundColor: getChartBackground(data.chartElement),
        scale: 2,
      });
      const chartWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
      const chartHeight = chartWidth * (canvas.height / canvas.width);

      y = addSection(
        doc,
        "Growth Chart",
        ensureSpace(doc, y, SECTION_HEIGHT + chartHeight),
      );
      doc.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        PAGE_MARGIN,
        y,
        chartWidth,
        chartHeight,
      );
    } catch {
      // Chart capture failed; skip image
    }
  }

  // Save
  const filename = `investment-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
