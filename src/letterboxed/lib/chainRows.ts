/**
 * How many rows the chain strip needs — the crude-on-purpose estimate behind
 * the strip's reserved height.
 *
 * The strip reserves space up front so the board doesn't jump when the chain
 * wraps (docs/ui.md → layout stability). A fixed reservation (2 rows desktop /
 * 3 mobile) covers the ordinary game, but the cap allows up to seven words and
 * letterboxed words run long, so a maxed-out chain can genuinely need more.
 * When it does, the extra rows are SUBTRACTED from the board's height budget
 * (`--avail-h`), so the board shrinks once at a rare threshold instead of the
 * page scrolling — the never-scroll invariant outranks never-move here, and
 * Joel accepted the rare shift explicitly (2026-08-05).
 *
 * It's an ESTIMATE, not a measurement — no refs, no ResizeObserver. The
 * constants approximate the pill CSS (font 1.05rem semibold uppercase,
 * 0.75rem side padding, 2px border, 0.4rem gap, the × on the last pill), and
 * being off by a little is survivable in both directions: an overestimate
 * reserves a blank row; an underestimate falls back on the strip's
 * `min-height` being a floor, which is exactly today's behavior.
 */

/** Estimated rendered width of one chain pill, in rem. */
const pillRem = (word: string, isLast: boolean): number =>
  word.length * 0.75 + 1.8 + (isLast ? 2 : 0)

/** Gap between pills on a row (the strip's flex gap). */
const GAP_REM = 0.4

/**
 * Per-row width budgets, in rem — deliberately a touch under the real strip
 * widths (`--side` caps at 34rem desktop; a 390px phone yields ~20-21rem) so
 * the estimate rounds toward reserving, not toward overflowing.
 */
export const DESKTOP_ROW_BUDGET_REM = 28
export const MOBILE_ROW_BUDGET_REM = 19

/** Greedy row packing of the chain's pills into rows of `budgetRem`. */
export function estimateChainRows(chain: readonly string[], budgetRem: number): number {
  if (chain.length === 0) return 1
  let rows = 1
  let x = 0
  chain.forEach((w, i) => {
    const width = pillRem(w, i === chain.length - 1)
    if (x > 0 && x + GAP_REM + width > budgetRem) {
      rows += 1
      x = width
    } else {
      x = x === 0 ? width : x + GAP_REM + width
    }
  })
  return rows
}
