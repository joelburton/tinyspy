// cs-blessed-setup-form

import type { SetupRow } from './setupRows'
import styles from './SetupDisclosure.module.css'

/**
 * The info-column "Setup options" disclosure — a closed-by-default `<details>`
 * that recaps the game's chosen settings while playing.
 *
 * Pass the array `<game>/lib/setupSummary.ts` builds, which is the same one the
 * PDF prints; a row renders as `label: value`. Every game's disclosure is
 * identical down to the `<li>`, so the whole of it lives here rather than the
 * wrapper alone.
 *
 * **A click must not leave focus on it** — see the `onMouseDown` below.
 */
export function SetupDisclosure({ rows }: { rows: SetupRow[] }) {
  return (
    <details className={styles.disclosure}>
      {/*
        Canceling `mousedown` is what withholds focus, that being the event's
        default action while the toggle is the click's. A pointer still opens
        and closes it, which is the only way it is ever operated.
      */}
      <summary onMouseDown={(e) => e.preventDefault()}>Setup options</summary>
      <ul>
        {rows.map((r) => (
          <li key={r.key}>
            {r.label}: {r.value}
          </li>
        ))}
      </ul>
    </details>
  )
}
