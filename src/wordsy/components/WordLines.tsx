// cs-unmet

import type { GScoredLetter, GScoredWord } from '../types'
import { ScoredWord } from './ScoredWord'
import styles from './WordLines.module.css'

/**
 * The two lines under the entry: the typed word's score as it is typed
 * ("DRAGON · 12"; doc.md → Frontend says why the page does the sum), and the
 * word standing for the round ("Your word: DRAGON · 12", "Your word is in: …"
 * once it can no longer change). While No Flip bars me from submitting, the
 * second line says so instead, since it is why ↵ does nothing.
 *
 * Each word is drawn by how it scores on the table (`ScoredWord`), in the wide
 * tracking. Both lines keep their height empty, so the column never moves as
 * they come and go.
 */
export function WordLines({
  typed,
  standing,
  isBlockedByNoFlip,
}: {
  // The word in the entry as it scores; null when nothing is typed.
  typed: GScoredWord | null
  // My word for the round, the same way; null when none stands.
  standing: (GScoredWord & { isFrozen: boolean }) | null
  // I may not submit yet: I hold No Flip and nobody has started the clock.
  isBlockedByNoFlip: boolean
}) {
  return (
    <div className={styles.wordLines}>
      <p className={styles.typedLine}>
        {typed !== null && <WordAndScore letters={typed.letters} score={typed.score}/>}
      </p>
      <p className={styles.standingLine}>
        {isBlockedByNoFlip && 'You hold No Flip — wait for someone else to submit'}
        {!isBlockedByNoFlip && standing !== null && (
          <>
            {standing.isFrozen ? 'Your word is in: ' : 'Your word: '}
            <WordAndScore letters={standing.letters} score={standing.score}/>
          </>
        )}
      </p>
    </div>
  )
}

/** "DRAGON · 12": the word as it scores, its score after a dot. */
function WordAndScore({ letters, score }: { letters: GScoredLetter[]; score: number }) {
  return (
    <>
      <span className={styles.word}><ScoredWord letters={letters}/></span>
      {' · '}
      <strong className={styles.score}>{score}</strong>
    </>
  )
}
