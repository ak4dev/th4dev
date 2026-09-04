/* ==================================================
 * Budget Panel
 *
 * Interactive budget builder where users name expenses
 * and enter monthly dollar amounts.  Shows totals,
 * category breakdown with proportional bars, and
 * optionally feeds annual expenses into FIRE.
 * ================================================== */

import { useState, useEffect, useRef } from "react";
import * as Icons from "@radix-ui/react-icons";
import { styled, keyframes } from "../../../stitches.config";
import { compactModernInputStyles } from "../../common/constants/input-styles";
import {
  addBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
  getMonthlyTotal,
  getAnnualTotal,
  getTotalByCategory,
  DEFAULT_CATEGORIES,
  MAX_ITEMS,
  type BudgetItem,
  type BudgetCategory,
} from "../../common/helpers/budget-manager";
import { formatCurrency } from "../../common/helpers/format";
import {
  AMOUNT_FIELD,
  parseFieldValue,
  sanitizeNumericText,
} from "../../common/helpers/numeric-field";
import {
  PanelContainer,
  PanelTitle,
  PanelButton,
  CountLabel,
  Separator,
  EmptyMessage,
  IconButton,
  SliderRoot,
  SliderTrack,
  SliderRange,
  SliderThumb,
} from "../ui/primitives";

/* ---------- Props ---------- */

interface BudgetPanelProps {
  /** Budget items managed by parent */
  items: BudgetItem[];
  /** Setter for budget items */
  setItems: (items: BudgetItem[]) => void;
  /** Called with the annual total of a non-empty budget whenever it changes (FIRE integration) */
  onAnnualTotalChange?: (annual: number) => void;
  /** Callback to set monthly withdrawal to budget total */
  onSetMonthlyWithdrawal?: (monthly: number) => void;
}

/* ---------- Animations ---------- */

const slideIn = keyframes({
  from: { opacity: 0, transform: "translateY(-6px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const fadeCheck = keyframes({
  "0%": { opacity: 0, transform: "scale(0.7)" },
  "15%": { opacity: 1, transform: "scale(1)" },
  "70%": { opacity: 1 },
  "100%": { opacity: 0, width: 0, marginLeft: 0, overflow: "hidden" },
});

const ConfirmCheck = styled("span", {
  display: "inline-flex",
  alignItems: "center",
  color: "$green",
  marginLeft: "4px",
  animation: `${String(fadeCheck)} 1.4s ease forwards`,
});

/* ---------- Styled Components ---------- */

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
  animation: `${String(slideIn)} 0.2s ease`,
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

const EditButton = styled(IconButton, {
  flexShrink: 0,
  padding: "2px 6px",
  borderRadius: "4px",
  transition: "color 0.15s, background-color 0.15s",
  // Keyboard focus gets the same treatment as hover; IconButton supplies the
  // focus ring itself.
  "&:hover, &:focus-visible": {
    color: "$cyan",
    backgroundColor: "$currentLine",
  },
});

const DeleteButton = styled(IconButton, {
  fontSize: "0.75rem",
  padding: "2px 6px",
  borderRadius: "4px",
  transition: "color 0.15s, background-color 0.15s",
  "&:hover, &:focus-visible": {
    color: "$red",
    backgroundColor: "$currentLine",
  },
});

/* --- Totals & category breakdown --- */

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
  display: "inline-flex",
  alignItems: "center",
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

// Theme tokens per category; the theme has fewer hues than categories,
// so the second member of a shared hue is dimmed to stay distinguishable.
const CategoryBarFill = styled("div", {
  height: "100%",
  borderRadius: "3px",
  transition: "width 0.3s ease",
  variants: {
    category: {
      Housing: { backgroundColor: "$purple" },
      Transportation: { backgroundColor: "$cyan" },
      Food: { backgroundColor: "$green" },
      Insurance: { backgroundColor: "$orange" },
      Utilities: { backgroundColor: "$yellow" },
      Healthcare: { backgroundColor: "$pink" },
      Savings: { backgroundColor: "$comment" },
      Entertainment: { backgroundColor: "$red" },
      Personal: { backgroundColor: "$foreground" },
      Debt: { backgroundColor: "$red", opacity: 0.55 },
      Other: { backgroundColor: "$comment", opacity: 0.55 },
    } satisfies Record<BudgetCategory, object>,
  },
  defaultVariants: { category: "Other" },
});

const isCategory = (cat: string): cat is BudgetCategory =>
  (DEFAULT_CATEGORIES as readonly string[]).includes(cat);

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

/* --- Inline-edit row --- */

const EditRow = styled("div", {
  display: "flex",
  flex: 1,
  minWidth: 0,
  gap: "8px",
});

const InlineInput = styled(Input, {
  padding: "4px 8px",
  fontSize: "0.82rem",
  width: "auto",
  variants: {
    field: {
      name: { flex: "2 1 0" },
      amount: { flex: "1 1 0", textAlign: "right", maxWidth: "90px" },
    },
  },
});

/** Slider range is twice the current amount, with a sensible floor for small items */
const sliderMax = (amount: number) => Math.max(amount * 2, 500);

/* ---------- Component ---------- */

export default function BudgetPanel({
  items,
  setItems,
  onAnnualTotalChange,
  onSetMonthlyWithdrawal,
}: BudgetPanelProps) {
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCategory, setNewCategory] = useState<string>(DEFAULT_CATEGORIES[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [withdrawalSet, setWithdrawalSet] = useState(0);
  // Range frozen for the item being dragged, so the max does not chase its own value
  const [drag, setDrag] = useState<{ id: string; max: number } | null>(null);
  // Only the item that installed the freeze may release it: pressing another
  // slider moves focus, and that blur must not clear the new item's freeze
  const releaseDrag = (id: string) => setDrag((d) => (d?.id === id ? null : d));

  const monthlyTotal = getMonthlyTotal(items);
  const annualTotal = getAnnualTotal(items);
  const sortedCategories = [...getTotalByCategory(items).entries()].sort(
    (a, b) => b[1] - a[1],
  );
  const pct = (amt: number) => (monthlyTotal ? (amt / monthlyTotal) * 100 : 0);
  const canAdd = items.length < MAX_ITEMS;

  /* --- Fire integration: only a non-empty budget feeds FIRE --- */
  const prevAnnualRef = useRef<number | null>(null);
  useEffect(() => {
    if (items.length === 0) {
      prevAnnualRef.current = null;
      return;
    }
    if (!onAnnualTotalChange || prevAnnualRef.current === annualTotal) return;
    prevAnnualRef.current = annualTotal;
    onAnnualTotalChange(annualTotal);
  }, [annualTotal, items.length, onAnnualTotalChange]);

  /* --- Handlers --- */

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim() || newCategory;
    setItems(
      addBudgetItem(
        name,
        parseFieldValue(newAmount, AMOUNT_FIELD),
        newCategory,
        items,
      ),
    );
    setNewName("");
    setNewAmount("");
  };

  /** Set by Escape so the unmount blur cancels instead of committing */
  const cancelledRef = useRef(false);

  const handleStartEdit = (item: BudgetItem) => {
    cancelledRef.current = false;
    setEditingId(item.id);
    setEditName(item.name);
    setEditAmount(String(item.amount));
  };

  const handleFinishEdit = (e?: React.FocusEvent<HTMLElement>) => {
    // Focus moving between the two inline inputs is not a commit
    if (e?.currentTarget.contains(e.relatedTarget as Node | null)) return;
    // Escape already cancelled: the blur browsers fire on unmount must not commit
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setEditingId(null);
      return;
    }
    if (editingId) {
      const original = items.find((i) => i.id === editingId);
      const name = editName.trim() || original?.name || "";
      setItems(
        updateBudgetItem(
          editingId,
          { name, amount: parseFieldValue(editAmount, AMOUNT_FIELD) },
          items,
        ),
      );
    }
    setEditingId(null);
  };

  const handleEditKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleFinishEdit();
    else if (e.key === "Escape") {
      cancelledRef.current = true;
      setEditingId(null);
    }
  };

  return (
    <PanelContainer>
      <PanelTitle>
        Monthly Budget{" "}
        <CountLabel>
          ({items.length}/{MAX_ITEMS})
        </CountLabel>
      </PanelTitle>

      {/* Add-item form */}
      <AddRow onSubmit={handleAdd}>
        <NameInput
          aria-label="Expense name"
          placeholder="Expense name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={60}
        />
        <AmountInput
          aria-label="Monthly amount"
          placeholder="$/mo"
          type="text"
          inputMode="decimal"
          value={newAmount}
          onChange={(e) =>
            setNewAmount(
              sanitizeNumericText(e.target.value, AMOUNT_FIELD.decimal),
            )
          }
        />
        <Select
          aria-label="Category"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
        >
          {DEFAULT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </Select>
        <PanelButton type="submit" color="cyan" disabled={!canAdd}>
          Add
        </PanelButton>
      </AddRow>

      {/* Item list */}
      <ItemList>
        {items.length === 0 && (
          <EmptyMessage>
            No expenses yet. Add your first budget item above.
          </EmptyMessage>
        )}
        {items.map((item) => (
          <ItemRow key={item.id}>
            {editingId === item.id ? (
              <EditRow onBlur={handleFinishEdit} onKeyDown={handleEditKey}>
                <InlineInput
                  field="name"
                  aria-label="Expense name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  maxLength={60}
                />
                <InlineInput
                  field="amount"
                  aria-label="Monthly amount"
                  type="text"
                  inputMode="decimal"
                  value={editAmount}
                  onChange={(e) =>
                    setEditAmount(
                      sanitizeNumericText(e.target.value, AMOUNT_FIELD.decimal),
                    )
                  }
                />
              </EditRow>
            ) : (
              <>
                <ItemName
                  onDoubleClick={() => handleStartEdit(item)}
                  title="Double-click to edit"
                >
                  {item.name}
                </ItemName>
                <ItemCategory>{item.category}</ItemCategory>
                <ItemAmount>{formatCurrency(item.amount)}</ItemAmount>
                <SliderRoot
                  size="sm"
                  value={[item.amount]}
                  min={0}
                  max={drag?.id === item.id ? drag.max : sliderMax(item.amount)}
                  step={1}
                  onPointerDown={() =>
                    setDrag({ id: item.id, max: sliderMax(item.amount) })
                  }
                  onPointerUp={() => releaseDrag(item.id)}
                  onPointerCancel={() => releaseDrag(item.id)}
                  onBlur={() => releaseDrag(item.id)}
                  onValueChange={([amount]) =>
                    setItems(updateBudgetItem(item.id, { amount }, items))
                  }
                >
                  <SliderTrack size="sm">
                    <SliderRange />
                  </SliderTrack>
                  <SliderThumb
                    size="sm"
                    aria-label={`${item.name} monthly amount`}
                  />
                </SliderRoot>
                <EditButton
                  onClick={() => handleStartEdit(item)}
                  aria-label={`Edit ${item.name}`}
                  title="Edit"
                >
                  <Icons.Pencil1Icon width={12} height={12} />
                </EditButton>
              </>
            )}
            <DeleteButton
              onClick={() => setItems(deleteBudgetItem(item.id, items))}
              aria-label={`Remove ${item.name}`}
              title="Remove"
            >
              ✕
            </DeleteButton>
          </ItemRow>
        ))}
      </ItemList>

      {items.length > 0 && (
        <>
          <Separator />

          {/* Totals */}
          <TotalsRow>
            <TotalLabel>Monthly</TotalLabel>
            <TotalValue color="green">
              {onSetMonthlyWithdrawal && monthlyTotal > 0 && (
                <PanelButton
                  size="sm"
                  color="muted"
                  css={{ marginRight: "8px" }}
                  onClick={() => {
                    onSetMonthlyWithdrawal(monthlyTotal);
                    setWithdrawalSet((c) => c + 1);
                  }}
                  title="Set monthly withdrawal to this amount"
                >
                  Set Withdrawal
                  {withdrawalSet > 0 && (
                    <ConfirmCheck key={withdrawalSet}>
                      <Icons.CheckCircledIcon width={14} height={14} />
                    </ConfirmCheck>
                  )}
                </PanelButton>
              )}
              {formatCurrency(monthlyTotal)}
            </TotalValue>
          </TotalsRow>
          <TotalsRow css={{ marginTop: "6px" }}>
            <TotalLabel>Annual</TotalLabel>
            <TotalValue color="cyan">{formatCurrency(annualTotal)}</TotalValue>
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
                        category={isCategory(cat) ? cat : "Other"}
                        style={{ width: `${pct(amt)}%` }}
                      />
                    </CategoryBarBg>
                    <CategoryPct>{pct(amt).toFixed(0)}%</CategoryPct>
                    <CategoryAmt>{formatCurrency(amt)}</CategoryAmt>
                  </CategoryRow>
                ))}
              </CategoryBreakdown>
            </>
          )}
        </>
      )}
    </PanelContainer>
  );
}
