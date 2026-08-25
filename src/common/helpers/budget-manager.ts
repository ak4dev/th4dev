/* ==================================================
 * Budget Manager
 *
 * Pure CRUD helpers for budget expense items.
 * Functions compute and return new arrays without
 * side effects — persistence is handled by the
 * consent-gated useEffect in App.tsx.
 * ================================================== */

import { MONTHS_PER_YEAR } from "../constants/app-constants";

/* ---------- Types ---------- */

export interface BudgetItem {
  id: string;
  name: string;
  amount: number;
  category: string;
}

/* ---------- Constants ---------- */

export const MAX_ITEMS = 50;

export const DEFAULT_CATEGORIES = [
  "Housing",
  "Transportation",
  "Food",
  "Insurance",
  "Utilities",
  "Healthcare",
  "Savings",
  "Entertainment",
  "Personal",
  "Debt",
  "Other",
] as const;

export type BudgetCategory = (typeof DEFAULT_CATEGORIES)[number];

/* ---------- CRUD ---------- */

export function addBudgetItem(
  name: string,
  amount: number,
  category: string,
  items: BudgetItem[],
): BudgetItem[] {
  if (items.length >= MAX_ITEMS) {
    throw new Error(`Maximum of ${MAX_ITEMS} budget items reached.`);
  }
  const id = `budget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return [...items, { id, name, amount: Math.max(0, amount), category }];
}

export function updateBudgetItem(
  id: string,
  changes: Partial<Pick<BudgetItem, "name" | "amount" | "category">>,
  items: BudgetItem[],
): BudgetItem[] {
  return items.map((item) =>
    item.id !== id
      ? item
      : {
          ...item,
          ...changes,
          amount: Math.max(0, changes.amount ?? item.amount),
        },
  );
}

export function deleteBudgetItem(
  id: string,
  items: BudgetItem[],
): BudgetItem[] {
  return items.filter((item) => item.id !== id);
}

/* ---------- Calculations ---------- */

export function getMonthlyTotal(items: BudgetItem[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

export function getAnnualTotal(items: BudgetItem[]): number {
  return getMonthlyTotal(items) * MONTHS_PER_YEAR;
}

export function getTotalByCategory(items: BudgetItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.category || "Other";
    map.set(key, (map.get(key) || 0) + item.amount);
  }
  return map;
}
