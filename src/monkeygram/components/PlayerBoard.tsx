import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { db } from '../db'
import { CANVAS_PAD, CELL, computeWindow } from '../lib/board'
import type {
  MonkeyGramBoardState,
  MonkeyGramPlacement,
  MonkeyGramTile,
} from '../hooks/useGame'
import styles from './PlayerBoard.module.css'

/**
 * The interactive player board — ported from the `monkeygram-ui/`
 * prototype (`src/App.jsx` + `src/board.js`) into the real app.
 *
 * Two ways to build (they coexist):
 *   1. DRAG tiles from the hand / around the board (hand-rolled pointer
 *      events with a click-vs-drag threshold).
 *   2. A crossword-style KEYBOARD CURSOR: click a cell (starts
 *      horizontal), type letters to place from the hand, ←↑→↓ to move /
 *      flip direction, Backspace to step back / unplace, Esc to dismiss.
 *      See `onKeyDown` and docs/games/monkeygram.md → "Keyboard input".
 *
 * The board's "intelligence" is the layout deriver in `lib/board.ts`:
 * the window is recomputed every render from the sparse placements, so
 * "recenter and grow" is a derivation, not stateful logic.
 *
 * **Persistence.** This component OWNS the live board as local state
 * (seeded once from `initialBoard`) and snapshots it to
 * `monkeygram.save_player_board` on a debounce AND on unmount. The
 * unmount save is load-bearing: `PauseBoundary` unmounts the play area
 * on pause, so without it an un-saved board would be lost. See
 * docs/games/monkeygram.md → "Persistence".
 */

const DRAG_THRESHOLD = 4 // px before a press becomes a drag (vs a click)
const AUTOSAVE_MS = 800 // debounce before snapshotting an edit

type Cell = { row: number; col: number }
type Cursor = Cell & { dir: 'h' | 'v' }
type DragSource = { kind: 'hand' } | { kind: 'board'; row: number; col: number }
type Drag = { tile: MonkeyGramTile; source: DragSource; x: number; y: number }
type Gesture = {
  cell: Cell | null
  tile: MonkeyGramTile | null
  source: DragSource | null
  startX: number
  startY: number
  started: boolean
}

// Hit-test helpers — the dragged ghost has pointer-events:none, so
// elementFromPoint sees the cells / hand beneath it.
function cellAtPoint(x: number, y: number): Cell | null {
  const el = document.elementFromPoint(x, y)
  const cell = el?.closest('[data-cell]') as HTMLElement | null
  if (!cell) return null
  return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
}
function overHandAtPoint(x: number, y: number): boolean {
  return !!document.elementFromPoint(x, y)?.closest('[data-zone="hand"]')
}

type Props = { gameId: string; initialBoard: MonkeyGramBoardState }

export function PlayerBoard({ gameId, initialBoard }: Props) {
  const [placements, setPlacements] = useState<MonkeyGramPlacement[]>(
    initialBoard.placements,
  )
  const [hand, setHand] = useState<MonkeyGramTile[]>(initialBoard.hand)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [errFlash, setErrFlash] = useState(false)
  const [errNonce, setErrNonce] = useState(0)

  // Refs mirror state so the always-on pointer/key handlers read the
  // latest without being re-subscribed on every change. Synced in an
  // effect (not during render) — handlers fire after commit, so they
  // always see the latest committed value.
  const placementsRef = useRef(placements)
  const handRef = useRef(hand)
  const cursorRef = useRef(cursor)
  useEffect(() => {
    placementsRef.current = placements
    handRef.current = hand
    cursorRef.current = cursor
  }, [placements, hand, cursor])

  const win = useMemo(
    () => computeWindow(placements, cursor ? { row: cursor.row, col: cursor.col } : null),
    [placements, cursor],
  )
  const occupied = useMemo(() => {
    const m = new Map<string, MonkeyGramPlacement>()
    for (const p of placements) m.set(p.row + ',' + p.col, p)
    return m
  }, [placements])

  const scrollRef = useRef<HTMLDivElement>(null)
  const prevWin = useRef<{ top: number; left: number } | null>(null)

  // --- Persistence: debounced autosave + save-on-unmount -----------------
  const stateRef = useRef<MonkeyGramBoardState>({ placements, hand })
  useEffect(() => {
    stateRef.current = { placements, hand }
  }, [placements, hand])
  const saveTimer = useRef(0)
  const save = useCallback(() => {
    void db.rpc('save_player_board', {
      target_game: gameId,
      state: stateRef.current,
    })
  }, [gameId])

  const firstSave = useRef(true)
  useEffect(
    function debouncedAutosave() {
      // Skip the seed render — the loaded board is already persisted.
      if (firstSave.current) {
        firstSave.current = false
        return
      }
      clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(save, AUTOSAVE_MS)
      return () => clearTimeout(saveTimer.current)
    },
    [placements, hand, save],
  )
  useEffect(
    function saveOnUnmount() {
      return () => {
        clearTimeout(saveTimer.current)
        save() // flush the latest state before the component goes away
      }
    },
    [save],
  )

  // --- Scroll-anchored growth -------------------------------------------
  // When the window grows up/left, existing tiles shift down/right; bump
  // scroll by the same number of cells, before paint, so what the user is
  // looking at stays visually pinned.
  useLayoutEffect(() => {
    const c = scrollRef.current
    if (!c) return
    const prev = prevWin.current
    if (prev) {
      const dTop = prev.top - win.top
      const dLeft = prev.left - win.left
      if (dTop) c.scrollTop += dTop * CELL
      if (dLeft) c.scrollLeft += dLeft * CELL
    }
    prevWin.current = { top: win.top, left: win.left }
  }, [win.top, win.left])

  // Keep the keyboard cursor visible WITHOUT shifting on every keystroke.
  // We only scroll when the cursor actually reaches the viewport edge, and
  // then reveal a generous chunk ahead (LEAD) so it won't re-trigger for many
  // more cells — short words near the middle never move the board at all, and
  // a long word scrolls in occasional pages rather than nudging every letter.
  // Runs after the anchor effect, so for cursor moves it wins.
  useLayoutEffect(() => {
    if (!cursor) return
    const c = scrollRef.current
    if (!c) return
    const x = CANVAS_PAD + (cursor.col - win.left) * CELL
    const y = CANVAS_PAD + (cursor.row - win.top) * CELL
    const trigger = CELL * 0.75 // scroll just before the cell is cut off
    const LEAD = 0.65 // viewport fraction to keep on the side we move toward
    if (x - trigger < c.scrollLeft) {
      c.scrollLeft = x + CELL - c.clientWidth * LEAD
    } else if (x + CELL + trigger > c.scrollLeft + c.clientWidth) {
      c.scrollLeft = x - c.clientWidth * (1 - LEAD)
    }
    if (y - trigger < c.scrollTop) {
      c.scrollTop = y + CELL - c.clientHeight * LEAD
    } else if (y + CELL + trigger > c.scrollTop + c.clientHeight) {
      c.scrollTop = y - c.clientHeight * (1 - LEAD)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor?.row, cursor?.col])

  const recenter = useCallback(() => {
    const c = scrollRef.current
    if (!c) return
    const w = computeWindow(placementsRef.current)
    const cr = w.extent ? (w.extent.minR + w.extent.maxR) / 2 : w.top + w.rows / 2 - 0.5
    const cc = w.extent ? (w.extent.minC + w.extent.maxC) / 2 : w.left + w.cols / 2 - 0.5
    c.scrollLeft = CANVAS_PAD + (cc - w.left + 0.5) * CELL - c.clientWidth / 2
    c.scrollTop = CANVAS_PAD + (cr - w.top + 0.5) * CELL - c.clientHeight / 2
  }, [])

  // Center on mount (layout effect, so the centered scroll is set before
  // paint — no first-frame flash of the empty canvas corner).
  useLayoutEffect(() => {
    recenter()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Drag plumbing (click-vs-drag) -------------------------------------
  const gestureRef = useRef<Gesture | null>(null)

  const finishDrag = useCallback((tile: MonkeyGramTile, source: DragSource, x: number, y: number) => {
    const cell = cellAtPoint(x, y)
    if (cell) {
      const occupant = placementsRef.current.find((p) => p.row === cell.row && p.col === cell.col)
      const ownCell = source.kind === 'board' && source.row === cell.row && source.col === cell.col
      if (occupant && !ownCell) return // cell taken by another tile → snap back
      setHand((h) => h.filter((t) => t.id !== tile.id))
      setPlacements((ps) => [
        ...ps.filter((p) => p.id !== tile.id),
        { id: tile.id, letter: tile.letter, row: cell.row, col: cell.col },
      ])
      return
    }
    if (overHandAtPoint(x, y)) {
      setPlacements((ps) => ps.filter((p) => p.id !== tile.id))
      setHand((h) => (h.some((t) => t.id === tile.id) ? h : [...h, { id: tile.id, letter: tile.letter }]))
    }
    // else dropped in the void → snap back (no state change)
  }, [])

  // The move/up handlers listen on window for the whole mount and act
  // only while a gesture is in flight (gestureRef set by a pointerdown).
  // Always-on (rather than add/remove per gesture) keeps the handlers
  // free of self-reference and the listener bookkeeping in one effect.
  const onGestureMove = useCallback((e: PointerEvent) => {
    const g = gestureRef.current
    if (!g) return
    if (
      !g.started &&
      g.tile &&
      Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > DRAG_THRESHOLD
    ) {
      g.started = true
      document.body.classList.add('mg-dragging')
    }
    if (g.started && g.tile && g.source) {
      setDrag({ tile: g.tile, source: g.source, x: e.clientX, y: e.clientY })
      setHover(cellAtPoint(e.clientX, e.clientY))
    }
  }, [])

  const onGestureUp = useCallback(
    (e: PointerEvent) => {
      const g = gestureRef.current
      if (!g) return
      gestureRef.current = null
      document.body.classList.remove('mg-dragging')
      if (g.started && g.tile && g.source) {
        finishDrag(g.tile, g.source, e.clientX, e.clientY)
        setDrag(null)
        setHover(null)
      } else if (g.cell) {
        // A click on a board cell drops the keyboard cursor there,
        // horizontal by default (arrows flip it).
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

  const onCellPointerDown = useCallback(
    (row: number, col: number, p: MonkeyGramPlacement | undefined, e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      gestureRef.current = {
        cell: { row, col },
        tile: p ? { id: p.id, letter: p.letter } : null,
        source: p ? { kind: 'board', row, col } : null,
        startX: e.clientX,
        startY: e.clientY,
        started: false,
      }
    },
    [],
  )

  const onHandPointerDown = useCallback((t: MonkeyGramTile, e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    gestureRef.current = {
      cell: null, // hand tiles don't set a cursor
      tile: { id: t.id, letter: t.letter },
      source: { kind: 'hand' },
      startX: e.clientX,
      startY: e.clientY,
      started: false,
    }
  }, [])

  // --- Keyboard cursor ---------------------------------------------------
  const flashError = useCallback(() => {
    setErrFlash(true)
    setErrNonce((n) => n + 1)
  }, [])
  useEffect(() => {
    if (!errFlash) return
    const id = setTimeout(() => setErrFlash(false), 180)
    return () => clearTimeout(id)
  }, [errFlash, errNonce])

  const advanceCursor = useCallback((cur: Cursor) => {
    setCursor({
      row: cur.row + (cur.dir === 'v' ? 1 : 0),
      col: cur.col + (cur.dir === 'h' ? 1 : 0),
      dir: cur.dir,
    })
  }, [])

  const unplaceToHand = useCallback((p: MonkeyGramPlacement) => {
    setPlacements((ps) => ps.filter((x) => x.id !== p.id))
    setHand((h) => (h.some((t) => t.id === p.id) ? h : [...h, { id: p.id, letter: p.letter }]))
  }, [])

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const cur = cursorRef.current
      if (!cur) return
      // Don't steal keystrokes from the chat input or any text field.
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
        const here = placementsRef.current.find((p) => p.row === cur.row && p.col === cur.col)
        if (here) unplaceToHand(here)
        setCursor({
          row: cur.row - (cur.dir === 'v' ? 1 : 0),
          col: cur.col - (cur.dir === 'h' ? 1 : 0),
          dir: cur.dir,
        })
        return
      }

      const isArrow = k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown'
      if (isArrow) {
        e.preventDefault()
        const axis = k === 'ArrowLeft' || k === 'ArrowRight' ? 'h' : 'v'
        if (cur.dir !== axis) {
          setCursor({ row: cur.row, col: cur.col, dir: axis })
        } else {
          const dc = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0
          const dr = k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0
          setCursor({ row: cur.row + dr, col: cur.col + dc, dir: cur.dir })
        }
        return
      }

      if (k.length === 1 && /[a-z]/i.test(k)) {
        e.preventDefault()
        const letter = k.toUpperCase()
        const occupant = placementsRef.current.find((p) => p.row === cur.row && p.col === cur.col)
        if (occupant) {
          if (occupant.letter === letter) advanceCursor(cur)
          else flashError()
          return
        }
        const tile = handRef.current.find((t2) => t2.letter === letter)
        if (!tile) {
          flashError()
          return
        }
        setHand((h) => {
          const i = h.findIndex((x) => x.id === tile.id)
          return i < 0 ? h : [...h.slice(0, i), ...h.slice(i + 1)]
        })
        setPlacements((ps) => [
          ...ps.filter((p) => !(p.row === cur.row && p.col === cur.col)),
          { id: tile.id, letter, row: cur.row, col: cur.col },
        ])
        advanceCursor(cur)
      }
    },
    [advanceCursor, flashError, unplaceToHand],
  )

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown])

  // --- Render ------------------------------------------------------------
  const cells: React.ReactNode[] = []
  for (let r = 0; r < win.rows; r++) {
    for (let c = 0; c < win.cols; c++) {
      const row = win.top + r
      const col = win.left + c
      const p = occupied.get(row + ',' + col)
      const isHover = hover && hover.row === row && hover.col === col
      const lifting = drag && p && drag.tile.id === p.id
      const blocked = isHover && p && !lifting
      const dropOk = isHover && !blocked
      const cursorHere = cursor && cursor.row === row && cursor.col === col
      cells.push(
        <div
          key={row + ',' + col}
          data-cell
          data-row={row}
          data-col={col}
          className={
            styles.cell + (dropOk ? ' ' + styles.dropOk : '') + (blocked ? ' ' + styles.dropNo : '')
          }
          onPointerDown={(e) => onCellPointerDown(row, col, p, e)}
        >
          {p && (
            <div className={styles.tile + (lifting ? ' ' + styles.lifted : '')}>{p.letter}</div>
          )}
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
          {/* The grid sits centered in a much larger padded canvas so it never
              re-centers as it grows — see CANVAS_PAD in lib/board.ts. */}
          <div className={styles.canvas} style={{ padding: CANVAS_PAD }}>
            <div
              className={styles.grid}
              style={{
                gridTemplateColumns: `repeat(${win.cols}, ${CELL}px)`,
                gridTemplateRows: `repeat(${win.rows}, ${CELL}px)`,
                width: win.cols * CELL,
                height: win.rows * CELL,
              }}
            >
              {cells}
            </div>
          </div>
        </div>
        <button type="button" className={styles.recenter} onClick={recenter}>
          Recenter
        </button>
      </div>

      <div className={styles.hand} data-zone="hand">
        {hand.map((t) => (
          <div
            key={t.id}
            className={styles.handTile + (drag && drag.tile.id === t.id ? ' ' + styles.lifted : '')}
            onPointerDown={(e) => onHandPointerDown(t, e)}
          >
            {t.letter}
          </div>
        ))}
        {hand.length === 0 && <span className={styles.handEmpty}>all tiles placed!</span>}
      </div>

      {drag && (
        <div className={styles.ghost} style={{ left: drag.x, top: drag.y }}>
          {drag.tile.letter}
        </div>
      )}
    </div>
  )
}
