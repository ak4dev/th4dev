/* ==================================================
 * Date Amount Table Component
 * ================================================== */

import { styled } from "../../stitches.config";
import type { InvestmentCalculator } from "../common/helpers/investment-growth-calculator";
import type { LineGraphEntry } from "../common/types/types";
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
}: DateAmountTableProps) {
  const matrix: LineGraphEntry[] = investmentCalc?.getGrowthMatrix() ?? [];
  
  if (!matrix || matrix.length === 0) {
    return <div>No data available</div>;
  }

  const initial = matrix[0]?.y ?? 0;

  /**
   * Determines text color based on value relative to initial amount
   * @param val - Current value to evaluate
   * @returns CSS color variable
   */
  const getColor = (val: number): string => {
    if (val < 0) return "var(--colors-red)";
    if (val < initial) return "var(--colors-orange)";
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
          {matrix.map((entry, idx) => {
            if (!entry || entry.y === undefined) return null;
            
            const year = new Date(entry.x).getFullYear();
            const nominal = entry.y;
            const adjusted = entry.alternateY ?? nominal;
            const pctChange = initial !== 0 
              ? ((nominal - initial) / initial) * 100 
              : 0;

            return (
              <tr key={idx}>
                <Td>{year}</Td>
                <Td style={{ color: getColor(nominal) }}>
                  ${nominal.toLocaleString()}
                </Td>
                <Td style={{ color: getColor(adjusted) }}>
                  ${adjusted.toLocaleString()}
                </Td>
                <Td
                  style={{
                    color:
                      pctChange < 0
                        ? "var(--colors-red)"
                        : "var(--colors-green)",
                  }}
                >
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
