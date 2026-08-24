// cs-found

import type { ReactNode } from 'react'
import styles from './PageHeader.module.css'

type Props = {
  /** The LEFT slot: the menu trigger, and whatever travels with it —
   *  a `<ChatButton>`, a `<PageHeaderStatusSlot>`. Every page has this. */
  children: ReactNode
  /** The RIGHT slot. Home and club pass nothing; the slot still renders,
   *  so all three pages have one shape and adding something later is
   *  adding a child rather than restructuring a header. */
  right?: ReactNode
}

/**
 * The strip at the top of every page: the menu trigger hard against the
 * page's top-left (the body's own padding is the only margin), a thin rule
 * beneath, and whatever else that page needs on the line.
 *
 * `<h1>`–`<h6>` are HEADINGS; this is a HEADER. The two are unrelated — a
 * heading labels a section and moves with its content, this is the page's
 * furniture — and the other one is `.heading-with-controls`
 * (common/patterns/heading.css).
 *
 * **A component rather than a class**, because the two slots are structure:
 * home, club and game were each assembling the same skeleton by hand, which
 * is how the three drifted apart in the first place (docs/ui.md → the page
 * header; plans/css-system-2.md §7 — a shared stylesheet with several
 * consumers and no component is a component waiting to be written).
 *
 * **THE HEIGHT IS A CONTRACT.** All three pages were `2.5rem` tall by
 * arithmetic nobody had written down — a 32px logo plus the menu trigger's
 * `0.25rem` of padding on each side — while `base.css` hard-coded that same
 * `2.5rem` into `--game-header-bottom`, the value that positions the mobile
 * `<InfoSheet>` just under this rule. Two places agreeing by coincidence is
 * how the sheet ends up riding 4px over the rule at one viewport, which has
 * happened once already (the token's comment records it). Both now read
 * `--page-header-height`, so moving the strip's height moves the sheet with
 * it.
 *
 * What each page puts in it:
 *
 *   home   left: the menu.                                right: —
 *   club   left: menu, chat bubble, status slot.          right: —
 *   game   left: menu, panel toggles, status slot.        right: pause,
 *                                                          timer, info switch
 */
export function PageHeader({ children, right }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.left}>{children}</div>
      <div className={styles.right}>{right}</div>
    </header>
  )
}
