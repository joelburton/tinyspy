// cs-unmet

import { RankBar } from '@/shared/rank-ladder/RankBar'
import { Stats } from '@/shared/rank-ladder/Stats'
import type { GStateLineData } from '../types'

/**
 * wordwheel's core live-state readout — the rank ladder, and the score and the
 * word count under it against the required set — drawn from
 * `gd.stateLineData`: the team's figures in coop, my own in compete, decided
 * once in `useGame`.
 *
 * Its own component because it's rendered TWICE, in two places that must never
 * drift: the top of the info column (desktop) and the mobile
 * `<MobileStatusBar>` above the board (below the `--mobile` breakpoint, where
 * the info column is off-canvas in the InfoSheet). A bare fragment — each
 * caller supplies its own wrapper.
 */
export function StateLine({ data }: { data: GStateLineData }) {
  return (
    <>
      <RankBar score={data.foundWordsScore} total={data.reqdWordsScore} targetIdx={data.targetRankIdx} />
      <Stats
        foundWordsScore={data.foundWordsScore}
        reqdWordsScore={data.reqdWordsScore}
        nFoundWords={data.nFoundWords}
        nReqdWords={data.nReqdWords}
      />
    </>
  )
}
