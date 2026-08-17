import { useEffect, useRef, useState } from 'react'
import { cls } from '../../common/lib/util/cls'
import { tileColor } from '../../common/lib/color/tileColor'
import { useCoarsePointer } from '../../common/hooks/ui/useCoarsePointer'
import { ATTENTION_FLASH_MS } from '../../common/lib/game/feedbackTiming'
import { useMoveCausedChange } from '../../common/hooks/game/useMoveCausedChange'
import { CELLS, isHole } from '../lib/waffle'
import shared from '../../common/components/game/PlayArea.module.css'
import history from '../../common/components/game/lists/historyViewer.module.css'
import styles from './Board.module.css'

/** A stable empty set, so "nothing is flashing" is one object rather than a new
 *  one per render (the flash state is a render-time comparison). */
const NO_CELLS: ReadonlySet<number> = new Set()

/** A render's board + colors + the swap it had in flight — what the next render
 *  compares itself against to find what changed. */
type BoardSnapshot = {
  board: string
  colors: string | null
  pendingSwap?: readonly [number, number] | null
}

/**
 * The cells worth flashing between two renders — see the call site for which two
 * kinds qualify and why.
 */
function changedCells(before: BoardSnapshot, after: BoardSnapshot): ReadonlySet<number> {
  const cells = new Set<number>()
  for (let i = 0; i < after.board.length; i++) {
    if (!isHole(i) && after.board[i] !== before.board[i]) cells.add(i)
  }
  // My own swap: the letters already moved optimistically, so what just arrived
  // is the color. `before.pendingSwap` is the swap that was still in flight —
  // if its cells have a color now, the server has answered them.
  for (const cell of before.pendingSwap ?? []) {
    if (after.colors?.[cell] !== before.colors?.[cell]) cells.add(cell)
  }
  return cells
}

type Props = {
  /** 25-char board string, holes = '.'. Live board OR a historical snapshot. */
  board: string
  /** 25-char per-tile color codes (g/y/x/.), or null before load. */
  colors: string | null
  /** When true, tiles aren't interactive (terminal / paused / viewing history). */
  disabled?: boolean
  /** Turn-history: draw the gray-blue "viewing a past turn" frame + suppress the
   *  attention flash (the ringed cells mark what the viewed swap did instead). */
  viewing?: boolean
  /** Turn-history: the cells the viewed swap moved — ring them. */
  highlight?: ReadonlySet<number>
  /** Swap the letters of two filled cells. */
  onSwap: (a: number, b: number) => void
  /** The swap in flight, or null. Its two cells take the shared in-flight dim —
   *  "your click landed; the server is working" — and ALL swap input
   *  is ignored until it settles: a production round-trip can run a second
   *  or two, and the reflexive did-I-misclick re-tap of the same two tiles
   *  would otherwise queue the REVERSE swap. */
  pendingSwap?: readonly [number, number] | null
  /** A teammate holds the move (turn-order coop): dim the whole board. The dim
   *  on a board says "you cannot act at all", the same verb the in-flight dim
   *  above uses on a tile — the element it lands on says what is inactive. */
  notMyTurn?: boolean
  /** True for a beat at the moment the turn becomes mine — flashes the board
   *  frame yellow. The dim lifting is a state change; this is the event, and
   *  you are by definition looking elsewhere when it happens. */
  myTurnJustStarted?: boolean
  /** The game is finished, and how it ended — the board takes a band in that
   *  outcome's gray (neutral for a game that was simply ended). Null while it is
   *  still live. Permanent, unlike the two transient dims above: it says "this is
   *  a record, not a position". */
  gameOver?: 'won' | 'lost' | 'neutral' | null
  /** How many swaps the server has recorded for the board on show (the replay
   *  log's length — everyone's in coop, mine in compete). It is the CAUSE the
   *  attention flash reads: a board that changed while this number stood still
   *  was re-dealt or revealed, not played. */
  moveCount: number
}

/**
 * The 5×5 waffle lattice. Tap a tile to pick it up (it highlights),
 * tap a second to swap them; tap the same tile again to cancel. Holes
 * render as gaps. Tile background is the server-computed Wordle-style
 * feedback (green / yellow / gray) — the FE only renders it, never
 * recomputes it (it doesn't hold the solution).
 *
 * Tiles use the SHARED `.tile` chrome (box / radius / shadow / hover shadow) and
 * the SHARED feedback marks (`.selected`, `.dimInFlight`, `.attentionFlash`)
 * from common; waffle's own classes just re-set the `--tile-*` tokens to a
 * Wordle color. The square board lives in a `.board` wrapper, top-aligned in
 * the shared `.boardCol` (see Board.module.css).
 */
export function Board({
  board,
  colors,
  disabled,
  viewing = false,
  highlight,
  onSwap,
  pendingSwap = null,
  notMyTurn = false,
  myTurnJustStarted = false,
  gameOver = null,
  moveCount,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  // Drag source (HTML5 drag-and-drop, the desktop alternative to tap). Drag is a
  // MOUSE affordance: on a touch device it's off (HTML5 DnD doesn't fire on touch
  // anyway, and a `draggable` tile there just invites a long-press drag-ghost),
  // leaving the tap-two-tiles model — which works everywhere — as the sole input.
  const coarse = useCoarsePointer()
  const dragFrom = useRef<number | null>(null)

  // ATTENTION — the cells that just changed under the player, washed yellow for
  // a beat before settling into their true state color. waffle is the case
  // docs/tile-feedback.md calls out as needing this: a swap substitutes letters
  // where they already sat and recolors them in place, so nothing about the
  // change announces itself, and in coop it lands in whatever corner a teammate
  // was working in.
  //
  // A MOVE has to be what changed the board, which the swap log says and the
  // board itself cannot — a restart re-deals every cell, and a terminal reveal
  // swaps the whole solution in. Both differ from the previous board in twenty
  // places and neither is news (`useMoveCausedChange`, and the reason it is
  // shared: setgame learned it the hard way).
  //
  // Given a move, TWO kinds of cell qualify, which is the audience rule made
  // concrete:
  //
  //   - its LETTER changed — a teammate's swap arriving on my board, the classic
  //     "something moved while I was reading elsewhere";
  //   - it was MINE and in flight, and its COLOR just resolved — my own swap
  //     being answered. Its letters moved when I dropped them, so there is no
  //     letter diff left to notice; the news is the verdict, which is exactly
  //     what I could not have known.
  //
  // The wash is set DURING the render that applies the change, so both land in
  // one commit: paint the color a frame early and the eye catches it first, and
  // the flash then reads as a second, unexplained event.
  const [flashing, setFlashing] = useState<ReadonlySet<number>>(NO_CELLS)
  const before = useMoveCausedChange(
    { board, colors, pendingSwap },
    `${board}|${colors ?? ''}`,
    moveCount,
  )
  // Quiet while viewing a past turn — the ringed cells already mark what that
  // swap did, and a move landing live behind the viewer is not something to
  // point at on a board they are not looking at.
  if (before && !viewing) setFlashing(changedCells(before, { board, colors }))

  // The wash is transient: take it off once it has played. (An effect, not a
  // render-time change — this one is a timer, not a reaction to new props.)
  useEffect(() => {
    if (flashing.size === 0) return
    const timer = setTimeout(() => setFlashing(NO_CELLS), ATTENTION_FLASH_MS)
    return () => clearTimeout(timer)
  }, [flashing])

  // While a swap is in flight, EVERY input path stays quiet (tap, drag, and
  // the keyboard — a focused tile's Enter/Space lands in `activate` too).
  const inFlight = pendingSwap !== null

  function activate(pos: number) {
    if (disabled || inFlight || isHole(pos)) return
    if (selected === null) {
      setSelected(pos)
    } else if (selected === pos) {
      setSelected(null)
    } else {
      onSwap(selected, pos)
      setSelected(null)
    }
  }

  function drop(pos: number) {
    const from = dragFrom.current
    dragFrom.current = null
    if (from === null || from === pos || isHole(from) || isHole(pos) || disabled || inFlight) {
      return
    }
    onSwap(from, pos)
    setSelected(null)
  }

  return (
    <div className={styles.board}>
      {/* Four marks ride on the board box, all shared: the gray-blue frame of
          "you're viewing a past turn"
          (common/components/game/lists/historyViewer.module.css), the dim of "a
          teammate holds the move", the yellow flash of "your turn just started",
          and the dark-gray frame of "this game is over". The turn marks can't
          collide with the last one — a finished game has no turn to wait for and
          none to receive — and the two frames, both outlines, take turns. */}
      <div
        className={cls(
          styles.grid,
          viewing && history.frame,
          notMyTurn && shared.dimNotYourTurn,
          // Both frames are outlines, so they take turns rather than nest: while
          // the viewer is open it owns the outline, because that is the state you
          // chose and the one you can leave.
          gameOver !== null && !viewing && shared.gameOverFrame,
          gameOver === 'won' && !viewing && shared.gameOverWon,
          gameOver === 'lost' && !viewing && shared.gameOverLost,
          myTurnJustStarted && shared.yourTurnFlash,
        )}
        role="grid"
        aria-label="Waffle board"
      >
        {Array.from({ length: CELLS }, (_, pos) => {
          if (isHole(pos)) {
            return <span key={pos} className={styles.hole} aria-hidden="true" />
          }
          const letter = board[pos] ?? ' '
          const color = tileColor(colors?.[pos])
          return (
            <button
              key={pos}
              type="button"
              className={cls(
                shared.tileFace,
                shared.tile,
                styles[color],
                selected === pos && shared.selected,
                pendingSwap?.includes(pos) && styles.inFlight,
                pendingSwap?.includes(pos) && shared.dimInFlight,
                flashing.has(pos) && shared.attentionFlash,
                highlight?.has(pos) && styles.viewedTile,
              )}
              aria-label={`${letter.toUpperCase()} (${color})`}
              aria-pressed={selected === pos}
              disabled={disabled}
              draggable={!disabled && !coarse}
              // NOT a focus target — but by BLUR rather than by the mousedown
              // guard the other boards use, because these tiles DRAG. Native
              // HTML5 drag needs the mousedown default: `preventDefault` there
              // stops `dragstart` firing at all (measured — with the guard
              // installed, dragging a tile onto another does nothing). So the
              // click hands focus straight back instead.
              //
              // Why bother: a clicked-and-still-focused tile is promoted to
              // `:focus-visible` by the very next keystroke, and the browser
              // ring then sits on it until you click elsewhere — the rank-square
              // trap. `tabIndex={-1}` covers the other door (25 tiles would bury
              // every real control in the tab order).
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur()
                activate(pos)
              }}
              onDragStart={(e) => {
                dragFrom.current = pos
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                drop(pos)
              }}
              onDragEnd={(e) => {
                // A completed drag fires no click, so blur here too — otherwise
                // the dragged tile keeps focus and the next keystroke rings it.
                e.currentTarget.blur()
                dragFrom.current = null
              }}
            >
              <span className={styles.letter}>{letter.toUpperCase()}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
