// cs-unmet

import { useCallback, useEffect, useRef, useState } from 'react'

/** A floating panel's persisted geometry. */
export type PanelRect = {
  x: number
  y: number
  width: number
  height: number
}

type PanelOpts = {
  /** localStorage key under which the rect is saved. Keys are
   *  unique per panel kind (e.g. `puzpuzpuz:chat`, `puzpuzpuz:
   *  scratchpad:<gameId>`); the hook does NOT namespace for you. */
  persistKey: string
  /** Initial rect on the first mount when nothing is stored.
   *  Subsequent mounts read whatever was last saved. */
  defaultRect: PanelRect
  /** Lower bound; panels can't be dragged or resized below this. */
  minWidth: number
  minHeight: number
  /** Overrides `VIEWPORT_EDGE_MARGIN`. Nothing passes one. */
  edgeMargin?: number
  /** Re-centre on a viewport change rather than nudging inside — see
   *  `useReclampOnResize`. */
  recenterOnResize: boolean
}

/**
 * Persisted geometry + viewport clamping for a floating panel — the six
 * COMPANIONS, which remember both where you put them and how big you made them,
 * and the three DIALOGS, which remember only a position because they cannot be
 * resized (plans/css-system-2.md §20).
 *
 * State lives in React for fast re-renders during a drag/resize,
 * AND is mirrored to localStorage so closing + reopening (or
 * navigating across pages) restores the panel where it was.
 * `useState`'s lazy initializer reads localStorage exactly once on
 * mount; every change writes back synchronously.
 *
 * Viewport clamping: on mount and on every window resize, the
 * stored rect is clamped so the panel sits fully on-screen with
 * `edgeMargin`-pixel margins. If the user shrank the browser
 * between sessions, the panel slides inward rather than landing
 * off-screen.
 *
 * Storage shape:
 *     {"x":120,"y":120,"width":340,"height":460}
 *
 * Falls back gracefully if `localStorage` is unavailable (private
 * mode, SSR, etc.): reads/writes become no-ops, state still works.
 */
export function useDraggablePanel({
  persistKey,
  defaultRect,
  minWidth,
  minHeight,
  edgeMargin = VIEWPORT_EDGE_MARGIN,
  recenterOnResize,
}: PanelOpts) {
  const [rect, setRectState] = useState<PanelRect>(() => {
    const stored = readRect(persistKey)
    const seed = stored ?? defaultRect
    return clampToViewport(seed, minWidth, minHeight, edgeMargin)
  })

  // Keep a ref to the latest rect so the resize listener can clamp
  // against current state without re-binding on every change.
  // Effect-driven assign rather than render-time (React 19's
  // stricter refs rule flags render-time `ref.current = …`).
  const rectRef = useRef(rect)
  useEffect(function syncRectRef() {
    rectRef.current = rect
  }, [rect])

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
      writeRect(persistKey, clamped)
    },
    [persistKey, minWidth, minHeight, edgeMargin],
  )

  // A shrunk window slides this panel inward, and writes the correction back.
  // Recording it is not important either way (Joel, 2026-08-25) — the panel just
  // has to stay reachable — so this keeps the write it already did.
  useReclampOnResize(rect, minWidth, minHeight, edgeMargin, recenterOnResize, (reclamped) => {
    setRectState(reclamped)
    writeRect(persistKey, reclamped)
  })

  return { rect, setRect }
}

// ─── pure helpers (exported for the test) ────────────────────

/**
 * Keep a floating panel reachable when the VIEWPORT changes under it — the
 * window shrinks, a tablet rotates — by hard-clamping it back inside.
 *
 * Shared, because it used to belong to the persisted panels alone and that put
 * the protection on the ones that needed it least: chat and the scratchpad
 * remember their rect and were watched, while every dialog and modal clamped
 * once on mount and then stopped listening. Drag a modal toward an edge — which
 * the soft clamp lets you do on purpose — shrink the window, and nothing pulled
 * it back (plans/areas/floating-panels.md → F26).
 *
 * `onReclamp` is what differs: a persisted panel stores the correction, an
 * ephemeral one only holds it in state. It is called ONLY when the rect actually
 * moves, so an ordinary resize where the panel already fits stays quiet — no
 * re-render, and no storage write.
 *
 * This never fights a deliberate drag: a user's move goes through the SOFT
 * clamp, which is allowed to leave the panel half off-screen, and this only ever
 * runs on a viewport event.
 */
export function useReclampOnResize(
  rect: PanelRect,
  minWidth: number,
  minHeight: number,
  edgeMargin: number,
  /**
   * RE-CENTER instead of merely pulling back inside.
   *
   * **The rule: re-centre unless the panel REMEMBERS where you put it.** Which
   * is `!remembersRect || !draggable` — a panel that forgets your position had
   * none worth preserving, and a panel you cannot drag never had one at all.
   *
   * Clamping instead is visibly wrong for those: a confirmation whose whole
   * identity is "centred" ended up flush against the right margin, because
   * `defaultPosition: 'center'` is resolved into concrete x/y once at mount and
   * nothing afterwards remembers it was ever an intent.
   *
   * **`modal-normal` is in the set even though you CAN drag one** (Joel,
   * 2026-08-25): they always open centred and never save a position, so *"the
   * players think 'these start at the center' — which is true — and therefore
   * should re-center on viewport resize."* Shoving one aside is a transient act
   * to see something behind it, not a placement.
   *
   * The `!draggable` clause is what covers a COARSE POINTER, where every panel
   * is forced non-draggable: a tablet rotation re-centres chat, because the rect
   * it restored was chosen in some desktop session and is not an intent on that
   * device.
   *
   * Only the POSITION is recomputed. The size is left alone: a `fitContent`
   * panel's height is its content's answer, not the viewport's.
   */
  recenter: boolean,
  onReclamp: (next: PanelRect) => void,
): void {
  // The latest rect in a ref, so the listener installs once and still reads
  // current values — the same reason `useDraggablePanel` keeps one.
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

/** A rect's own size, centred in the current viewport. Size untouched. */
function centerInViewport(rect: PanelRect): PanelRect {
  const vw = typeof window !== 'undefined' ? window.innerWidth : rect.width
  const vh = typeof window !== 'undefined' ? window.innerHeight : rect.height
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
 * Exported because the content fit in `FloatingPanel` needs the same gutter,
 * and used to hard-code it — as `8` for the top edge and `16` for the height
 * cap, the second being twice the first with nothing anywhere saying so. Change
 * this and both follow.
 */
export const VIEWPORT_EDGE_MARGIN = 8

/**
 * How much of a floating panel stays on screen when you PARK it partly off the
 * edge — enough to grab it back. The top edge additionally can't go negative,
 * so the titlebar is always reachable.
 *
 * Was `SOFT_MIN_VISIBLE`, which named the clamp MODE rather than the thing:
 * "soft" means nothing until you know there are two clamps, where "parked" is
 * already the word the docstring below uses for the gesture.
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
 * Width / height are capped at viewport minus padding either
 * way (a stored panel bigger than the current viewport always
 * gets shrunk to fit). Width and height never drop below the
 * minimums.
 */
export function clampToViewport(
  rect: PanelRect,
  minWidth: number,
  minHeight: number,
  edgeMargin: number,
  mode: ClampMode = 'hard',
): PanelRect {
  const vw = typeof window !== 'undefined' ? window.innerWidth : rect.width
  const vh = typeof window !== 'undefined' ? window.innerHeight : rect.height
  const maxWidth = Math.max(minWidth, vw - edgeMargin * 2)
  const maxHeight = Math.max(minHeight, vh - edgeMargin * 2)
  const width = Math.max(minWidth, Math.min(rect.width, maxWidth))
  const height = Math.max(minHeight, Math.min(rect.height, maxHeight))

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

function readRect(key: string): PanelRect | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
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

function writeRect(key: string, rect: PanelRect): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(rect))
  } catch {
    // localStorage may be unavailable (private mode, SSR). State
    // still drives the live panel; we just lose persistence.
  }
}
