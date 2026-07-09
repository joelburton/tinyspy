import { useSyncExternalStore } from 'react'

/**
 * The shared desktop→mobile line (see docs/mobile.md). Phones + portrait
 * tablets sit below it; landscape tablets + desktops at/above keep the desktop
 * layout. Kept in sync by hand with the `56.25rem` in every mobile `@media`
 * override — CSS can't share the constant without a build step, so grep it.
 */
const MOBILE_QUERY = '(max-width: 56.25rem)'

function subscribe(callback: () => void): () => void {
  // jsdom (the vitest env) has a window but no matchMedia — treat as desktop
  // and never notify. Real browsers always have it.
  if (typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot(): boolean {
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia(MOBILE_QUERY).matches
}

// Desktop-first: with no window (SSR/test snapshot), assume desktop.
function getServerSnapshot(): boolean {
  return false
}

/**
 * `true` when the viewport is at mobile width (≤ the shared breakpoint).
 *
 * The JS companion to the `@media (max-width: 56.25rem)` overrides — for the
 * rare case a mobile layout can't be pure CSS because it changes what the JS
 * *renders* (e.g. adding a mobile-only menu item, mounting an overlay). Prefer a
 * CSS media query whenever the difference is purely visual; reach for this only
 * when the branch is structural. Re-renders on a cross-breakpoint resize
 * (matchMedia's `change` event) via `useSyncExternalStore` — no setState-in-
 * effect, so it's clean under the repo's lint rule.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
