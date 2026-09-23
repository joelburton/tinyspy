// cs-blessed-setup-form

import { InfoDisclosure } from '../info-sheet/InfoDisclosure'
import type { SetupRow } from './setupRows'
import styles from './SetupDisclosure.module.css'

/**
 * The info-column "Setup options" disclosure — an `<InfoDisclosure>` that
 * recaps the game's chosen settings while playing.
 *
 * Pass the array `<game>/lib/setupSummary.ts` builds, which is the same one the
 * PDF prints; a row renders as `label: value`. Every game's disclosure is
 * identical down to the `<li>`, so the whole of it lives here rather than the
 * wrapper alone.
 */
export function SetupDisclosure({ rows }: { rows: SetupRow[] }) {
  return (
    <InfoDisclosure title="Setup options">
      <ul className={styles.rows}>
        {rows.map((r) => (
          <li key={r.key}>
            {r.label}: {r.value}
          </li>
        ))}
      </ul>
    </InfoDisclosure>
  )
}
