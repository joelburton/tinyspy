import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { db } from '../db'
import {
  GRID,
  DEFAULT_CELL,
  MAX_CELL,
  idx,
  clamp,
  setChar,
  removeCharAt,
  tilesExtent,
} from '../lib/board'
import type { MonkeyGramBoardState } from '../hooks/useGame'
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
 * **Persistence.** Owns the live board (`board` + `hand` strings, seeded from
 * `initialState`) and snapshots to `monkeygram.save_player_board` on a debounce
 * AND on unmount — the unmount save is load-bearing because `PauseBoundary`
 * unmounts the play area on pause (docs/games/monkeygram.md → "Persistence").
 */

const DRAG_THRESHOLD = 4 // px before a press becomes a drag (vs a click)
const AUTOSAVE_MS = 800 // debounce before snapshotting an edit
const FIT_MARGIN = 3 // cells of breathing room kept around the tiles on a fit

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

type Props = { gameId: string; initialState: MonkeyGramBoardState }

export function PlayerBoard({ gameId, initialState }: Props) {
  const [board, setBoard] = useState(initialState.board)
  const [hand, setHand] = useState(initialState.hand)
  const [cell, setCell] = useState(DEFAULT_CELL) // zoom (px per cell)
  const [minCell, setMinCell] = useState(24) // smallest zoom = whole grid fits
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [errFlash, setErrFlash] = useState(false)
  const [errNonce, setErrNonce] = useState(0)

  // Refs mirror state for the always-on pointer/key handlers (synced in an
  // effect, never written during render).
  const boardRef = useRef(board)
  const handRef = useRef(hand)
  const cursorRef = useRef(cursor)
  useEffect(() => {
    boardRef.current = board
    handRef.current = hand
    cursorRef.current = cursor
  }, [board, hand, cursor])

  const scrollRef = useRef<HTMLDivElement>(null)

  // --- Persistence: debounced autosave + save-on-unmount ----------------
  const save = useCallback(() => {
    void db.rpc('save_player_board', {
      target_game: gameId,
      state: { board: boardRef.current, hand: handRef.current },
    })
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
  }, [board, hand, save])
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

  // --- Mutations --------------------------------------------------------
  const handToBoard = useCallback((handIndex: number, letter: string, r: number, c: number) => {
    setBoard((b) => setChar(b, idx(r, c), letter))
    setHand((h) => removeCharAt(h, handIndex))
  }, [])
  const boardToBoard = useCallback((r1: number, c1: number, r2: number, c2: number) => {
    setBoard((b) => {
      const letter = b[idx(r1, c1)]
      return setChar(setChar(b, idx(r1, c1), '.'), idx(r2, c2), letter)
    })
  }, [])
  const boardToHand = useCallback((r: number, c: number) => {
    const letter = boardRef.current[idx(r, c)]
    if (letter === '.') return
    setBoard((b) => setChar(b, idx(r, c), '.'))
    setHand((h) => h + letter)
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
        if (g.source.kind === 'hand' && g.letter) handToBoard(g.source.index, g.letter, target.row, target.col)
        else if (g.source.kind === 'board') boardToBoard(g.source.row, g.source.col, target.row, target.col)
        return
      }
      if (overHandAtPoint(x, y) && g.source.kind === 'board') boardToHand(g.source.row, g.source.col)
    },
    [handToBoard, boardToBoard, boardToHand],
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
        const i = handRef.current.indexOf(letter)
        if (i < 0) {
          flashError()
          return
        }
        handToBoard(i, letter, cur.row, cur.col)
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

      <div className={styles.hand} data-zone="hand">
        {hand.split('').map((letter, i) => (
          <div
            key={i}
            className={styles.handTile + (drag && drag.source.kind === 'hand' && drag.source.index === i ? ' ' + styles.lifted : '')}
            onPointerDown={(e) => onHandPointerDown(i, letter, e)}
          >
            {letter}
          </div>
        ))}
        {hand.length === 0 && <span className={styles.handEmpty}>all tiles placed!</span>}
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
