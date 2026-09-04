import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import html2canvas from "html2canvas";
import {
  generatePdfReport,
  dynamicWithdrawalAssumptions as reExportedFromRenderer,
  type PdfReportData,
} from "../pdf-export";
import { dynamicWithdrawalAssumptions } from "../pdf-report-data";

const { doc } = vi.hoisted(() => ({
  doc: {
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    text: vi.fn(),
    addPage: vi.fn(),
    addImage: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock("jspdf", () => ({
  jsPDF: vi.fn(function () {
    return doc;
  }),
}));
vi.mock("html2canvas", () => ({ default: vi.fn() }));

const A4_BOTTOM_MARGIN_Y = 297 - 20;

const report = (overrides: Partial<PdfReportData> = {}): PdfReportData => ({
  generatedAt: "2026-01-15 12:00",
  assumptions: [
    { label: "Initial Amount", value: "$100,000" },
    { label: "Return Rate", value: "10%" },
  ],
  metrics: [{ label: "Final Value", value: "$1,000,000" }],
  chartElement: null,
  ...overrides,
});

const rows = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({
    label: `${prefix} ${i}`,
    value: `Value ${i}`,
  }));

/** Y coordinate of every doc.text call */
const textYs = () => doc.text.mock.calls.map((call) => call[2] as number);

/** Fake DOM chain: a transparent wrapper inside a painted container */
const fakeChart = (containerBg: string) => {
  const container = { parentElement: null, bg: containerBg };
  const wrapper = { parentElement: container, bg: "rgba(0, 0, 0, 0)" };
  vi.stubGlobal("getComputedStyle", (node: { bg: string }) => ({
    backgroundColor: node.bg,
  }));
  return wrapper as unknown as HTMLElement;
};

const fakeCanvas = {
  width: 800,
  height: 400,
  toDataURL: () => "data:image/png;base64,chart",
};

/**
 * Pretends the machine sits in `tz` at `utcInstant`. The worker clock is pinned
 * to UTC (vitest.config.ts), so a filename assertion only proves the export
 * names the file after the LOCAL calendar day if the zone is moved off UTC
 * first — under TZ=UTC the local and UTC dates are identical and the assertion
 * would pass against a UTC-based implementation too.
 */
const atLocalTime = (tz: string, utcInstant: string) => {
  vi.stubEnv("TZ", tz);
  vi.setSystemTime(new Date(utcInstant));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 15, 12));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("generatePdfReport", () => {
  it("saves the report under a locally-dated filename", async () => {
    // UTC+14: 11:30 on Jan 1 UTC is already 01:30 on Jan 2 where the user is,
    // so a UTC-derived filename would be stamped with yesterday's date.
    atLocalTime("Pacific/Kiritimati", "2025-01-01T11:30:00Z");
    await generatePdfReport(report());
    expect(doc.save).toHaveBeenCalledWith("investment-report-2025-01-02.pdf");
  });

  it("dates the filename by the local day west of UTC too", async () => {
    // UTC-10: 01:30 on Jan 1 UTC is still 15:30 on Dec 31 locally. The calendar
    // year (2024) also differs from the ISO week-year (2025) here, so a "YYYY"
    // format token instead of "yyyy" would fail this too.
    atLocalTime("Pacific/Honolulu", "2025-01-01T01:30:00Z");
    await generatePdfReport(report());
    expect(doc.save).toHaveBeenCalledWith("investment-report-2024-12-31.pdf");
  });

  it("writes the title, timestamp and every label/value pair", async () => {
    await generatePdfReport(report({ title: "Test Report" }));
    const written = doc.text.mock.calls.map((call) => call[0] as string);
    expect(written).toEqual([
      "Test Report",
      "Generated: 2026-01-15 12:00",
      "Assumptions",
      "Initial Amount:",
      "$100,000",
      "Return Rate:",
      "10%",
      "Key Metrics",
      "Final Value:",
      "$1,000,000",
    ]);
    expect(doc.addPage).not.toHaveBeenCalled();
  });

  it("omits a section whose list is empty", async () => {
    await generatePdfReport(report({ assumptions: [] }));
    const written = doc.text.mock.calls.map((call) => call[0] as string);
    expect(written).not.toContain("Assumptions");
    expect(written).toContain("Key Metrics");
  });

  it("paginates long lists without writing past the bottom margin", async () => {
    await generatePdfReport(
      report({ assumptions: rows(50, "Param"), metrics: rows(30, "Metric") }),
    );
    expect(doc.addPage).toHaveBeenCalled();
    expect(Math.max(...textYs())).toBeLessThanOrEqual(A4_BOTTOM_MARGIN_Y);
  });

  it("moves a section header to a new page when only it would fit", async () => {
    // 30 rows leave room for the next header but not for its first row, so
    // the header must start on a fresh page rather than orphaned at the bottom.
    await generatePdfReport(
      report({ assumptions: rows(30, "Param"), metrics: rows(1, "Metric") }),
    );
    const headerCall = doc.text.mock.calls.find(
      (call) => call[0] === "Key Metrics",
    );
    expect(doc.addPage).toHaveBeenCalledTimes(1);
    expect(headerCall?.[2]).toBe(20);
  });

  it("skips the chart when no element is given", async () => {
    await generatePdfReport(report());
    expect(html2canvas).not.toHaveBeenCalled();
    expect(doc.addImage).not.toHaveBeenCalled();
  });

  it("rasterises the chart on its nearest painted ancestor background", async () => {
    const chartElement = fakeChart("rgb(229, 229, 229)");
    vi.mocked(html2canvas).mockResolvedValue(
      fakeCanvas as unknown as HTMLCanvasElement,
    );

    await generatePdfReport(report({ chartElement }));

    expect(html2canvas).toHaveBeenCalledWith(chartElement, {
      backgroundColor: "rgb(229, 229, 229)",
      scale: 2,
    });
    expect(doc.addImage).toHaveBeenCalledWith(
      "data:image/png;base64,chart",
      "PNG",
      20,
      expect.any(Number),
      170,
      85,
    );
  });

  it("starts a new page when the chart would overflow", async () => {
    const chartElement = fakeChart("rgb(40, 42, 54)");
    vi.mocked(html2canvas).mockResolvedValue(
      fakeCanvas as unknown as HTMLCanvasElement,
    );

    await generatePdfReport(
      report({ metrics: rows(25, "Metric"), chartElement }),
    );

    expect(doc.addPage).toHaveBeenCalledTimes(1);
    // Image sits directly under the "Growth Chart" header at the top margin
    expect(doc.addImage.mock.calls[0][3]).toBe(20 + 9);
  });

  it("still saves the report when chart capture fails", async () => {
    const chartElement = fakeChart("rgb(40, 42, 54)");
    vi.mocked(html2canvas).mockRejectedValue(new Error("canvas unavailable"));

    await generatePdfReport(report({ chartElement }));

    expect(doc.addImage).not.toHaveBeenCalled();
    expect(doc.save).toHaveBeenCalledTimes(1);
  });
});

/* ---------- Module graph ---------- */

const HELPERS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The first of `base`.ts / `base`.tsx / `base`/index.ts that exists on disk */
const sourceFile = (base: string): string => {
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      // try the next extension
    }
  }
  throw new Error(`no source file for ${base}`);
};

/**
 * Every package `entry` can reach by following relative imports.
 *
 * The point of the split is a fact about the module graph, not about one
 * function's output: nothing the hub imports on every render may lead to the
 * PDF renderer, or the ~584 kB of jspdf and html2canvas is back in the entry
 * chunk for every visitor. Only the source text can say that here, because
 * both packages are mocked in this file.
 */
const packagesReachedFrom = (entry: string): Set<string> => {
  const packages = new Set<string>();
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(
      /^\s*(?:import|export)[^"']*?from "([^"]+)";/gm,
    )) {
      if (specifier.startsWith("."))
        visit(sourceFile(resolve(dirname(file), specifier)));
      else packages.add(specifier);
    }
  };
  visit(entry);
  return packages;
};

describe("pdf-report-data", () => {
  it("reaches no PDF renderer, while pdf-export does", () => {
    const renderer = packagesReachedFrom(resolve(HELPERS_DIR, "pdf-export.ts"));
    const data = packagesReachedFrom(
      resolve(HELPERS_DIR, "pdf-report-data.ts"),
    );

    // The positive half proves the scan can see a renderer import at all
    expect(renderer).toContain("jspdf");
    expect(renderer).toContain("html2canvas");
    expect(data).not.toContain("jspdf");
    expect(data).not.toContain("html2canvas");
  });

  it("is the single definition, re-exported by the renderer unchanged", () => {
    expect(reExportedFromRenderer).toBe(dynamicWithdrawalAssumptions);
  });
});

describe("dynamicWithdrawalAssumptions", () => {
  it("describes the policy as rate, floor and ceiling rows for the lane", () => {
    expect(
      dynamicWithdrawalAssumptions("B", {
        ratePct: 4,
        floor: 1500,
        ceiling: 10000,
      }),
    ).toEqual([
      { label: "Withdrawal Rate (B)", value: "4% of balance" },
      { label: "Withdrawal Floor (B)", value: "$1,500/mo" },
      { label: "Withdrawal Ceiling (B)", value: "$10,000/mo" },
    ]);
  });
});
