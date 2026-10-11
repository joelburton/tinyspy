// cs-unmet

import type { GScoredLetter } from '../types'
import { ScoredWord } from './ScoredWord'
import styles from './WordLines.module.css'

/**
 * The two lines under the entry: the typed word's score as it is typed
 * ("DRAGON · 12" — the table is public and the sum is the rulebook's own, so
 * the page does it as the player would on paper; plans/wordsy.md, decision
 * 12), and the word standing for the round ("Your word: DRAGON · 12", "Your
 * word is in: …" once it can no longer change). Holding No Flip before anyone
 * has submitted takes the second line, since it is why ↵ does nothing.
 *
 * Each word is drawn by how it scores on the table (`ScoredWord`), in the wide
 * tracking. Both lines keep their height empty, so the column never moves as
 * they come and go.
 */
export function WordLines({
  typed,
  standing,
  holdsNoFlip,
}: {
  // The word in the entry, letter by letter as it scores, and its score; null
  // when nothing is typed.
  typed: { letters: GScoredLetter[]; score: number } | null
  // My word for the round, the same way; null when none stands.
  standing: { letters: GScoredLetter[]; score: number; isFrozen: boolean } | null
  // I may not start the round's clock: nobody has submitted yet.
  holdsNoFlip: boolean
}) {
  return (
    <div className={styles.wordLines}>
      <p className={styles.typedLine}>
        {typed !== null && <WordAndScore letters={typed.letters} score={typed.score}/>}
      </p>
      <p className={styles.standingLine}>
        {holdsNoFlip && 'You hold No Flip — wait for someone else to submit'}
        {!holdsNoFlip && standing !== null && (
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
