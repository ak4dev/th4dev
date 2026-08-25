import { describe, it, expect } from "vitest";
import { formatCurrency, formatPrice, formatSignedPercent } from "../format";

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
