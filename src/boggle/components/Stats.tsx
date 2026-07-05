import styles from './Stats.module.css'

type Props = {
  /** All words the player/team found. */
  words: number
  /** Score of all those words. */
  score: number
  /** Required words found / required words on the board. */
  requiredFound: number
  requiredTotal: number
  /** Legal words found / legal words on the board. "Legal" is the full findable
   *  set (required ∪ bonus), so `legalFound` equals `words` — every found word is
   *  legal; the "/ total" is what the column adds (how much of the board's whole
   *  vocabulary you've turned up). */
  legalFound: number
  legalTotal: number
}

/**
 * boggle's 4-cell stat grid — the two-line "label over value" idiom, like
 * spellingbee's `<Stats>`: Words · Score · Required Words (found/total) · Legal
 * Words (found/total). Pure presentation; the parent (PlayArea) derives the
 * figures from the found words + the board's required/bonus lists.
 */
export function Stats({
  words,
  score,
  requiredFound,
  requiredTotal,
  legalFound,
  legalTotal,
}: Props) {
  return (
    <div className={styles.stats}>
      <Cell label="Words" value={`${words}`} />
      <Cell label="Score" value={`${score}`} />
      <Cell label="Required Words" value={`${requiredFound}`} sub={`/ ${requiredTotal}`} />
      <Cell label="Legal Words" value={`${legalFound}`} sub={`/ ${legalTotal}`} />
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
