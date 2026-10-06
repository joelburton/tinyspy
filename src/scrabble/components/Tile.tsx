// cs-unmet

import { cls } from '@/common/utils/cls'
import { tileValue } from '../lib/board'
import styles from './Tile.module.css'

/** What the board or the rack says about a tile, beside the tile itself. */
type TileMarks = {
  // Board: laid out this turn, not yet played.
  isStaged?: boolean
  // Board: played, so it cannot be picked up.
  isLocked?: boolean
  // Board: the tile a drag is carrying, faded where it was.
  isLifted?: boolean
  // Board: in the word just played, ringed green for its beat.
  isJustPlayed?: boolean
  // Board: new in a word the dictionary refused, ringed red for its beat.
  isRefused?: boolean
  // Board: placed by the past turn on view.
  isHistoryLit?: boolean
  // Board: under a drag that cannot land here.
  isDropBlocked?: boolean
  // Rack: staged on the board already.
  isUsed?: boolean
  // Rack: picked for a swap.
  isPicked?: boolean
  // Rack: just drawn, flashing.
  isDrawn?: boolean
}

/**
 * One scrabble tile — its letter, its value, and a blank's ring — on the board
 * or in the rack, which draw the same tile. It fills whatever holds it: a
 * board cell, or a rack slot.
 *
 * The letter is the data's lowercase and shows its capital (CSS). A blank
 * played as a letter is ringed and worth nothing; a blank still in the rack
 * has no letter yet, and shows a faint `?`.
 *
 * The board or the rack decides which marks a tile wears (`TileMarks`); the
 * tile decides how each is drawn.
 */
export function Tile({
  id,
  letter,
  blank,
  where,
  marks,
}: {
  // The tile's id on the board — its cell's; a rack tile has none.
  id?: string
  // Null for a blank still in the rack, which has no letter yet.
  letter: string | null
  blank: boolean
  where: 'board' | 'rack'
  marks: TileMarks
}) {
  const value = letter === null ? 0 : tileValue({ letter, blank })
  return (
    <span
      data-tile={id}
      className={cls(
        styles.tile,
        styles[where],
        blank && (letter === null ? styles.undecided : styles.blank),
        marks.isStaged && styles.staged,
        marks.isLocked && styles.locked,
        marks.isLifted && styles.lifted,
        marks.isJustPlayed && styles.justPlayed,
        marks.isHistoryLit && styles.historyLit,
        marks.isRefused && styles.refused,
        marks.isDropBlocked && styles.dropBlocked,
        marks.isUsed && styles.used,
        marks.isPicked && styles.picked,
        marks.isDrawn && styles.drawn,
      )}
    >
      <span className={styles.letter}>{letter ?? '?'}</span>
      {value > 0 && <span className={styles.value}>{value}</span>}
    </span>
  )
}
