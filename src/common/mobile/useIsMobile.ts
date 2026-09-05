// cs-blessed-mobile

import { useMediaQuery } from './useMediaQuery'

// The JS copy of `--mobile` in breakpoints.css; useIsMobile.test.ts asserts the
// two still say the same thing.
export const MOBILE_QUERY = '(max-width: 56.25rem)'

/**
 * `true` below the shared desktop→mobile line — where the two-column layouts
 * fold to one. Phones and portrait tablets are below it; landscape tablets and
 * desktops are not (docs/mobile.md).
 *
 * The JS companion to the `@media (--mobile)` overrides — for the rare case a
 * mobile layout can't be pure CSS because it changes what the JS *renders*
 * (e.g. adding a mobile-only menu item, mounting an overlay). Prefer a CSS media
 * query whenever the difference is purely visual; reach for this only when the
 * branch is structural.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY)
}
