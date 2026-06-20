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

const DRAG_THRESHOLD = 4 // px before a press becomes a drag (vs a click)
const AUTOSAVE_MS = 800 // debounce before snapshotting an edit
const FIT_MARGIN = 3 // cells of breathing room kept around the tiles on a fit
const DUMP_COUNT = 3 // tiles drawn per dump (server default; mirrored for the FE label/gate)

type Cell = { row: number; col: number }
type Cursor = Cell & { dir: 'h' | 'v' }
type DragSource = { kind: 'hand'; index: number } | { kind: 'board'; row: number; col: number }
type Drag = { letter: string; source: DragSource; x: number; y: number }
type Gesture = {
  cell: Cell | null
  letter: string | null
  source: DragSource
  startX: number
  startY: number
  started: boolean
}

function cellAtPoint(x: number, y: number): Cell | null {
  const el = document.elementFromPoint(x, y)
  const cell = el?.closest('[data-cell]') as HTMLElement | null
  if (!cell) return null
  return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
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
   *  win/terminal modal is driven from above by realtime). */
  onPeel?: () => void | Promise<void>
  /** Dump a hand tile (calls `dump`): swap it for DUMP_COUNT from the bunch.
   *  Fired by dropping a hand tile on the dump slot. */
  onDump?: (letter: string) => void | Promise<void>
  /** Tiles left in the shared bunch (from status.pool_remaining), or undefined
   *  before it's known. Shown next to Peel so players sense the endgame. */
  bunchCount?: number
}

export function PlayerBoard({ gameId, initialBoard, tiles, peers, isTerminal, onPeel, onDump, bunchCount }: Props) {
  const [board, setBoard] = useState(initialBoard)
  // A local shuffle order for the hand (the ⟲ button). null = use the canonical
  // derived order. Reconciled against the live hand each render, so it survives
  // placements / peels without going stale.
  const [handOrder, setHandOrder] = useState<string | null>(null)
  const [cell, setCell] = useState(DEFAULT_CELL) // zoom (px per cell)
  const [minCell, setMinCell] = useState(24) // smallest zoom = whole grid fits
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hover, setHover] = useState<Cell | null>(null)
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
  useEffect(() => {
    boardRef.current = board
    tilesRef.current = tiles
    cursorRef.current = cursor
  }, [board, tiles, cursor])

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
    const cr = ext ? (ext.minR + ext.maxR + 1) / 2 : GRID / 2
    const cc = ext ? (ext.minC + ext.maxC + 1) / 2 : GRID / 2
    c.scrollLeft = cc * cell - c.clientWidth / 2
    c.scrollTop = cr * cell - c.clientHeight / 2
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
    if (!cursor) return
    const c = scrollRef.current
    if (!c) return
    const m = cell
    const x = cursor.col * cell
    const y = cursor.row * cell
    if (x - m < c.scrollLeft) c.scrollLeft = x - m
    else if (x + cell + m > c.scrollLeft + c.clientWidth) c.scrollLeft = x + cell + m - c.clientWidth
    if (y - m < c.scrollTop) c.scrollTop = y - m
    else if (y + cell + m > c.scrollTop + c.clientHeight) c.scrollTop = y + cell + m - c.clientHeight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor?.row, cursor?.col])

  // --- Error flash ------------------------------------------------------
  const flashError = useCallback(() => {
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
  const handToBoard = useCallback((letter: string, r: number, c: number) => {
    setBoard((b) => setChar(b, idx(r, c), letter))
  }, [])
  const boardToBoard = useCallback((r1: number, c1: number, r2: number, c2: number) => {
    setBoard((b) => {
      const letter = b[idx(r1, c1)]
      return setChar(setChar(b, idx(r1, c1), '.'), idx(r2, c2), letter)
    })
  }, [])
  // Returning a tile to the hand just empties its cell — the derived hand gains
  // the letter back.
  const boardToHand = useCallback((r: number, c: number) => {
    if (boardRef.current[idx(r, c)] === '.') return
    setBoard((b) => setChar(b, idx(r, c), '.'))
  }, [])

  // --- Drag plumbing (always-on window listeners) -----------------------
  const gestureRef = useRef<Gesture | null>(null)

  const finishDrag = useCallback(
    (g: Gesture, x: number, y: number) => {
      const target = cellAtPoint(x, y)
      if (target) {
        const occupied = boardRef.current[idx(target.row, target.col)] !== '.'
        const ownCell =
          g.source.kind === 'board' && g.source.row === target.row && g.source.col === target.col
        if (occupied && !ownCell) return // taken → snap back
        if (g.source.kind === 'hand' && g.letter) handToBoard(g.letter, target.row, target.col)
        else if (g.source.kind === 'board') boardToBoard(g.source.row, g.source.col, target.row, target.col)
        return
      }
      // Drop a HAND tile on the dump slot → dump it (server swaps it for
      // DUMP_COUNT; the live `tiles` update re-derives the hand). Snap back if
      // the bunch is too low to cover the draw — the slot shows that state.
      const canDump = bunchCount === undefined || bunchCount >= DUMP_COUNT
      if (overDumpAtPoint(x, y) && g.source.kind === 'hand' && g.letter && canDump) {
        onDump?.(g.letter)
        return
      }
      if (overHandAtPoint(x, y) && g.source.kind === 'board') boardToHand(g.source.row, g.source.col)
    },
    [handToBoard, boardToBoard, boardToHand, onDump, bunchCount],
  )

  const onGestureMove = useCallback((e: PointerEvent) => {
    const g = gestureRef.current
    if (!g) return
    if (
      !g.started &&
      g.letter &&
      Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > DRAG_THRESHOLD
    ) {
      g.started = true
      document.body.classList.add('mg-dragging')
    }
    if (g.started && g.letter) {
      setDrag({ letter: g.letter, source: g.source, x: e.clientX, y: e.clientY })
      setHover(cellAtPoint(e.clientX, e.clientY))
      // Only HAND tiles dump; light the slot when one hovers it.
      setDumpHot(g.source.kind === 'hand' && overDumpAtPoint(e.clientX, e.clientY))
    }
  }, [])

  const onGestureUp = useCallback(
    (e: PointerEvent) => {
      const g = gestureRef.current
      if (!g) return
      gestureRef.current = null
      document.body.classList.remove('mg-dragging')
      if (g.started) {
        finishDrag(g, e.clientX, e.clientY)
        setDrag(null)
        setHover(null)
        setDumpHot(false)
      } else if (g.cell) {
        setCursor({ row: g.cell.row, col: g.cell.col, dir: 'h' })
      }
    },
    [finishDrag],
  )

  useEffect(() => {
    window.addEventListener('pointermove', onGestureMove)
    window.addEventListener('pointerup', onGestureUp)
    return () => {
      window.removeEventListener('pointermove', onGestureMove)
      window.removeEventListener('pointerup', onGestureUp)
    }
  }, [onGestureMove, onGestureUp])

  const onCellPointerDown = useCallback((r: number, c: number, e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const letter = boardRef.current[idx(r, c)]
    gestureRef.current = {
      cell: { row: r, col: c },
      letter: letter !== '.' ? letter : null,
      source: { kind: 'board', row: r, col: c },
      startX: e.clientX,
      startY: e.clientY,
      started: false,
    }
  }, [])
  const onHandPointerDown = useCallback((index: number, letter: string, e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    gestureRef.current = {
      cell: null,
      letter,
      source: { kind: 'hand', index },
      startX: e.clientX,
      startY: e.clientY,
      started: false,
    }
  }, [])

  // --- Keyboard cursor --------------------------------------------------
  const advance = useCallback((cur: Cursor) => {
    setCursor({
      row: clamp(cur.row + (cur.dir === 'v' ? 1 : 0)),
      col: clamp(cur.col + (cur.dir === 'h' ? 1 : 0)),
      dir: cur.dir,
    })
  }, [])

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const cur = cursorRef.current
      if (!cur) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const k = e.key

      if (k === 'Escape' || k === 'Enter') {
        e.preventDefault()
        setCursor(null)
        return
      }
      if (k === 'Backspace') {
        e.preventDefault()
        if (boardRef.current[idx(cur.row, cur.col)] !== '.') boardToHand(cur.row, cur.col)
        setCursor({
          row: clamp(cur.row - (cur.dir === 'v' ? 1 : 0)),
          col: clamp(cur.col - (cur.dir === 'h' ? 1 : 0)),
          dir: cur.dir,
        })
        return
      }
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault()
        const axis = k === 'ArrowLeft' || k === 'ArrowRight' ? 'h' : 'v'
        if (cur.dir !== axis) {
          setCursor({ row: cur.row, col: cur.col, dir: axis })
        } else {
          const dc = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0
          const dr = k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0
          setCursor({ row: clamp(cur.row + dr), col: clamp(cur.col + dc), dir: cur.dir })
        }
        return
      }
      if (k.length === 1 && /[a-z]/i.test(k)) {
        e.preventDefault()
        const letter = k.toUpperCase()
        const here = boardRef.current[idx(cur.row, cur.col)]
        if (here !== '.') {
          if (here === letter) advance(cur)
          else flashError()
          return
        }
        // Available iff the derived hand (held tiles − placed) still has one.
        if (!deriveHand(tilesRef.current, boardRef.current).includes(letter)) {
          flashError()
          return
        }
        handToBoard(letter, cur.row, cur.col)
        advance(cur)
      }
    },
    [advance, flashError, boardToHand, handToBoard],
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
    const h = ext.maxR - ext.minR + 1
    const w = ext.maxC - ext.minC + 1
    const top = Math.floor((GRID - h) / 2)
    const left = Math.floor((GRID - w) / 2)
    const dr = top - ext.minR
    const dc = left - ext.minC
    setBoard((b) => {
      const nb = new Array(GRID * GRID).fill('.')
      for (let r = 0; r < GRID; r++)
        for (let col = 0; col < GRID; col++) {
          const ch = b[idx(r, col)]
          if (ch !== '.') nb[idx(r + dr, col + dc)] = ch
        }
      return nb.join('')
    })
    setCursor(null)

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
  const cells: React.ReactNode[] = []
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const ch = board[idx(r, c)]
      const isHover = hover && hover.row === r && hover.col === c
      const lifting =
        drag && drag.source.kind === 'board' && drag.source.row === r && drag.source.col === c
      const blocked = isHover && ch !== '.' && !lifting
      const dropOk = isHover && !blocked
      const cursorHere = cursor && cursor.row === r && cursor.col === c
      cells.push(
        <div
          key={r * GRID + c}
          data-cell
          data-row={r}
          data-col={c}
          className={styles.cell + (dropOk ? ' ' + styles.dropOk : '') + (blocked ? ' ' + styles.dropNo : '')}
          onPointerDown={(e) => onCellPointerDown(r, c, e)}
        >
          {ch !== '.' && <div className={styles.tile + (lifting ? ' ' + styles.lifted : '')}>{ch}</div>}
          {cursorHere && (
            <div
              key={'cur-' + errNonce}
              className={
                styles.cursor +
                ' ' +
                (cursor.dir === 'h' ? styles.cursorH : styles.cursorV) +
                (errFlash ? ' ' + styles.cursorError : '')
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
              fontSize: cell * 0.5,
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
        {/* Dump slot: drop a hand tile here to swap it for DUMP_COUNT. Lights up
         *  while a hand tile is dragged; dims when the bunch can't cover it. */}
        {onDump && !isTerminal && (() => {
          const tooLow = bunchCount !== undefined && bunchCount < DUMP_COUNT
          return (
            <div
              data-zone="dump"
              className={
                styles.dump +
                (drag?.source.kind === 'hand' && !tooLow ? ' ' + styles.dumpArmed : '') +
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
              onClick={async () => {
                setDeclaring(true)
                try {
                  await db.rpc('save_player_board', {
                    target_game: gameId,
                    board: boardRef.current,
                  })
                  await onPeel()
                } finally {
                  setDeclaring(false)
                }
              }}
            >
              {isTerminal
                ? 'Game over'
                : derivedHand.length === 0
                  ? 'Peel! 🍌'
                  : 'Place all your tiles'}
            </button>
            {bunchCount !== undefined && !isTerminal && (
              <span className={styles.bunch} title="Tiles left in the bunch">
                🍌 {bunchCount} in bunch
              </span>
            )}
          </div>
        )}
      </div>

      {drag && (
        <div
          className={styles.ghost}
          style={{ left: drag.x, top: drag.y, width: cell, height: cell, fontSize: cell * 0.5 }}
        >
          {drag.letter}
        </div>
      )}
    </div>
  )
}
