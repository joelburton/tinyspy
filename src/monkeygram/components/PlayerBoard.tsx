import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { ShuffleButton } from '../../common/components/ShuffleButton'
import { useDragGesture, type DragGesture } from '../../common/hooks/useDragGesture'
import { moveCursor, stepBack } from '../../common/lib/gridCursor'
import styles from './PlayerBoard.module.css'

/**
 * The interactive player board — a FIXED 25×25 arena (see lib/board.ts).
 *
 * You navigate with the **zoom** slider + scrollbars; the grid never resizes,
 * so placing a tile never shifts the view — that's what keeps this simple (no
 * view box, no growth, no scroll compensation). **Center + fit** shifts your
 * tiles to the middle of the arena and zooms to frame them.
 *
 * Two ways to place: DRAG from the hand / around the board, or click a cell and
 * type (the crossword cursor). Bounds are clamped to `[0, 24]`.
 *
 * **Board vs hand.** This component owns only the `board` (seeded once from
 * `initialBoard`); the HAND is derived from the server-owned `tiles` prop as
 * `deriveHand(tiles, board)`. So every mutation here writes the board ONLY —
 * placing a tile fills a cell, and the hand shrinks by re-derivation; a peel/
 * dump grows `tiles` upstream and the hand grows by re-derivation. A local
 * shuffle order (the ⟲ button) is layered on with `reconcileHandOrder`.
 *
 * **Persistence.** Snapshots the board to `monkeygram.save_player_board` on a
 * debounce AND on unmount — the unmount save is load-bearing because
 * `PauseBoundary` unmounts the play area on pause (docs/games/monkeygram.md →
 * "Persistence"). `tiles` is server-owned and never saved from here.
 */

const AUTOSAVE_MS = 800 // debounce before snapshotting an edit
const FIT_MARGIN = 3 // cells of breathing room kept around the tiles on a fit
const DUMP_COUNT = 3 // tiles drawn per dump (server default; mirrored for the FE label/gate)
// Tile letter size as a fraction of the cell (px). A touch larger than half
// the tile so the letter stays legible when the board is zoomed out — the tile
// shrinks with zoom, the letter keeps a bit more of it.
const LETTER_SCALE = 0.6
// Stable empty set for "no red flags" — a fresh `new Set()` each render would
// be a new reference and defeat memoization downstream.
const NO_CELLS: ReadonlySet<number> = new Set()

type Cell = { x: number; y: number }
type Cursor = Cell & { dir: 'h' | 'v' }

// The board cursor is always present during play (you can type the
// moment the board loads). It starts dead center — Bananagrams builds
// outward from the middle — and is reset there after a recenter.
const CENTER_CURSOR: Cursor = { x: Math.floor(GRID / 2), y: Math.floor(GRID / 2), dir: 'h' }
type DragSource = { kind: 'hand'; index: number } | { kind: 'board'; x: number; y: number }

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

type Props = {
  gameId: string
  /** The FE-owned placement grid at load — seeds local board state ONCE. */
  initialBoard: string
  /** Server-owned holdings (everything the player holds). LIVE: a peel/dump
   *  changes it upstream and the derived hand follows. The board is never part
   *  of it; the hand the player sees is `deriveHand(tiles, board)`. */
  tiles: string
  /** Opponents' tiles-left strip, slotted above the hand (null in solo). */
  peers?: React.ReactNode
  /** True once the game is over — disables the Peel button (the race is run). */
  isTerminal?: boolean
  /** Peel (calls `peel`). Enabled only when the hand is empty; draws a tile for
   *  everyone, or — if the bunch can't refill the table — wins the game (the
   *  win/terminal modal is driven from above by realtime). Resolves to
   *  `{ illegalCells }` when a winning peel was BLOCKED by the legal-board
   *  check (those board cells get painted red); `null` otherwise. */
  onPeel?: () => Promise<{ illegalCells: number[] } | null>
  /** Dump a tile (calls `dump`): swap it for DUMP_COUNT from the bunch.
   *  Fired by dropping a tile on the dump slot — from the hand, or off the
   *  board (the caller clears the board cell so holdings stay consistent). */
  onDump?: (letter: string) => void | Promise<void>
  /** Tiles left in the shared bunch (from status.pool_remaining), or undefined
   *  before it's known. Shown next to Peel so players sense the endgame. */
  bunchCount?: number
  /** Tiles in the out-of-play box (status.box_remaining) — only nonzero in
   *  dump-to-box games. Shown muted next to the bunch count, and counts toward
   *  what a dump can draw (the bunch tops up from the box when it's short). */
  boxCount?: number
}

export function PlayerBoard({ gameId, initialBoard, tiles, peers, isTerminal, onPeel, onDump, bunchCount, boxCount }: Props) {
  const [board, setBoard] = useState(initialBoard)
  // A local shuffle order for the hand (the ⟲ button). null = use the canonical
  // derived order. Reconciled against the live hand each render, so it survives
  // placements / peels without going stale.
  const [handOrder, setHandOrder] = useState<string | null>(null)
  const [cell, setCell] = useState(DEFAULT_CELL) // zoom (px per cell)
  const [minCell, setMinCell] = useState(24) // smallest zoom = whole grid fits
  const [cursor, setCursor] = useState<Cursor>(CENTER_CURSOR)
  // Board cells flagged illegal by a blocked winning peel (disconnected, or —
  // with check_words on — in an invalid word):
  // tiles in an invalid word or split off the main mass. Stored WITH the board
  // they were computed against, so any edit (which changes `board`) makes them
  // stop matching in render — they clear themselves, no effect needed.
  const [invalid, setInvalid] = useState<{
    board: string
    cells: ReadonlySet<number>
  } | null>(null)
  const [dumpHot, setDumpHot] = useState(false) // a hand tile is hovering the dump slot
  const [errFlash, setErrFlash] = useState(false)
  const [errNonce, setErrNonce] = useState(0)
  const [declaring, setDeclaring] = useState(false) // Done click in flight

  // The derived hand: held tiles minus what's on the board. `displayedHand`
  // applies the local shuffle order on top (reconciled so it never drifts from
  // the canonical multiset).
  const derivedHand = deriveHand(tiles, board)
  const displayedHand = handOrder !== null ? reconcileHandOrder(handOrder, derivedHand) : derivedHand

  // Refs mirror state for the always-on pointer/key handlers (synced in an
  // effect, never written during render). `tilesRef` lets the keyboard handler
  // check tile availability against the live holdings.
  const boardRef = useRef(board)
  const tilesRef = useRef(tiles)
  const cursorRef = useRef(cursor)
  const declaringRef = useRef(declaring) // lets the peel shortcut see an in-flight peel
  useEffect(() => {
    boardRef.current = board
    tilesRef.current = tiles
    cursorRef.current = cursor
    declaringRef.current = declaring
  }, [board, tiles, cursor, declaring])

  const scrollRef = useRef<HTMLDivElement>(null)

  // --- Persistence: debounced autosave + save-on-unmount ----------------
  const save = useCallback(() => {
    // The PostgREST builder is LAZY — it only sends the request once `.then()`
    // is called, so we must invoke it (not just `void` it). Fire-and-forget:
    // a failed snapshot just means a stale save, so swallow errors. Only the
    // board is sent; `tiles` is server-owned.
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
  function onZoom(next: number) {
    const c = scrollRef.current
    if (c) {
      zoomAnchor.current = {
        cx: (c.scrollLeft + c.clientWidth / 2) / cell,
        cy: (c.scrollTop + c.clientHeight / 2) / cell,
      }
    }
    setCell(next)
  }
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

  // The smallest zoom shows the WHOLE grid and no more: min cell = the board
  // area's binding dimension / GRID. Measured on mount + resize.
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
  // A brief red box around the hand: "you don't hold that tile." Bumping the
  // nonce remounts the overlay (keyed by it) so the flash replays even on a
  // repeated miss — e.g. mashing a letter you don't have.
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
  // Returning a tile to the hand just empties its cell — the derived hand gains
  // the letter back.
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
      // Drop a tile on the dump slot → dump it (server swaps it for
      // DUMP_COUNT; the live `tiles` update re-derives the hand). Snap back if
      // the bunch is too low to cover the draw — the slot shows that state.
      // A tile dragged off the BOARD is dumpable too (it's a legal move): clear
      // its cell first so `board` loses the letter in lock-step with the
      // server removing it from `tiles`. Without the clear, the dumped letter
      // would still sit on the board while `tiles` dropped it — the exact
      // board/holdings desync we want to avoid. (The derived hand briefly
      // regains the letter between the clear and the server's `tiles` update,
      // ending one-instance-lighter just like dumping a hand tile.)
      // A dump draws from the bunch, topping up from the box when short — so
      // what it can draw is bunch + box.
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
    // Any dragged tile (hand or board) can be dumped; light the slot when one
    // hovers it, and clear that highlight once the drag ends.
    onDragMove: (x, y) => setDumpHot(overDumpAtPoint(x, y)),
    onDragEnd: () => setDumpHot(false),
  })

  const onCellPointerDown = useCallback(
    (x: number, y: number, e: React.PointerEvent) => {
      const letter = boardRef.current[idx(x, y)]
      start({ kind: 'board', x, y }, letter !== '.' ? letter : null, { x, y }, e)
    },
    [start],
  )
  const onHandPointerDown = useCallback(
    (index: number, letter: string, e: React.PointerEvent) => {
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

  // Peel as a callable action (the button and the keyboard shortcut share it).
  // Guarded to exactly the button's enabled condition — every held tile placed
  // (derived hand empty), game live, no peel already in flight — read from live
  // refs so the keyboard path can't act on stale state. Flushes the board first
  // so the server's `placed == tiles` check sees the latest placements.
  const doPeel = useCallback(async () => {
    if (!onPeel || isTerminal || declaringRef.current) return
    if (deriveHand(tilesRef.current, boardRef.current).length !== 0) return
    setDeclaring(true)
    try {
      await db.rpc('save_player_board', { target_game: gameId, board: boardRef.current })
      // A blocked winning peel (legal-board check) hands back the offending
      // cells; paint them red against the board they were judged on. boardRef
      // equals the saved board here, and the board doesn't change on a peel —
      // so the flags show until the player's next edit moves `board` past it.
      const outcome = await onPeel()
      if (outcome && outcome.illegalCells.length > 0) {
        setInvalid({ board: boardRef.current, cells: new Set(outcome.illegalCells) })
      }
    } finally {
      setDeclaring(false)
    }
  }, [onPeel, isTerminal, gameId])

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const k = e.key

      // Enter / Space → peel (when legal), with or without an active board
      // cursor — "my hand's empty, draw again" is the move you reach for most,
      // so it shouldn't require a click. Skip when a <button> is focused so we
      // don't double-fire alongside its native Space/Enter activation; doPeel
      // itself no-ops when a peel isn't legal right now.
      if (k === 'Enter' || k === ' ') {
        if (t && t.tagName === 'BUTTON') return
        e.preventDefault()
        void doPeel()
        return
      }

      const cur = cursorRef.current

      if (k === 'Backspace') {
        e.preventDefault()
        if (boardRef.current[idx(cur.x, cur.y)] !== '.') boardToHand(cur.x, cur.y)
        setCursor(stepBack(cur, GRID - 1))
        return
      }
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault()
        setCursor(moveCursor(cur, k, GRID - 1))
        return
      }
      if (k.length === 1 && /[a-z]/i.test(k)) {
        e.preventDefault()
        const letter = k.toUpperCase()
        const i = idx(cur.x, cur.y)
        // Typing on a FILLED cell swaps: the tile under the cursor returns to
        // the hand and the typed letter takes its place. So the hand we can
        // place FROM is the held tiles minus everything placed EXCEPT this
        // cell — clear it first, then ask "do I hold the typed letter?". (On
        // an empty cell that clear is a no-op, so this collapses to the plain
        // check.) Because the hand is DERIVED from the board, the single
        // overwrite below does BOTH halves of the swap: the old letter
        // re-derives back into the hand, the typed letter leaves it. (Typing
        // a letter over its own twin is a harmless no-op for the same reason.)
        const freed =
          boardRef.current[i] === '.'
            ? boardRef.current
            : setChar(boardRef.current, i, '.')
        if (!deriveHand(tilesRef.current, freed).includes(letter)) {
          flashHandError() // you don't hold that tile → red flash around the hand
          return
        }
        handToBoard(letter, cur.x, cur.y)
        advance(cur)
      }
    },
    [advance, flashHandError, boardToHand, handToBoard, doPeel],
  )
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown])

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
    // Tiles just moved under the cursor; reset it to center rather than
    // leave it pointing at a now-stale cell.
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

  // --- Render -----------------------------------------------------------
  // The red flags apply only while the board still matches the one the legal
  // check ran on; any edit moves `board` past it and they vanish (no effect).
  const invalidCells = invalid && invalid.board === board ? invalid.cells : NO_CELLS
  const cells: React.ReactNode[] = []
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const ch = board[idx(x, y)]
      const isHover = hover && hover.x === x && hover.y === y
      const lifting =
        drag && drag.source.kind === 'board' && drag.source.x === x && drag.source.y === y
      const blocked = isHover && ch !== '.' && !lifting
      const dropOk = isHover && !blocked
      const cursorHere = cursor.x === x && cursor.y === y
      cells.push(
        <div
          key={y * GRID + x}
          data-cell
          data-x={x}
          data-y={y}
          className={styles.cell + (dropOk ? ' ' + styles.dropOk : '') + (blocked ? ' ' + styles.dropNo : '')}
          onPointerDown={(e) => onCellPointerDown(x, y, e)}
        >
          {ch !== '.' && (
            <div
              className={
                styles.tile +
                (lifting ? ' ' + styles.lifted : '') +
                (invalidCells.has(idx(x, y)) ? ' ' + styles.tileInvalid : '')
              }
            >
              {ch}
            </div>
          )}
          {cursorHere && (
            <div
              className={
                styles.cursor +
                ' ' +
                (cursor.dir === 'h' ? styles.cursorH : styles.cursorV)
              }
            />
          )}
        </div>,
      )
    }
  }

  return (
    <div className={styles.layout}>
      <div className={styles.boardCol}>
        <div className={styles.boardScroll} ref={scrollRef}>
          <div
            className={styles.grid}
            style={{
              gridTemplateColumns: `repeat(${GRID}, ${cell}px)`,
              gridTemplateRows: `repeat(${GRID}, ${cell}px)`,
              width: GRID * cell,
              height: GRID * cell,
              fontSize: cell * LETTER_SCALE,
            }}
          >
            {cells}
          </div>
        </div>
        {/* Floating controls over the board's top-right corner. */}
        <div className={styles.controls}>
          <input
            type="range"
            className={styles.zoom}
            min={minCell}
            max={MAX_CELL}
            value={cell}
            onChange={(e) => onZoom(Number(e.target.value))}
            aria-label="Zoom"
            title="Zoom"
          />
          <button
            type="button"
            className={styles.fitBtn}
            onClick={centerAndFit}
            title="Center + fit"
            aria-label="Center and fit"
          >
            ◎
          </button>
        </div>
      </div>

      <div className={styles.rightCol}>
        {peers}
        <div className={styles.handHeader}>
          <span className={styles.handLabel}>Hand</span>
          <ShuffleButton
            onShuffle={() => setHandOrder(shuffleString(displayedHand))}
            disabled={displayedHand.length === 0}
            label="Shuffle hand"
          />
        </div>
        <div className={styles.hand} data-zone="hand">
          {/* Red box flash: "you don't hold that tile" (a keyboard miss).
              Keyed by the nonce so a repeated miss replays the animation;
              pointer-events:none so it never blocks tile drags. */}
          {errFlash && (
            <div key={errNonce} className={styles.handError} aria-hidden />
          )}
          {displayedHand.split('').map((letter, i) => (
            <div
              key={i}
              data-hand-tile
              className={styles.handTile + (drag && drag.source.kind === 'hand' && drag.source.index === i ? ' ' + styles.lifted : '')}
              onPointerDown={(e) => onHandPointerDown(i, letter, e)}
            >
              {letter}
            </div>
          ))}
          {displayedHand.length === 0 && <span className={styles.handEmpty}>all tiles placed!</span>}
        </div>
        {/* Dump slot: drop a tile here (from the hand OR the board) to swap it
         *  for DUMP_COUNT. Lights up while any tile is dragged; dims when the
         *  bunch can't cover the draw. */}
        {onDump && !isTerminal && (() => {
          // A dump draws from the bunch + box together (see finishDrag).
          const drawable = bunchCount === undefined ? undefined : bunchCount + (boxCount ?? 0)
          const tooLow = drawable !== undefined && drawable < DUMP_COUNT
          return (
            <div
              data-zone="dump"
              className={
                styles.dump +
                (drag && !tooLow ? ' ' + styles.dumpArmed : '') +
                (dumpHot ? ' ' + styles.dumpHot : '') +
                (tooLow ? ' ' + styles.dumpDisabled : '')
              }
            >
              {tooLow ? '♻️ bunch too low to dump' : `♻️ drag a tile here to dump (1 → ${DUMP_COUNT})`}
            </div>
          )
        })()}
        {/* The draw/win move: enabled only once the hand is empty. We FLUSH the
         *  board first so peel's "placed == tiles" check sees the latest
         *  placements; if the bunch is dry this wins, and the terminal modal is
         *  driven from above by realtime, not by this click. */}
        {onPeel && (
          <div className={styles.peelRow}>
            <button
              type="button"
              className={styles.doneBtn}
              disabled={derivedHand.length !== 0 || isTerminal || declaring}
              onClick={() => void doPeel()}
            >
              {isTerminal
                ? 'Game over'
                : derivedHand.length === 0
                  ? 'Peel! 🍌'
                  : 'Place all your tiles'}
            </button>
            {bunchCount !== undefined && !isTerminal && (
              <span className={styles.bunch} title="Tiles left in the bunch">
                🍌 <span className={styles.bunchNum}>{bunchCount}</span> in bunch
                {boxCount !== undefined && boxCount > 0 && (
                  <span className={styles.box}> ({boxCount} in box)</span>
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {drag && (
        <div
          className={styles.ghost}
          style={{ left: drag.x, top: drag.y, width: cell, height: cell, fontSize: cell * LETTER_SCALE }}
        >
          {drag.letter}
        </div>
      )}
    </div>
  )
}
