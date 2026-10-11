// cs-unmet

import { cls } from '@/common/utils/cls'
import type { GScoredLetter } from '../types'
import styles from './ScoredWord.module.css'

/**
 * A word drawn by the table it was played against: a letter that scored nothing
 * in dark gray, one that scored on a common card in bold, one that scored on a
 * rare card in bold and that card's color. Hand it `scoreLetters`'s answer.
 */
export function ScoredWord({ letters }: { letters: GScoredLetter[] }) {
  return (
    <span className={styles.scoredWord}>
      {letters.map((l, i) => (
        <span
          key={i}
          className={cls(
            l.tile === null ? styles.unscored : styles.scored,
            l.tile !== null && l.tile.bonus > 0 && styles[`bonus_${l.tile.bonus}`],
          )}
        >
          {l.letter}
        </span>
      ))}
    </span>
  )
}
