// cs-unmet

import { cls } from '@/common/utils/cls'
import styles from './Tile.module.css'

/** What the board or the hand says about a tile, beside the tile itself. */
type TileMarks = {
  // The tile a drag is carrying, faded where it was.
  isLifted?: boolean
  // Board: painted red by a blocked peel or a check — in a word that is not
  // real, or split off the main block — until the next edit.
  isInvalid?: boolean
}

/**
 * One bananagrams tile — a letter — on the board, in the hand, or carried by
 * the drag as its ghost; all three draw the same tile. It fills whatever holds
 * it: a board cell, a hand slot, the ghost's box.
 *
 * The letter is the data's lowercase and shows its capital (CSS), sized as a
 * fraction of the tile, so a board tile at any zoom and a hand tile look alike.
 *
 * The board or the hand decides which marks a tile wears (`TileMarks`); the
 * tile decides how each is drawn.
 */
export function Tile({
  letter,
  where,
  marks = {},
}: {
  letter: string
  where: 'board' | 'hand' | 'ghost'
  marks?: TileMarks
}) {
  return (
    <span
      className={cls(
        styles.tile,
        styles[where],
        marks.isLifted && styles.lifted,
        marks.isInvalid && styles.invalid,
      )}
    >
      <span className={styles.letter}>{letter}</span>
    </span>
  )
}
