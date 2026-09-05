// cs-audited-mobile

import { useMediaQuery } from './useMediaQuery'

// The JS copy of `--phone` in breakpoints.css; useIsPhone.test.ts asserts the
// two still say the same thing. The comma is an OR — a narrow width, or a short
// landscape (a phone on its side, which excludes landscape tablets).
export const PHONE_QUERY =
  '(max-width: 34rem), (orientation: landscape) and (max-height: 27.5rem)'

/**
 * `true` on a phone — the device with no room to spare, in either orientation.
 *
 * Reach for this rather than `useIsMobile` (which also takes in portrait
 * tablets) when the behavior is about how little space there is: a row of
 * labeled buttons that has to go icon-only, a panel that fills the screen and
 * must clamp to the visual viewport. What is tight varies by caller, so the call
 * site is where the reason belongs.
 */
export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY)
}
