import type { ReactNode } from 'react'
import styles from './MobileStatusBar.module.css'

/**
 * The mobile-only status strip that sits ABOVE the board, carrying the game's
 * core state readout (codenamesduet: "3/15 agents · 4/9 turns").
 *
 * **Why it exists.** On desktop that readout is the info column's `.infoState`
 * line, always in view beside the board. Below the `--mobile` breakpoint the
 * whole info column moves off-canvas into the `<InfoSheet>` (docs/mobile.md →
 * the shared recipe), so the player loses their live state unless they open the
 * sheet — a tap, mid-game, to answer "how many agents left?". This puts the one
 * line that answers it back on the play surface.
 *
 * **Render it as the FIRST child of `shared.boardCol`** (above the board). It's
 * hidden by pure CSS on desktop — `display: none`, so it generates no box and
 * no flex gap — rather than by a `useIsMobile()` branch: the visibility is
 * exactly the InfoSheet's breakpoint, and CSS can't disagree with itself across
 * a resize the way two independent JS/CSS reads can.
 *
 * **Feed it the SAME node the info column renders**, not a re-worded copy — a
 * game should extract its state line into one component and hand it to both
 * (see codenamesduet's `StateLine`), so the two can't drift.
 *
 * The bar is a fixed-height, non-wrapping row: it costs the board that height
 * and nothing more, ever (docs/ui.md → Layout stability). Keep the content to
 * one short line.
 */
export function MobileStatusBar({ children }: { children: ReactNode }) {
  // `data-mobile-status` is the e2e handle (the repo's `[data-board]` /
  // `[data-info-sheet]` convention) — hashed CSS-module class names aren't
  // selectable from a browser test.
  //
  // The inner <span> is load-bearing, not a wrapper habit: `.bar` is a flex
  // container, and a flex container turns each run of text into its OWN
  // anonymous flex item, DROPPING the whitespace between them. A status line
  // built from `<strong>1/3</strong> found · <strong>0/7</strong> guesses used`
  // then renders as "1/3found·0/7guesses used" — visibly tighter than the same
  // component inside the info column's plain <p>. Making the span the single
  // flex item hands the text back to normal inline layout, so both surfaces
  // space identically.
  return (
    <div className={styles.bar} data-mobile-status>
      <span>{children}</span>
    </div>
  )
}
