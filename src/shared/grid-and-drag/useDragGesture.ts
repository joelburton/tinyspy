// cs-audited-grid-and-drag

import { useCallback, useEffect, useRef, useState } from 'react'
import './dragging.css'

const DRAG_THRESHOLD = 4 // px a press must travel before it counts as a drag (vs a tap)

/** The body class set while a tile is being dragged; `dragging.css` styles it. */
export const DRAGGING_CLASS = 'tile-dragging'

/** A cell of the grid: `x` is its column, `y` its row. */
export type GridCell = { x: number; y: number }

/**
 * The grid cell under a screen point, or null off the grid. A cell is an
 * element carrying `data-cell`, with its column and row in `data-x` and
 * `data-y`.
 */
export function cellAtPoint(x: number, y: number): GridCell | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-cell]') as HTMLElement | null
  if (!el) return null
  return { x: Number(el.dataset.x), y: Number(el.dataset.y) }
}

/** An armed gesture: a press that may still become a drag or settle as a tap. */
export type DragGesture<TSource> = {
  // What was picked up (game-defined: a rack slot, a board cell, a hand tile…).
  source: TSource
  // The letter being moved, or null when the press can't drag (an empty cell,
  // a finger). A null letter can only ever tap.
  letter: string | null
  // The board cell pressed, or null when the press began off the grid (on the
  // rack or hand).
  cell: GridCell | null
  startX: number
  startY: number
  // Flips true once the press travels past DRAG_THRESHOLD.
  started: boolean
}

/** The live drag overlay: the ghost letter + where it is + what it came from. */
export type DragState<TSource> = {
  letter: string
  source: TSource
  x: number
  y: number
}

export type UseDragGestureOpts<TSource> = {
  // A completed drag dropped at (x, y). The game decides what that means.
  onDrop: (g: DragGesture<TSource>, x: number, y: number) => void
  // A press that never became a drag (a plain tap or click).
  onTap: (g: DragGesture<TSource>) => void
  // Called on every pointer move during a drag, with the pointer's position.
  onDragMove?: (x: number, y: number) => void
  // Called once a drag ends, dropped or canceled.
  onDragEnd?: () => void
}

/**
 * Press a tile, then tap it or drag it: the pointer plumbing for a grid you
 * drag lettered tiles onto. The game says what a drop and a tap mean; the
 * hook does the rest.
 *
 * A press armed with `start` becomes a drag once it travels a few pixels with
 * a letter to carry; released before that, it is a tap. While a drag is in
 * flight, `drag` holds the ghost's letter and position, `hover` the grid cell
 * under the pointer (found by `cellAtPoint`, which says how a grid marks its
 * cells), and the body carries `DRAGGING_CLASS`. A canceled pointer ends it
 * with neither a drop nor a tap.
 *
 * The options are read fresh on every event, so they may be new closures on
 * every render.
 *
 * Generic over what was picked up (`TSource`: a rack slot, a board cell…).
 */
export function useDragGesture<TSource>(opts: UseDragGestureOpts<TSource>) {
  // Latest callbacks, read by the once-bound window listeners below.
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  const gestureRef = useRef<DragGesture<TSource> | null>(null)
  const [drag, setDrag] = useState<DragState<TSource> | null>(null)
  const [hover, setHover] = useState<GridCell | null>(null)

  // Bind the window listeners ONCE — they read the gesture + the latest opts
  // from refs, so they never need to re-attach.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const g = gestureRef.current
      if (!g) return
      const { onDragMove } = optsRef.current
      if (
        !g.started &&
        g.letter &&
        Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > DRAG_THRESHOLD
      ) {
        g.started = true
        document.body.classList.add(DRAGGING_CLASS)
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
      const { onDrop, onTap, onDragEnd } = optsRef.current
      document.body.classList.remove(DRAGGING_CLASS)
      if (g.started) {
        onDrop(g, e.clientX, e.clientY)
        setDrag(null)
        setHover(null)
        onDragEnd?.()
      } else {
        onTap(g)
      }
    }
    // A canceled pointer (the browser taking it for a pan, an OS gesture) fires
    // pointercancel and NO pointerup — without this the armed gesture is
    // stranded: the ghost tile stays rendered and the body `DRAGGING_CLASS` stays
    // applied until some unrelated future pointerup. Tear the gesture down as
    // a no-drop, no-tap (it never completed).
    const onCancel = () => {
      const g = gestureRef.current
      if (!g) return
      gestureRef.current = null
      if (g.started) {
        const { onDragEnd } = optsRef.current
        document.body.classList.remove(DRAGGING_CLASS)
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
   * non-primary buttons and prevents the default text-selection drag. A touch
   * press can only tap.
   */
  const start = useCallback(
    (source: TSource, letter: string | null, cell: GridCell | null, e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      gestureRef.current = {
        source,
        // A finger taps but never drags: dragging is a mouse affordance (docs/mobile.md).
        letter: e.pointerType === 'touch' ? null : letter,
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
