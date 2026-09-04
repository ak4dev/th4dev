import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatPrice,
  formatSignedPercent,
  parseAmountInput,
} from "../format";

describe("formatCurrency", () => {
  it("formats whole dollars with thousands separators", () => {
    expect(formatCurrency(0)).toBe("$0");
    expect(formatCurrency(1234567)).toBe("$1,234,567");
  });

  it("rounds fractional amounts to whole dollars", () => {
    expect(formatCurrency(12.5)).toBe("$13");
    expect(formatCurrency(99.49)).toBe("$99");
  });

  it("keeps the sign of negative balances", () => {
    expect(formatCurrency(-1234)).toBe("$-1,234");
  });

  it("renders non-finite values as N/A", () => {
    expect(formatCurrency(Infinity)).toBe("N/A");
    expect(formatCurrency(NaN)).toBe("N/A");
  });
});

describe("formatPrice", () => {
  it("always shows cents", () => {
    expect(formatPrice(1234)).toBe("$1,234.00");
    expect(formatPrice(1234.5)).toBe("$1,234.50");
  });

  it("rounds to two decimals", () => {
    expect(formatPrice(0.005)).toBe("$0.01");
    expect(formatPrice(19.999)).toBe("$20.00");
  });
});

describe("formatSignedPercent", () => {
  it("prefixes non-negative values with a plus sign", () => {
    expect(formatSignedPercent(0)).toBe("+0.0%");
    expect(formatSignedPercent(12.34)).toBe("+12.3%");
  });

  it("keeps the minus sign for negative values", () => {
    expect(formatSignedPercent(-7.25)).toBe("-7.3%");
  });
});

/*
 * parseAmountInput is the app's ONE definition of what a money string means:
 * the amount box reads its own value with it, numeric-field.ts commits with
 * it, and buildLane now reads the plan's principal with it, so the engine
 * takes a number rather than a second, disagreeing parse of the same text.
 * These cases pin that contract at the module that owns it.
 */
describe("parseAmountInput", () => {
  it("reads a plain amount", () => {
    expect(parseAmountInput("10000")).toBe(10000);
    expect(parseAmountInput("0")).toBe(0);
  });

  it("reads through the decoration a money field carries", () => {
    // A currency symbol, a thousands separator and surrounding space are all
    // decoration on a number the user can already see
    expect(parseAmountInput("10,000")).toBe(10000);
    expect(parseAmountInput("$10000")).toBe(10000);
    expect(parseAmountInput(" 10000 ")).toBe(10000);
    expect(parseAmountInput("$250,000.00")).toBe(250000);
  });

  it("keeps the decimal point rather than concatenating across it", () => {
    // Stripping the point turned a pasted "$250,000.00" into $25,000,000
    expect(parseAmountInput("10000.75")).toBe(10000.75);
    expect(parseAmountInput("$250,000.00")).not.toBe(25_000_000);
  });

  it("is NaN when the text holds no number at all", () => {
    // Not 0: each caller decides what an unreadable amount means to it. The
    // lane treats it as the empty pot a cleared box means; the engine refuses
    // to simulate one.
    expect(parseAmountInput("")).toBeNaN();
    expect(parseAmountInput("abc")).toBeNaN();
    expect(parseAmountInput(" ")).toBeNaN();
  });

  it("keeps a leading minus so a negative amount can be rejected", () => {
    // Stripping the sign would silently turn "-500" into a $500 plan
    expect(parseAmountInput("-500")).toBe(-500);
  });
});
