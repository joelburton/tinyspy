// cs-unmet

import { cls } from '@/common/utils/cls'
import type { EndOutcome } from '@/common/ending/gameEnding'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import history from '@/common/event-log/historyViewer.module.css'
import shared from '@/common/game-page/playArea.module.css'
import { Tile } from './Tile'
import styles from './Board.module.css'
import type { GTile } from '../types'

/** The four columns, by the slots under each: 5, 4, 3, 2. */
const COLUMNS = [[1, 2], [3, 4], [5, 6], [7, 8]] as const

/**
 * The table: four columns worth 5, 4, 3 and 2, each a plaque with its value
 * over its two cards — the rulebook's layout, so where a card sits says what
 * it is worth. Nothing on it is clicked: a word is typed below.
 */
export function Board({
  tiles,
  isViewingHistory,
  endingOutcome,
  clockJustStarted,
}: {
  // The round's eight cards, in slot order: the live round's, or a past
  // round's — PlayArea picks.
  tiles: GTile[]
  // A past round is open on the board.
  isViewingHistory: boolean
  // How I came out, for the ended board's frame; null while I still play.
  endingOutcome: EndOutcome | null
  // True for a beat as a rival's first submit starts the round's clock.
  clockJustStarted: boolean
}) {
  const tileBySlot = new Map(tiles.map((t) => [t.slot, t]))

  return (
    <div
      data-testid="board"
      className={cls(
        styles.board,
        isViewingHistory && history.historyFrame,
        clockJustStarted && shared.yourTurnFlash,
        makeEndingFrameClasses(endingOutcome, isViewingHistory),
      )}
    >
      {COLUMNS.map((slots) => (
        <div key={slots[0]} className={styles.column}>
          {/* Every card in a column is worth its value; the first card's says
              which. */}
          <div className={styles.plaque}>{tileBySlot.get(slots[0])!.value}</div>
          {slots.map((slot) => (
            <Tile key={slot} tile={tileBySlot.get(slot)!}/>
          ))}
        </div>
      ))}
    </div>
  )
}
