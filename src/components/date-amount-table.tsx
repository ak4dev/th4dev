// src/components/date-amount-table.tsx
import React from 'react';
import { styled } from '../../stitches.config';
import type { InvestmentCalculator } from '../common/helpers/investment-growth-calculator';
import type { LineGraphEntry } from '../common/types/types';

const TableContainer = styled('div', {
  maxHeight: '320px', // ~10 rows visible
  overflowY: 'auto',
});

const Table = styled('table', {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.875rem',
});

const Th = styled('th', {
  textAlign: 'left',
  padding: '4px 8px',
  borderBottom: '1px solid $comment',
  color: '$comment',
  backgroundColor: '$currentLine',
  position: 'sticky',
  top: 0,
});

const Td = styled('td', {
  padding: '4px 8px',
  borderBottom: '1px solid $comment',
});

interface DateAmountTableProps {
  investmentCalc: InvestmentCalculator;
}

export default function DateAmountTable({ investmentCalc }: DateAmountTableProps) {
  const matrix: LineGraphEntry[] = investmentCalc?.getGrowthMatrix() ?? [];
  if (!matrix || matrix.length === 0) return <div>No data available</div>;

  const initial = matrix[0]?.y ?? 0;

  // Determine row color like chart
  const getColor = (val: number) => {
    if (val < 0) return 'var(--colors-red)';
    if (val < initial) return 'var(--colors-orange)';
    return 'var(--colors-green)';
  };

  return (
    <TableContainer>
      <Table>
        <thead>
          <tr>
            <Th>Year</Th>
            <Th>Nominal</Th>
            <Th>Inflation-Adjusted</Th>
            <Th>% Change</Th>
          </tr>
        </thead>
        <tbody>
          {matrix.map((entry, idx) => {
            if (!entry || entry.y === undefined) return null;
            const year = new Date(entry.x).getFullYear();
            const nominal = entry.y;
            const adjusted = entry.inflationAdjusted ?? nominal;
            const pctChange = initial !== 0 ? ((nominal - initial) / initial) * 100 : 0;

            return (
              <tr key={idx}>
                <Td>{year}</Td>
                <Td style={{ color: getColor(nominal) }}>${nominal.toLocaleString()}</Td>
                <Td style={{ color: getColor(adjusted) }}>${adjusted.toLocaleString()}</Td>
                <Td style={{ color: pctChange < 0 ? 'var(--colors-red)' : 'var(--colors-green)' }}>
                  {pctChange.toFixed(1)}%
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </TableContainer>
  );
}