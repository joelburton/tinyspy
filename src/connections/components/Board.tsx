// cs-blessed-connections

import { cls } from '@/common/utils/cls'
import type { Category } from '../lib/board'
import type { MatchedCategory } from '../hooks/useGame'
import type { HistoryView } from '../hooks/useHistoryView'
import type { BoardVerdict } from '../hooks/useVerdictMark'
import { useTileShuffle } from '../hooks/useTileShuffle'
import type { Mark } from '@/common/board-marks/useMark'
import type { EndOutcome } from '@/common/terminal/gameEnding'
import type { Cell } from '@/common/board-cursor/stepCell'
import { cellAt, positionAt } from '@/common/board-cursor/boardPosition'
import { useBoardSelectionCursor } from '@/common/board-cursor/useBoardSelectionCursor'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { makeBoardShape } from '../lib/boardShape'
import { RANK_TOKEN } from '../lib/rankColors'
import { useMoveAttention } from '@/common/board-marks/useMoveAttention'
import { OUTCOME_TO_VERDICT_CLASS } from '@/common/game-page/outcomeToVerdictClass'
import shared from '@/common/game-page/playArea.module.css'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import history from '@/common/event-log/historyViewer.module.css'
import styles from './Board.module.css'

const COLS = 4


type Props = {
  // Categories resolved by a correct guess.
  matched: MatchedCategory[]
  // Categories revealed at game-end (loss / elimination); `[]` during play.
  unmatched: Category[]
  // The loose tiles, in the board's order; the display order is this
  // component's (`useTileShuffle`). They stay on a FROZEN board (that's the
  // record of how far the players got) and step aside only for the reveal,
  // whose bands take their grid rows.
  remainingTiles: string[]
  // Is the ANSWER on the board right now (the reveal)?
  solutionShown: boolean
  // A past turn's board while one is open: its bands and tiles replace the
  // live ones, its four guessed tiles are lit, and the board is read-only
  // under the shared viewer frame.
  historyView: HistoryView
  // The board responds to me (the page's `isBoardInteractive`). False — or a
  // past turn on screen — marks the tiles `disabled`: the shared `.tile`
  // chrome then drops the pointer cursor and the hover lift, so a record
  // doesn't advertise itself as an input.
  isBoardInteractive: boolean
  // Still in the game — the Shuffle shows, and the picks are drawn.
  isStillPlaying: boolean
  // tile → user_id (the inverted picks map). Says which tiles are in the
  // guess being built, and whose pick each one was.
  ownerByTile: ReadonlyMap<string, string>
  // A tile was picked — by a click, or by Space on the cursor.
  onPick: (tile: string) => void
  // The tiles of a guess that is OUT — sent, waiting on the server. They wear
  // the shared in-flight dim until the answer lands.
  inFlightGuess: ReadonlySet<string>
  // The verdict on the last guess, filling its tiles in its pill's outcome
  // (`useVerdictMark`). Null while nothing is being judged. Its PHASE is the
  // mark's two beats, and the tiles draw both off it: the attention flash
  // first, then the head-shake over the fill the flash hands back. Its `nonce`
  // is what those tiles are keyed on, so submitting the same four twice
  // shakes twice.
  verdict: Mark<BoardVerdict> | null
  // user_id → resolved color var, for the identity ring.
  colorByUserId: ReadonlyMap<string, string>
  // The players are working one board together (`gd.isSharedBoard`).
  isSharedBoard: boolean
  // A teammate holds the move (the page's `isWaitingForTurn`): the board-scope
  // dim, unless the board is interactive.
  isWaitingForTurn: boolean
  // True for a beat as the turn becomes mine (useTurnStartFlash).
  myTurnJustStarted: boolean
  // The ending that applies to me — the board wears the frame in its outcome.
  // Null while I play.
  endingOutcome: EndOutcome | null
  // ATTENTION's cause, the server's move marker: the guess log's length. A band
  // arriving is only news when a MOVE put it there — the reveal swaps four
  // bands in without one (`useMoveAttention`).
  moveCount: number
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
  matched,
  unmatched,
  remainingTiles,
  solutionShown,
  historyView,
  isBoardInteractive,
  isStillPlaying,
  ownerByTile,
  onPick,
  inFlightGuess,
  verdict,
  colorByUserId,
  isSharedBoard,
  isWaitingForTurn,
  myTurnJustStarted,
  endingOutcome,
  moveCount,
}: Props) {
  // May I pick a tile right now? A past turn on screen blocks it: any click
  // or key there leaves history.
  const canPick = isBoardInteractive && !historyView.isViewing

  // ─── The display order, and the cursor over it ─────────
  const shuffle = useTileShuffle({
    remainingTiles,
    canShuffle: isStillPlaying && !historyView.isViewing,
  })
  // The cursor sits on a CELL, so a shuffle moves the tiles under it, and a
  // solved band — a row fewer — pulls it onto the nearest tile left.
  const boardShape = makeBoardShape(shuffle.tiles.length)
  const selectionCursor = useBoardSelectionCursor({
    shape: boardShape,
    enabled: canPick,
    onToggle: (cell: Cell) => {
      const tile = shuffle.tiles[positionAt(cell.x, cell.y, boardShape.numCols)]
      if (tile !== undefined) onPick(tile)
    },
  })
  // A tile click: the cursor moves there, hidden, and the click does its move.
  function pickClickedTile(tile: string) {
    selectionCursor.setTo(cellAt(shuffle.tiles.indexOf(tile), boardShape.numCols))
    onPick(tile)
  }

  // ─── The rows ──────────────────────────────────────────
  // What is on the grid: a past turn's bands and tiles while one is open;
  // else the solved bands in rank order, the revealed ones, and the loose
  // tiles — and how many rows that makes, which is what sizes it.
  const shownMatched = historyView.matched ?? matched
  const shownUnmatched = historyView.isViewing ? [] : unmatched
  const tiles = historyView.tiles ?? (solutionShown ? [] : shuffle.tiles)
  const sortedMatched = [...shownMatched].sort((a, b) => a.rank - b.rank)
  // Total rows = one per band + the tile rows. Always 4 for a standard
  // 16-tile / 4×4 board, but computed so the cap math stays correct if a
  // category ever isn't exactly four tiles.
  const rows = sortedMatched.length + shownUnmatched.length + Math.ceil(tiles.length / COLS)

  // ─── Attention ─────────────────────────────────────────
  // ATTENTION — a category resolved while you were reading another corner: a
  // correct guess collapses four tiles into a band and reflows everything
  // below it, in coop wherever a teammate was working.
  //
  // Gated on the CAUSE (the guess log) rather than on the board differing:
  // a restart re-deals with every band gone and the reveal swaps four bands
  // in at once, and neither is a move. `matched` is projected from the log in
  // useGame, so a band cannot arrive a render before its row. See
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
  const band = (c: Category | MatchedCategory, revealed: boolean) => (
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
    // --rows (bands + tile-rows) drives the grid's 1fr row tracks AND the
    // board's max-height (both computed in CSS from the --max-tile-* caps — see
    // Board.module.css). A band is one of these rows spanning all columns.
    <div className={cls(shared.boardSeal, styles.board)} style={{ ['--rows' as string]: rows }} data-board>
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
          historyView.isViewing && history.historyFrame,
          isWaitingForTurn && !isBoardInteractive && shared.dimNotYourTurn,
          myTurnJustStarted && shared.yourTurnFlash,
          makeEndingFrameClasses(endingOutcome, historyView.isViewing),
        )}
      >
        {sortedMatched.map((mc) => band(mc, false))}
        {shownUnmatched.map((c) => band(c, true))}
        {tiles.map((tile, i) => {
          const ownerId = ownerByTile.get(tile)
          // WHOSE pick this is, on a board where that is worth saying: everyone's
          // on a shared one (mine included), nobody's otherwise. Undefined also
          // gates the ring class, because the color arrives as an inline
          // `--peer-color` and a ring drawn against an undefined token is an
          // invalid declaration rather than a subtle bug.
          const ownerColor =
            isSharedBoard && ownerId !== undefined ? colorByUserId.get(ownerId) : undefined
          const isInFlight = inFlightGuess.has(tile)
          const isVerdict = verdict?.value.tiles.has(tile) ?? false
          // One of the four tiles the viewed turn guessed — tinted the outcome
          // color and outlined in the history blue.
          const isHistoryLit = historyView.litTiles?.has(tile) ?? false
          return (
            <button
              // Keyed on the verdict's nonce while it is wearing one, so that
              // submitting the same four tiles again REMOUNTS them and the verdict's
              // shake replays — a CSS animation only restarts on a new element.
              // Just these four: the other twelve keep their identity.
              key={isVerdict && verdict ? `${tile}#${verdict.nonce}` : tile}
              type="button"
              // A stable e2e hook (the class names are hashed, and the floating
              // Shuffle control lives inside the board root, so "a button in
              // the board" isn't specific enough to mean "a tile").
              data-tile={tile}
              disabled={!isBoardInteractive || historyView.isViewing}
              className={cls(
                shared.tileFace,
                shared.tile,
                // PICKED, whoever picked it: the border says "in the move",
                // the ring below says whose.
                ownerId !== undefined && shared.picked,
                ownerColor && styles.peerPick,
                // The answer landing here — the attention flash first, then the
                // head-shake over the verdict color the flash hands back. One
                // mark, two beats, so the phase is the whole of the ordering.
                isVerdict && verdict?.phase === 'attention' && shared.attentionFlash,
                isVerdict && verdict?.phase === 'answer' && shared.verdictShake,
                isInFlight && shared.dimInFlight,
                // The answer fills the tile, in a PALE tier of its pill's outcome.
                isVerdict && shared.verdictFill,
                isVerdict && verdict && OUTCOME_TO_VERDICT_CLASS[verdict.value.outcome],
                isHistoryLit && shared.verdictFill,
                // Set together with `litTiles`, which `isHistoryLit` read.
                isHistoryLit && OUTCOME_TO_VERDICT_CLASS[historyView.litOutcome!],
                isHistoryLit && styles.historyTile,
                selectionCursor.cell !== null
                  && positionAt(selectionCursor.cell.x, selectionCursor.cell.y, COLS) === i
                  && shared.selectionCursor,
              )}
              style={ownerColor ? { ['--peer-color' as string]: ownerColor } : undefined}
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
      <ShuffleButton action={shuffle.actShuffle} tooltip="Shuffle tiles" className={shared.floatingShuffle} />
    </div>
  )
}
