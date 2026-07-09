import { useSyncExternalStore } from 'react'

/**
 * The visual viewport — the region actually visible right now — as
 * `{ height, offsetTop }` in CSS pixels.
 *
 * The key difference from `window.innerHeight` (the *layout* viewport): on a
 * phone the visual viewport SHRINKS when the on-screen keyboard opens, while the
 * layout viewport does not. So a `position: fixed` full-screen sheet sized to
 * the layout viewport extends *behind* the keyboard — you can scroll the webview
 * to the hidden part, and iOS auto-scrolls there on focus. Sizing to the visual
 * viewport instead makes the sheet end exactly at the keyboard's top edge.
 *
 * `offsetTop` is how far the visible region has been pushed down (non-zero when
 * iOS scrolls the page to keep a focused field visible); pin a fixed sheet's
 * `top` to it so the sheet tracks the visible region rather than drifting.
 *
 * Falls back to the layout viewport where `visualViewport` is unavailable (old
 * browsers, jsdom) — there's no keyboard to account for there anyway.
 */
type ViewportMetrics = { height: number; offsetTop: number }

// Module-level cache so getSnapshot can return a STABLE reference when nothing
// changed — useSyncExternalStore compares snapshots with Object.is, so returning
// a fresh object every call would loop forever. The visual viewport is a single
// global, so one shared cache is correct.
let cache: ViewportMetrics = { height: 0, offsetTop: 0 }

function currentMetrics(): ViewportMetrics {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  if (vv) return { height: vv.height, offsetTop: vv.offsetTop }
  const height = typeof window !== 'undefined' ? window.innerHeight : 0
  return { height, offsetTop: 0 }
}

function subscribe(callback: () => void): () => void {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  if (!vv) return () => {}
  // resize fires on keyboard show/hide + rotation; scroll fires when iOS shifts
  // the visible region (offsetTop changes) to keep a focused field on-screen.
  vv.addEventListener('resize', callback)
  vv.addEventListener('scroll', callback)
  return () => {
    vv.removeEventListener('resize', callback)
    vv.removeEventListener('scroll', callback)
  }
}

function getSnapshot(): ViewportMetrics {
  const next = currentMetrics()
  if (next.height !== cache.height || next.offsetTop !== cache.offsetTop) cache = next
  return cache
}

function getServerSnapshot(): ViewportMetrics {
  return cache
}

export function useVisualViewport(): ViewportMetrics {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
