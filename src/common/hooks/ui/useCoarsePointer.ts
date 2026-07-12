import { useMediaQuery } from './useMediaQuery'

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
 * Re-renders on a pointer change (e.g. plugging a mouse into a tablet) via the
 * shared `useMediaQuery` engine — no setState-in-effect, so it's clean under the
 * repo's lint rule.
 */
export function useCoarsePointer(): boolean {
  return useMediaQuery(COARSE_QUERY)
}
