// src/common/types.ts

export interface LineGraphEntry {
  x: Date;          // The date of the data point
  y: number;        // The primary value (nominal or inflation-adjusted)
  alternateY: number; // The alternate value for comparison
}

export interface InvestmentCalculatorProps {
  currentAmount?: string;
  setCurrentAmount: (value: string | undefined) => void;
  projectedGain: number;
  setProjectedGain: (value: number) => void;
  yearsOfGrowth: number;
  setYearsOfGrowth: (value: number) => void;
  monthlyContribution: number;
  setMonthlyContribution: (value: number) => void;
  monthlyWithdrawal: number;
  setMonthlyWithdrawal: (value: number) => void;
  yearWithdrawalsBegin: number;
  setYearWithdrawalsBegin: (value: number) => void;
  yearContributionsStop?: number;
  setYearContributionsStop: (value: number | undefined) => void;
  growthMatrix: LineGraphEntry[];
  advanced?: boolean;
  rollOver?: boolean;
  investmentToRoll?: number;
  yearOfRollover?: number;
  maxMonthlyWithdrawal: number;
  depreciationRate: number;
  investmentId: string;
}

export interface DateAmountPair {
  date: Date;
  amount: number;
  inflationAdjustedAmount: number;
}