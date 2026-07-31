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
  return (
    <div className={styles.bar} data-mobile-status>
      {children}
    </div>
  )
}
