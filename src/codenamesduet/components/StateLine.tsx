// cs-blessed-codenamesduet

import { TOTAL_AGENTS } from '../lib/agents'
import type { GFacts } from '../types'

/**
 * codenamesduet's live-state readout — "3/15 agents · 3/9 turns spent", or
 * "3/15 agents · sudden death" once the turn budget is spent, and still after
 * a game that reached sudden death has ended.
 *
 * Drawn from the pair's facts, `gd.me`, against the deal's agents. Rendered in
 * two places that must not drift — the info column's state line and the
 * phone's `<MobileStatusBar>` above the board — so it is one component. Bare
 * inline content: each caller supplies the wrapper and its text style.
 *
 * **The turn counter reports turns SPENT** — the turns over, and the one the
 * game ended on — since the agents beside it are a tally of things done too.
 */
export function StateLine({ facts }: { facts: GFacts }) {
  return (
    <>
      <strong>{facts.nFoundAgents}</strong>/{TOTAL_AGENTS} agents ·{' '}
      {facts.suddenDeath ? (
        'sudden death'
      ) : (
        <>
          <strong>{facts.nTurnsUsed}</strong>/{facts.maxTurns} turns spent
        </>
      )}
    </>
  )
}
