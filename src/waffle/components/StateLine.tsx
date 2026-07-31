/**
 * waffle's core live-state readout — "Swaps 3/12 (9 left) · Par 10".
 *
 * Its own component because it's rendered TWICE, in two places that must never
 * drift: the info column's `.infoState` line (desktop) and the mobile
 * `<MobileStatusBar>` above the board (below the `--mobile` breakpoint, where
 * the info column is off-canvas in the InfoSheet). Bare inline content — each
 * caller supplies its own wrapper element + text styling. Same shape as
 * psychicnum's `StateLine` (docs/mobile.md → the status bar).
 *
 * The counters are bold and the labels aren't: the numbers are what's read at a
 * glance. Both readouts are per-viewer in compete (my swaps) and — because coop
 * rows move in lock-step — effectively team-wide in coop; the caller resolves
 * that and passes numbers.
 */
export function StateLine({
  swapsUsed,
  maxSwaps,
  remaining,
  parSwaps,
}: {
  /** Swaps spent out of the budget. */
  swapsUsed: number
  maxSwaps: number
  /** Swaps left (`maxSwaps - swapsUsed`, floored at 0 — the caller clamps). */
  remaining: number
  /** The generator's MINIMUM swap count — the golf-style bar the solve is measured against. */
  parSwaps: number
}) {
  return (
    <>
      Swaps{' '}
      <strong>
        {swapsUsed}/{maxSwaps}
      </strong>{' '}
      ({remaining} left) · Par <strong>{parSwaps}</strong>
    </>
  )
}
