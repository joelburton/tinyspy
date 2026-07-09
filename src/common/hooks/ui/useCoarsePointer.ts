import { useSyncExternalStore } from 'react'

/**
 * The touch-device signal (docs/mobile.md → "Input is the primary axis"): a
 * coarse pointer means no precise mouse, so we disable dragging/resizing and
 * favor bigger tap targets. This is the JS mirror of the `--touch`
 * (`pointer: coarse`) custom-media in src/common/breakpoints.css — the two must
 * be kept in sync by hand, since matchMedia can't read a custom-media name.
 *
 * NOT width-based: a touch tablet is desktop-width but still touch. Use this
 * (not useIsMobile) when the branch is about *how you point*, not how wide the
 * screen is.
 */
const COARSE_QUERY = '(pointer: coarse)'

function subscribe(callback: () => void): () => void {
  // jsdom (the vitest env) has a window but no matchMedia — treat as a precise
  // pointer (mouse/desktop) and never notify. Real browsers always have it.
  if (typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia(COARSE_QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot(): boolean {
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia(COARSE_QUERY).matches
}

// Desktop-first: with no window (SSR/test snapshot), assume a precise pointer.
function getServerSnapshot(): boolean {
  return false
}

/**
 * `true` when the primary pointer is coarse (a touchscreen — phone or tablet).
 *
 * The structural companion to the `@media (--touch)` CSS overrides — for when a
 * touch difference changes what JS *does*, not just how something looks. The
 * flagship use is FloatingPanel: a coarse pointer forces panels non-draggable
 * and non-resizable, which both suits touch AND fixes the close-button bug
 * (react-draggable `preventDefault`s the header touchstart, killing the
 * synthesized click on the X — remove the drag binding and the X works).
 *
 * Re-renders on a pointer change (e.g. plugging a mouse into a tablet) via
 * `useSyncExternalStore` — no setState-in-effect, so it's clean under the
 * repo's lint rule.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
