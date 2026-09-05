// cs-unmet

/**
 * Publish the usable viewport width (excluding the vertical scrollbar) as the
 * CSS custom property `--client-width` on the document root, kept fresh with a
 * ResizeObserver.
 *
 * The viewport-bound game layout sizes the board column from the available
 * width (`--avail-w`, see common/game-page/PlayArea.module.css). The obvious
 * source, `100vw`, is wrong: **`100vw` INCLUDES the vertical scrollbar's width,
 * but the content box doesn't.**
 */

let last = -1

function publish(): void {
  const w = document.documentElement.clientWidth
  // Guard against redundant writes: setting the var re-runs the board math,
  // which can nudge layout and re-fire the observer — only write on real change.
  if (w === last) return
  last = w
  document.documentElement.style.setProperty('--client-width', `${w}px`)
}

/** Install the measurement (call once at app startup, from main.tsx). */
export function trackLayoutWidth(): void {
  publish()
  // Observe the root: its content-box width changes on window resize AND when a
  // scrollbar appears/disappears from content growth (the case `resize` misses).
  new ResizeObserver(publish).observe(document.documentElement)
}
