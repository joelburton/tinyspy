// cs-unmet

import { cls } from '@/common/utils/cls'
import type { EndOutcome } from '@/common/ending/gameEnding'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import history from '@/common/event-log/historyViewer.module.css'
import shared from '@/common/game-page/playArea.module.css'
import { Tile } from './Tile'
import styles from './Board.module.css'
import type { GTile } from '../types'

/** The four columns, each worth its value and holding two slots. */
const COLUMNS = [
  { value: 5, slots: [1, 2] },
  { value: 4, slots: [3, 4] },
  { value: 3, slots: [5, 6] },
  { value: 2, slots: [7, 8] },
] as const

/**
 * The table: four columns worth 5, 4, 3 and 2, each a plaque with its value
 * over its two cards — the rulebook's layout, so where a card sits says what
 * it is worth. Nothing on it is clicked: a word is typed below.
 */
export function Board({
  tiles,
  isViewingHistory,
  endingOutcome,
  isDimmed,
  isNewTableFlashing,
  isClockStartFlashing,
}: {
  // The round's eight cards, in slot order: the live round's, or a past
  // round's — PlayArea picks.
  tiles: GTile[]
  // A past round is open on the board.
  isViewingHistory: boolean
  // How I came out, for the ended board's frame; null while I still play.
  endingOutcome: EndOutcome | null
  // Nothing is left for me to enter on this table.
  isDimmed: boolean
  // True for a beat as a new round's table arrives: the yellow frame.
  isNewTableFlashing: boolean
  // True for a beat as a rival's first word starts the clock: the caution frame.
  isClockStartFlashing: boolean
}) {
  const tileBySlot = new Map(tiles.map((t) => [t.slot, t]))

  return (
    <div
      data-testid="board"
      className={cls(
        styles.board,
        isViewingHistory && history.historyFrame,
        isDimmed && shared.dimNotYourTurn,
        isNewTableFlashing && shared.yourTurnFlash,
        isClockStartFlashing && styles.clockStartFlash,
        makeEndingFrameClasses(endingOutcome, isViewingHistory),
      )}
    >
      {COLUMNS.map((column) => (
        <div key={column.value} className={styles.column}>
          <div className={styles.plaque}>{column.value}</div>
          {column.slots.map((slot) => (
            <Tile key={slot} tile={tileBySlot.get(slot)!}/>
          ))}
        </div>
      ))}
    </div>
  )
}
