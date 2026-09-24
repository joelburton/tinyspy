// cs-blessed-codenamesduet

import { isSuddenDeathTurn } from '../lib/events'
import { TOTAL_AGENTS } from '../lib/agents'

/**
 * codenamesduet's live-state readout — "3/15 agents · 3/9 turns spent", or
 * "3/15 agents · sudden death" once the turn budget is spent, and still after
 * a game that reached sudden death has ended (`isSuddenDeathTurn`).
 *
 * Rendered in two places that must not drift — the info column's state line
 * and the phone's `<MobileStatusBar>` above the board — so it is one
 * component. Bare inline content: each caller supplies the wrapper and its
 * text style.
 *
 * **The turn counter reports turns SPENT**, one less than the turn you are on:
 * the agents beside it are a tally of things done, so the turns are too.
 * `turn_number` starts at 1, so spent starts at 0, and the last thing shown
 * before sudden death is "9/10 turns spent" while the tenth is being played.
 */
export function StateLine({
  greenFound,
  turnNumber,
  turns,
}: {
  // Green agents contacted, out of `TOTAL_AGENTS`.
  greenFound: number
  // The current turn (`games.turn_number`, 1-based) — the raw column; this
  // component renders it as turns spent.
  turnNumber: number
  // The game's turn budget (`setup.turns`).
  turns: number
}) {
  return (
    <>
      <strong>{greenFound}</strong>/{TOTAL_AGENTS} agents ·{' '}
      {isSuddenDeathTurn(turnNumber, turns) ? (
        'sudden death'
      ) : (
        <>
          {/* `max(0, …)` guards a turn_number of 0, which the schema's
              `default 1` rules out. */}
          <strong>{Math.max(0, turnNumber - 1)}</strong>/{turns} turns spent
        </>
      )}
    </>
  )
}
