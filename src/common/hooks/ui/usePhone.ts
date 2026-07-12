import { useMediaQuery } from './useMediaQuery'

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

export function usePhone(): boolean {
  return useMediaQuery(PHONE_QUERY)
}
