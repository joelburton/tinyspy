// cs-blessed-codenamesduet

import type { GStateLineData } from '../types'

/**
 * codenamesduet's live-state readout — "3/15 agents · 3/9 turns spent", or
 * "3/15 agents · sudden death" once the turn budget is spent, and still after
 * a game that reached sudden death has ended.
 *
 * Drawn from `gd.stateLineData`, decided once in `makeGameData`. Rendered in
 * two places that must not drift — the info column's state line and the
 * phone's `<MobileStatusBar>` above the board — so it is one component. Bare
 * inline content: each caller supplies the wrapper and its text style.
 *
 * **The turn counter reports turns SPENT** — the turns over, and the one the
 * game ended on — since the agents beside it are a tally of things done too.
 */
export function StateLine({ data }: { data: GStateLineData }) {
  return (
    <>
      <strong>{data.nFoundAgents}</strong>/{data.nAgents} agents ·{' '}
      {data.suddenDeath ? (
        'sudden death'
      ) : (
        <>
          <strong>{data.nTurnsUsed}</strong>/{data.maxTurns} turns spent
        </>
      )}
    </>
  )
}
