// cs-unmet

import type { GFacts, GGameData } from '../types'
import { LengthScoreBar } from './LengthScoreBar'
import styles from './StateLine.module.css'

/**
 * wordiply's state line, drawn from my side's facts, `gd.me`: while playing, the
 * guesses used — "1 / 5 guesses", the only readout during play; once the game
 * has ended, the length-score bar and the letter count, the builder's scores.
 * The team's track in coop, mine in compete; the board's longest is the
 * puzzle's.
 *
 * A fragment, not a box: the caller supplies the element and its fixed height
 * (`InfoCol`'s state block). The same name and shape as every game's state
 * line (docs/playarea.md → Info-column readouts).
 */
export function StateLine({ facts, puzzle, isGameEnded }: {
  facts: GFacts;
  puzzle: GGameData['puzzle'];
  isGameEnded: boolean
}) {
  if (!isGameEnded) {
    return (
      <div className={styles.guessCount}>
        <strong>{facts.nGuessesUsed}</strong>
        <span
          className={styles.guessCountOf}> / {facts.maxGuesses} guesses</span>
      </div>
    )
  }

  // The scores are written with the ending.
  return (
    <>
      <LengthScoreBar
        lengthScore={facts.lengthScore!}
        longestWordLen={facts.longestWordLen!}
        maxWordLen={puzzle.maxWordLen}
      />
      <div className={styles.letterStat}>
        <strong>{facts.nLetters}</strong> letters
        across {facts.nGuessesUsed} guess
        {facts.nGuessesUsed === 1 ? '' : 'es'}
      </div>
    </>
  )
}
