// cs-found

import type { ReactNode } from 'react'
import styles from './MenuTrigger.module.css'

/**
 * What a `<Menu>`'s trigger holds: the caller's identity element — a game or app
 * logo — with the little down-chevron snugged up tight to its right. The chevron
 * is the "this opens a menu" affordance, shared so every trigger reads the same
 * way.
 *
 * Three consumers, all of them the page header's menu: HomePage, ClubPage,
 * GamePage. Purely presentational — the wrapping `<Menu>` trigger button owns
 * the click and the ARIA; this is the row inside it.
 */
export function MenuTrigger({ children }: { children: ReactNode }) {
  return (
    <span className={styles.row}>
      {children}
      <MenuChevron />
    </span>
  )
}

/** Tiny down-chevron. Inline SVG so it inherits `currentColor`; size kept
 *  small so it reads as an affordance mark, not a second icon. */
function MenuChevron() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}
