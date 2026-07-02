/**
 * Publish the usable viewport width (excluding the vertical scrollbar) as the
 * CSS custom property `--client-width` on the document root, kept fresh with a
 * ResizeObserver.
 *
 * ─── Why this exists ─────────────────────────────────────────────────────────
 * The viewport-bound game layout sizes the board column from the available
 * width (`--avail-w`, see common/components/PlayArea.module.css). The obvious
 * source, `100vw`, is wrong: **`100vw` INCLUDES the vertical scrollbar's width,
 * but the content box doesn't.** On systems with classic, space-taking
 * scrollbars (macOS set to "always show", most Windows), that overstates the
 * usable width, so the board is sized too wide and the whole board+info pair
 * overflows to the right — dragging the info column off-screen. It hits hardest
 * at game-over, when the shared WordList reveal fills the info column and forces
 * a scrollbar to appear.
 *
 * `document.documentElement.clientWidth` is the width of the root content box —
 * it **excludes the scrollbar in every engine** (Blink, WebKit, Gecko), which is
 * exactly the number we want. We publish it as `--client-width` and CSS does the
 * rest (`--avail-w = calc(var(--client-width) - <info col> - <gaps>)`).
 *
 * ─── Why a ResizeObserver, not a `resize` listener ───────────────────────────
 * An earlier version measured on `window`'s `resize` event and broke in
 * Safari/Firefox: a scrollbar appearing because *content grew* (the WordList
 * reveal) does NOT fire `resize`, so the stale "no scrollbar" width stuck and the
 * board overflowed. A ResizeObserver on the root element fires whenever its
 * content box changes width — including when a scrollbar appears/disappears — so
 * the value is always current. (It also fires once on `observe()`, covering the
 * initial measure.) Chrome happened to survive the old approach only because
 * `scrollbar-gutter: stable` reserved the gutter permanently; the other engines
 * don't reserve it the same way, which is why they regressed.
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
