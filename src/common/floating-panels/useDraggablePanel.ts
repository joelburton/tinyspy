// cs-blessed-floating-panels

import { useCallback, useEffect, useRef, useState } from 'react'
import { readStored, writeStored } from '../web-storage/storage'

/** A floating panel's persisted geometry. */
export type PanelRect = {
  x: number
  y: number
  width: number
  height: number
}

type PanelOpts = {
  // Where the rect is saved, or `undefined` for a panel that remembers
  // nothing. Keys are unique per panel kind (`puzpuzpuz:chat:rect`,
  // `puzpuzpuz:scratchpad:rect:<gameId>`); the hook does NOT namespace for you.
  persistKey: string | undefined
  // Where it opens when nothing is stored. Later mounts read what was saved.
  defaultRect: PanelRect
  // How small the user may drag it. Capped to the viewport before it is
  // applied — see `clampToViewport`.
  minWidth: number
  minHeight: number
  // Re-center on a viewport change rather than nudging inside — see
  // `useReclampOnResize`.
  recenterOnResize: boolean
}

/**
 * Where a floating panel IS — its rect, kept on screen, and remembered between
 * opens if it asked to be. Every panel on the shell uses this; `persistKey` is
 * the only thing that varies.
 *
 * **With a key** the panel reopens where you left it: the lazy initializer
 * reads localStorage once on mount, and every change writes back synchronously.
 * That is what "opens where you left it" means for a companion (position and
 * size) and for a word dialog (position only, since it cannot be resized).
 *
 * **Without one** the rect lives in React state and resets on every mount,
 * which is what a modal wants — reopening a fresh question in the place you
 * shoved the last one aside to is surprising. Nothing else changes: the same
 * clamps, the same re-clamp on resize, the same state.
 *
 * Which a panel gets is its FAMILY's answer, not its own (`FAMILY` in
 * FloatingPanel.tsx, and docs/ui.md → Floating panels).
 *
 * Either way the rect is clamped into the viewport on mount and on every
 * window resize, so a panel saved on a bigger monitor slides inward rather
 * than opening off-screen.
 *
 * Storage shape:
 *     {"x":120,"y":120,"width":340,"height":460}
 *
 * Storage being unavailable is not an error here: reads and writes become
 * no-ops and the panel behaves like one that remembers nothing.
 */
export function useDraggablePanel({
  persistKey,
  defaultRect,
  minWidth,
  minHeight,
  recenterOnResize,
}: PanelOpts) {
  const edgeMargin = VIEWPORT_EDGE_MARGIN
  const [rect, setRectState] = useState<PanelRect>(() => {
    const stored = persistKey ? readRect(persistKey) : null
    const seed = stored ?? defaultRect
    return clampToViewport(seed, minWidth, minHeight, edgeMargin)
  })

  const setRect = useCallback(
    (next: PanelRect) => {
      // Soft clamp on user-initiated changes (drag/resize stops)
      // — let the user park the panel partly off-screen for
      // juggling. The hard clamp on mount + window-resize
      // guarantees we never come back to an unreachable panel.
      const clamped = clampToViewport(
        next,
        minWidth,
        minHeight,
        edgeMargin,
        'soft',
      )
      setRectState(clamped)
      if (persistKey) writeRect(persistKey, clamped)
    },
    [persistKey, minWidth, minHeight, edgeMargin],
  )

  // A shrunk window slides this panel inward, and a persisting one records the
  // correction. Whether it records is not important — the panel just has to
  // stay reachable — so this keeps the write it was already doing.
  useReclampOnResize(rect, minWidth, minHeight, edgeMargin, recenterOnResize, (reclamped) => {
    setRectState(reclamped)
    if (persistKey) writeRect(persistKey, reclamped)
  })

  return { rect, setRect }
}

// ─── pure helpers (exported for the test) ────────────────────

/**
 * Keep a floating panel reachable when the VIEWPORT changes under it — the
 * window shrinks, a tablet rotates — by hard-clamping it back inside.
 *
 * Every panel watches, not just the ones that remember their rect. The soft
 * clamp lets you park a panel half off-screen on purpose, so any panel can be
 * near an edge when the window shrinks under it.
 *
 * `onReclamp` is where the caller decides what to do with the correction —
 * store it, or just hold it in state. It fires ONLY when the rect actually
 * moves, so a resize the panel already fits through stays quiet: no re-render,
 * no storage write.
 *
 * It never fights a deliberate drag, which goes through the soft clamp; this
 * runs on viewport events alone. See `recenter` for the one real choice here.
 */
export function useReclampOnResize(
  rect: PanelRect,
  minWidth: number,
  minHeight: number,
  edgeMargin: number,
  // RE-CENTER instead of merely pulling back inside, and the rule is:
  // re-center unless the panel REMEMBERS where you put it — `!remembersRect ||
  // !draggable`. A panel that forgets your position had none worth preserving,
  // and one you cannot drag never had one at all. Clamping those is visibly
  // wrong: `defaultPosition: 'center'` resolves to concrete x/y at mount and
  // nothing afterwards knows it was an intent, so a confirmation whose whole
  // identity is "centered" ends up flush against the right margin.
  //
  // A `modal-normal` is in the set despite being draggable: it always opens
  // centered and never saves a position, so shoving one aside is a transient
  // act to see behind it, not a placement. The `!draggable` half is what covers
  // a coarse pointer, where nothing is draggable — a tablet rotation re-centers
  // chat, whose restored rect was chosen in some desktop session.
  //
  // Only the POSITION is recomputed; a `fitContent` panel's height is its
  // content's answer, not the viewport's.
  recenter: boolean,
  onReclamp: (next: PanelRect) => void,
): void {
  // The latest rect in a ref, so the listener installs once and still reads
  // current values.
  const rectRef = useRef(rect)
  useEffect(() => {
    rectRef.current = rect
  }, [rect])

  const onReclampRef = useRef(onReclamp)
  useEffect(() => {
    onReclampRef.current = onReclamp
  })

  useEffect(() => {
    function onResize() {
      const now = rectRef.current
      const wanted = recenter ? centerInViewport(now) : now
      const reclamped = clampToViewport(wanted, minWidth, minHeight, edgeMargin)
      if (
        reclamped.x === now.x &&
        reclamped.y === now.y &&
        reclamped.width === now.width &&
        reclamped.height === now.height
      ) {
        return
      }
      onReclampRef.current(reclamped)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [minWidth, minHeight, edgeMargin, recenter])
}

/** A rect's own size, centered in the current viewport. Size untouched. */
function centerInViewport(rect: PanelRect): PanelRect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    ...rect,
    x: Math.max(0, Math.round((vw - rect.width) / 2)),
    y: Math.max(0, Math.round((vh - rect.height) / 2)),
  }
}

/** Two clamp modes — see `clampToViewport` doc. */
export type ClampMode = 'hard' | 'soft'

/**
 * The gutter a floating panel keeps at every viewport edge when **the app**
 * places it — on mount, on window resize, and when a card grows to fit its
 * content. Not when YOU place it: a drag may park a panel half off-screen on
 * purpose, and that case is `MIN_VISIBLE_WHEN_PARKED` below.
 *
 * Exported because `FloatingPanel`'s content fit keeps the same gutter, top and
 * bottom, so it reads this rather than a literal of its own.
 */
export const VIEWPORT_EDGE_MARGIN = 8

/**
 * How much of a floating panel stays on screen when you PARK it partly off the
 * edge — enough to grab it back. The top edge additionally can't go negative,
 * so the titlebar is always reachable.
 */
const MIN_VISIBLE_WHEN_PARKED = 60

/**
 * Clamp a rect against the current viewport. Two modes:
 *
 *   - `'hard'` (default) — panel must fit FULLY inside the
 *     viewport, with `edgeMargin` clearance on every side.
 *     Used on mount + window-resize: when the user comes back
 *     from a bigger monitor or shrinks the window, the panel
 *     snaps in so it's visible.
 *
 *   - `'soft'` — panel may extend past the viewport edges as
 *     long as ~60px stays visible on each axis, with the
 *     additional rule that the top edge can't go negative
 *     (header must remain reachable). Used on drag-stop +
 *     resize-stop: the user can park the panel half-off-screen
 *     for "juggling" — slide chat to the corner so they can see
 *     more of a setup dialog — but can't lose it entirely.
 *
 * Width / height are capped at viewport minus padding either way, so a stored
 * panel bigger than the current viewport always gets shrunk to fit. They never
 * drop below the minimums EXCEPT when a minimum is itself wider than that —
 * the cap wins, because a floor that outranks the screen places the panel off
 * the edge of it. `FloatingPanel.module.css` leans on this being true: a
 * blocking card is the one shape that keeps its rect on a phone, and it has no
 * CSS width rule because the geometry is settled here first.
 */
export function clampToViewport(
  rect: PanelRect,
  minWidth: number,
  minHeight: number,
  edgeMargin: number,
  mode: ClampMode = 'hard',
): PanelRect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  // What the viewport has room for, and the floors capped to it. A minimum
  // says "don't let the USER drag it smaller than this" — it cannot outrank
  // the screen, or the panel is placed wider than the space it is being fitted
  // into and hangs off the edge.
  const fitWidth = Math.max(0, vw - edgeMargin * 2)
  const fitHeight = Math.max(0, vh - edgeMargin * 2)
  const floorWidth = Math.min(minWidth, fitWidth)
  const floorHeight = Math.min(minHeight, fitHeight)
  const width = Math.max(floorWidth, Math.min(rect.width, fitWidth))
  const height = Math.max(floorHeight, Math.min(rect.height, fitHeight))

  if (mode === 'soft') {
    // Soft: at least MIN_VISIBLE_WHEN_PARKED px stays visible on each
    // axis. Top edge can't go negative (header stays in view);
    // left/right/bottom can.
    const minX = MIN_VISIBLE_WHEN_PARKED - width
    const maxX = vw - MIN_VISIBLE_WHEN_PARKED
    const maxY = Math.max(0, vh - MIN_VISIBLE_WHEN_PARKED)
    const x = Math.max(minX, Math.min(rect.x, maxX))
    const y = Math.max(0, Math.min(rect.y, maxY))
    return { x, y, width, height }
  }

  // Hard mode — panel fully inside the viewport.
  const maxX = Math.max(edgeMargin, vw - width - edgeMargin)
  const maxY = Math.max(edgeMargin, vh - height - edgeMargin)
  const x = Math.max(edgeMargin, Math.min(rect.x, maxX))
  const y = Math.max(edgeMargin, Math.min(rect.y, maxY))
  return { x, y, width, height }
}

/** The rect remembered under `key`, or null where there is none or it cannot
 *  be read. */
function readRect(key: string): PanelRect | null {
  // No stored rect and no storage at all both mean "open where you always do".
  const raw = readStored('local', key, null)
  if (!raw) return null
  // The parse still needs its own guard: a hand-edited or truncated value is a
  // different failure from storage being unavailable, and only this one throws.
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      typeof (parsed as PanelRect).x !== 'number' ||
      typeof (parsed as PanelRect).y !== 'number' ||
      typeof (parsed as PanelRect).width !== 'number' ||
      typeof (parsed as PanelRect).height !== 'number'
    ) {
      return null
    }
    return parsed as PanelRect
  } catch {
    return null
  }
}

/** Remember the rect under `key`. */
function writeRect(key: string, rect: PanelRect): void {
  // Losing this costs the floating panel its remembered position; state still
  // drives the live one.
  writeStored('local', key, JSON.stringify(rect))
}
