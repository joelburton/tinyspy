// cs-unmet

import type { GStateLineData } from '../types'
import { LengthScoreBar } from './LengthScoreBar'
import styles from './PlayArea.module.css'

/**
 * wordiply's state line, drawn from `gd.stateLineData`: while playing, the
 * guesses used — "1 / 5 guesses", the only readout during play; once the game
 * has ended, the length-score bar and the letter count, the builder's scores.
 * The team's track in coop, mine in compete — `gd` picked it.
 *
 * A fragment, not a box: the caller supplies the element and its fixed height
 * (`InfoCol`'s state block). The same name and shape as every game's state
 * line (docs/playarea.md → Info-column readouts).
 */
export function StateLine({ data, isGameEnded }: {
  data: GStateLineData;
  isGameEnded: boolean
}) {
  if (!isGameEnded) {
    return (
      <div className={styles.guessCount}>
        <strong>{data.nGuessesUsed}</strong>
        <span
          className={styles.guessCountOf}> / {data.maxGuesses} guesses</span>
      </div>
    )
  }

  // The scores are written with the ending.
  return (
    <>
      <LengthScoreBar
        lengthScore={data.lengthScore!}
        longestWordLen={data.longestWordLen!}
        maxWordLen={data.maxWordLen}
      />
      <div className={styles.letterStat}>
        <strong>{data.nLetters}</strong> letters
        across {data.nGuessesUsed} guess
        {data.nGuessesUsed === 1 ? '' : 'es'}
      </div>
    </>
  )
}
