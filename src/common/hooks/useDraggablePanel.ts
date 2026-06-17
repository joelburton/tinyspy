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
   *  unique per panel kind (e.g. `pupgames:chat`, `pupgames:
   *  scratchpad:<gameId>`); the hook does NOT namespace for you. */
  persistKey: string
  /** Initial rect on the first mount when nothing is stored.
   *  Subsequent mounts read whatever was last saved. */
  defaultRect: PanelRect
  /** Lower bound; panels can't be dragged or resized below this. */
  minWidth: number
  minHeight: number
  /** Padding kept clear at every viewport edge so the panel can't
   *  vanish off-screen via a stored rect that's older than the
   *  current window dimensions (e.g. user resized the browser
   *  smaller, reloaded). Default 8px matches `../connections`. */
  edgePadding?: number
}

/**
 * Persisted geometry + viewport clamping for a floating panel
 * (FloatingChat, future Scratchpad, etc.).
 *
 * State lives in React for fast re-renders during a drag/resize,
 * AND is mirrored to localStorage so closing + reopening (or
 * navigating across pages) restores the panel where it was.
 * `useState`'s lazy initializer reads localStorage exactly once on
 * mount; every change writes back synchronously.
 *
 * Viewport clamping: on mount and on every window resize, the
 * stored rect is clamped so the panel sits fully on-screen with
 * `edgePadding`-pixel margins. If the user shrank the browser
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
  edgePadding = 8,
}: PanelOpts) {
  const [rect, setRectState] = useState<PanelRect>(() => {
    const stored = readRect(persistKey)
    const seed = stored ?? defaultRect
    return clampToViewport(seed, minWidth, minHeight, edgePadding)
  })

  // Keep a ref to the latest rect so the resize listener can clamp
  // against current state without re-binding on every change.
  // Effect-driven assign rather than render-time (React 19's
  // stricter refs rule flags render-time `ref.current = …`).
  const rectRef = useRef(rect)
  useEffect(() => {
    rectRef.current = rect
  }, [rect])

  const setRect = useCallback(
    (next: PanelRect) => {
      const clamped = clampToViewport(next, minWidth, minHeight, edgePadding)
      setRectState(clamped)
      writeRect(persistKey, clamped)
    },
    [persistKey, minWidth, minHeight, edgePadding],
  )

  // Window-resize re-clamp: if the user shrinks the browser to a
  // size where the panel no longer fits, slide it inward.
  useEffect(() => {
    function onResize() {
      const reclamped = clampToViewport(
        rectRef.current,
        minWidth,
        minHeight,
        edgePadding,
      )
      // Skip the write if nothing changed — keeps storage quiet
      // during ordinary resizes where the panel already fits.
      if (
        reclamped.x === rectRef.current.x &&
        reclamped.y === rectRef.current.y &&
        reclamped.width === rectRef.current.width &&
        reclamped.height === rectRef.current.height
      ) {
        return
      }
      setRectState(reclamped)
      writeRect(persistKey, reclamped)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [persistKey, minWidth, minHeight, edgePadding])

  return { rect, setRect }
}

// ─── pure helpers (exported for the test) ────────────────────

/**
 * Clamp a rect so it sits fully inside the current viewport with
 * `edgePadding` clearance on every side. Width / height are
 * shrunk first (capped at viewport minus padding) then position
 * is clamped so the right/bottom edges don't run off. Width and
 * height never drop below the minimums.
 */
export function clampToViewport(
  rect: PanelRect,
  minWidth: number,
  minHeight: number,
  edgePadding: number,
): PanelRect {
  const vw = typeof window !== 'undefined' ? window.innerWidth : rect.width
  const vh = typeof window !== 'undefined' ? window.innerHeight : rect.height
  const maxWidth = Math.max(minWidth, vw - edgePadding * 2)
  const maxHeight = Math.max(minHeight, vh - edgePadding * 2)
  const width = Math.max(minWidth, Math.min(rect.width, maxWidth))
  const height = Math.max(minHeight, Math.min(rect.height, maxHeight))
  const maxX = Math.max(edgePadding, vw - width - edgePadding)
  const maxY = Math.max(edgePadding, vh - height - edgePadding)
  const x = Math.max(edgePadding, Math.min(rect.x, maxX))
  const y = Math.max(edgePadding, Math.min(rect.y, maxY))
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
