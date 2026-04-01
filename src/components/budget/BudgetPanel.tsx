/* ==================================================
 * Budget Panel
 *
 * Interactive budget builder where users name expenses
 * and enter monthly dollar amounts.  Shows totals,
 * category breakdown with proportional bars, and
 * optionally feeds annual expenses into FIRE.
 * ================================================== */

import { useState, useCallback, useMemo } from "react";
import * as Slider from "@radix-ui/react-slider";
import { styled, keyframes } from "../../../stitches.config";
import { compactModernInputStyles } from "../../common/constants/input-styles";
import {
  addBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
  getMonthlyTotal,
  getAnnualTotal,
  getTotalByCategory,
  getCategoryPercentages,
  DEFAULT_CATEGORIES,
  MAX_ITEMS,
  type BudgetItem,
} from "../../common/helpers/budget-manager";

/* ---------- Props ---------- */

interface BudgetPanelProps {
  /** Budget items managed by parent */
  items: BudgetItem[];
  /** Setter for budget items */
  setItems: (items: BudgetItem[]) => void;
  /** Callback fired whenever the annual total changes (for FIRE integration) */
  onAnnualTotalChange?: (annual: number) => void;
}

/* ---------- Animations ---------- */

const slideIn = keyframes({
  from: { opacity: 0, transform: "translateY(-6px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

/* ---------- Styled Components ---------- */

const Container = styled("div", {
  backgroundColor: "$currentLine",
  borderRadius: "12px",
  padding: "20px",
  marginTop: "24px",
  boxShadow: "0 6px 16px rgba(0,0,0,0.2)",
});

const Title = styled("h4", {
  margin: 0,
  marginBottom: "16px",
  fontSize: "0.95rem",
  fontWeight: 600,
  color: "$cyan",
  display: "flex",
  alignItems: "center",
  gap: "8px",
});

const CountLabel = styled("span", {
  fontSize: "0.72rem",
  color: "$comment",
  fontWeight: 400,
});

/* --- Add-item form --- */

const AddRow = styled("form", {
  display: "flex",
  gap: "8px",
  marginBottom: "16px",
  flexWrap: "wrap",
});

const Input = styled("input", {
  ...compactModernInputStyles,
  outline: "none",
  "&::placeholder": { color: "$comment", opacity: 0.8 },
});

const NameInput = styled(Input, {
  flex: "2 1 140px",
  minWidth: "120px",
});

const AmountInput = styled(Input, {
  flex: "1 1 90px",
  minWidth: "80px",
  textAlign: "right",
});

const Select = styled("select", {
  backgroundColor: "$background",
  border: "1px solid $comment",
  borderRadius: "6px",
  padding: "8px 10px",
  fontSize: "0.82rem",
  color: "$foreground",
  outline: "none",
  flex: "1 1 110px",
  minWidth: "100px",
  cursor: "pointer",
  "&:focus": { borderColor: "$cyan" },
});

const Button = styled("button", {
  borderRadius: "6px",
  border: "none",
  padding: "8px 14px",
  fontSize: "0.8rem",
  fontWeight: 600,
  cursor: "pointer",
  transition: "opacity 0.15s",
  "&:hover": { opacity: 0.85 },
  "&:disabled": { opacity: 0.4, cursor: "not-allowed" },
  variants: {
    color: {
      cyan: { backgroundColor: "$cyan", color: "$background" },
      green: { backgroundColor: "$green", color: "$background" },
      red: { backgroundColor: "$red", color: "$background" },
      muted: { backgroundColor: "$comment", color: "$background" },
    },
    size: {
      sm: { padding: "4px 10px", fontSize: "0.72rem" },
      md: { padding: "8px 14px", fontSize: "0.8rem" },
    },
  },
  defaultVariants: { color: "cyan", size: "md" },
});

/* --- Item list --- */

const ItemList = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  marginBottom: "16px",
});

const ItemRow = styled("div", {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  backgroundColor: "$background",
  borderRadius: "8px",
  padding: "8px 12px",
  animation: `${slideIn} 0.2s ease`,
});

const ItemName = styled("span", {
  flex: "2 1 0",
  fontSize: "0.85rem",
  fontWeight: 500,
  color: "$foreground",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const ItemCategory = styled("span", {
  flex: "1 1 0",
  fontSize: "0.72rem",
  color: "$comment",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const ItemAmount = styled("span", {
  fontSize: "0.9rem",
  fontWeight: 600,
  color: "$green",
  whiteSpace: "nowrap",
  minWidth: "70px",
  textAlign: "right",
});

const DeleteButton = styled("button", {
  all: "unset",
  cursor: "pointer",
  fontSize: "0.75rem",
  color: "$comment",
  padding: "2px 6px",
  borderRadius: "4px",
  transition: "color 0.15s, background-color 0.15s",
  "&:hover": { color: "$red", backgroundColor: "rgba(255,85,85,0.1)" },
});

/* --- Totals & category breakdown --- */

const Separator = styled("hr", {
  border: "none",
  borderTop: "1px solid $comment",
  opacity: 0.2,
  margin: "14px 0",
});

const TotalsRow = styled("div", {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0 4px",
});

const TotalLabel = styled("span", {
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "$comment",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
});

const TotalValue = styled("span", {
  fontSize: "1.1rem",
  fontWeight: 700,
  variants: {
    color: {
      green: { color: "$green" },
      cyan: { color: "$cyan" },
      orange: { color: "$orange" },
    },
  },
  defaultVariants: { color: "green" },
});

const CategoryBreakdown = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  marginTop: "12px",
});

const CategoryRow = styled("div", {
  display: "flex",
  alignItems: "center",
  gap: "10px",
});

const CategoryName = styled("span", {
  fontSize: "0.78rem",
  color: "$foreground",
  minWidth: "100px",
  fontWeight: 500,
});

const CategoryBarBg = styled("div", {
  flex: 1,
  height: "6px",
  backgroundColor: "$background",
  borderRadius: "3px",
  overflow: "hidden",
});

const CategoryBarFill = styled("div", {
  height: "100%",
  borderRadius: "3px",
  backgroundColor: "$purple",
  transition: "width 0.3s ease",
});

const CategoryPct = styled("span", {
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "$comment",
  minWidth: "42px",
  textAlign: "right",
});

const CategoryAmt = styled("span", {
  fontSize: "0.72rem",
  color: "$comment",
  minWidth: "60px",
  textAlign: "right",
});

const EmptyMessage = styled("p", {
  fontSize: "0.82rem",
  color: "$comment",
  textAlign: "center",
  padding: "20px 0",
  margin: 0,
});

/* --- Inline-edit input --- */

const InlineInput = styled(Input, {
  padding: "4px 8px",
  fontSize: "0.82rem",
  width: "auto",
});

/* --- Budget item slider (matches original InvestmentSlider theme) --- */

const BudgetSliderRoot = styled(Slider.Root, {
  position: "relative",
  display: "flex",
  alignItems: "center",
  flex: 1,
  minWidth: 0,
  height: "20px",
});

const BudgetSliderTrack = styled(Slider.Track, {
  backgroundColor: "$cyan",
  position: "relative",
  flexGrow: 1,
  height: "4px",
  borderRadius: "9999px",
});

const BudgetSliderRange = styled(Slider.Range, {
  position: "absolute",
  backgroundColor: "$green",
  height: "100%",
  borderRadius: "9999px",
});

const BudgetSliderThumb = styled(Slider.Thumb, {
  width: 14,
  height: 14,
  borderRadius: "50%",
  backgroundColor: "$green",
  boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
});

/* ---------- Helpers ---------- */

function fmt(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/* ---------- Category color map ---------- */

const CATEGORY_COLORS: Record<string, string> = {
  Housing: "#bd93f9",
  Transportation: "#8be9fd",
  Food: "#50fa7b",
  Insurance: "#ffb86c",
  Utilities: "#f1fa8c",
  Healthcare: "#ff79c6",
  Savings: "#6272a4",
  Entertainment: "#ff5555",
  Personal: "#8be9fd",
  Debt: "#ff5555",
  Other: "#6272a4",
};

/* ---------- Component ---------- */

export default function BudgetPanel({
  items,
  setItems,
  onAnnualTotalChange,
}: BudgetPanelProps) {
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCategory, setNewCategory] = useState<string>(DEFAULT_CATEGORIES[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");

  const monthlyTotal = useMemo(() => getMonthlyTotal(items), [items]);
  const annualTotal = useMemo(() => getAnnualTotal(items), [items]);
  const categoryTotals = useMemo(() => getTotalByCategory(items), [items]);
  const categoryPcts = useMemo(() => getCategoryPercentages(items), [items]);

  const canAdd = items.length < MAX_ITEMS;

  /* --- Fire integration --- */
  const prevAnnualRef = useMemo(() => ({ current: -1 }), []);
  if (onAnnualTotalChange && annualTotal !== prevAnnualRef.current) {
    prevAnnualRef.current = annualTotal;
    // Defer to avoid setState-during-render
    queueMicrotask(() => onAnnualTotalChange(annualTotal));
  }

  /* --- Handlers --- */

  const handleAdd = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!canAdd) return;
      const amount = parseFloat(newAmount) || 0;
      const name = newName.trim() || "Untitled";
      const updated = addBudgetItem(name, amount, newCategory, items);
      setItems(updated);
      setNewName("");
      setNewAmount("");
    },
    [canAdd, newName, newAmount, newCategory, items],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const updated = deleteBudgetItem(id, items);
      setItems(updated);
    },
    [items],
  );

  const handleStartEdit = useCallback((item: BudgetItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditAmount(String(item.amount));
  }, []);

  const handleFinishEdit = useCallback(() => {
    if (editingId && editName.trim()) {
      const updated = updateBudgetItem(
        editingId,
        { name: editName.trim(), amount: parseFloat(editAmount) || 0 },
        items,
      );
      setItems(updated);
    }
    setEditingId(null);
  }, [editingId, editName, editAmount, items]);

  const handleSliderChange = useCallback(
    (id: string, amount: number) => {
      const updated = updateBudgetItem(id, { amount }, items);
      setItems(updated);
    },
    [items],
  );

  /* --- Sorted categories for display --- */
  const sortedCategories = useMemo(() => {
    return [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]);
  }, [categoryTotals]);

  return (
    <Container>
      <Title>
        Monthly Budget{" "}
        <CountLabel>
          ({items.length}/{MAX_ITEMS})
        </CountLabel>
      </Title>

      {/* Add-item form */}
      <AddRow onSubmit={handleAdd}>
        <NameInput
          placeholder="Expense name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={60}
        />
        <AmountInput
          placeholder="$/mo"
          type="text"
          inputMode="decimal"
          value={newAmount}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^0-9.]/g, "");
            setNewAmount(cleaned);
          }}
        />
        <Select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
        >
          {DEFAULT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </Select>
        <Button type="submit" color="cyan" disabled={!canAdd}>
          Add
        </Button>
      </AddRow>

      {/* Item list */}
      <ItemList>
        {items.length === 0 && (
          <EmptyMessage>
            No expenses yet. Add your first budget item above.
          </EmptyMessage>
        )}
        {items.map((item) => {
          const isEditing = editingId === item.id;
          return (
            <ItemRow key={item.id}>
              {isEditing ? (
                <>
                  <InlineInput
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleFinishEdit()}
                    onBlur={handleFinishEdit}
                    autoFocus
                    maxLength={60}
                    css={{ flex: "2 1 0" }}
                  />
                  <InlineInput
                    type="text"
                    inputMode="decimal"
                    value={editAmount}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^0-9.]/g, "");
                      setEditAmount(cleaned);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleFinishEdit()}
                    onBlur={handleFinishEdit}
                    css={{ flex: "1 1 0", textAlign: "right", maxWidth: "90px" }}
                  />
                </>
              ) : (
                <>
                  <ItemName
                    onDoubleClick={() => handleStartEdit(item)}
                    title="Double-click to edit"
                  >
                    {item.name}
                  </ItemName>
                  <ItemCategory>{item.category}</ItemCategory>
                  <ItemAmount>{fmt(item.amount)}</ItemAmount>
                  <BudgetSliderRoot
                    value={[item.amount]}
                    min={0}
                    max={Math.max(item.amount * 2, 500)}
                    step={1}
                    onValueChange={(val) => handleSliderChange(item.id, val[0])}
                  >
                    <BudgetSliderTrack>
                      <BudgetSliderRange />
                    </BudgetSliderTrack>
                    <BudgetSliderThumb />
                  </BudgetSliderRoot>
                </>
              )}
              <DeleteButton
                onClick={() => handleDelete(item.id)}
                title="Remove"
              >
                ✕
              </DeleteButton>
            </ItemRow>
          );
        })}
      </ItemList>

      {items.length > 0 && (
        <>
          <Separator />

          {/* Totals */}
          <TotalsRow>
            <TotalLabel>Monthly</TotalLabel>
            <TotalValue color="green">{fmt(monthlyTotal)}</TotalValue>
          </TotalsRow>
          <TotalsRow css={{ marginTop: "6px" }}>
            <TotalLabel>Annual</TotalLabel>
            <TotalValue color="cyan">{fmt(annualTotal)}</TotalValue>
          </TotalsRow>

          {/* Category breakdown */}
          {sortedCategories.length > 1 && (
            <>
              <Separator />
              <CategoryBreakdown>
                {sortedCategories.map(([cat, amt]) => (
                  <CategoryRow key={cat}>
                    <CategoryName>{cat}</CategoryName>
                    <CategoryBarBg>
                      <CategoryBarFill
                        css={{
                          width: `${categoryPcts.get(cat) || 0}%`,
                          backgroundColor: CATEGORY_COLORS[cat] || "$purple",
                        }}
                      />
                    </CategoryBarBg>
                    <CategoryPct>
                      {(categoryPcts.get(cat) || 0).toFixed(0)}%
                    </CategoryPct>
                    <CategoryAmt>{fmt(amt)}</CategoryAmt>
                  </CategoryRow>
                ))}
              </CategoryBreakdown>
            </>
          )}
        </>
      )}
    </Container>
  );
}
