// cs-blessed-codenamesduet

import type { ReactNode } from 'react'
import styles from './InfoDisclosure.module.css'

/**
 * A closed-by-default section of the info column — a titled `<details>` a
 * player opens when they want it and closes to have the room back. Every game's
 * "Setup options" is one (`<SetupDisclosure>`); a game may add its own.
 *
 * **It is the allowed exception to the column's no-growth rule**: opening it
 * grows the column, and closing it reclaims the space (docs/ui.md → Layout
 * stability). Closed on every load.
 *
 * **A click must not leave focus on it** — see the `onMouseDown` below: a
 * focused summary would take the next key the game wanted.
 */
export function InfoDisclosure({
  title,
  children,
}: {
  // The summary line, the part that shows while it is closed.
  title: string
  // What opening it reveals.
  children: ReactNode
}) {
  return (
    <details className={styles.disclosure}>
      {/*
        Canceling `mousedown` is what withholds focus, that being the event's
        default action while the toggle is the click's. A pointer still opens
        and closes it, which is the only way it is ever operated.
      */}
      <summary onMouseDown={(e) => e.preventDefault()}>{title}</summary>
      {children}
    </details>
  )
}
