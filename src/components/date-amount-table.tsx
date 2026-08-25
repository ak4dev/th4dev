/* ==================================================
 * Date Amount Table Component
 * ================================================== */

import { styled } from "../../stitches.config";
import type { InvestmentCalculator } from "../common/helpers/investment-growth-calculator";
import { buildTableRows } from "../common/helpers/growth-rows";
import { formatCurrency } from "../common/helpers/format";
import { TABLE_MAX_HEIGHT } from "../common/constants/app-constants";

/* ==================================================
 * Styled Components
 * ================================================== */

const TableContainer = styled("div", {
  maxHeight: TABLE_MAX_HEIGHT,
  overflowY: "auto",
});

const Table = styled("table", {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.875rem",
});

const Th = styled("th", {
  textAlign: "left",
  padding: "4px 8px",
  borderBottom: "1px solid $comment",
  color: "$comment",
  backgroundColor: "$currentLine",
  position: "sticky",
  top: 0,
});

const Td = styled("td", {
  padding: "4px 8px",
  borderBottom: "1px solid $comment",
});

/* ==================================================
 * Types
 * ================================================== */

/**
 * Props for the DateAmountTable component
 */
interface DateAmountTableProps {
  /** Investment calculator instance containing growth data */
  investmentCalc: InvestmentCalculator;
  /** Whether the calculator ran in inflation view (decides which series is nominal) */
  showInflation: boolean;
  /** Starting balance; the growth matrix has no today row, so it must be supplied */
  initialAmount: number;
}

/* ==================================================
 * Component
 * ================================================== */

/**
 * Table component displaying investment growth data over time
 * Shows year-by-year breakdown with nominal and inflation-adjusted amounts
 */
export default function DateAmountTable({
  investmentCalc,
  showInflation,
  initialAmount,
}: DateAmountTableProps) {
  const rows = buildTableRows(
    investmentCalc.getGrowthMatrix(),
    showInflation,
    initialAmount,
  );

  if (rows.length === 0) {
    return <div>No data available</div>;
  }

  /** Text colour of a balance relative to the starting amount */
  const getColor = (val: number): string => {
    if (val < 0) return "var(--colors-red)";
    if (val < initialAmount) return "var(--colors-orange)";
    return "var(--colors-green)";
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
          {/* A partial final year can share a calendar year with the previous
              row, so the index is the only safe key. */}
          {rows.map(({ year, nominal, inflationAdjusted, pctChange }, idx) => (
            <tr key={idx}>
              <Td>{year}</Td>
              <Td style={{ color: getColor(nominal) }}>
                {formatCurrency(nominal)}
              </Td>
              <Td style={{ color: getColor(inflationAdjusted) }}>
                {formatCurrency(inflationAdjusted)}
              </Td>
              <Td
                style={{
                  color:
                    pctChange < 0 ? "var(--colors-red)" : "var(--colors-green)",
                }}
              >
                {pctChange.toFixed(1)}%
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableContainer>
  );
}
