// cs-unmet

import { cls } from '@/common/utils/cls'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { Mark } from '@/common/board-marks/useMark'
import { OUTCOME_TO_VERDICT_CLASS } from '@/common/game-page/outcomeToVerdictClass'
import shared from '@/common/game-page/playArea.module.css'
import { getTileColor, type TileColor } from '../lib/colors'
import { WORD_LENGTH } from '../lib/setup'
import { Tile } from './Tile'
import styles from './BoardRow.module.css'

/** Per-tile stagger so a row's letters flip left-to-right, not at once. */
const REVEAL_STEP_SEC = 0.22

/** What a row wears on or around it. */
type BoardRowMarks = {
  // It just landed: its tiles turn over to their colors, one after another.
  isFlipping: boolean
  // Its word is out with the server.
  isInFlight: boolean
  // The past turn open on the board added it.
  isHistoryLit: boolean
  // A refused guess still sitting in the typing row: the row rings and shakes
  // in its outcome.
  refusedGuessMark: Mark<Outcome> | null
}

/**
 * One row of wordle's board: five tiles spelling `word`, each on its color
 * once the row is judged.
 */
export function BoardRow({
  word,
  colors,
  marks,
}: {
  // What the tiles spell; empty for an empty row.
  word: string
  // The guess's g/y/x codes; null while the row is unjudged.
  colors: string | null
  marks: BoardRowMarks
}) {
  return (
    <div
      className={cls(
        styles.row,
        marks.isHistoryLit && styles.historyRow,
        marks.refusedGuessMark && shared.verdictRing,
        marks.refusedGuessMark && OUTCOME_TO_VERDICT_CLASS[marks.refusedGuessMark.value],
      )}
      role="row"
    >
      {Array.from({ length: WORD_LENGTH }, (_, letterIdx) => {
        const color: TileColor = colors === null ? 'blank' : getTileColor(colors[letterIdx])
        return (
          <Tile
            key={letterIdx}
            letter={word[letterIdx] ?? ''}
            color={color}
            marks={{
              isInFlight: marks.isInFlight,
              isFlipping: marks.isFlipping,
              flipDelaySec: letterIdx * REVEAL_STEP_SEC,
            }}
          />
        )
      })}
    </div>
  )
}
