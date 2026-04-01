# TH4Dev Beta Feature Specifications

Planned features for the TH4Dev investment calculator. Each feature is
scoped as a single commit with all code, types, tests, and integration.

---

## Feature 1: Expense Phasing

### Purpose
Allow users to assign start/end years to individual budget items so
expenses are not assumed to last the entire projection. Examples:
mortgage payments ending at year 15, college tuition from years 18-22,
childcare only for years 0-5.

### Commit Scope
`feat(budget): expense phasing with start/end year bounds`

### Type Changes

**`src/common/types/types.ts`** — Extend `BudgetItem`:
```ts
export interface BudgetItem {
  id: string
  name: string
  amount: number
  category: string
  startYear?: number  // Year expense begins (default 0)
  endYear?: number    // Year expense ends (default Infinity)
}
```

### Helper Changes

**`src/common/helpers/budget-manager.ts`**:
- `addBudgetItem()` accepts optional `startYear`, `endYear` params
- `updateBudgetItem()` allows partial update of phasing fields
- New: `getActiveExpenses(items, year)` — filters items where
  `startYear <= year <= endYear`
- New: `getMonthlyTotalAtYear(items, year)` — sum of active items
- New: `getAnnualPhaseSchedule(items, maxYear)` — returns
  `Array<{ year: number; annualTotal: number }>` for charting

### UI Changes

**`src/components/budget/BudgetPanel.tsx`**:
- Add two optional number inputs per budget row: "Start Year" and
  "End Year" with spinner-free styling (matching `inputStyles`)
- Default Start Year = 0, End Year = blank (interpreted as no end)
- Display active/inactive status per item based on a "preview year"
  slider at the top of the panel
- Show a small phasing summary: "3 of 5 expenses active at year 12"

### Calculator Integration

**`src/components/InvestmentCalculatorModern.tsx`**:
- Pass phased annual totals into the growth calculator per year
  instead of a flat annual withdrawal
- FIRE calculator receives phased schedule to compute variable
  withdrawal rates per retirement year

**`src/common/helpers/investment-growth-calculator.ts`**:
- `calculateGrowth()` accepts optional `annualExpenseSchedule:
  Map<number, number>` — if provided, withdrawal amount varies by year
- Monthly withdrawal = `schedule.get(year) / 12` when schedule exists

### Test File
**`src/common/helpers/__tests__/budget-manager.test.ts`** — add:
- `getActiveExpenses` filters correctly at boundary years
- `getMonthlyTotalAtYear` sums only active items
- `getAnnualPhaseSchedule` produces correct year-by-year totals
- Budget items without phasing default to always-active
- Edge: startYear > endYear returns 0 for that item
- Integration: phased withdrawal produces different growth than flat

---

## Feature 2: Tax-Aware Withdrawal Sequencing

### Purpose
Model the tax impact of withdrawing from different account types
(Traditional IRA, Roth IRA, Taxable Brokerage) in sequence. Show the
optimal withdrawal order to minimize lifetime tax burden using standard
US federal tax brackets.

### Commit Scope
`feat(fire): tax-aware withdrawal sequencing across account types`

### Type Changes

**`src/common/types/types.ts`**:
```ts
export interface TaxAccount {
  id: string
  label: string
  type: "traditional" | "roth" | "taxable"
  balance: number
  annualContribution: number
}

export interface TaxBracket {
  floor: number
  rate: number  // e.g. 0.22 = 22%
}

export interface WithdrawalSequenceResult {
  year: number
  withdrawals: Array<{
    accountId: string
    gross: number
    tax: number
    net: number
  }>
  totalTax: number
  totalNet: number
  remainingBalances: Record<string, number>
}
```

Add `taxAccounts?: TaxAccount[]` to `TH4State`.

### Helper: New File

**`src/common/helpers/tax-withdrawal.ts`**:
- `US_BRACKETS_2025: TaxBracket[]` — current federal brackets
  (single filer, married filing jointly selectable)
- `computeTaxOnIncome(income, brackets, filingStatus)` — progressive
  tax computation
- `sequenceWithdrawals(accounts, annualNeed, years, brackets,
  filingStatus)` — greedy algorithm: withdraw from taxable first
  (taxed at capital gains rate), then traditional (ordinary income),
  then Roth (tax-free) to minimize total tax paid
- `optimizeSequence(accounts, annualNeed, years, brackets)` — runs
  all 6 permutations of 3 account types, returns the one with lowest
  cumulative tax
- Returns `WithdrawalSequenceResult[]` per year

### UI Changes

**`src/components/fire/FirePanel.tsx`**:
- New section (visible when FIRE toggle is on): "Tax-Aware Withdrawal"
- Inputs: filing status dropdown (Single / Married Filing Jointly),
  up to 3 accounts with type selector, balance, and contribution
- Output table: year-by-year withdrawal amounts per account, taxes
  paid, net received
- Summary: total taxes paid over retirement, effective tax rate

### State & Toggle

- New toggle: `taxWithdrawal: boolean` in `TogglesState`
- Visible only when `toggles.fire === true` (nested under FIRE)
- Follow standard toggle addition pattern (types.ts, state-manager.ts,
  InvestmentCalculatorModern.tsx, StateIOPopover.tsx)

### Test File
**`src/common/helpers/__tests__/tax-withdrawal.test.ts`**:
- Progressive tax computation matches known bracket calculations
- Taxable-first sequence produces lower total tax than Roth-first
- Zero-balance accounts are skipped gracefully
- Single year vs multi-year sequencing
- Edge: annual need exceeds all balances (partial withdrawal)
- Filing status affects bracket thresholds correctly

---

## Feature 3: Roth Conversion Ladder

### Purpose
Model annual Roth conversions from Traditional IRA to Roth IRA during
early retirement. Shows the 5-year seasoning pipeline, annual tax
impact, and break-even point where conversions save money vs staying
traditional.

### Commit Scope
`feat(fire): roth conversion ladder with 5-year seasoning pipeline`

### Type Changes

**`src/common/types/types.ts`**:
```ts
export interface RothConversionYear {
  year: number
  convertedAmount: number
  taxOnConversion: number
  seasoned: boolean         // true if 5+ years since conversion
  availableForWithdrawal: number
}

export interface RothLadderResult {
  conversions: RothConversionYear[]
  totalTaxPaid: number
  totalTaxSaved: number     // vs withdrawing from traditional
  breakEvenYear: number     // year where cumulative savings > 0
  pipeline: Array<{ year: number; available: number }>
}
```

### Helper: New File

**`src/common/helpers/roth-ladder.ts`**:
- `planRothLadder(traditionalBalance, annualConversion, years,
  brackets, otherIncome)` — simulates year-by-year:
  - Convert `annualConversion` from Traditional to Roth
  - Pay tax on conversion at current bracket (+ otherIncome)
  - Track 5-year seasoning per conversion tranche
  - After year 5, converted funds become available tax-free
- `compareLadderVsDirect(traditionalBalance, annualNeed, years,
  brackets)` — compares total tax: ladder strategy vs direct
  traditional withdrawals
- Returns `RothLadderResult`

### UI Changes

**`src/components/fire/FirePanel.tsx`**:
- New collapsible section: "Roth Conversion Ladder"
- Inputs: Traditional IRA balance, annual conversion amount,
  other income (Social Security, part-time work)
- Visual pipeline: 5-column table showing conversion tranches and
  their seasoning status per year
- Summary: total tax paid on conversions, total tax saved, break-even

### Toggle

- New toggle: `rothLadder: boolean` in `TogglesState`
- Nested under FIRE (visible only when `toggles.fire === true`)

### Test File
**`src/common/helpers/__tests__/roth-ladder.test.ts`**:
- Conversions respect 5-year seasoning rule
- Tax on conversion uses progressive brackets correctly
- Break-even year calculation matches manual computation
- Zero conversion amount returns empty pipeline
- Ladder with zero other income vs high other income
- Edge: conversion amount exceeds traditional balance

---

## Feature 4: Social Security Optimizer

### Purpose
Estimate Social Security benefits at ages 62, 67 (FRA), and 70 using
PIA-based calculations. Show the break-even age where delaying
benefits becomes more profitable than claiming early.

### Commit Scope
`feat(fire): social security claiming age optimizer`

### Type Changes

**`src/common/types/types.ts`**:
```ts
export interface SocialSecurityEstimate {
  claimAge: number           // 62, 67, or 70
  monthlyBenefit: number
  annualBenefit: number
  reductionOrBonus: string   // e.g. "-30%" or "+24%"
  breakEvenVs62: number | null
  breakEvenVs67: number | null
}
```

### Helper: New File

**`src/common/helpers/social-security.ts`**:
- `estimatePIA(avgAnnualIncome, currentAge)` — simplified PIA using
  bend points (2025 values: $1,174 / $7,078 thresholds)
- `adjustForClaimAge(pia, claimAge, fra)` — applies early reduction
  (5/9% per month for first 36 months, 5/12% thereafter) or delayed
  credits (2/3% per month after FRA up to 70)
- `estimateBenefits(avgIncome, currentAge, fra)` — returns estimates
  for ages 62, 67, 70
- `findBreakEven(earlyBenefit, lateBenefit, earlyAge, lateAge)` —
  cumulative crossover point
- `optimizeClaimAge(avgIncome, currentAge, lifeExpectancy)` — returns
  the claim age that maximizes lifetime benefits

### UI Changes

**`src/components/fire/FirePanel.tsx`**:
- New section: "Social Security Optimizer"
- Inputs: average annual income (pre-retirement), current age,
  full retirement age (default 67), life expectancy (default 85)
- Output: 3-column comparison table (Age 62 / 67 / 70) showing
  monthly benefit, annual benefit, reduction/bonus percentage
- Break-even summary: "Delaying to 70 beats claiming at 62 if you
  live past age 80"
- Optional: feed optimal SS benefit into FIRE withdrawal reduction

### Toggle

- New toggle: `socialSecurity: boolean` in `TogglesState`
- Nested under FIRE (visible only when `toggles.fire === true`)

### Test File
**`src/common/helpers/__tests__/social-security.test.ts`**:
- PIA computation matches SSA bend-point formula
- Early claiming reduces benefit by correct percentage
- Delayed credits increase benefit correctly
- Break-even ages are mathematically correct
- Edge: very low income (below first bend point)
- Edge: very high income (above both bend points)
- Life expectancy shorter than break-even returns "claim early"

---

## Feature 5: Cash Flow Waterfall

### Purpose
Unified year-by-year cash flow view combining all income sources
(contributions, Social Security, Roth withdrawals) and all outflows
(expenses, taxes, fees) into a single waterfall visualization. Shows
net cash position per year and cumulative surplus/deficit.

### Commit Scope
`feat(budget): cash flow waterfall with income and expense streams`

### Type Changes

**`src/common/types/types.ts`**:
```ts
export interface CashFlowEntry {
  year: number
  inflows: Array<{ source: string; amount: number }>
  outflows: Array<{ category: string; amount: number }>
  netCashFlow: number
  cumulativePosition: number
}
```

### Helper: New File

**`src/common/helpers/cash-flow.ts`**:
- `buildCashFlowSchedule(params)` — takes:
  - `budgetItems` (with phasing from Feature 1 if available)
  - `investmentWithdrawals` (from growth calculator)
  - `contributions` (monthly contribution schedule)
  - `fees` (annual fee amounts from fee calculator)
  - `socialSecurityBenefit` (optional, from Feature 4)
  - `taxPayments` (optional, from Feature 2)
  - `years` (projection horizon)
- Returns `CashFlowEntry[]` — one entry per year
- Each entry breaks down all inflows and outflows by source/category

### UI: New Component

**`src/components/budget/CashFlowPanel.tsx`**:
- Waterfall chart using Recharts BarChart with stacked positive
  (green) and negative (red) bars per year
- Hover tooltip shows itemized inflows/outflows
- Summary row: total lifetime inflows, outflows, net position
- Table view toggle: switch between chart and tabular breakdown

### Integration

**`src/components/InvestmentCalculatorModern.tsx`**:
- Compute cash flow data from existing calculator outputs
- Pass to CashFlowPanel as props
- Panel visible when `toggles.budget === true` (embedded in budget
  section, no separate toggle needed)

### Test File
**`src/common/helpers/__tests__/cash-flow.test.ts`**:
- Net cash flow = sum(inflows) - sum(outflows) per year
- Cumulative position accumulates correctly
- Zero budget items produces inflow-only schedule
- Phased expenses (if Feature 1 exists) vary by year
- Edge: negative net cash flow years flagged correctly
- Integration: matches growth calculator withdrawal amounts

---

## Feature 6: Rebalancing Simulator

### Purpose
Model the impact of periodic portfolio rebalancing on returns and
volatility. Compare buy-and-hold vs annual/quarterly rebalancing
across a user-defined asset allocation (stocks/bonds split).

### Commit Scope
`feat(portfolio): rebalancing simulator with drift and frequency`

### Type Changes

**`src/common/types/types.ts`**:
```ts
export interface AssetAllocation {
  stocks: number   // percentage, e.g. 80
  bonds: number    // percentage, e.g. 20
}

export interface RebalanceResult {
  year: number
  preRebalance: AssetAllocation
  postRebalance: AssetAllocation
  drift: number                    // max deviation from target
  portfolioValue: number
  rebalanceTrades: number          // dollar amount traded
}

export interface RebalanceComparison {
  buyAndHold: {
    finalValue: number
    maxDrawdown: number
    volatility: number
  }
  annual: {
    finalValue: number
    maxDrawdown: number
    volatility: number
  }
  quarterly: {
    finalValue: number
    maxDrawdown: number
    volatility: number
  }
  threshold5: {
    finalValue: number
    maxDrawdown: number
    volatility: number
  }
}
```

Add `rebalanceAllocation?: AssetAllocation` to `TH4State`.

### Helper: New File

**`src/common/helpers/rebalance-simulator.ts`**:
- `simulateRebalancing(params)` — takes:
  - `initialValue`, `allocation`, `years`
  - `stockReturn`, `bondReturn`, `stockVolatility`, `bondVolatility`
  - `frequency`: "none" | "annual" | "quarterly" | "threshold"
  - `threshold`: drift percentage triggering rebalance (e.g. 5%)
  - `simulations`: number of Monte Carlo runs (default 1000)
- Per simulation: generate correlated stock/bond returns monthly,
  apply rebalancing at specified frequency, track portfolio value
- `compareStrategies(params)` — runs all 4 strategies, returns
  `RebalanceComparison` with percentile statistics
- Uses same RNG seeding pattern as existing `monte-carlo.ts`

### UI: New Component

**`src/components/portfolio/RebalancePanel.tsx`**:
- Target allocation: two linked sliders (stocks % + bonds % = 100)
- Frequency selector: None / Annual / Quarterly / 5% Threshold
- Display: comparison table of all 4 strategies
  (final value, max drawdown, annualized volatility)
- Chart: overlay of portfolio value paths for each strategy

### Integration

**`src/components/InvestmentCalculatorModern.tsx`**:
- New toggle: `rebalancing: boolean` in `TogglesState`
- Visible when `toggles.portfolio === true` (nested under Portfolio)
- Panel rendered below PortfolioPanel

**`src/common/helpers/state-manager.ts`**:
- Add slider defaults: `rebalanceStocks: 80`, `rebalanceBonds: 20`
- Add toggle default: `rebalancing: false`

### Test File
**`src/common/helpers/__tests__/rebalance-simulator.test.ts`**:
- No-rebalance simulation matches buy-and-hold math
- Annual rebalance resets allocation at year boundaries
- Quarterly rebalance fires 4x per year
- Threshold rebalance triggers only when drift exceeds threshold
- Zero volatility produces deterministic result matching manual calc
- Stock + bond percentages always sum to 100 after rebalance
- Edge: 100% stocks (no bonds) degenerates to simple growth
- Comparison returns all 4 strategies with valid statistics

---

## Implementation Order

Features are listed in dependency order. Each can be implemented
independently, but some build on prior features:

1. **Expense Phasing** — standalone, enhances existing budget
2. **Tax-Aware Withdrawal Sequencing** — standalone, new FIRE sub-tool
3. **Roth Conversion Ladder** — benefits from Feature 2 tax helpers
4. **Social Security Optimizer** — standalone, feeds into FIRE
5. **Cash Flow Waterfall** — benefits from Features 1, 2, 4 if present
6. **Rebalancing Simulator** — standalone, extends portfolio tools

Features 1, 2, 4, and 6 have no dependencies and can be implemented
in any order. Feature 3 shares tax computation logic with Feature 2.
Feature 5 aggregates data from all other features.

## Shared Patterns

All features follow these project conventions:
- TypeScript strict mode, no semicolons
- Stitches for styled components, Radix UI for interactive primitives
- Number inputs use `inputStyles` from `src/common/constants/input-styles.ts`
- Spinner-free inputs: `type="text"` with `inputMode="decimal"`
- Toggles: add to `TogglesState` (types.ts + InvestmentCalculatorModern.tsx),
  `DEFAULT_TOGGLES` (state-manager.ts), `isValidTH4State` backward-compat,
  `StateIOPopover` type guard
- Tests: Vitest with `describe`/`it`/`expect`, mock localStorage,
  one describe per exported function, edge cases included
- No emojis in UI text
- Conventional commit format with scope
