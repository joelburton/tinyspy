import { useCallback, useSyncExternalStore } from 'react'

/**
 * Subscribe to a CSS media query and re-render when it flips. The shared engine
 * behind the app's device hooks (`useIsMobile` / `usePhone` / `useCoarsePointer`)
 * — they're all this same `useSyncExternalStore(matchMedia)` wrapper differing
 * only in the query string, so the subscribe/getSnapshot/jsdom-guard boilerplate
 * lives here ONCE and each device hook is a one-liner that names its query and
 * carries the docstring explaining what that query means.
 *
 * jsdom (the vitest env) has a `window` but no `matchMedia`; there we treat the
 * query as unmatched and never notify — the desktop-first default (a test
 * snapshot renders the desktop layout). Real browsers always have `matchMedia`.
 *
 * Uses `useSyncExternalStore`, so a cross-query resize re-renders WITHOUT a
 * setState-in-effect — clean under the repo's lint rule (see docs/code-conventions).
 *
 * NOTE for callers: matchMedia can't read a `@custom-media` name from
 * breakpoints.css, so each device hook duplicates its query string and must be
 * kept in sync with breakpoints.css by hand (grep the literal, e.g. `34rem`).
 */
export function useMediaQuery(query: string): boolean {
  // Memoized on `query` so the identity is stable across renders (a changing
  // `subscribe` would make useSyncExternalStore resubscribe every render). The
  // callers pass a module-constant string, so this effectively memoizes forever.
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => {
    if (typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  }, [query])
  // Desktop-first: with no window (SSR/test snapshot), assume the query is unmet.
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
