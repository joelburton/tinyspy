/**
 * codenamesduet's core live-state readout — "3/15 agents · 4/9 turns" (or
 * "3/15 agents · sudden death" once the turn budget is spent).
 *
 * Its own component because it's rendered TWICE, in two places that must never
 * drift: the info column's `.infoState` line (desktop) and the mobile
 * `<MobileStatusBar>` above the board (below the `--mobile` breakpoint, where
 * the info column is off-canvas in the InfoSheet). Bare inline content — each
 * caller supplies its own wrapper element + text styling.
 *
 * The counters are bold and the labels aren't: the numbers are what's being
 * read at a glance.
 */
export function StateLine({
  greenFound,
  turnNumber,
  turns,
  inSuddenDeath,
}: {
  /** Green agents contacted, out of the fixed 15. */
  greenFound: number
  /** The current turn number (`games.turn_number`). */
  turnNumber: number
  /** The game's turn budget (`setup.turns`). */
  turns: number
  /** Budget spent — the turn counter is replaced by the standing warning. */
  inSuddenDeath: boolean
}) {
  return (
    <>
      <strong>{greenFound}</strong>/15 agents ·{' '}
      {inSuddenDeath ? (
        'sudden death'
      ) : (
        <>
          <strong>{turnNumber}</strong>/{turns} turns
        </>
      )}
    </>
  )
}
