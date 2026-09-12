// cs-audited-page-header

import type { ReactNode } from 'react'
import styles from './PageHeader.module.css'

type Props = {
  // The LEFT slot: the menu trigger, and whatever travels with it — a
  // `<ChatButton>`, a `<PageHeaderStatusSlot>`. Every page has this.
  children: ReactNode
  // The RIGHT slot. Home and club pass nothing; the slot still renders, so all
  // three pages have one shape and adding something later is adding a child
  // rather than restructuring a header.
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
 * (common/core-css/patterns/heading.css).
 *
 * **A component rather than a class**, because the two slots are structure:
 * home, club and game were each assembling the same skeleton by hand, which
 * is how the three drifted apart in the first place (docs/ui.md → The page
 * header; docs/code-conventions.md → Patterns: a shared stylesheet with
 * several consumers and no component is a component waiting to be written).
 *
 * **Its height is `--pageHeader-height`, and the strip never grows.** A
 * second file composes from that token to place the mobile `<InfoSheet>`
 * under this rule (base.css says how and why), so a child that overflows is
 * fixed at the child — never by letting the strip give.
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
