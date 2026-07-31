import styles from './Stats.module.css'

/** The figures behind boggle's 4-cell stat grid (all `found / total`). */
export type BoggleStats = {
  /** Required words found (A) / required words on the board (B). */
  requiredFound: number
  requiredCount: number
  /** Score of required words found (C) / of all required words on the board (D). */
  requiredFoundScore: number
  requiredScore: number
  /** Bonus words found (E) / bonus words on the board (F). */
  bonusFound: number
  bonusCount: number
  /** Score of bonus words found (G) / of all bonus words on the board (H). */
  bonusFoundScore: number
  bonusScore: number
}

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
 * The two BONUS cells are dropped (and the grid narrows to two columns) when the
 * board has no bonus words — i.e. the legal list is just the required list, so
 * there's nothing to show. Pure presentation; PlayArea derives the figures.
 */
export function Stats(s: BoggleStats) {
  // Labels are a [kind, metric] PAIR, stacked on two lines ("Req" over "Words").
  // Four cells side by side are narrow — narrower still in the mobile status bar
  // above the board — and one-line labels either wrapped at an arbitrary point or
  // forced the columns wider than the numbers needed.
  const cells: { label: readonly [string, string]; value: string; sub: string; pct: string }[] = [
    { label: ['Req', 'Words'] as const, value: `${s.requiredFound}`, sub: `/ ${s.requiredCount}`, pct: pct(s.requiredFound, s.requiredCount) },
    { label: ['Req', 'Score'] as const, value: `${s.requiredFoundScore}`, sub: `/ ${s.requiredScore}`, pct: pct(s.requiredFoundScore, s.requiredScore) },
    ...(s.bonusCount > 0
      ? ([
          { label: ['Bonus', 'Words'] as const, value: `${s.bonusFound}`, sub: `/ ${s.bonusCount}`, pct: pct(s.bonusFound, s.bonusCount) },
          { label: ['Bonus', 'Score'] as const, value: `${s.bonusFoundScore}`, sub: `/ ${s.bonusScore}`, pct: pct(s.bonusFoundScore, s.bonusScore) },
        ])
      : []),
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
        {sub && <span className={styles.muted}> {sub}</span>}
      </span>
      <span className={styles.percent}>{pct}</span>
    </div>
  )
}
