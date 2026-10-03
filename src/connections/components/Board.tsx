// cs-blessed-connections

import { cls } from '@/common/utils/cls'
import type { GBoard, GCategory, GHistoryView, GMatchedCat } from '../types'
import type { GBoardVerdict } from '../types'
import { useTileShuffle } from '../hooks/useTileShuffle'
import type { Mark } from '@/common/board-marks/useMark'
import type { EndOutcome } from '@/common/terminal/gameEnding'
import type { Cell } from '@/common/board-cursor/stepCell'
import { cellAt, positionAt } from '@/common/board-cursor/boardPosition'
import { useBoardSelectionCursor } from '@/common/board-cursor/useBoardSelectionCursor'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { CATEGORY_COUNT } from '../lib/board'
import { makeBoardShape } from '../lib/boardShape'
import { RANK_TOKEN } from '../lib/rankColors'
import { useMoveAttention } from '@/common/board-marks/useMoveAttention'
import { OUTCOME_TO_VERDICT_CLASS } from '@/common/game-page/outcomeToVerdictClass'
import shared from '@/common/game-page/playArea.module.css'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import historyStyles from '@/common/event-log/historyViewer.module.css'
import styles from './Board.module.css'

const COLS = 4

/** What the board wears on and around its tiles. */
type BoardMarks = {
  // Each picked tile, with its picker's color where WHOSE pick is worth
  // saying, else null. A tile absent from it is not in the guess being built.
  tileToPickerColor: ReadonlyMap<string, string | null>
  // The tiles of a guess that is OUT — sent, waiting on the server. They wear
  // the shared in-flight dim until the answer lands.
  inFlightGuess: ReadonlySet<string>
  // The verdict on the last guess, filling its tiles in its pill's outcome
  // (`useVerdictMark`). Null while nothing is being judged. Its PHASE is the
  // mark's two beats, and the tiles draw both off it: the attention flash
  // first, then the head-shake over the fill the flash hands back. Its `nonce`
  // is what those tiles are keyed on, so submitting the same four twice
  // shakes twice.
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
  // False marks them `disabled`: the shared `.tile` chrome then drops the
  // pointer cursor and the hover lift, so a record doesn't advertise itself
  // as an input.
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
 * the element each one lands on is what says how far it reaches. On a TILE: the
 * `.picked` border for a tile in the guess being built — worn whoever picked
 * it, because in coop the four tiles are one shared move — with `.peerPick`
 * naming the picker where that is worth saying; `.dimInFlight` while the guess
 * is with the server; `.verdictFill` in its pill's outcome when the answer lands.
 * On a BAND: `.attentionFlash`, for a category that resolved under a teammate's
 * hands. On the BOARD: the not-your-turn dim, the your-turn flash, and the
 * ending's frame. What is left to connections is the bands themselves and the
 * history tints.
 *
 * The board owns its display order and Shuffle (`useTileShuffle`) and the
 * keyboard's selection cursor over the loose tiles (`useBoardSelectionCursor`),
 * which reports a pick up through `onPick` as a click does.
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
  // The cursor sits on a CELL, so a shuffle moves the tiles under it, and a
  // solved band — a row fewer — pulls it onto the nearest tile left.
  const boardShape = makeBoardShape(tiles.length)
  const selectionCursor = useBoardSelectionCursor({
    shape: boardShape,
    enabled: isInteractive,
    onToggle: (cell: Cell) => {
      const tile = tiles[positionAt(cell.x, cell.y, boardShape.numCols)]
      if (tile !== undefined) onPick(tile)
    },
  })
  // A tile click: the cursor moves there, hidden, and the click does its move.
  function pickClickedTile(tile: string) {
    selectionCursor.setTo(cellAt(tiles.indexOf(tile), boardShape.numCols))
    onPick(tile)
  }

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

  // ─── A band ────────────────────────────────────────────
  // One long tile: a solved or revealed category drawn across the row.
  // A solved band and a revealed one look the same; `revealed` only namespaces
  // the React keys across the two lists.
  const band = (c: GCategory | GMatchedCat, revealed: boolean) => (
    <div
      key={`${revealed ? 'u' : 'm'}-${c.rank}`}
      // A band IS a tile — one long one — so it wears the shared `.tileFace`
      // and says what color it is by re-setting that face's tokens, exactly as a
      // state class does. `.band` is then only what makes it long: the column
      // span and the two stacked lines.
      className={cls(
        shared.tileFace,
        styles.band,
        flashingRanks.has(c.rank) && shared.attentionFlash,
      )}
      style={{
        ['--tile-slot-fill-color' as string]: RANK_TOKEN[c.rank],
        // The edge is the rank color stepped darker. A band is inert — never
        // picked, nothing refused on it — so nothing else ever claims its
        // border.
        ['--tile-slot-edge-color' as string]: `color-mix(in srgb, ${RANK_TOKEN[c.rank]} 84%, #000)`,
        // --len drives the same auto-fit the tiles use (here for the band name).
        ['--len' as string]: c.name.length,
      }}
    >
      <strong>{c.name}</strong>
      <div className={styles.bandMembers}>{c.tiles.join(' · ')}</div>
    </div>
  )

  // ─── Render ────────────────────────────────────────────
  return (
    // --rows drives the grid's 1fr row tracks AND the board's max-height (both
    // computed in CSS from the --max-tile-* caps — see Board.module.css). A
    // band takes the row its four tiles left, so the grid is always one row
    // per category.
    <div
      className={cls(shared.boardSeal, styles.board)} style={{ ['--rows' as string]: CATEGORY_COUNT }}
      data-board
    >
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
        {sortedMatched.map((mc) => band(mc, false))}
        {revealedCats.map((c) => band(c, true))}
        {tiles.map((tile, i) => {
          // Undefined: not picked. Null: picked, by someone not worth naming.
          // A string gates the ring class as well as coloring it, because the
          // color arrives as an inline `--peer-color` and a ring drawn against
          // an undefined token is an invalid declaration rather than a subtle
          // bug.
          const pickerColor = marks.tileToPickerColor.get(tile)
          const isPicked = pickerColor !== undefined
          const isInFlight = marks.inFlightGuess.has(tile)
          const isVerdict = marks.verdict?.value.tiles.has(tile) ?? false
          // One of the four tiles the viewed turn guessed — tinted the outcome
          // color and outlined in the history blue.
          const isHistoryLit = historyView.litTiles?.has(tile) ?? false
          return (
            <button
              // Keyed on the verdict's nonce while it is wearing one, so that
              // submitting the same four tiles again REMOUNTS them and the verdict's
              // shake replays — a CSS animation only restarts on a new element.
              // Just these four: the other twelve keep their identity.
              key={isVerdict && marks.verdict ? `${tile}#${marks.verdict.nonce}` : tile}
              type="button"
              // A stable e2e hook (the class names are hashed, and the floating
              // Shuffle control lives inside the board root, so "a button in
              // the board" isn't specific enough to mean "a tile").
              data-tile={tile}
              disabled={!isInteractive}
              className={cls(
                shared.tileFace,
                shared.tile,
                // PICKED, whoever picked it: the border says "in the move",
                // the ring below says whose.
                isPicked && shared.picked,
                pickerColor && styles.peerPick,
                // The answer landing here — the attention flash first, then the
                // head-shake over the verdict color the flash hands back. One
                // mark, two beats, so the phase is the whole of the ordering.
                isVerdict && marks.verdict?.phase === 'attention' && shared.attentionFlash,
                isVerdict && marks.verdict?.phase === 'answer' && shared.verdictShake,
                isInFlight && shared.dimInFlight,
                // The answer fills the tile, in a PALE tier of its pill's outcome.
                isVerdict && shared.verdictFill,
                isVerdict && marks.verdict && OUTCOME_TO_VERDICT_CLASS[marks.verdict.value.outcome],
                isHistoryLit && shared.verdictFill,
                // Set together with `litTiles`, which `isHistoryLit` read.
                isHistoryLit && OUTCOME_TO_VERDICT_CLASS[historyView.litOutcome!],
                isHistoryLit && styles.historyTile,
                selectionCursor.cell !== null
                  && positionAt(selectionCursor.cell.x, selectionCursor.cell.y, COLS) === i
                  && shared.selectionCursor,
              )}
              style={pickerColor ? { ['--peer-color' as string]: pickerColor } : undefined}
              onClick={() => pickClickedTile(tile)}
              // NOT a focus target: `preventDefault` on mousedown stops a CLICK
              // parking focus here, where the next keystroke would promote it
              // to `:focus-visible` and leave a stray ring. Nothing here needs
              // focus — tiles are clicked, and Submit is bound board-wide.
              onMouseDown={(e) => e.preventDefault()}
            >
              {/* --len drives the shared .tileWord auto-fit. */}
              <span className={shared.tileWord} style={{ ['--len' as string]: tile.length }}>
                {tile}
              </span>
            </button>
          )
        })}
      </div>
      {/* Shuffle floats over the board's top-right, inside the board root (the
          `position: relative` anchor) so it hugs the VISUAL board. Its action
          hides itself once the board cannot be shuffled. */}
      <ShuffleButton
        action={shuffle.actShuffle}
        tooltip="Shuffle tiles"
        className={shared.floatingShuffle}
      />
    </div>
  )
}
