/**
 * codenamesduet's core live-state readout — "3/15 agents · 3/9 turns spent" (or
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
 *
 * **The turn counter reports turns SPENT, which is one less than the turn
 * you're on.** It used to print `turn_number` under a bare "turns" label —
 * "4/10 turns" while you were partway through the fourth — which reads as four
 * turns used when only three are gone. The two numbers on this line then
 * disagreed about what they counted: the agents are a tally of things DONE, so
 * the turns beside them have to be as well. `turn_number` starts at 1, so
 * spent starts at 0 and the last thing shown before sudden death is
 * "9/10 turns spent" — correct, since the tenth is still being played.
 */
export function StateLine({
  greenFound,
  turnNumber,
  turns,
  inSuddenDeath,
}: {
  /** Green agents contacted, out of the fixed 15. */
  greenFound: number
  /** The current turn number (`games.turn_number`, 1-based). Rendered as turns
   *  SPENT — see the docstring; callers pass the raw column. */
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
          {/* `max(0, …)` is belt-and-braces for a turn_number of 0, which the
              schema's `default 1` means we shouldn't see. */}
          <strong>{Math.max(0, turnNumber - 1)}</strong>/{turns} turns spent
        </>
      )}
    </>
  )
}
