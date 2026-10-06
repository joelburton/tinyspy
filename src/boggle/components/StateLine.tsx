// cs-unmet

import styles from '@/shared/rank-ladder/Stats.module.css'
import type { GFacts, GGameData } from '../types'

/** `found / total` as a whole-number percent; 0 total reads as 0% (nothing to find). */
function formatPercent(found: number, total: number): string {
  return total > 0 ? `${Math.round((found / total) * 100)}%` : '0%'
}

/**
 * boggle's core live-state readout — four cells, each `found / total` with the
 * found share as a percent underneath:
 *
 *   Req / Words    required words found / on the board
 *   Req / Score    their points / the required total
 *   Bonus / Words  bonus words found / on the board
 *   Bonus / Score  their points / the bonus total
 *
 * Drawn from my side's facts, `gd.me` — the team's figures in coop, my own in
 * compete — against the puzzle's two lists. Its own component because it's rendered
 * TWICE, in two places that must never drift: the top of the info column
 * (desktop) and the mobile `<MobileStatusBar>` above the board.
 */
export function StateLine({ facts, puzzle }: { facts: GFacts; puzzle: GGameData['puzzle'] }) {
  // Each label is a [kind, metric] PAIR, stacked on two lines ("Req" over
  // "Words"): four cells side by side are narrow, narrower still above the
  // board on a phone.
  const cells = [
    {
      label: ['Req', 'Words'] as const,
      found: facts.nFoundReqdWords,
      total: puzzle.nReqdWords,
    },
    {
      label: ['Req', 'Score'] as const,
      found: facts.foundReqdWordsScore,
      total: puzzle.reqdWordsScore,
    },
    {
      label: ['Bonus', 'Words'] as const,
      found: facts.nFoundBonusWords,
      total: puzzle.nBonusWords,
    },
    {
      label: ['Bonus', 'Score'] as const,
      found: facts.foundBonusWordsScore,
      total: puzzle.bonusWordsScore,
    },
  ]
  return (
    <div className={styles.stats} style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}>
      {cells.map((c) => (
        <div key={c.label.join(' ')} className={styles.cell}>
          <span className={styles.label}>
            {c.label[0]}
            <br />
            {c.label[1]}
          </span>
          <span className={styles.value}>
            {c.found}
            <span className={styles.muted}>/{c.total}</span>
          </span>
          <span className={styles.percent}>{formatPercent(c.found, c.total)}</span>
        </div>
      ))}
    </div>
  )
}
