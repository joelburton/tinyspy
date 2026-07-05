import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { db } from '../db'
import {
  GRID,
  DEFAULT_CELL,
  MAX_CELL,
  idx,
  clamp,
  setChar,
  tilesExtent,
  deriveHand,
  reconcileHandOrder,
  shuffleString,
} from '../lib/board'
import { useDragGesture, type DragGesture, type DragState } from '../../common/hooks/ui/useDragGesture'
import { moveCursor, stepBack } from '../../common/lib/game/gridCursor'
import { useBoardCursorKeys } from '../../common/hooks/input/useBoardCursorKeys'
import { isEditableField } from '../../common/hooks/input/useGameHasKeyboard'

/**
 * bananagrams' player-board **interaction engine** — the cross-column state and
 * behaviour that `<PlayerBoard>` used to hold inline, lifted into a hook.
 *
 * Why a hook (and not the roster's `BoardCol` + `InfoCol` split): bananagrams is the
 * documented exception where the board and the hand are NOT independently-owned
 * columns. One engine spans both — the hand tiles (info column) are drag SOURCES that
 * drop onto the board (board column); the dump zone (info column) is a drop TARGET
 * during a board drag; the derived hand (`deriveHand(tiles, board)`) is a function of
 * BOARD state; the keyboard cursor types onto the board but checks the hand; Peel /
 * rotate read board + hand. So the engine can't be split by column — it lives here as
 * ONE unit, and the two thin VIEWS (`<BoardArena>` / `<HandCard>`) render what it
 * returns. See docs/games/bananagrams.md + docs/playarea-decomposition-plan.md.
 *
 * The board model (unchanged from the old inline version): this owns only the `board`
 * (seeded once from `initialBoard`); the HAND is DERIVED from the server-owned `tiles`
 * as `deriveHand(tiles, board)`. Every mutation writes the board ONLY — placing a tile
 * fills a cell and the hand shrinks by re-derivation; a peel/dump grows `tiles`
 * upstream and the hand grows by re-derivation. A local shuffle order (the ⟲ button)
 * layers on with `reconcileHandOrder`. Persistence snapshots the board to
 * `save_player_board` on a debounce AND on unmount (the unmount save is load-bearing —
 * `PauseBoundary` unmounts the play area on pause).
 */

const AUTOSAVE_MS = 800 // debounce before snapshotting an edit
const FIT_MARGIN = 3 // cells of breathing room kept around the tiles on a fit
// tiles drawn per dump (server default; mirrored for the FE label/gate). Exported: the
// hand card's dump zone reads it to show the "bunch too low to dump" state.
export const DUMP_COUNT = 3
// Tile letter size as a fraction of the cell (px). A touch larger than half the tile
// so the letter stays legible when the board is zoomed out — the tile shrinks with
// zoom, the letter keeps a bit more of it. Exported: the arena grid AND the drag ghost
// both size their letters by it.
export const LETTER_SCALE = 0.6
// Stable empty set for "no red flags" — a fresh `new Set()` each render would be a new
// reference and defeat memoization downstream.
const NO_CELLS: ReadonlySet<number> = new Set()

export type Cell = { x: number; y: number }
export type Cursor = Cell & { dir: 'h' | 'v' }
export type DragSource = { kind: 'hand'; index: number } | { kind: 'board'; x: number; y: number }

// The board cursor is always present during play (you can type the moment the board
// loads). It starts dead center — Bananagrams builds outward from the middle — and is
// reset there after a recenter.
const CENTER_CURSOR: Cursor = { x: Math.floor(GRID / 2), y: Math.floor(GRID / 2), dir: 'h' }

function cellAtPoint(x: number, y: number): Cell | null {
  const el = document.elementFromPoint(x, y)
  const cell = el?.closest('[data-cell]') as HTMLElement | null
  if (!cell) return null
  return { x: Number(cell.dataset.x), y: Number(cell.dataset.y) }
}
function overHandAtPoint(x: number, y: number): boolean {
  return !!document.elementFromPoint(x, y)?.closest('[data-zone="hand"]')
}
function overDumpAtPoint(x: number, y: number): boolean {
  return !!document.elementFromPoint(x, y)?.closest('[data-zone="dump"]')
}

/**
 * Hand focus back to the board when the player interacts with it.
 *
 * bananagrams' cells + hand tiles are plain `<div>`s (not focusable), so clicking them
 * does NOT move focus off a focused chat box the way clicking a `<button>` tile would
 * in the other games — focus stays in chat and typed letters go there instead of onto
 * the board (the window key handler declines while a field is focused). Blurring the
 * focused field on a board interaction hands the keyboard back to the game, matching
 * how a focusable tile behaves elsewhere (see useGameHasKeyboard). No-op when nothing
 * editable is focused. Exported: both views wire it to their pointer-down.
 */
export function blurActiveField(): void {
  const a = document.activeElement
  if (isEditableField(a)) (a as HTMLElement).blur()
}

/** What the engine needs from PlayArea (the outer coordinator). */
export type UsePlayerBoardInput = {
  gameId: string
  /** The FE-owned placement grid at load — seeds local board state ONCE. */
  initialBoard: string
  /** Server-owned holdings (everything the player holds). LIVE: a peel/dump changes it
   *  upstream and the derived hand follows. */
  tiles: string
  /** True once the game is over — disables Peel (the race is run). */
  isTerminal?: boolean
  /** True once THIS player has conceded (game still live for the others): freezes the
   *  board (no placing / dragging / typing) and disables peel + dump. */
  isConceded?: boolean
  /** Peel: draws a tile for everyone, or wins if the bunch can't refill the table.
   *  Resolves to `{ illegalCells }` when a winning peel was BLOCKED by the legal-board
   *  check (those cells get painted red); `null` otherwise. */
  onPeel?: () => Promise<{ illegalCells: number[] } | null>
  /** Dump a tile: swap it for DUMP_COUNT from the bunch. */
  onDump?: (letter: string) => void | Promise<void>
  /** Tiles left in the shared bunch (status.pool_remaining), or undefined pre-load. */
  bunchCount?: number
  /** Tiles in the out-of-play box (status.box_remaining) — counts toward what a dump
   *  can draw (the bunch tops up from the box when short). */
  boxCount?: number
  /** Optional out-param: kept pointed at the LIVE board string so the outer
   *  coordinator can snapshot it on demand (the print menu reads it at click time)
   *  without subscribing to every placement. */
  reportBoardRef?: RefObject<string>
}

/** Everything the two views + the layout need to render. */
export type PlayerBoardEngine = {
  // ── Board arena ──
  scrollRef: RefObject<HTMLDivElement | null>
  board: string
  cell: number
  minCell: number
  cursor: Cursor
  hover: Cell | null
  drag: DragState<DragSource> | null
  invalidCells: ReadonlySet<number>
  onZoom: (next: number) => void
  centerAndFit: () => void
  onCellPointerDown: (x: number, y: number, e: ReactPointerEvent) => void
  // ── Hand ──
  displayedHand: string
  derivedHand: string
  dumpHot: boolean
  errFlash: boolean
  errNonce: number
  onHandPointerDown: (index: number, letter: string, e: ReactPointerEvent) => void
  onShuffle: () => void
  // ── Actions ──
  declaring: boolean
  doPeel: () => Promise<void>
}

export function usePlayerBoard({
  gameId,
  initialBoard,
  tiles,
  isTerminal,
  isConceded,
  onPeel,
  onDump,
  bunchCount,
  boxCount,
  reportBoardRef,
}: UsePlayerBoardInput): PlayerBoardEngine {
  const [board, setBoard] = useState(initialBoard)
  // A local shuffle order for the hand (the ⟲ button). null = use the canonical
  // derived order. Reconciled against the live hand each render, so it survives
  // placements / peels without going stale.
  const [handOrder, setHandOrder] = useState<string | null>(null)
  const [cell, setCell] = useState(DEFAULT_CELL) // zoom (px per cell)
  const [minCell, setMinCell] = useState(24) // smallest zoom = whole grid fits
  const [cursor, setCursor] = useState<Cursor>(CENTER_CURSOR)
  // Board cells flagged illegal by a blocked peel (disconnected, or — with
  // word_check on — in an invalid word). Stored WITH the board they were computed
  // against, so any edit (which changes `board`) makes them stop matching in render —
  // they clear themselves, no effect needed.
  const [invalid, setInvalid] = useState<{
    board: string
    cells: ReadonlySet<number>
  } | null>(null)
  const [dumpHot, setDumpHot] = useState(false) // a hand tile is hovering the dump slot
  const [errFlash, setErrFlash] = useState(false)
  const [errNonce, setErrNonce] = useState(0)
  const [declaring, setDeclaring] = useState(false) // Done click in flight

  // The derived hand: held tiles minus what's on the board. `displayedHand` applies the
  // local shuffle order on top (reconciled so it never drifts from the canonical
  // multiset).
  const derivedHand = deriveHand(tiles, board)
  const displayedHand = handOrder !== null ? reconcileHandOrder(handOrder, derivedHand) : derivedHand

  // Refs mirror state for the always-on pointer/key handlers (synced in an effect,
  // never written during render). `tilesRef` lets the keyboard handler check tile
  // availability against the live holdings.
  const boardRef = useRef(board)
  const tilesRef = useRef(tiles)
  const cursorRef = useRef(cursor)
  const declaringRef = useRef(declaring) // lets the peel shortcut see an in-flight peel
  // The board is frozen when the player is out of the game — either they
  // conceded OR the game is over. Freezing at TERMINAL too matters: otherwise
  // post-game keystrokes/drags keep mutating the local board (which
  // save_player_board no-ops server-side and "Print board (PDF)" snapshots
  // live), so the on-screen and printed "final" board would silently diverge
  // from the stored one. The always-on pointer/key handlers read this ref to
  // bail (they're stable, so they can't close over the props directly).
  const frozen = !!isConceded || !!isTerminal
  const frozenRef = useRef(frozen)
  useEffect(() => {
    boardRef.current = board
    tilesRef.current = tiles
    cursorRef.current = cursor
    declaringRef.current = declaring
    frozenRef.current = frozen
    if (reportBoardRef) reportBoardRef.current = board // expose the live board upward
  }, [board, tiles, cursor, declaring, frozen, reportBoardRef])

  const scrollRef = useRef<HTMLDivElement>(null)

  // --- Persistence: debounced autosave + save-on-unmount ----------------
  const save = useCallback(() => {
    // The PostgREST builder is LAZY — it only sends the request once `.then()` is
    // called, so we must invoke it (not just `void` it). Fire-and-forget: a failed
    // snapshot just means a stale save, so swallow errors. Only the board is sent;
    // `tiles` is server-owned.
    db.rpc('save_player_board', {
      target_game: gameId,
      board: boardRef.current,
    }).then(undefined, () => {})
  }, [gameId])
  const saveTimer = useRef(0)
  const firstSave = useRef(true)
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false
      return
    }
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(save, AUTOSAVE_MS)
    return () => clearTimeout(saveTimer.current)
  }, [board, save])
  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current)
      save()
    }
  }, [save])

  // --- Zoom keeps the viewport center fixed -----------------------------
  const zoomAnchor = useRef<{ cx: number; cy: number } | null>(null)
  const onZoom = useCallback(
    (next: number) => {
      const c = scrollRef.current
      if (c) {
        zoomAnchor.current = {
          cx: (c.scrollLeft + c.clientWidth / 2) / cell,
          cy: (c.scrollTop + c.clientHeight / 2) / cell,
        }
      }
      setCell(next)
    },
    [cell],
  )
  useLayoutEffect(() => {
    const c = scrollRef.current
    if (!c || !zoomAnchor.current) return
    const { cx, cy } = zoomAnchor.current
    c.scrollLeft = cx * cell - c.clientWidth / 2
    c.scrollTop = cy * cell - c.clientHeight / 2
    zoomAnchor.current = null
  }, [cell])

  // Start centered on the middle of the arena (or the player's tiles).
  useLayoutEffect(() => {
    const c = scrollRef.current
    if (!c) return
    const ext = tilesExtent(boardRef.current)
    const cy = ext ? (ext.minY + ext.maxY + 1) / 2 : GRID / 2
    const cx = ext ? (ext.minX + ext.maxX + 1) / 2 : GRID / 2
    c.scrollLeft = cx * cell - c.clientWidth / 2
    c.scrollTop = cy * cell - c.clientHeight / 2
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The smallest zoom shows the WHOLE grid and no more: min cell = the board area's
  // binding dimension / GRID. Measured on mount + resize.
  useLayoutEffect(() => {
    const c = scrollRef.current
    if (!c) return
    const ro = new ResizeObserver(() => {
      const el = scrollRef.current
      if (!el) return
      const m = Math.max(8, Math.floor(Math.min(el.clientWidth, el.clientHeight) / GRID))
      setMinCell(m)
      setCell((cur) => Math.max(cur, m))
    })
    ro.observe(c)
    return () => ro.disconnect()
  }, [])

  // Keep the keyboard cursor in view (just scrolls — the grid never moves).
  useLayoutEffect(() => {
    const c = scrollRef.current
    if (!c) return
    const m = cell
    const x = cursor.x * cell
    const y = cursor.y * cell
    if (x - m < c.scrollLeft) c.scrollLeft = x - m
    else if (x + cell + m > c.scrollLeft + c.clientWidth) c.scrollLeft = x + cell + m - c.clientWidth
    if (y - m < c.scrollTop) c.scrollTop = y - m
    else if (y + cell + m > c.scrollTop + c.clientHeight) c.scrollTop = y + cell + m - c.clientHeight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.x, cursor.y])

  // --- Hand error flash -------------------------------------------------
  // A brief red box around the hand: "you don't hold that tile." Bumping the nonce
  // remounts the overlay (keyed by it) so the flash replays even on a repeated miss —
  // e.g. mashing a letter you don't have.
  const flashHandError = useCallback(() => {
    setErrFlash(true)
    setErrNonce((n) => n + 1)
  }, [])
  useEffect(() => {
    if (!errFlash) return
    const id = setTimeout(() => setErrFlash(false), 180)
    return () => clearTimeout(id)
  }, [errFlash, errNonce])

  // --- Mutations (board-only; the hand re-derives) ----------------------
  // Placing a hand tile just fills a cell — the derived hand loses that letter
  // automatically. (No hand index needed: tiles are interchangeable by letter.)
  const handToBoard = useCallback((letter: string, x: number, y: number) => {
    setBoard((b) => setChar(b, idx(x, y), letter))
  }, [])
  const boardToBoard = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    setBoard((b) => {
      const letter = b[idx(x1, y1)]
      return setChar(setChar(b, idx(x1, y1), '.'), idx(x2, y2), letter)
    })
  }, [])
  // Returning a tile to the hand just empties its cell — the derived hand gains the
  // letter back.
  const boardToHand = useCallback((x: number, y: number) => {
    if (boardRef.current[idx(x, y)] === '.') return
    setBoard((b) => setChar(b, idx(x, y), '.'))
  }, [])

  // --- Drag plumbing (shared hook owns the window listeners) ------------
  const finishDrag = useCallback(
    (g: DragGesture<DragSource, Cell>, x: number, y: number) => {
      const target = cellAtPoint(x, y)
      if (target) {
        const occupied = boardRef.current[idx(target.x, target.y)] !== '.'
        const ownCell =
          g.source.kind === 'board' && g.source.x === target.x && g.source.y === target.y
        if (occupied && !ownCell) return // taken → snap back
        if (g.source.kind === 'hand' && g.letter) handToBoard(g.letter, target.x, target.y)
        else if (g.source.kind === 'board') boardToBoard(g.source.x, g.source.y, target.x, target.y)
        return
      }
      // Drop a tile on the dump slot → dump it (server swaps it for DUMP_COUNT; the live
      // `tiles` update re-derives the hand). Snap back if the bunch is too low to cover
      // the draw — the slot shows that state. A tile dragged off the BOARD is dumpable
      // too (it's a legal move): clear its cell first so `board` loses the letter in
      // lock-step with the server removing it from `tiles`. Without the clear, the
      // dumped letter would still sit on the board while `tiles` dropped it — the exact
      // board/holdings desync we want to avoid. (The derived hand briefly regains the
      // letter between the clear and the server's `tiles` update, ending
      // one-instance-lighter just like dumping a hand tile.) A dump draws from the
      // bunch, topping up from the box when short — so what it can draw is bunch + box.
      const drawable = bunchCount === undefined ? undefined : bunchCount + (boxCount ?? 0)
      const canDump = drawable === undefined || drawable >= DUMP_COUNT
      if (overDumpAtPoint(x, y) && g.letter && canDump) {
        if (g.source.kind === 'board') boardToHand(g.source.x, g.source.y)
        onDump?.(g.letter)
        return
      }
      if (overHandAtPoint(x, y) && g.source.kind === 'board') boardToHand(g.source.x, g.source.y)
    },
    [handToBoard, boardToBoard, boardToHand, onDump, bunchCount, boxCount],
  )

  // A plain tap on a board cell moves the keyboard cursor there.
  const onTap = useCallback((g: DragGesture<DragSource, Cell>) => {
    if (g.cell) setCursor({ x: g.cell.x, y: g.cell.y, dir: 'h' })
  }, [])

  const { drag, hover, start } = useDragGesture<DragSource, Cell>({
    dragClass: 'mg-dragging',
    cellAtPoint,
    onDrop: finishDrag,
    onTap,
    // Any dragged tile (hand or board) can be dumped; light the slot when one hovers
    // it, and clear that highlight once the drag ends.
    onDragMove: (x, y) => setDumpHot(overDumpAtPoint(x, y)),
    onDragEnd: () => setDumpHot(false),
  })

  const onCellPointerDown = useCallback(
    (x: number, y: number, e: ReactPointerEvent) => {
      if (frozenRef.current) return // conceded → board is frozen
      const letter = boardRef.current[idx(x, y)]
      start({ kind: 'board', x, y }, letter !== '.' ? letter : null, { x, y }, e)
    },
    [start],
  )
  const onHandPointerDown = useCallback(
    (index: number, letter: string, e: ReactPointerEvent) => {
      if (frozenRef.current) return // conceded → hand is frozen
      start({ kind: 'hand', index }, letter, null, e)
    },
    [start],
  )

  // --- Keyboard cursor --------------------------------------------------
  const advance = useCallback((cur: Cursor) => {
    setCursor({
      x: clamp(cur.x + (cur.dir === 'h' ? 1 : 0)),
      y: clamp(cur.y + (cur.dir === 'v' ? 1 : 0)),
      dir: cur.dir,
    })
  }, [])

  // Peel as a callable action (the button and the keyboard shortcut share it). Guarded
  // to exactly the button's enabled condition — every held tile placed (derived hand
  // empty), game live, no peel already in flight — read from live refs so the keyboard
  // path can't act on stale state. Flushes the board first so the server's `placed ==
  // tiles` check sees the latest placements.
  const doPeel = useCallback(async () => {
    if (!onPeel || isTerminal || isConceded || declaringRef.current) return
    if (deriveHand(tilesRef.current, boardRef.current).length !== 0) return
    setDeclaring(true)
    try {
      await db.rpc('save_player_board', { target_game: gameId, board: boardRef.current })
      // A blocked winning peel (legal-board check) hands back the offending cells; paint
      // them red against the board they were judged on. boardRef equals the saved board
      // here, and the board doesn't change on a peel — so the flags show until the
      // player's next edit moves `board` past it.
      const outcome = await onPeel()
      if (outcome && outcome.illegalCells.length > 0) {
        setInvalid({ board: boardRef.current, cells: new Set(outcome.illegalCells) })
      }
    } finally {
      setDeclaring(false)
    }
  }, [onPeel, isTerminal, isConceded, gameId])

  // Board-cursor keyboard — the shared 2-D placement engine (scrabble's twin; it owns
  // the modifier bail, the focused-input guard, arrows→cursor, and the skip-Enter/
  // Space-when-a-<button>-is-focused so a focused Peel button doesn't double-fire).
  // bananagrams supplies its 5%: EVERY cell is editable (typing over a filled cell swaps
  // its tile back to the hand — no "committed" tiles, unlike scrabble), Backspace
  // returns the tile under the cursor, and Enter/Space peels (`doPeel` self-no-ops when
  // a peel isn't legal). Disabled while conceded (the board freezes; others keep
  // racing).
  useBoardCursorKeys({
    enabled: !frozen,
    enterOnSpace: true,
    onEnter: () => void doPeel(),
    onArrow: (k) => setCursor(moveCursor(cursorRef.current, k, GRID - 1)),
    onBackspace: () => {
      const cur = cursorRef.current
      if (boardRef.current[idx(cur.x, cur.y)] !== '.') boardToHand(cur.x, cur.y)
      setCursor(stepBack(cur, GRID - 1))
    },
    onLetter: (letter) => {
      const cur = cursorRef.current
      const i = idx(cur.x, cur.y)
      // Typing on a FILLED cell swaps: clear it first (its tile re-derives back into the
      // hand), then ask "do I hold the typed letter?". On an empty cell that clear is a
      // no-op. Because the hand is DERIVED from the board, the one overwrite below does
      // both halves of the swap.
      const freed =
        boardRef.current[i] === '.' ? boardRef.current : setChar(boardRef.current, i, '.')
      if (!deriveHand(tilesRef.current, freed).includes(letter)) {
        flashHandError() // you don't hold that tile → red flash around the hand
        return
      }
      handToBoard(letter, cur.x, cur.y)
      advance(cur)
    },
  })

  // --- Center + fit -----------------------------------------------------
  const centerAndFit = useCallback(() => {
    const c = scrollRef.current
    if (!c) return
    const ext = tilesExtent(boardRef.current)
    if (!ext) {
      setCell(DEFAULT_CELL)
      requestAnimationFrame(() => {
        const el = scrollRef.current
        if (!el) return
        el.scrollLeft = (GRID / 2) * DEFAULT_CELL - el.clientWidth / 2
        el.scrollTop = (GRID / 2) * DEFAULT_CELL - el.clientHeight / 2
      })
      return
    }
    const h = ext.maxY - ext.minY + 1
    const w = ext.maxX - ext.minX + 1
    const top = Math.floor((GRID - h) / 2)
    const left = Math.floor((GRID - w) / 2)
    const dy = top - ext.minY
    const dx = left - ext.minX
    setBoard((b) => {
      const nb = new Array(GRID * GRID).fill('.')
      for (let y = 0; y < GRID; y++)
        for (let x = 0; x < GRID; x++) {
          const ch = b[idx(x, y)]
          if (ch !== '.') nb[idx(x + dx, y + dy)] = ch
        }
      return nb.join('')
    })
    // Tiles just moved under the cursor; reset it to center rather than leave it
    // pointing at a now-stale cell.
    setCursor(CENTER_CURSOR)

    const usedW = Math.min(GRID, w + 2 * FIT_MARGIN)
    const usedH = Math.min(GRID, h + 2 * FIT_MARGIN)
    const fit = Math.max(
      minCell,
      Math.min(MAX_CELL, Math.floor(Math.min(c.clientWidth / usedW, c.clientHeight / usedH))),
    )
    setCell(fit)
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      el.scrollLeft = (left + w / 2) * fit - el.clientWidth / 2
      el.scrollTop = (top + h / 2) * fit - el.clientHeight / 2
    })
  }, [minCell])

  // The red flags apply only while the board still matches the one the legal check ran
  // on; any edit moves `board` past it and they vanish (no effect).
  const invalidCells = invalid && invalid.board === board ? invalid.cells : NO_CELLS

  // The ⟲ rotate: a local view-only shuffle of the hand order.
  const onShuffle = () => setHandOrder(shuffleString(displayedHand))

  return {
    scrollRef,
    board,
    cell,
    minCell,
    cursor,
    hover,
    drag,
    invalidCells,
    onZoom,
    centerAndFit,
    onCellPointerDown,
    displayedHand,
    derivedHand,
    dumpHot,
    errFlash,
    errNonce,
    onHandPointerDown,
    onShuffle,
    declaring,
    doPeel,
  }
}
