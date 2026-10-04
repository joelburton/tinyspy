// cs-unmet

import styles from '@/shared/rank-ladder/Stats.module.css'
import type { GStateLineData } from '../types'

/** `found / total` as a whole-number percent; 0 total reads as 0% (nothing to find). */
function pct(found: number, total: number): string {
  return total > 0 ? `${Math.round((found / total) * 100)}%` : '0%'
}

/**
 * boggle's stat grid — the three-line "label / value / percent" idiom (an
 * extension of spellingbee's two-line `<Stats>`). Every cell is `found / total`
 * with the found-share as a percent underneath:
 *   Req / Words    required found / required on board
 *   Req / Score    required-found score / required total score
 *   Bonus / Words  bonus found / bonus on board
 *   Bonus / Score  bonus-found score / bonus total score
 * (each label stacked on two lines — see the `cells` note below)
 * Drawn from `gd.stateLineData`, which decided whose finds they are.
 */
export function Stats({ data: d }: { data: GStateLineData }) {
  // Labels are a [kind, metric] PAIR, stacked on two lines ("Req" over "Words").
  // Four cells side by side are narrow — narrower still in the mobile status bar
  // above the board — and one-line labels either wrapped at an arbitrary point or
  // forced the columns wider than the numbers needed.
  const cells: { label: readonly [string, string]; value: string; sub: string; pct: string }[] = [
    { label: ['Req', 'Words'] as const, value: `${d.nFoundReqdWords}`, sub: `/${d.nReqdWords}`, pct: pct(d.nFoundReqdWords, d.nReqdWords) },
    { label: ['Req', 'Score'] as const, value: `${d.foundReqdWordsScore}`, sub: `/${d.reqdWordsScore}`, pct: pct(d.foundReqdWordsScore, d.reqdWordsScore) },
    { label: ['Bonus', 'Words'] as const, value: `${d.nFoundBonusWords}`, sub: `/${d.nBonusWords}`, pct: pct(d.nFoundBonusWords, d.nBonusWords) },
    { label: ['Bonus', 'Score'] as const, value: `${d.foundBonusWordsScore}`, sub: `/${d.bonusWordsScore}`, pct: pct(d.foundBonusWordsScore, d.bonusWordsScore) },
  ]
  return (
    <div className={styles.stats} style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}>
      {cells.map((c) => (
        <Cell key={c.label.join(' ')} label={c.label} value={c.value} sub={c.sub} pct={c.pct} />
      ))}
    </div>
  )
}

function Cell({
  label,
  value,
  sub,
  pct,
}: {
  label: readonly [string, string]
  value: string
  sub?: string
  pct: string
}) {
  return (
    <div className={styles.cell}>
      <span className={styles.label}>
        {label[0]}
        <br />
        {label[1]}
      </span>
      <span className={styles.value}>
        {value}
        {sub && <span className={styles.muted}>{sub}</span>}
      </span>
      <span className={styles.percent}>{pct}</span>
    </div>
  )
}
