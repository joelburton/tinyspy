import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The shared "press a tile, then either tap or drag it" pointer plumbing,
 * factored out of bananagrams and scrabble — the two games with a grid you
 * drag lettered tiles onto.
 *
 * Both games run the *same* gesture state machine: a pointer-down arms a
 * gesture; the first move past a small threshold promotes it to a real drag
 * (otherwise the release is treated as a plain tap); during a drag we track a
 * floating ghost + the cell under the pointer; the release either drops the
 * tile or, if it never became a drag, taps. Only the *meaning* of a drop / a
 * tap differs per game, so those are callbacks. Everything mechanical — the
 * threshold maths, the window listeners, the body "dragging" class, the
 * drag/hover state — lives here once.
 *
 * What stays in each game (genuinely game-specific, deliberately NOT absorbed):
 *   - `cellAtPoint` — reads the game's own grid data-attributes (`data-x/y`
 *     vs `data-row/col`), so it's passed in.
 *   - `onDrop` — the drop semantics (stage a tile, move it, recall it to the
 *     rack, dump it…). This is the heart of each game's rules.
 *   - `onTap` — what a non-drag release means (move the keyboard cursor,
 *     toggle a rack tile for exchange…).
 *   - the keyboard cursor + tile placement / typing — those diverge enough
 *     that sharing them would obscure each game's rules, so they stay put.
 *
 * The callbacks are read through a ref, so the window listeners bind exactly
 * ONCE for the hook's lifetime and never re-attach as the game's render-fresh
 * closures change.
 *
 * Generic over the game's drag *source* (what was picked up — a rack slot, a
 * board cell…) and its *cell* coordinate shape (`{x,y}` or `{row,col}`).
 */

const DRAG_THRESHOLD = 4 // px a press must travel before it counts as a drag (vs a tap)

/** An armed gesture: a press that may still become a drag or settle as a tap. */
export type DragGesture<TSource, TCell> = {
  /** What was picked up (game-defined: a rack slot, a board cell, a hand tile…). */
  source: TSource
  /** The letter being moved, or null when the press isn't draggable (an empty
   *  board cell). A null letter can only ever tap, never drag. */
  letter: string | null
  /** The board cell pressed (for the tap → move-cursor path), or null when the
   *  press began off the grid (e.g. on the rack/hand). */
  cell: TCell | null
  startX: number
  startY: number
  /** Flips true once the press travels past DRAG_THRESHOLD. */
  started: boolean
}

/** The live drag overlay: the ghost letter + where it is + what it came from. */
export type DragState<TSource> = {
  letter: string
  source: TSource
  x: number
  y: number
}

export type UseDragGestureOpts<TSource, TCell> = {
  /** Body class toggled while a drag is in flight (e.g. `'mg-dragging'`); the
   *  game's theme.css uses it to suppress text selection + show a grab cursor. */
  dragClass: string
  /** The grid cell under a screen point, read from the game's data-attributes. */
  cellAtPoint: (x: number, y: number) => TCell | null
  /** A completed drag dropped at (x, y). The game decides what that means. */
  onDrop: (g: DragGesture<TSource, TCell>, x: number, y: number) => void
  /** A press that never became a drag (a plain tap/click). */
  onTap: (g: DragGesture<TSource, TCell>) => void
  /** Optional: extra per-move side-effect during a drag (bananagrams lights its
   *  dump slot when a tile hovers it). Called with the live pointer position. */
  onDragMove?: (x: number, y: number) => void
  /** Optional: extra cleanup once a drag finishes (clear the dump highlight). */
  onDragEnd?: () => void
}

export function useDragGesture<TSource, TCell>(
  opts: UseDragGestureOpts<TSource, TCell>,
) {
  // Latest callbacks, read by the once-bound window listeners below.
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  const gestureRef = useRef<DragGesture<TSource, TCell> | null>(null)
  const [drag, setDrag] = useState<DragState<TSource> | null>(null)
  const [hover, setHover] = useState<TCell | null>(null)

  // Bind the window listeners ONCE — they read the gesture + the latest opts
  // from refs, so they never need to re-attach.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const g = gestureRef.current
      if (!g) return
      const { dragClass, cellAtPoint, onDragMove } = optsRef.current
      if (
        !g.started &&
        g.letter &&
        Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > DRAG_THRESHOLD
      ) {
        g.started = true
        document.body.classList.add(dragClass)
      }
      if (g.started && g.letter) {
        setDrag({ letter: g.letter, source: g.source, x: e.clientX, y: e.clientY })
        setHover(cellAtPoint(e.clientX, e.clientY))
        onDragMove?.(e.clientX, e.clientY)
      }
    }
    const onUp = (e: PointerEvent) => {
      const g = gestureRef.current
      if (!g) return
      gestureRef.current = null
      const { dragClass, onDrop, onTap, onDragEnd } = optsRef.current
      document.body.classList.remove(dragClass)
      if (g.started) {
        onDrop(g, e.clientX, e.clientY)
        setDrag(null)
        setHover(null)
        onDragEnd?.()
      } else {
        onTap(g)
      }
    }
    // A canceled pointer (touch-scroll takeover, an OS gesture) fires
    // pointercancel and NO pointerup — without this the armed gesture is
    // stranded: the ghost tile stays rendered and the body `dragClass` stays
    // applied until some unrelated future pointerup. Tear the gesture down as
    // a no-drop, no-tap (it never completed).
    const onCancel = () => {
      const g = gestureRef.current
      if (!g) return
      gestureRef.current = null
      if (g.started) {
        const { dragClass, onDragEnd } = optsRef.current
        document.body.classList.remove(dragClass)
        setDrag(null)
        setHover(null)
        onDragEnd?.()
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [])

  /**
   * Arm a gesture from a pointer-down. Call this from the cell / rack / hand
   * `onPointerDown` after any game-specific guard (e.g. "it's my turn"). Ignores
   * non-primary buttons and prevents the default text-selection drag.
   */
  const start = useCallback(
    (source: TSource, letter: string | null, cell: TCell | null, e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      gestureRef.current = {
        source,
        letter,
        cell,
        startX: e.clientX,
        startY: e.clientY,
        started: false,
      }
    },
    [],
  )

  return { drag, hover, start }
}
