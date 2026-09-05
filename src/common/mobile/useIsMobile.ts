// cs-audited-mobile

import { useMediaQuery } from './useMediaQuery'

/**
 * The shared desktop→mobile line (see docs/mobile.md). Phones + portrait
 * tablets sit below it; landscape tablets + desktops at/above keep the desktop
 * layout. The JS copy of `--mobile` in breakpoints.css; exported so
 * `useIsMobile.test.ts` can hold the two copies together.
 */
export const MOBILE_QUERY = '(max-width: 56.25rem)'

/**
 * `true` when the viewport is at mobile width (≤ the shared breakpoint).
 *
 * The JS companion to the `@media (max-width: 56.25rem)` overrides — for the
 * rare case a mobile layout can't be pure CSS because it changes what the JS
 * *renders* (e.g. adding a mobile-only menu item, mounting an overlay). Prefer a
 * CSS media query whenever the difference is purely visual; reach for this only
 * when the branch is structural. Re-renders on a cross-breakpoint resize via the
 * shared `useMediaQuery` engine — no setState-in-effect, so it's clean under the
 * repo's lint rule.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY)
}
