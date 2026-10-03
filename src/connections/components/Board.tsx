// cs-blessed-connections

import { cls } from '@/common/utils/cls'
import type { GBoard, GCategory, GHistoryView } from '../types'
import type { GBoardVerdict } from '../types'
import { useTileShuffle } from '../hooks/useTileShuffle'
import { useTileCursor } from '../hooks/useTileCursor'
import type { Mark } from '@/common/board-marks/useMark'
import type { EndOutcome } from '@/common/terminal/gameEnding'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { CATEGORY_COUNT } from '../lib/board'
import { makeBoardShape } from '../lib/boardShape'
import { useMoveAttention } from '@/common/board-marks/useMoveAttention'
import shared from '@/common/game-page/playArea.module.css'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import historyStyles from '@/common/event-log/historyViewer.module.css'
import { Band } from './Band'
import { Tile } from './Tile'
import styles from './Board.module.css'

/** What the board wears on and around its tiles. */
type BoardMarks = {
  // Each picked tile, with its picker's color where WHOSE pick is worth
  // saying, else null. A tile absent from it is not in the guess being built.
  tileToPickerColor: ReadonlyMap<string, string | null>
  // The tiles of a guess that is OUT — sent, waiting on the server.
  inFlightGuess: ReadonlySet<string>
  // The verdict on the last guess, filling its tiles in its pill's outcome
  // (`useVerdictMark`). Null while nothing is being judged. Its `nonce` is
  // what those tiles are keyed on, so submitting the same four twice shakes
  // twice.
  verdict: Mark<GBoardVerdict> | null
  // The ending that applies to me — the board wears the frame in its outcome.
  // Null while I play.
  endingOutcome: EndOutcome | null
  // A teammate holds the move: the board-scope dim.
  isWaitingForTurn: boolean
  // True for a beat as the turn becomes mine (useTurnStartFlash).
  myTurnJustStarted: boolean
}

type Props = {
  // What the grid draws: the matched bands, and the loose tiles in the
  // puzzle's order — the display order is this component's (`useTileShuffle`).
  // The live board, the reveal's (no tiles left), or a past turn's: the
  // caller picks. Loose tiles stay on a FROZEN board (that's the record of how
  // far the players got) and step aside only for the reveal, whose bands take
  // their grid rows.
  board: GBoard
  // The categories the reveal shows in place of the loose tiles; `[]` otherwise.
  revealedCats: GCategory[]
  marks: BoardMarks
  // A past turn is open: the board is read-only under the shared viewer frame,
  // and its four guessed tiles are lit.
  historyView: GHistoryView
  // The board is mine to touch right now: the tiles take a click or Space.
  isInteractive: boolean
  // Still in the game — the Shuffle shows.
  isStillPlaying: boolean
  // ATTENTION's cause, the server's move marker: the guess log's length. A band
  // arriving is only news when a MOVE put it there — the reveal swaps four
  // bands in without one (`useMoveAttention`).
  moveCount: number
  // A tile was picked — by a click, or by Space on the cursor.
  onPick: (tile: string) => void
}

/**
 * connections' board: a SINGLE grid holding both the solved-category bands and
 * the remaining tiles. A solved category becomes a full-width band row
 * (`grid-column: 1 / -1`) in place of the tile row it replaced — a band is
 * "one long tile" spanning the row instead of four, the same height, padding
 * and depth as a tile, sharing the one grid gap. Because every category is
 * four tiles, `bands + ceil(remaining / 4)` is always the same row count, so
 * it is one grid that grows to fill its `.board` wrapper.
 *
 * Every mark on it is the SHARED vocabulary (common/board-marks/doc.md), and
 * the element each one lands on is what says how far it reaches. On a TILE
 * (`Tile`): the picked border and the picker's ring, the in-flight dim, the
 * verdict's flash, shake and fill. On a BAND (`Band`): the attention flash,
 * for a category that resolved under a teammate's hands. On the BOARD: the
 * not-your-turn dim, the your-turn flash, and the ending's frame. The board
 * decides WHICH marks each piece wears; the piece decides how each is drawn.
 *
 * The board owns its display order and Shuffle (`useTileShuffle`) and the
 * keyboard's selection cursor over the loose tiles (`useTileCursor`), which
 * reports a pick up through `onPick` as a click does.
 */
export function Board({
  board,
  revealedCats,
  marks,
  historyView,
  isInteractive,
  isStillPlaying,
  moveCount,
  onPick,
}: Props) {
  // ─── The display order, and the cursor over it ─────────
  const shuffle = useTileShuffle({
    tilesLeft: board.tilesLeft,
    canShuffle: isStillPlaying && !historyView.isViewing,
  })
  // A past turn's tiles draw in the puzzle's order, not this client's.
  const tiles = historyView.isViewing ? board.tilesLeft : shuffle.tiles
  const boardShape = makeBoardShape(tiles.length)
  const tileCursor = useTileCursor({
    displayedTiles: tiles,
    boardShape,
    isInteractive,
    onPick,
  })

  // ─── The rows ──────────────────────────────────────────
  // The solved bands in rank order, then the revealed ones, then the tiles.
  const sortedMatched = [...board.matchedCats].sort((a, b) => a.rank - b.rank)

  // ─── Attention ─────────────────────────────────────────
  // ATTENTION — a category resolved while you were reading another corner: a
  // correct guess collapses four tiles into a band and reflows everything
  // below it, in coop wherever a teammate was working.
  //
  // Gated on the CAUSE (the guess log) rather than on the board differing:
  // a restart re-deals with every band gone and the reveal swaps four bands
  // in at once, and neither is a move. `matchedCats` is written from the log
  // by the builder, so a band cannot arrive a render before its row. See
  // `useMoveAttention`.
  const rankKey = sortedMatched.map((m) => m.rank).join(',')
  const flashingRanks = useMoveAttention({
    content: sortedMatched,
    contentKey: rankKey,
    moveCount,
    // Quiet only while viewing a past turn: the lit tiles there are already
    // the mark. A player's OWN band is marked like anyone else's — it lands at
    // the top of the board while they were reading tiles.
    quiet: historyView.isViewing,
    changed: (before, now) => {
      const had = new Set(before.map((m) => m.rank))
      return new Set(now.map((m) => m.rank).filter((r) => !had.has(r)))
    },
  })

  // ─── Render ────────────────────────────────────────────
  return (
    // --rows drives the grid's 1fr row tracks AND the board's max-height (both
    // computed in CSS from the --max-tile-* caps — see Board.module.css). A
    // band takes the row its four tiles left, so the grid is always one row
    // per category.
    <div className={cls(shared.boardSeal, styles.board)} style={{ ['--rows' as string]: CATEGORY_COUNT }} data-board>
      {/* Four shared marks ride on the grid box, and all four are about the whole
          surface rather than any piece of it: the blue frame of "you're viewing a
          past turn" (which also makes the board click-through, so a click
          anywhere returns to live — useHistoryViewer's document listener), the
          dim of "a teammate holds the move", the yellow flash of "your turn just
          started", and the gray frame of "this board is finished". */}
      <div
        className={cls(
          shared.hugRectWidth,
          styles.grid,
          historyView.isViewing && historyStyles.historyFrame,
          marks.isWaitingForTurn && shared.dimNotYourTurn,
          marks.myTurnJustStarted && shared.yourTurnFlash,
          makeEndingFrameClasses(marks.endingOutcome, historyView.isViewing),
        )}
      >
        {/* A solved band and a revealed one look the same; the key prefix only
            keeps the two lists apart. */}
        {sortedMatched.map((mc) => (
          <Band key={`m-${mc.rank}`} cat={mc} isFlashing={flashingRanks.has(mc.rank)} />
        ))}
        {revealedCats.map((c) => (
          <Band key={`u-${c.rank}`} cat={c} isFlashing={false} />
        ))}

        {tiles.map((tile, i) => {
          const pickerColor = marks.tileToPickerColor.get(tile)
          const isVerdict = marks.verdict?.value.tiles.has(tile) ?? false
          const isHistoryLit = historyView.litTiles?.has(tile) ?? false
          return (
            <Tile
              // Keyed on the verdict's nonce while it is wearing one, so that
              // submitting the same four tiles again REMOUNTS them and the
              // verdict's shake replays — a CSS animation only restarts on a new
              // element. Just these four: the other twelve keep their identity.
              key={isVerdict && marks.verdict ? `${tile}#${marks.verdict.nonce}` : tile}
              tile={tile}
              marks={{
                isPicked: pickerColor !== undefined,
                pickerColor: pickerColor ?? null,
                isUnderCursor: tileCursor.position === i,
                isInFlight: marks.inFlightGuess.has(tile),
                verdict:
                  isVerdict && marks.verdict
                    ? { phase: marks.verdict.phase, outcome: marks.verdict.value.outcome }
                    : null,
                // Set together with `litTiles`, which `isHistoryLit` read.
                historyLit: isHistoryLit ? historyView.litOutcome! : null,
              }}
              isDisabled={!isInteractive}
              onClick={() => tileCursor.pickClicked(tile)}
            />
          )
        })}
      </div>

      {/* Shuffle floats over the board's top-right, inside the board root (the
          `position: relative` anchor) so it hugs the VISUAL board. Its action
          hides itself once the board cannot be shuffled. */}
      <ShuffleButton action={shuffle.actShuffle} tooltip="Shuffle tiles" className={shared.floatingShuffle} />
    </div>
  )
}
