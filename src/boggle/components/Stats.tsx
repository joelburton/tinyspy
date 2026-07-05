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

/**
 * boggle's stat grid — the two-line "label over value" idiom (like spellingbee's
 * `<Stats>`). Every cell is `found / total`:
 *   Words        required found / required on board
 *   Score        required-found score / required total score
 *   Bonus Words  bonus found / bonus on board
 *   Bonus Score  bonus-found score / bonus total score
 * The two BONUS cells are dropped (and the grid narrows to two columns) when the
 * board has no bonus words — i.e. the legal list is just the required list, so
 * there's nothing to show. Pure presentation; PlayArea derives the figures.
 */
export function Stats(s: BoggleStats) {
  const cells = [
    { label: 'Words', value: `${s.requiredFound}`, sub: `/ ${s.requiredCount}` },
    { label: 'Score', value: `${s.requiredFoundScore}`, sub: `/ ${s.requiredScore}` },
    ...(s.bonusCount > 0
      ? [
          { label: 'Bonus Words', value: `${s.bonusFound}`, sub: `/ ${s.bonusCount}` },
          { label: 'Bonus Score', value: `${s.bonusFoundScore}`, sub: `/ ${s.bonusScore}` },
        ]
      : []),
  ]
  return (
    <div className={styles.stats} style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}>
      {cells.map((c) => (
        <Cell key={c.label} label={c.label} value={c.value} sub={c.sub} />
      ))}
    </div>
  )
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={styles.cell}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        {value}
        {sub && <span className={styles.muted}> {sub}</span>}
      </span>
    </div>
  )
}
