// cs-unmet

import type { MenuHeader } from './menuModel'
import styles from './MenuSectionHeader.module.css'

/**
 * A section's non-clickable header: a title and muted lines under it
 * (crosswords' puzzle title and credits). Not a menu item, so the arrow keys
 * pass over it.
 */
export function MenuSectionHeader({ header }: { header: MenuHeader }) {
  return (
    <div className={styles.header} role="presentation">
      <div className={styles.headerTitle}>{header.title}</div>
      {(header.lines ?? []).map((line, i) => (
        <div key={i} className={styles.headerLine}>
          {line}
        </div>
      ))}
    </div>
  )
}
