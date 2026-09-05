// cs-audited-mobile

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Subscribe to a CSS media query and re-render when it flips. The shared engine
 * behind the app's device hooks (`useIsMobile` / `useIsPhone` / `useIsCoarsePointer`)
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
 * setState-in-effect — which the repo lints against
 * (`react-hooks/set-state-in-effect`). That is a property of THIS file; the
 * device hooks just call it.
 *
 * NOTE for callers: matchMedia can't read a `@custom-media` name from
 * breakpoints.css, so each device hook writes its condition out again in JS —
 * and each one's spec asserts that copy still equals the CSS, which is what
 * keeps the two from drifting (see `readCustomMedia`).
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
