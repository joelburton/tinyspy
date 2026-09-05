// cs-audited-mobile

import { useMediaQuery } from './useMediaQuery'

/**
 * The touch-device signal (docs/mobile.md → "Input is the primary axis"): a
 * coarse pointer means no precise mouse, so we disable dragging/resizing and
 * favor bigger tap targets. This is the JS copy of the `--touch`
 * (`pointer: coarse`) custom-media in src/common/mobile/breakpoints.css;
 * `useIsCoarsePointer.test.ts` asserts the two still say the same thing.
 *
 * NOT width-based: a touch tablet is desktop-width but still touch. Use this
 * (not useIsMobile) when the branch is about *how you point*, not how wide the
 * screen is.
 */
export const COARSE_QUERY = '(pointer: coarse)'

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
 * Re-renders on a pointer change — e.g. plugging a mouse into a tablet.
 */
export function useIsCoarsePointer(): boolean {
  return useMediaQuery(COARSE_QUERY)
}
