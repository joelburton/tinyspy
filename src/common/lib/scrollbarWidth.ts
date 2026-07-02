/**
 * Publish the classic-scrollbar width as the CSS custom property
 * `--scrollbar-width` on the document root, kept fresh on resize.
 *
 * ─── Why this exists ─────────────────────────────────────────────────────────
 * The viewport-bound game layout sizes the board column from the available
 * width, expressed as `--avail-w: calc(100vw - <info column> - <gaps>)` (see
 * common/components/PlayArea.module.css). The trap: **`100vw` includes the
 * vertical scrollbar's width, but the actual content box does not.** On systems
 * with classic, space-taking scrollbars (macOS set to "always show", most
 * Windows), that means `100vw` overstates the usable width by ~15px — so the
 * board is sized a hair too wide and the whole board+info pair overflows to the
 * right, dragging the info column off-screen. It's invisible with overlay
 * scrollbars (0px) — which is why it hid for so long, and why headless browsers
 * (overlay-only) can't reproduce it.
 *
 * The fix is to subtract the real scrollbar width from that math. CSS can't
 * measure it, so we measure it here once (and on resize) and hand it to CSS as a
 * variable. `window.innerWidth - documentElement.clientWidth` is the width the
 * scrollbar is taking right now; with `scrollbar-gutter: stable` on `html` (see
 * theme.css) the gutter is always reserved, so this value is stable rather than
 * flipping between 0 and 15 as content crosses the viewport height.
 *
 * Falls back to 0 (`var(--scrollbar-width, 0px)` in CSS), so overlay-scrollbar
 * systems — where the value is 0 anyway — are completely unaffected.
 */
function measure(): void {
  const w = window.innerWidth - document.documentElement.clientWidth
  document.documentElement.style.setProperty('--scrollbar-width', `${Math.max(0, w)}px`)
}

/** Install the measurement (call once at app startup, from main.tsx). */
export function trackScrollbarWidth(): void {
  measure()
  window.addEventListener('resize', measure)
}
