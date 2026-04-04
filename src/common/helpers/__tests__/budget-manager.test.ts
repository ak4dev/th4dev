import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadBudget,
  addBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
  getMonthlyTotal,
  getAnnualTotal,
  getTotalByCategory,
  getCategoryPercentages,
  MAX_ITEMS,
  type BudgetItem,
} from "../budget-manager";

/* ---------- localStorage mock ---------- */

let storage: Record<string, string> = {};

beforeEach(() => {
  storage = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => {
      storage[k] = v;
    },
    removeItem: (k: string) => {
      delete storage[k];
    },
  });
});

/* ---------- loadBudget ---------- */

describe("loadBudget", () => {
  it("returns empty array when nothing stored", () => {
    expect(loadBudget()).toEqual([]);
  });

  it("returns empty array for corrupt data", () => {
    storage["th4_budget"] = "not json";
    expect(loadBudget()).toEqual([]);
  });

  it("returns stored items", () => {
    const item: BudgetItem = {
      id: "b1",
      name: "Rent",
      amount: 1500,
      category: "Housing",
    };
    storage["th4_budget"] = JSON.stringify({ items: [item] });
    const result = loadBudget();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Rent");
    expect(result[0].amount).toBe(1500);
  });
});

/* ---------- addBudgetItem ---------- */

describe("addBudgetItem", () => {
  it("adds a new item to empty array", () => {
    const result = addBudgetItem("Rent", 1500, "Housing", []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Rent");
    expect(result[0].amount).toBe(1500);
    expect(result[0].category).toBe("Housing");
  });

  it("appends to existing items", () => {
    const first = addBudgetItem("Rent", 1500, "Housing", []);
    const result = addBudgetItem("Groceries", 600, "Food", first);
    expect(result).toHaveLength(2);
    expect(result[1].name).toBe("Groceries");
  });

  it("clamps negative amounts to zero", () => {
    const result = addBudgetItem("Negative", -100, "Other", []);
    expect(result[0].amount).toBe(0);
  });

  it("does not write to localStorage", () => {
    addBudgetItem("Rent", 1500, "Housing", []);
    expect(storage["th4_budget"]).toBeUndefined();
  });

  it("throws when max items reached", () => {
    const existing: BudgetItem[] = Array.from({ length: MAX_ITEMS }, (_, i) => ({
      id: `b${i}`,
      name: `Item ${i}`,
      amount: 100,
      category: "Other",
    }));
    expect(() => addBudgetItem("One too many", 100, "Other", existing)).toThrow(
      /Maximum/,
    );
  });
});

/* ---------- updateBudgetItem ---------- */

describe("updateBudgetItem", () => {
  it("updates name of an existing item", () => {
    const items = addBudgetItem("Rent", 1500, "Housing", []);
    const id = items[0].id;
    const result = updateBudgetItem(id, { name: "Mortgage" }, items);
    expect(result[0].name).toBe("Mortgage");
    expect(result[0].amount).toBe(1500);
  });

  it("updates amount of an existing item", () => {
    const items = addBudgetItem("Rent", 1500, "Housing", []);
    const id = items[0].id;
    const result = updateBudgetItem(id, { amount: 2000 }, items);
    expect(result[0].amount).toBe(2000);
  });

  it("clamps negative amount update to zero", () => {
    const items = addBudgetItem("Rent", 1500, "Housing", []);
    const id = items[0].id;
    const result = updateBudgetItem(id, { amount: -500 }, items);
    expect(result[0].amount).toBe(0);
  });

  it("updates category", () => {
    const items = addBudgetItem("Internet", 80, "Other", []);
    const id = items[0].id;
    const result = updateBudgetItem(id, { category: "Utilities" }, items);
    expect(result[0].category).toBe("Utilities");
  });

  it("does not write to localStorage", () => {
    const items = addBudgetItem("Rent", 1500, "Housing", []);
    updateBudgetItem(items[0].id, { amount: 2000 }, items);
    expect(storage["th4_budget"]).toBeUndefined();
  });

  it("leaves other items unchanged", () => {
    const first = addBudgetItem("Rent", 1500, "Housing", []);
    const both = addBudgetItem("Food", 600, "Food", first);
    const result = updateBudgetItem(both[1].id, { amount: 700 }, both);
    expect(result[0].amount).toBe(1500);
    expect(result[1].amount).toBe(700);
  });
});

/* ---------- deleteBudgetItem ---------- */

describe("deleteBudgetItem", () => {
  it("removes an item by id", () => {
    const items = addBudgetItem("Rent", 1500, "Housing", []);
    const result = deleteBudgetItem(items[0].id, items);
    expect(result).toHaveLength(0);
  });

  it("does not write to localStorage", () => {
    const items = addBudgetItem("Rent", 1500, "Housing", []);
    deleteBudgetItem(items[0].id, items);
    expect(storage["th4_budget"]).toBeUndefined();
  });

  it("does nothing if id not found", () => {
    const items = addBudgetItem("Rent", 1500, "Housing", []);
    const result = deleteBudgetItem("nonexistent", items);
    expect(result).toHaveLength(1);
  });
});

/* ---------- Calculations ---------- */

describe("getMonthlyTotal", () => {
  it("returns 0 for empty list", () => {
    expect(getMonthlyTotal([])).toBe(0);
  });

  it("sums all item amounts", () => {
    const items: BudgetItem[] = [
      { id: "1", name: "Rent", amount: 1500, category: "Housing" },
      { id: "2", name: "Food", amount: 600, category: "Food" },
      { id: "3", name: "Car", amount: 400, category: "Transportation" },
    ];
    expect(getMonthlyTotal(items)).toBe(2500);
  });
});

describe("getAnnualTotal", () => {
  it("returns monthly total * 12", () => {
    const items: BudgetItem[] = [
      { id: "1", name: "Rent", amount: 1000, category: "Housing" },
    ];
    expect(getAnnualTotal(items)).toBe(12000);
  });
});

describe("getTotalByCategory", () => {
  it("groups by category", () => {
    const items: BudgetItem[] = [
      { id: "1", name: "Rent", amount: 1500, category: "Housing" },
      { id: "2", name: "Insurance", amount: 200, category: "Housing" },
      { id: "3", name: "Food", amount: 600, category: "Food" },
    ];
    const map = getTotalByCategory(items);
    expect(map.get("Housing")).toBe(1700);
    expect(map.get("Food")).toBe(600);
  });

  it("uses 'Other' for empty category", () => {
    const items: BudgetItem[] = [
      { id: "1", name: "Misc", amount: 50, category: "" },
    ];
    const map = getTotalByCategory(items);
    expect(map.get("Other")).toBe(50);
  });
});

describe("getCategoryPercentages", () => {
  it("returns percentages for each category", () => {
    const items: BudgetItem[] = [
      { id: "1", name: "Rent", amount: 750, category: "Housing" },
      { id: "2", name: "Food", amount: 250, category: "Food" },
    ];
    const pcts = getCategoryPercentages(items);
    expect(pcts.get("Housing")).toBe(75);
    expect(pcts.get("Food")).toBe(25);
  });

  it("returns empty map for zero total", () => {
    expect(getCategoryPercentages([])).toEqual(new Map());
  });
});

describe("edge cases", () => {
  it("update on non-existent id returns items unchanged", () => {
    const items = addBudgetItem("Rent", 1500, "Housing", []);
    const result = updateBudgetItem("nonexistent", { amount: 2000 }, items);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(1500);
  });

  it("delete on non-existent id returns items unchanged", () => {
    const items = addBudgetItem("Rent", 1500, "Housing", []);
    const result = deleteBudgetItem("nonexistent", items);
    expect(result).toHaveLength(1);
  });

  it("handles fractional amounts", () => {
    const items = addBudgetItem("Sub", 9.99, "Other", []);
    expect(items[0].amount).toBe(9.99);
    expect(getAnnualTotal(items)).toBeCloseTo(119.88, 2);
  });
});
