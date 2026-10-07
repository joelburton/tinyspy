// cs-unmet

import type { RefObject } from 'react'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { EndingMessage } from '@/common/ending/endingMessage'
import { cls } from '@/common/utils/cls'
import { useEditingBoard } from '../hooks/useEditingBoard'
import type { GActions } from '../reactTypes'
import type { GGameData } from '../types'
import { Board } from './Board'
import { InfoCol } from './InfoCol'
import { Tile } from './Tile'
import shell from '@/common/game-page/playArea.module.css'
import dragGhost from '@/shared/grid-and-drag/dragGhost.module.css'
import styles from './EditingBoard.module.css'

/**
 * The interactive part of bananagrams' surface, under `PlayArea`. It draws no
 * grid of its own: it holds the editing board (`useEditingBoard`: my board as I
 * edit it, the hand derived from it, the drag, the cursor, the zoom and the
 * autosave) and lays out the two views that draw from it — `<Board>` in the
 * board column, and the `<InfoCol>` with the hand box in the info column.
 *
 * Kept apart from `PlayArea` so the editing board's constant changes (a drag
 * updates on every pointer move) re-render this and below, never PlayArea's
 * hooks.
 *
 * Why not the roster's `BoardCol` + `InfoCol` split: the hand's tiles drop onto
 * the board and the dump zone takes a tile dragged off it, so one editing board
 * spans both columns and neither view owns input (docs/games/bananagrams.md).
 */
export function EditingBoard({
  gd,
  actions,
  endingMessage,
  localFeedbackSlot,
  onPeel,
  onCheckBoard,
  onDump,
  reportBoardRef,
}: {
  gd: GGameData
  actions: GActions
  // The ending that applies to me, or null while I play.
  endingMessage: EndingMessage | null
  // PlayArea's below-board slot, drawn in the fixed-height slot under the
  // board so the board never reflows.
  localFeedbackSlot: FeedbackSlot
  // Peel: draws a tile for everyone, or wins if the bunch can't refill the
  // table. Resolves to `{ invalidCells }` when the legal-board check blocked
  // the peel (those cells paint red); `null` otherwise.
  onPeel: () => Promise<{ invalidCells: number[] } | null>
  // Check words: resolves to the cells that failed, or `null` when the check
  // itself failed.
  onCheckBoard: () => Promise<{ invalidCells: number[] } | null>
  // Dump a tile: swap it for DUMP_COUNT from the bunch.
  onDump: (letter: string) => void | Promise<void>
  // Kept pointed at the live board, so PlayArea's print reads it at click time.
  reportBoardRef: RefObject<string>
}) {
  const editing = useEditingBoard({
    gameId: gd.id,
    // Seeded ONCE: the editing board owns the board after, and a later blob
    // never re-seeds it.
    initialBoard: gd.me.board.letters,
    tiles: gd.me.tiles,
    isBoardInteractive: gd.me.stillPlaying,
    onPeel,
    onCheckBoard,
    onDump,
    nBunchTiles: gd.me.nBunchTiles,
    nBagTiles: gd.me.nBagTiles,
    reportBoardRef,
  })

  return (
    <div className={cls(shell.layout, styles.layout)}>
      {/* The board column is game-specific (a FILL scroll box, not the shared
          hug board), so it does NOT compose shell.boardCol — styles.boardCol is
          self-sufficient, avoiding a flex hug-vs-fill override fight. */}
      <div className={styles.boardCol}>
        <Board editing={editing} />
        {/* Moves are made on the board itself, so `.moveArea` is empty; the
            slot reserves its own height so the board never reflows when the
            pill appears or clears (docs/playarea.md → The swap rule). */}
        <div className={styles.belowBoard}>
          <div className={styles.moveArea} />
          <div className={shell.localFeedback}>
            <FeedbackPill slot={localFeedbackSlot} />
          </div>
        </div>
      </div>

      <InfoCol
        gd={gd}
        editing={editing}
        actions={actions}
        endingMessage={endingMessage}
      />

      {/* The ghost: the tile the drag carries, following the pointer at the
          board's tile size. The shared rule pins and tilts it; the tile is
          its look. */}
      {editing.drag && editing.drag.letter !== null && (
        <div
          className={dragGhost.ghost}
          style={{
            left: editing.drag.x,
            top: editing.drag.y,
            width: editing.cell,
            height: editing.cell,
          }}
        >
          <Tile letter={editing.drag.letter} where="ghost" />
        </div>
      )}
    </div>
  )
}
