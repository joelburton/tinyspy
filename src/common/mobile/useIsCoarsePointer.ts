// cs-blessed-mobile

import { useMediaQuery } from './useMediaQuery'

// The JS copy of `--touch` in breakpoints.css; useIsCoarsePointer.test.ts
// asserts the two still say the same thing.
export const COARSE_QUERY = '(pointer: coarse)'

/**
 * `true` when the primary pointer is coarse — a touchscreen, phone or tablet.
 *
 * The device has no precise pointer, so anything that needs one is off here:
 * dragging, resizing, a small hit target. Reach for this rather
 * than `useIsMobile` when the branch is about *how you point* and not how wide
 * the screen is — a touch tablet is desktop-width and still has no mouse
 * (docs/mobile.md → "Input is the primary axis").
 *
 * The structural companion to the `@media (--touch)` overrides: use it when a
 * touch difference changes what JS *does*, and CSS when it only changes how
 * something looks. Re-renders on a pointer change — e.g. plugging a mouse into
 * a tablet.
 */
export function useIsCoarsePointer(): boolean {
  return useMediaQuery(COARSE_QUERY)
}
