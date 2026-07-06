import type { ReactNode } from 'react'
import styles from './TriggerWithChevron.module.css'

/**
 * Standard content for a `<Menu>` trigger: the caller's identity element
 * (a game/app logo, the UserMenu's profile-color dot) with the little
 * down-chevron snugged up tight to its right — the "this opens a menu"
 * affordance, shared so every menu trigger reads the same way.
 *
 * Purely presentational: the wrapping `<Menu>` trigger button owns the
 * click/ARIA behavior; this is just the row inside it.
 */
export function TriggerWithChevron({ children }: { children: ReactNode }) {
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
