import { describe, it, expect } from "vitest";
import {
  AMOUNT_FIELD,
  numericFieldKeyAction,
  parseFieldValue,
  sanitizeNumericText,
  type NumericFieldPolicy,
} from "../numeric-field";

describe("sanitizeNumericText", () => {
  it("keeps digits and the decimal point in decimal mode", () => {
    expect(sanitizeNumericText("12.5", true)).toBe("12.5");
  });

  it("strips a currency symbol and thousands separators, keeping the point", () => {
    // The batch-5 bug: stripping the point concatenated the digits either
    // side of it and read a quarter of a million as twenty-five million.
    expect(sanitizeNumericText("$250,000.00", true)).toBe("250000.00");
  });

  it("strips the decimal point in whole-number mode", () => {
    expect(sanitizeNumericText("12.5", false)).toBe("125");
  });

  it("defaults to whole-number mode", () => {
    expect(sanitizeNumericText("12.5")).toBe("125");
  });

  it("refuses a leading minus, so a negative cannot be typed into a field", () => {
    expect(sanitizeNumericText("-500", true)).toBe("500");
  });

  it("leaves text holding nothing numeric empty", () => {
    expect(sanitizeNumericText("abc", true)).toBe("");
    expect(sanitizeNumericText("", true)).toBe("");
  });

  it("keeps a half-typed decimal so the user can carry on typing", () => {
    expect(sanitizeNumericText("12.", true)).toBe("12.");
  });
});

describe("parseFieldValue", () => {
  const decimal = { decimal: true, fallback: 0 } satisfies NumericFieldPolicy;

  it("reads a half-typed decimal as the number so far", () => {
    expect(parseFieldValue("12.", decimal)).toBe(12);
  });

  it("clamps above the maximum rather than rejecting the entry", () => {
    expect(parseFieldValue("150", { ...decimal, max: 100 })).toBe(100);
  });

  it("clamps below the minimum", () => {
    expect(parseFieldValue("0", { ...decimal, min: 5 })).toBe(5);
  });

  it("leaves a value inside the range alone", () => {
    expect(parseFieldValue("42.5", { ...decimal, min: 0, max: 100 })).toBe(
      42.5,
    );
  });

  it("returns the given fallback for an empty field", () => {
    expect(parseFieldValue("", decimal)).toBe(0);
    expect(parseFieldValue("", { ...decimal, fallback: 7 })).toBe(7);
  });

  it("returns 'revert' for an unreadable entry when that is the fallback", () => {
    expect(parseFieldValue("abc", { ...decimal, fallback: "revert" })).toBe(
      "revert",
    );
  });

  it("does not clamp the fallback into the field's range", () => {
    // The fallback is the field's own answer to "this says nothing", not a
    // value the user offered, so the bounds have nothing to correct.
    expect(parseFieldValue("", { ...decimal, min: 10, fallback: 0 })).toBe(0);
  });

  it("ends the number at a second decimal point instead of corrupting it", () => {
    expect(parseFieldValue("1.2.3", decimal)).toBe(1.2);
  });

  it("reads a pasted, fully decorated amount", () => {
    expect(parseFieldValue("$250,000.00", decimal)).toBe(250000);
  });

  it("rejects a bare '.' in whole-number mode", () => {
    expect(parseFieldValue(".", { decimal: false, fallback: 0 })).toBe(0);
  });

  it("truncates a fraction in whole-number mode", () => {
    expect(parseFieldValue("12.9", { decimal: false, fallback: 0 })).toBe(12);
  });

  it("defaults to whole-number mode", () => {
    expect(parseFieldValue("12.9", { fallback: 0 })).toBe(12);
  });

  it("keeps a negative negative, so a min can reject it", () => {
    // parseAmountInput preserves the sign for exactly this reason; a field
    // that filters its keystrokes never sees one, and a min catches the rest.
    expect(parseFieldValue("-500", decimal)).toBe(-500);
    expect(parseFieldValue("-500", { ...decimal, min: 0 })).toBe(0);
  });
});

describe("numericFieldKeyAction", () => {
  it("commits on Enter", () => {
    expect(numericFieldKeyAction("Enter")).toBe("commit");
  });

  it("reverts on Escape", () => {
    expect(numericFieldKeyAction("Escape")).toBe("revert");
  });

  it("ignores ordinary typing", () => {
    for (const key of ["1", ".", "a", "Tab", "ArrowUp", "Backspace"]) {
      expect(numericFieldKeyAction(key)).toBe("ignore");
    }
  });
});

/*
 * One case per real call site, named after it.
 *
 * These fields deliberately disagree about what an unreadable entry means,
 * and the disagreement is the point: consolidating them onto one shared
 * policy object would be a silent behaviour change at four of the six. Each
 * case below states the policy that call site passes, so unifying them breaks
 * a test that names the site it broke.
 */
describe("call-site policies", () => {
  it("InvestmentCalculatorModern CurrencyInput: a cleared amount box is an empty pot", () => {
    expect(AMOUNT_FIELD.fallback).toBe(0);
    expect(parseFieldValue("", AMOUNT_FIELD)).toBe(0);
    expect(parseFieldValue("abc", AMOUNT_FIELD)).toBe(0);
    // Whole dollars: the box rounds what it commits, so cents cannot shift
    // the stored amount by a factor of a hundred
    expect(Math.round(parseFieldValue("$250,000.49", AMOUNT_FIELD))).toBe(
      250000,
    );
  });

  it("InvestmentCalculatorModern TargetControl: a cleared goal is no goal", () => {
    // Same policy object as the amount box; solveTarget reads 0 as "clear it"
    expect(parseFieldValue("", AMOUNT_FIELD)).toBe(0);
  });

  it("InvestmentCalculatorModern InvestmentSlider: an unreadable entry leaves the slider where it was", () => {
    // Years, min 0 max 100, half-year steps
    const years = {
      decimal: true,
      min: 0,
      max: 100,
      fallback: "revert",
    } satisfies NumericFieldPolicy;
    expect(parseFieldValue("abc", years)).toBe("revert");
    expect(parseFieldValue("", years)).toBe("revert");
    expect(parseFieldValue("10.5", years)).toBe(10.5);
    expect(parseFieldValue("150", years)).toBe(100);
  });

  it("BudgetPanel add row and inline edit: an empty amount is $0", () => {
    expect(parseFieldValue("", AMOUNT_FIELD)).toBe(0);
    expect(parseFieldValue("2000.50", AMOUNT_FIELD)).toBe(2000.5);
  });

  it("PortfolioPanel allocation: over 100% is pulled back, a half-typed entry holds", () => {
    const committed = {
      decimal: true,
      max: 100,
      fallback: 0,
    } satisfies NumericFieldPolicy;
    expect(parseFieldValue("150", committed)).toBe(100);
    expect(parseFieldValue("", committed)).toBe(0);
    // While typing, an emptied box reallocates to nothing but a keystroke
    // that is not yet a number at all ("." on the way to ".5") leaves the
    // holding's share alone instead of zeroing it mid-word
    expect(parseFieldValue("0.", { ...committed, fallback: "revert" })).toBe(0);
    expect(parseFieldValue(".", { ...committed, fallback: "revert" })).toBe(
      "revert",
    );
  });
});
