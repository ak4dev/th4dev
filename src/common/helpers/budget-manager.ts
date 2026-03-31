/* ==================================================
 * Budget Manager
 *
 * CRUD for named budget expense items stored in
 * localStorage.  Each item has a name, amount
 * (monthly), and optional category.
 * ================================================== */

/* ---------- Types ---------- */

export interface BudgetItem {
  id: string;
  name: string;
  amount: number;
  category: string;
}

export interface BudgetStore {
  items: BudgetItem[];
}

/* ---------- Constants ---------- */

const STORAGE_KEY = "th4_budget";
const MAX_ITEMS = 50;

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

/* ---------- Persistence ---------- */

export function loadBudget(): BudgetItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BudgetStore;
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function persistBudget(items: BudgetItem[]): void {
  const store: BudgetStore = { items };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/* ---------- CRUD ---------- */

export function addBudgetItem(
  name: string,
  amount: number,
  category: string,
  existing?: BudgetItem[],
): BudgetItem[] {
  const items = existing ?? loadBudget();

  if (items.length >= MAX_ITEMS) {
    throw new Error(`Maximum of ${MAX_ITEMS} budget items reached.`);
  }

  const id = `budget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const item: BudgetItem = { id, name, amount: Math.max(0, amount), category };

  const updated = [...items, item];
  persistBudget(updated);
  return updated;
}

export function updateBudgetItem(
  id: string,
  changes: Partial<Pick<BudgetItem, "name" | "amount" | "category">>,
  existing?: BudgetItem[],
): BudgetItem[] {
  const items = existing ?? loadBudget();
  const updated = items.map((item) =>
    item.id === id
      ? {
          ...item,
          ...changes,
          amount: changes.amount !== undefined ? Math.max(0, changes.amount) : item.amount,
        }
      : item,
  );
  persistBudget(updated);
  return updated;
}

export function deleteBudgetItem(
  id: string,
  existing?: BudgetItem[],
): BudgetItem[] {
  const items = existing ?? loadBudget();
  const updated = items.filter((item) => item.id !== id);
  persistBudget(updated);
  return updated;
}

/* ---------- Calculations ---------- */

export function getMonthlyTotal(items: BudgetItem[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

export function getAnnualTotal(items: BudgetItem[]): number {
  return getMonthlyTotal(items) * 12;
}

export function getTotalByCategory(
  items: BudgetItem[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.category || "Other";
    map.set(key, (map.get(key) || 0) + item.amount);
  }
  return map;
}

export function getCategoryPercentages(
  items: BudgetItem[],
): Map<string, number> {
  const totals = getTotalByCategory(items);
  const monthly = getMonthlyTotal(items);
  if (monthly === 0) return new Map();
  const pcts = new Map<string, number>();
  for (const [cat, amt] of totals) {
    pcts.set(cat, (amt / monthly) * 100);
  }
  return pcts;
}

export { MAX_ITEMS };
