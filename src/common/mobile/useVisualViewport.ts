// cs-audited-mobile

import { useSyncExternalStore } from 'react'

type ViewportMetrics = {
  // Height of the region actually visible right now, in CSS pixels.
  height: number
  // How far that region has been pushed down — see the hook's docstring.
  offsetTop: number
}

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

/**
 * The part of the page a phone can actually show right now, as
 * `{ height, offsetTop }` in CSS pixels — call this when a full-screen sheet
 * has to end where the on-screen keyboard begins.
 *
 * The difference from `window.innerHeight` (the *layout* viewport): on a phone
 * the visual viewport SHRINKS when the keyboard opens and the layout viewport
 * does not. So a `position: fixed` sheet sized to the layout viewport extends
 * *behind* the keyboard — you can scroll the webview to the hidden part, and iOS
 * auto-scrolls there on focus. Sizing to the visual viewport ends the sheet at
 * the keyboard's top edge instead.
 *
 * `offsetTop` is how far the visible region has been pushed down, non-zero when
 * iOS scrolls the page to keep a focused field visible; pin a fixed sheet's
 * `top` to it so the sheet tracks the visible region rather than drifting.
 *
 * Falls back to the layout viewport where `visualViewport` is unavailable (old
 * browsers, jsdom) — there's no keyboard to account for there anyway.
 */
export function useVisualViewport(): ViewportMetrics {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
