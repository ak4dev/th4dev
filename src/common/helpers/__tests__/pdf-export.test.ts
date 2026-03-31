import { describe, it, expect } from "vitest";
import type { PdfReportData } from "../pdf-export";

/**
 * The PDF export relies on jsPDF and html2canvas which require
 * DOM/Canvas APIs. We test the data structure assembly and
 * validate the type contracts rather than the actual PDF output.
 */

describe("PdfReportData type contract", () => {
  it("accepts valid report data with all fields", () => {
    const data: PdfReportData = {
      title: "Test Report",
      generatedAt: "2024-01-01T00:00:00Z",
      assumptions: [
        { label: "Initial Amount", value: "$100,000" },
        { label: "Return Rate", value: "10%" },
      ],
      metrics: [
        { label: "Final Value", value: "$1,000,000" },
      ],
      chartElement: null,
    };
    expect(data.assumptions).toHaveLength(2);
    expect(data.metrics).toHaveLength(1);
    expect(data.title).toBe("Test Report");
  });

  it("accepts minimal report data", () => {
    const data: PdfReportData = {
      generatedAt: new Date().toISOString(),
      assumptions: [],
      metrics: [],
    };
    expect(data.title).toBeUndefined();
    expect(data.chartElement).toBeUndefined();
    expect(data.assumptions).toEqual([]);
  });

  it("handles large assumption lists", () => {
    const assumptions = Array.from({ length: 50 }, (_, i) => ({
      label: `Param ${i}`,
      value: `Value ${i}`,
    }));
    const data: PdfReportData = {
      generatedAt: new Date().toISOString(),
      assumptions,
      metrics: [],
    };
    expect(data.assumptions).toHaveLength(50);
  });

  it("handles large metrics lists", () => {
    const metrics = Array.from({ length: 30 }, (_, i) => ({
      label: `Metric ${i}`,
      value: `$${i * 1000}`,
    }));
    const data: PdfReportData = {
      generatedAt: new Date().toISOString(),
      assumptions: [],
      metrics,
    };
    expect(data.metrics).toHaveLength(30);
  });
});
