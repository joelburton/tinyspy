// cs-unmet

import { RankBar } from '@/shared/rank-ladder/RankBar'
import { Stats } from '@/shared/rank-ladder/Stats'
import type { GFacts, GPuzzle } from '../types'

/**
 * wordwheel's core live-state readout — the rank ladder, and the score and the
 * word count under it against the required set — drawn from my side's facts,
 * `gd.me`: the team's figures in coop, my own in compete; the required set is
 * the puzzle's.
 *
 * Its own component because it's rendered TWICE, in two places that must never
 * drift: the top of the info column (desktop) and the mobile
 * `<MobileStatusBar>` above the board (below the `--mobile` breakpoint, where
 * the info column is off-canvas in the InfoSheet). A bare fragment — each
 * caller supplies its own wrapper.
 */
export function StateLine({ facts, puzzle }: { facts: GFacts; puzzle: GPuzzle }) {
  return (
    <>
      <RankBar
        rankIdx={facts.rankIdx}
        rankName={facts.rankName}
        total={puzzle.reqdWordsScore}
        targetIdx={facts.targetRankIdx}
      />
      <Stats
        foundWordsScore={facts.foundWordsScore}
        reqdWordsScore={puzzle.reqdWordsScore}
        nFoundWords={facts.nFoundWords}
        nReqdWords={puzzle.nReqdWords}
      />
    </>
  )
}
