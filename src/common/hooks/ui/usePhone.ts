import { useSyncExternalStore } from 'react'

/**
 * `true` on a phone-sized viewport — the JS mirror of the `--phone` custom-media
 * in src/common/breakpoints.css (narrow portrait OR short landscape). Like
 * `useIsMobile` mirrors `--mobile`: matchMedia can't read a custom-media name,
 * so the condition is duplicated here and must be kept in sync by hand (grep
 * `34rem`). The comma is an OR — a narrow width, or a short landscape (a phone
 * on its side, which excludes landscape tablets).
 *
 * Use this (not `useIsMobile`, which also includes tablets) when a behavior must
 * be scoped to the full-screen-sheet phone layout specifically — e.g. clamping a
 * panel to the visual viewport, which only makes sense when the panel fills the
 * screen.
 */
const PHONE_QUERY =
  '(max-width: 34rem), (orientation: landscape) and (max-height: 27.5rem)'

function subscribe(callback: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia(PHONE_QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot(): boolean {
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia(PHONE_QUERY).matches
}

// Desktop-first: with no window (SSR/test snapshot), assume not-a-phone.
function getServerSnapshot(): boolean {
  return false
}

export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
