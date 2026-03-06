import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as Slider from '@radix-ui/react-slider';
import * as Switch from '@radix-ui/react-switch';
import { styled } from '../../stitches.config'; // Use global stitches theme
import type { InvestmentCalculatorProps } from '../common/types/types';
import { InvestmentCalculator } from '../common/helpers/investment-growth-calculator';
import DateAmountTable from './date-amount-table';
import { InvestmentLineChart } from './investment-line-chart';

// ==================================================
// Styled Components
// ==================================================
const Container = styled('div', {
  backgroundColor: '$background',
  color: '$foreground',
  fontFamily: '$body',
  padding: '20px',
  minHeight: '100vh',
});

const Header = styled('div', {
  fontSize: '1.5rem',
  fontWeight: 'bold',
  marginBottom: '16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

const Panel = styled('div', {
  backgroundColor: '$currentLine',
  padding: '16px',
  borderRadius: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
});

const Label = styled('label', {
  fontSize: '0.875rem',
  marginBottom: '4px',
  color: '$comment',
});

const InputField = styled('input', {
  backgroundColor: '$currentLine',
  color: '$foreground',
  border: '1px solid $green',
  borderRadius: '4px',
  padding: '6px 8px',
  fontSize: '1rem',
  width: '100%',

  '&:focus': {
    borderColor: '$cyan',
    outline: 'none',
    boxShadow: '0 0 0 2px $cyan',
  },
});

const SliderRoot = styled(Slider.Root, {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '20px',
});

const SliderTrack = styled(Slider.Track, {
  backgroundColor: '$cyan',
  position: 'relative',
  flexGrow: 1,
  height: '4px',
  borderRadius: '9999px',
});

const SliderRange = styled(Slider.Range, {
  position: 'absolute',
  backgroundColor: '$green',
  height: '100%',
  borderRadius: '9999px',
});

const SliderThumb = styled(Slider.Thumb, {
  display: 'block',
  width: '16px',
  height: '16px',
  backgroundColor: '$green',
  borderRadius: '50%',
  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
});

const Grid = styled('div', {
  display: 'grid',
  gap: '16px',
  gridTemplateColumns: '1fr',
  '@media(min-width: 768px)': {
    gridTemplateColumns: '1fr 1fr',
  },
});

const AmountsGrid = styled('div', {
  display: 'grid',
  gap: '16px',
  gridTemplateColumns: '1fr 1fr', // Two columns for A and B
  marginTop: '16px',
});

const PopoverContent = styled(Popover.Content, {
  backgroundColor: '$currentLine',
  color: '$foreground',
  padding: '12px',
  borderRadius: '8px',
  boxShadow: '0 5px 10px rgba(0,0,0,0.3)',
  zIndex: 1000,
});

// ==================================================
// Input & Slider Helpers
// ==================================================
function CurrencyInput({ value, onChange }: { value: string | undefined; onChange: (val: string) => void }) {
  return (
    <InputField
      type="text"
      value={value ? `$${parseInt(value).toLocaleString()}` : ''}
      onChange={(e) => {
        const numericValue = e.target.value.replace(/[^0-9]/g, '');
        onChange(numericValue);
      }}
    />
  );
}

function InvestmentSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
}) {
  return (
    <div>
      <Label>{label}: {value}</Label>
      <SliderRoot value={[value]} min={min} max={max} step={step} onValueChange={(val) => onChange(val[0])}>
        <SliderTrack>
          <SliderRange />
        </SliderTrack>
        <SliderThumb />
      </SliderRoot>
    </div>
  );
}

// ==================================================
// Switch Wrapper Component
// ==================================================
function SwitchButton({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      style={{
        width: 42,
        height: 24,
        backgroundColor: checked ? '#bd93f9' : '#6272a4',
        borderRadius: 9999,
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      <Switch.Thumb
        style={{
          display: 'block',
          width: 20,
          height: 20,
          backgroundColor: '#f8f8f2',
          borderRadius: 9999,
          transition: 'transform 0.2s',
          transform: checked ? 'translateX(20px)' : 'translateX(2px)',
        }}
      />
    </Switch.Root>
  );
}

// ==================================================
// Main Component
// ==================================================
export default function InvestmentCalculatorRadix() {
  const [advanced, setAdvanced] = useState<boolean>(false);

  // Investment A states
  const [currentAmountA, setCurrentAmountA] = useState<string | undefined>('10000');
  const [projectedGainA, setProjectedGainA] = useState<number>(10);
  const [yearsOfGrowthA, setYearsOfGrowthA] = useState<number>(30);
  const [monthlyContributionA, setMonthlyContributionA] = useState<number>(0);
  const [monthlyWithdrawalA, setMonthlyWithdrawalA] = useState<number>(0);
  const [yearWithdrawalsBeginA, setYearWithdrawalsBeginA] = useState<number>(0);
  const [yearContributionsStopA, setYearContributionsStopA] = useState<number | undefined>(30);
  const [yearlyInflationA, setYearlyInflationA] = useState<number>(2.5);  // Inflation state for Investment A
  const [rollOverA, setRollOverA] = useState<boolean>(false);  // Rollover switch for Investment A

  // Investment B states
  const [currentAmountB, setCurrentAmountB] = useState<string | undefined>('10000');
  const [projectedGainB, setProjectedGainB] = useState<number>(10);
  const [yearsOfGrowthB, setYearsOfGrowthB] = useState<number>(30);
  const [monthlyContributionB, setMonthlyContributionB] = useState<number>(0);
  const [monthlyWithdrawalB, setMonthlyWithdrawalB] = useState<number>(0);
  const [yearWithdrawalsBeginB, setYearWithdrawalsBeginB] = useState<number>(0);
  const [yearContributionsStopB, setYearContributionsStopB] = useState<number | undefined>(30);
  const [yearlyInflationB, setYearlyInflationB] = useState<number>(2.5);  // Inflation state for Investment B
  const [rollOverB, setRollOverB] = useState<boolean>(false);  // Rollover switch for Investment B

  // Investment A props
  const investmentPropsA: InvestmentCalculatorProps = {
    currentAmount: currentAmountA,
    setCurrentAmount: setCurrentAmountA,
    projectedGain: projectedGainA,
    setProjectedGain: setProjectedGainA,
    yearsOfGrowth: yearsOfGrowthA,
    setYearsOfGrowth: setYearsOfGrowthA,
    monthlyContribution: monthlyContributionA,
    setMonthlyContribution: setMonthlyContributionA,
    monthlyWithdrawal: monthlyWithdrawalA,
    setMonthlyWithdrawal: setMonthlyWithdrawalA,
    yearWithdrawalsBegin: yearWithdrawalsBeginA,
    setYearWithdrawalsBegin: setYearWithdrawalsBeginA,
    yearContributionsStop: yearContributionsStopA,
    setYearContributionsStop: setYearContributionsStopA,
    growthMatrix: [],
    advanced,
    investmentId: 'investmentA',
    depreciationRate: yearlyInflationA,  // Pass inflation to depreciationRate
    rollOver: rollOverA,  // Rollover state for Investment A
  };

  // Investment B props
  const investmentPropsB: InvestmentCalculatorProps = {
    currentAmount: currentAmountB,
    setCurrentAmount: setCurrentAmountB,
    projectedGain: projectedGainB,
    setProjectedGain: setProjectedGainB,
    yearsOfGrowth: yearsOfGrowthB,
    setYearsOfGrowth: setYearsOfGrowthB,
    monthlyContribution: monthlyContributionB,
    setMonthlyContribution: setMonthlyContributionB,
    monthlyWithdrawal: monthlyWithdrawalB,
    setMonthlyWithdrawal: setMonthlyWithdrawalB,
    yearWithdrawalsBegin: yearWithdrawalsBeginB,
    setYearWithdrawalsBegin: setYearWithdrawalsBeginB,
    yearContributionsStop: yearContributionsStopB,
    setYearContributionsStop: setYearContributionsStopB,
    growthMatrix: [],
    advanced,
    investmentId: 'investmentB',
    depreciationRate: yearlyInflationB,  // Pass inflation to depreciationRate
    rollOver: rollOverB,  // Rollover state for Investment B
  };

  // Initialize Investment Calculators
  const investmentCalcA = new InvestmentCalculator(investmentPropsA);
  const investmentCalcB = new InvestmentCalculator(investmentPropsB);

  // Calculate total value for both investments
  const totalA = investmentCalcA.calculateGrowth(false);
  const totalB = investmentCalcB.calculateGrowth(false);

  // If rollover is enabled, add the final value from Investment A to Investment B
  const finalAmountB = rollOverA ?
    parseInt(totalB.replace(/[^0-9.-]+/g, '')) + parseInt(totalA.replace(/[^0-9.-]+/g, ''))
    : parseInt(totalB.replace(/[^0-9.-]+/g, ''));

  // ====== Render Helpers ======
  const renderHeader = () => (
    <Header>
      Investment Calculator
      <SwitchButton checked={advanced} onCheckedChange={setAdvanced} />
    </Header>
  );

  const renderControls = () => (
    <Grid>
      {/* Investment A controls */}
      <Panel>
        <CurrencyInput value={currentAmountA} onChange={setCurrentAmountA} />
        <InvestmentSlider label="Estimated Return (%)" value={projectedGainA} min={0} max={30} onChange={setProjectedGainA} />
        <InvestmentSlider label="Years" value={yearsOfGrowthA} min={0} max={100} onChange={setYearsOfGrowthA} />
        {advanced && (
          <>
            <InvestmentSlider label="Monthly Contribution" value={monthlyContributionA} min={0} max={5000} onChange={setMonthlyContributionA} />
            <InvestmentSlider label="Year Contributions Stop" value={yearContributionsStopA ?? 0} min={0} max={yearsOfGrowthA} onChange={setYearContributionsStopA} />
            <InvestmentSlider label="Monthly Withdrawal" value={monthlyWithdrawalA} min={0} max={10000} onChange={setMonthlyWithdrawalA} />
            <InvestmentSlider label="Year Withdrawals Begin" value={yearWithdrawalsBeginA} min={0} max={yearsOfGrowthA} onChange={setYearWithdrawalsBeginA} />
            <InvestmentSlider label="Inflation Rate (%)" value={yearlyInflationA} min={0} max={10} onChange={setYearlyInflationA} /> {/* Inflation slider */}
            <div>
              <Label>Rollover:</Label>
              <SwitchButton checked={rollOverA} onCheckedChange={setRollOverA} />
            </div>
          </>
        )}
      </Panel>

      {/* Investment B controls */}
      {advanced && (
        <Panel>
          <CurrencyInput value={currentAmountB} onChange={setCurrentAmountB} />
          <InvestmentSlider label="Estimated Return (%)" value={projectedGainB} min={0} max={30} onChange={setProjectedGainB} />
          <InvestmentSlider label="Years" value={yearsOfGrowthB} min={0} max={100} onChange={setYearsOfGrowthB} />
          <InvestmentSlider label="Monthly Contribution (B)" value={monthlyContributionB} min={0} max={5000} onChange={setMonthlyContributionB} />
          <InvestmentSlider label="Year Contributions Stop (B)" value={yearContributionsStopB ?? 0} min={0} max={yearsOfGrowthB} onChange={setYearContributionsStopB} />
          <InvestmentSlider label="Monthly Withdrawal (B)" value={monthlyWithdrawalB} min={0} max={10000} onChange={setMonthlyWithdrawalB} />
          <InvestmentSlider label="Year Withdrawals Begin (B)" value={yearWithdrawalsBeginB} min={0} max={yearsOfGrowthB} onChange={setYearWithdrawalsBeginB} />
          <InvestmentSlider label="Inflation Rate (B)" value={yearlyInflationB} min={0} max={10} onChange={setYearlyInflationB} /> {/* Inflation slider */}
        </Panel>
      )}
    </Grid>
  );

  return (
    <Container>
      {renderHeader()}
      {renderControls()}

      {/* Dollar Amounts in Two Columns */}
      <AmountsGrid>
        {/* Investment A Popover */}
        <Popover.Root>
          <Popover.Trigger>
            <h3>{`$${parseInt(totalA.replace(/[^0-9.-]+/g, '')).toLocaleString()}`}</h3>
          </Popover.Trigger>
          <PopoverContent side="bottom">
            <DateAmountTable investmentCalc={investmentCalcA} />
          </PopoverContent>
        </Popover.Root>

        {/* Investment B Popover - only show if 'advanced' is true */}
        {advanced && (
          <Popover.Root>
            <Popover.Trigger>
              <h3>{`$${finalAmountB.toLocaleString()}`}</h3> {/* Format Investment B properly */}
            </Popover.Trigger>
            <PopoverContent side="bottom">
              <DateAmountTable investmentCalc={investmentCalcB} />
            </PopoverContent>
          </Popover.Root>
        )}
      </AmountsGrid>
      <InvestmentLineChart
  growthMatrixA={investmentCalcA.getGrowthMatrix()}
  growthMatrixB={advanced ? investmentCalcB.getGrowthMatrix() : undefined}
  advanced={advanced}
/>
    </Container>

  );
}