// cs-unmet

import type { RefObject } from 'react'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { cls } from '@/common/utils/cls'
import { usePlayerBoard } from '../hooks/usePlayerBoard'
import { LETTER_SCALE } from '../lib/board'
import type { GActions } from '../reactTypes'
import type { GCheckResult, GGameData } from '../types'
import { BoardArena } from './BoardArena'
import { InfoCol } from './InfoCol'
import shell from '@/common/game-page/playArea.module.css'
import dragGhost from '@/shared/grid-and-drag/dragGhost.module.css'
import styles from './PlayerBoard.module.css'

/**
 * bananagrams' two columns — the thin coordinator under `PlayArea`. It holds
 * the board editor (`usePlayerBoard`: my board as I edit it, the hand derived
 * from it, the drag, the cursor, the zoom and the autosave) and lays out the
 * two views that draw from it: `<BoardArena>` in the board column, and the
 * `<InfoCol>` with the hand card in the info column.
 *
 * Why not the roster's `BoardCol` + `InfoCol` split: the hand's tiles drop onto
 * the board and the dump zone takes a tile dragged off it, so one editor spans
 * both columns and neither view owns input (docs/games/bananagrams.md).
 */
export function PlayerBoard({
  gd,
  actions,
  endingMessage,
  localFeedbackSlot,
  onPeel,
  onCheckResult,
  onDump,
  reportBoardRef,
}: {
  gd: GGameData
  actions: GActions
  // The ending that applies to me, or null while I play.
  endingMessage: TerminalMessage | null
  // PlayArea's below-board slot, drawn in the fixed-height slot under the
  // board so the arena never reflows.
  localFeedbackSlot: FeedbackSlot
  // Peel: draws a tile for everyone, or wins if the bunch can't refill the
  // table. Resolves to `{ illegalCells }` when a winning peel was BLOCKED
  // (those cells paint red); `null` otherwise.
  onPeel: () => Promise<{ illegalCells: number[] } | null>
  // Report a Check-words outcome up, so the coordinator can show it.
  onCheckResult: (r: GCheckResult) => void
  // Dump a tile: swap it for DUMP_COUNT from the bunch.
  onDump: (letter: string) => void | Promise<void>
  // Kept pointed at the live board, so PlayArea's print reads it at click time.
  reportBoardRef: RefObject<string>
}) {
  const editor = usePlayerBoard({
    gameId: gd.id,
    // Seeded ONCE: the editor owns the board after, and a later blob never
    // re-seeds it.
    initialBoard: gd.me.board.letters,
    tiles: gd.me.tiles,
    isBoardInteractive: gd.me.stillPlaying,
    onPeel,
    onCheckResult,
    onDump,
    bunchCount: gd.nBunchTiles,
    bagCount: gd.nBagTiles,
    reportBoardRef,
  })

  return (
    <div className={cls(shell.layout, styles.layout)}>
      {/* The board column is game-specific (a FILL scroll arena, not the shared
          hug board), so it does NOT compose shell.boardCol — styles.boardCol is
          self-sufficient, avoiding a flex hug-vs-fill override fight. */}
      <div className={styles.boardCol}>
        <BoardArena
          scrollRef={editor.scrollRef}
          cell={editor.cell}
          minCell={editor.minCell}
          onZoom={editor.onZoom}
          actZoomFit={editor.actZoomFit}
          board={editor.board}
          cursor={editor.cursor}
          hover={editor.hover}
          drag={editor.drag}
          invalidCells={editor.invalidCells}
          onCellPointerDown={editor.onCellPointerDown}
        />
        {/* Moves are made on the arena itself, so `.moveArea` is empty; the
            slot reserves its own height so the arena never reflows when the
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
        editor={editor}
        actions={actions}
        endingMessage={endingMessage}
        hasDump
      />

      {editor.drag && (
        <div
          className={cls(dragGhost.ghost, styles.ghost)}
          style={{
            left: editor.drag.x,
            top: editor.drag.y,
            width: editor.cell,
            height: editor.cell,
            fontSize: editor.cell * LETTER_SCALE,
          }}
        >
          {editor.drag.letter}
        </div>
      )}
    </div>
  )
}
