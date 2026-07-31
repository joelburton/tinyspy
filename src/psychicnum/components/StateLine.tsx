/**
 * psychicnum's core live-state readout — "1/3 found · 4/7 guesses used".
 *
 * Its own component because it's rendered TWICE, in two places that must never
 * drift: the info column's `.infoState` line (desktop) and the mobile
 * `<MobileStatusBar>` above the board (below the `--mobile` breakpoint, where
 * the info column is off-canvas in the InfoSheet). Bare inline content — each
 * caller supplies its own wrapper element + text styling.
 *
 * Both readouts are per-viewer in compete (my finds, my budget) and team-wide in
 * coop; the caller resolves that and passes numbers. The counters are bold and
 * the labels aren't: the numbers are what's read at a glance.
 */
export function StateLine({
  found,
  secretCount,
  guessesUsed,
  totalGuesses,
}: {
  /** Secrets found (mine in compete, the team's in coop). */
  found: number
  /** How many secrets the board hides. */
  secretCount: number
  /** Guesses spent out of the budget. */
  guessesUsed: number
  totalGuesses: number
}) {
  return (
    <>
      <strong>
        {found}/{secretCount}
      </strong>{' '}
      found ·{' '}
      <strong>
        {guessesUsed}/{totalGuesses}
      </strong>{' '}
      guesses used
    </>
  )
}
