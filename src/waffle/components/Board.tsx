// cs-fixed-outcome-fix

import { useRef } from 'react'
import { cls } from '@/common/utils/cls'
import type { EndOutcome } from '@/common/terminal/gameEnding'
import { useIsCoarsePointer } from '@/common/mobile/useIsCoarsePointer'
import { useMoveAttention } from '@/common/board-marks/useMoveAttention'
import shared from '@/common/game-page/playArea.module.css'
import {
  makeEndingFrameClasses,
} from '@/common/game-page/makeEndingFrameClasses'
import history from '@/common/event-log/historyViewer.module.css'
import { useTileCursor } from '../hooks/useTileCursor'
import { CELLS } from '../lib/waffle'
import { Tile } from './Tile'
import styles from './Board.module.css'
import type { GHistoryView, GTile } from '../types'

/** What the board wears on and around its tiles. */
type BoardMarks = {
  // The ids of the tiles picked up for the next swap, in pick order.
  pickedTileIds: readonly string[]
  // The ids of the two tiles of a swap that is OUT — sent, waiting on the
  // server — or empty.
  inFlightTileIds: ReadonlySet<string>
  // How I came out, once I have ended — with the game, or before it while the
  // others race on: the board takes a band in that outcome's gray (neutral for
  // a game that was simply stopped). Null while I still play. Permanent, it
  // says "this is a record, not a position".
  endingOutcome: EndOutcome | null
  // A teammate holds the move: the board-scope dim. The dim on a board says
  // "you cannot act at all", the same verb the in-flight dim uses on a tile —
  // the element it lands on says what is inactive.
  isWaitingForTurn: boolean
  // True for a beat as the turn becomes mine — the frame flashes yellow. The
  // dim lifting is a state change; this is the event, and you are by
  // definition looking elsewhere when it happens.
  myTurnJustStarted: boolean
}

/** A render's tiles and the swap it had in flight — what the next render
 *  compares itself against to find what changed. */
type BoardSnapshot = {
  tiles: readonly GTile[]
  inFlightTileIds: ReadonlySet<string>
}

/**
 * The tiles worth flashing between two renders — see the call site for which
 * two kinds qualify and why.
 */
function findChangedTileIds(before: BoardSnapshot, after: BoardSnapshot): ReadonlySet<string> {
  const beforeById = new Map(before.tiles.map((t) => [t.id, t]))
  const ids = new Set<string>()
  for (const t of after.tiles) {
    const was = beforeById.get(t.id)!
    if (t.letter !== was.letter) ids.add(t.id)
      // My own swap: the letters already moved optimistically, so what just
      // arrived is the color. If a tile that was in flight is no longer, the
    // server has answered it.
    else if (before.inFlightTileIds.has(t.id) &&
      !after.inFlightTileIds.has(t.id)) ids.add(t.id)
  }
  return ids
}

/**
 * The 5×5 waffle lattice. Tap a tile to pick it up (it highlights), tap a
 * second to swap them; tap the same tile again to cancel. From the keyboard,
 * arrows move a selection cursor (`useTileCursor`), Space picks up to two
 * tiles, and Enter swaps them — the second pick WAITS for Enter, where the
 * second tap is the swap, because an arrow can land a cell off and a swap costs
 * one from the budget. The picks and those rules are the column's
 * (`usePickedTiles`); the board reports the tap, the Space and the drop. Holes
 * render as gaps, and the cursor passes over them.
 * A tile's color is the server's feedback — the board only draws it, never
 * works it out (it doesn't hold the solution).
 *
 * Board decides which marks each `<Tile>` wears; the tile draws them. The
 * square board lives in a `.board` wrapper, top-aligned in the shared
 * `.boardCol` (see Board.module.css).
 */
export function Board({
  tiles,
  marks,
  historyView,
  isInteractive,
  moveCount,
  onTap,
  onTogglePick,
  onDrop,
}: {
  // The board to draw, by position: the live one (with a swap in flight
  // applied), the revealed solution, or a past swap's — the caller picks.
  tiles: GTile[]
  marks: BoardMarks
  // A past swap is open: the board wears the shared viewer frame, its two
  // moved tiles are ringed, and the attention flash stays quiet.
  historyView: GHistoryView
  // The board is mine to work: the move is mine and the live board is on
  // screen. When false the tiles take no pick, drag or key.
  isInteractive: boolean
  // How many swaps the server has recorded for the board on show. It is the
  // CAUSE the attention flash reads: a board that changed while this number
  // stood still was re-dealt or revealed, not played.
  moveCount: number
  // A click or tap on a tile.
  onTap: (tile: GTile) => void
  // Space on the tile under the cursor.
  onTogglePick: (tile: GTile) => void
  // One tile dragged onto another.
  onDrop: (from: GTile, to: GTile) => void
}) {
  const tilesById = new Map(tiles.map((t) => [t.id, t]))
  // Drag is a MOUSE affordance: on a touch device it's off (HTML5 DnD doesn't
  // fire on touch anyway, and a `draggable` tile there just invites a
  // long-press drag-ghost), leaving the tap-two-tiles model as the sole input.
  const coarse = useIsCoarsePointer()
  // The id of the tile being dragged.
  const dragFromTileId = useRef<string | null>(null)

  // ATTENTION — the tiles that just changed under the player, flashed yellow for
  // a beat before settling into their true state color. waffle is the case
  // plans/tile-feedback.md calls out as needing this: a swap substitutes letters
  // where they already sat and recolors them in place, so nothing about the
  // change announces itself, and in coop it lands in whatever corner a teammate
  // was working in.
  //
  // A MOVE has to be what changed the board, which the swap count says and the
  // board itself cannot — the reveal swaps the whole solution in, differing
  // from the previous board in twenty places, and is not news (`useMoveAttention`, and the reason it is shared:
  // setgame learned it the hard way).
  //
  // Given a move, TWO kinds of tile qualify, which is the audience rule made
  // concrete:
  //
  //   - its LETTER changed — a teammate's swap arriving on my board, the classic
  //     "something moved while I was reading elsewhere";
  //   - it was MINE and in flight, and its COLOR just resolved — my own swap
  //     being answered. Its letters moved when I dropped them, so there is no
  //     letter diff left to notice; the news is the verdict, which is exactly
  //     what I could not have known.
  //
  // The flash is set DURING the render that applies the change, so both land in
  // one commit: paint the color a frame early and the eye catches it first, and
  // the flash then reads as a second, unexplained event.
  const flashingTileIds = useMoveAttention({
    content: { tiles, inFlightTileIds: marks.inFlightTileIds },
    contentKey: `${tiles.map((t) => t.letter +
      t.color).join('')}|${[...marks.inFlightTileIds].join()}`,
    moveCount,
    // Quiet while viewing a past turn — the ringed tiles already mark what that
    // swap did, and a move landing live behind the viewer is not something to
    // point at on a board they are not looking at.
    quiet: historyView.isViewing,
    changed: findChangedTileIds,
  })

  function dropOnTile(tile: GTile) {
    const fromId = dragFromTileId.current
    dragFromTileId.current = null
    if (fromId !== null) onDrop(tilesById.get(fromId)!, tile)
  }

  // The keyboard: arrows move the cursor, Space toggles a pick.
  const cursor = useTileCursor({ tiles, isInteractive, onToggle: onTogglePick })

  return (
    <div className={cls(shared.boardSeal, styles.board)}>
      {/* Four marks ride on the board box, all shared: the gray-blue frame of
          "you're viewing a past turn"
          (common/event-log/historyViewer.module.css), the dim of "a
          teammate holds the move", the yellow flash of "your turn just started",
          and the dark-gray frame of "I have ended". The turn marks can't
          collide with the last one — an ended player has no turn to wait for
          and none to receive — and the two frames, both outlines, take turns. */}
      <div
        className={cls(
          styles.grid,
          historyView.isViewing && history.historyFrame,
          marks.isWaitingForTurn && !isInteractive && shared.dimNotYourTurn,
          makeEndingFrameClasses(marks.endingOutcome, historyView.isViewing),
          marks.myTurnJustStarted && shared.yourTurnFlash,
        )}
        role="grid"
        aria-label="Waffle board"
      >
        {Array.from({ length: CELLS }, (_, pos) => {
          const tile = tilesById.get(String(pos))
          // A hole — an interior cell in no word — has no tile.
          if (tile === undefined) {
            return <span key={pos} className={styles.hole} aria-hidden="true"/>
          }
          return (
            <Tile
              key={tile.id}
              tile={tile}
              marks={{
                isPicked: marks.pickedTileIds.includes(tile.id),
                isUnderCursor: cursor.cursorTileId === tile.id,
                isInFlight: marks.inFlightTileIds.has(tile.id),
                isFlashing: flashingTileIds.has(tile.id),
                isHistoryLit: historyView.litTileIds.has(tile.id),
              }}
              isDisabled={!isInteractive}
              isDraggable={isInteractive && !coarse}
              onClick={() => {
                // The cursor follows the hand, hidden, so the keys resume here.
                cursor.moveToClicked(tile)
                onTap(tile)
              }}
              onDragStart={() => {
                dragFromTileId.current = tile.id
              }}
              onDrop={() => dropOnTile(tile)}
              onDragEnd={() => {
                dragFromTileId.current = null
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
