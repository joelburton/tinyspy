// cs-audited-mobile

import { useMediaQuery } from './useMediaQuery'

/**
 * `true` on a phone-sized viewport — the JS copy of the `--phone` custom-media
 * in src/common/mobile/breakpoints.css (narrow portrait OR short landscape),
 * the way `useIsMobile` copies `--mobile`; `useIsPhone.test.ts` asserts the two
 * still say the same thing. The comma is an OR — a narrow width, or a short
 * landscape (a phone on its side, which excludes landscape tablets).
 *
 * Use this (not `useIsMobile`, which also includes tablets) when a behavior must
 * be scoped to the full-screen-sheet phone layout specifically — e.g. clamping a
 * panel to the visual viewport, which only makes sense when the panel fills the
 * screen.
 */
export const PHONE_QUERY =
  '(max-width: 34rem), (orientation: landscape) and (max-height: 27.5rem)'

export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY)
}
