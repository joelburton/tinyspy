// cs-blessed-codenamesduet

import { cls } from '@/common/utils/cls'
import type { EndOutcome } from '@/common/ending/gameEnding'
import { positionAt } from '@/common/board-cursor/boardPosition'
import shared from '@/common/game-page/playArea.module.css'
import {
  makeEndingFrameClasses,
} from '@/common/game-page/makeEndingFrameClasses'
import history from '@/common/event-log/historyViewer.module.css'
import { BOARD_SHAPE } from '../lib/boardShape'
import { useDecidedTileMarks } from '../hooks/useDecidedTileMarks'
import { useTileCursor } from '../hooks/useTileCursor'
import { Tile } from './Tile'
import styles from './Board.module.css'
import type { GHistoryView, GPlayer, GTile } from '../types'

/** What this screen adds to the board: worn on or around it, never in the blob. */
type BoardMarks = {
  // The tile the keyboard has picked, waiting for Enter, or null.
  pickedTile: GTile | null
  // The tile whose guess is in flight — dimmed until its reveal lands — or null.
  inFlightTile: GTile | null
  // The ending's outcome, for the game-over frame's color; null while playing.
  endingOutcome: EndOutcome | null
  // My partner holds the move: the board dims, unless it takes input.
  isWaitingForTurn: boolean
  // True for a beat as the move becomes mine: the board's frame flashes.
  myTurnJustStarted: boolean
}

/**
 * The 5×5 codenamesduet board: a grid of tiles, and the keyboard's way around
 * them (`useTileCursor`). It decides which marks each tile wears — its key
 * squares, its arrows, whether it takes a click, and the shared board marks
 * (plans/tile-feedback.md): the pick and the cursor ring, the in-flight dim,
 * the attention flash and the shake (`useDecidedTileMarks`) — and on the board
 * the turn dim and flash and the game-over frame. `Tile` draws them.
 */
export function Board({
  tiles,
  moveCount,
  marks,
  historyView,
  me,
  partner,
  showsPartnerKey,
  isInteractive,
  onPick,
  onGuess,
}: {
  // The 25 tiles — the live board or a viewed turn's (PlayArea picks).
  tiles: GTile[]
  // Guesses the server has recorded — the CAUSE the attention flash reads.
  moveCount: number
  marks: BoardMarks
  // A past turn open: `tiles` is then its board, the frame rings the board,
  // the turn's own tiles are ringed, and clicks fall through to the viewer's
  // own exit.
  historyView: GHistoryView
  // Whose key is mine, and whose is my partner's.
  me: GPlayer
  partner: GPlayer
  // My partner's key-card squares are drawn: the game has ended and I asked.
  showsPartnerKey: boolean
  // The board takes my guess right now (BoardCol's `isInteractive`).
  isInteractive: boolean
  // Pick a tile, or un-pick with null — the keyboard's Space.
  onPick: (tile: GTile | null) => void
  // Guess a tile — a click. BoardCol owns the guess.
  onGuess: (tile: GTile) => void
}) {
  // I am guessing on this board right now: it takes my guess, and it is the
  // live board rather than a past turn.
  const isGuessing = isInteractive && !historyView.isViewing
  const tileCursor = useTileCursor({
    tiles,
    pickedTile: marks.pickedTile,
    canGuess: isGuessing,
    me,
    onPick,
    onGuess,
  })
  const decidedMarks = useDecidedTileMarks({
    tiles,
    moveCount,
    isViewingHistory: historyView.isViewing,
  })
  const cursorPosition =
    tileCursor.cell === null
      ? null
      : positionAt(tileCursor.cell.x, tileCursor.cell.y, BOARD_SHAPE.numCols)

  return (
    // data-board: the e2e handle for the layout-stability test, which measures
    // this element's height across the below-board states.
    <div className={cls(shared.boardSeal, styles.board)} data-board>
      {/* While a past turn is open the shared `.historyFrame` rings the board and
          makes it click-through (pointer-events: none), so a click on it reaches
          the viewer's own document-level exit. */}
      <div
        className={cls(
          shared.hugRectWidth,
          styles.grid,
          historyView.isViewing && history.historyFrame,
          marks.isWaitingForTurn && !isInteractive && shared.dimNotYourTurn,
          marks.myTurnJustStarted && shared.yourTurnFlash,
          makeEndingFrameClasses(marks.endingOutcome, historyView.isViewing),
        )}
      >
        {tiles.map((tile, index) => (
          <Tile
            key={tile.id}
            tile={tile}
            // My key-card square, except while I am the one guessing: my own
            // key says nothing about my partner's clue.
            myKey={isGuessing ? null : tile.puzzleTile.key[me.id]!}
            partnerKey={showsPartnerKey ? tile.puzzleTile.key[partner.id] ??
              null : null}
            // The builder decides who a tile points at; the board only says
            // which way each arrow faces.
            arrowToMe={tile.revealed?.arrows.has(me) ?? false}
            arrowToPartner={tile.revealed?.arrows.has(partner) ?? false}
            marks={{
              isPicked: marks.pickedTile?.id === tile.id,
              isUnderCursor: cursorPosition === index,
              isInFlight: marks.inFlightTile?.id === tile.id,
              isFlashing: decidedMarks.flashingTiles.has(tile),
              isShaking: decidedMarks.shakingTiles.has(tile),
              isHistoryLit: historyView.litTileIds.has(tile.id),
            }}
            // While I am guessing, and the builder says I may guess it.
            isClickable={isGuessing && tile.guessableBy.has(me)}
            onClick={() => tileCursor.guessClicked(tile)}
          />
        ))}
      </div>
    </div>
  )
}
