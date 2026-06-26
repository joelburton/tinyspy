/**
 * Pure month-grid layout helper, extracted from the Calendar
 * component so the component file holds only React (the rest of
 * the lint config flags the colocated helper under
 * `react-refresh/only-export-components`).
 *
 * Returns the array of cells the Calendar renders for the given
 * (year, month0): real day-cells in their column-of-week
 * position, with leading-blank and trailing-pad `null` cells so
 * the grid is a clean 7-wide rectangle.
 *
 * The grid format:
 *   - Week starts Sunday (index 0).
 *   - Leading nulls: how many cells before day 1 (= the 1st's
 *     UTC day-of-week).
 *   - Trailing nulls: round up to the next multiple of 7.
 *   - All date strings: `YYYY-MM-DD`, matching
 *     `connections.puzzles.nyt_date::text`.
 *
 * UTC throughout so the grid is the same regardless of the
 * user's clock zone — these dates are calendar coordinates,
 * not timestamps.
 */
export function buildMonthGrid(
  year: number,
  month: number,
): Array<{ day: number; dateStr: string } | null> {
  const firstDayOfWeek = new Date(Date.UTC(year, month, 1)).getUTCDay()
  // Day-count: 0th day of next month, which is the last day of THIS month.
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: Array<{ day: number; dateStr: string } | null> = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: formatDate(year, month, d) })
  }
  // Pad up to a multiple of 7 so the grid has clean rows.
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function formatDate(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}
