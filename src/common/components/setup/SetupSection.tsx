import type { ReactNode } from 'react'
import styles from './SetupSection.module.css'

/**
 * A collapsible section in a setup DIALOG — a `<details>` whose `<summary>` shows
 * the field's label WITH its current value baked in (e.g. `Timer: none`,
 * `Dictionaries: 3 (Familiar) / 5 (Obscure)`, `Custom letters: A-BCDEFG`). So a
 * player sees the current setting at a glance and expands only to change it.
 * Closed by default.
 *
 * Distinct from the info-column `<SetupDisclosure>` (the "Setup options" recap
 * shown WHILE playing): this one wraps a single editable field in the setup
 * dialog, and its summary carries that field's live value. Used by the shared
 * `<TimerField>` and by per-game setup forms (e.g. spellingbee's Dictionaries +
 * Custom letters).
 */
export function SetupSection({
  label,
  defaultOpen = false,
  children,
}: {
  /** The summary text — the field's name plus its current value. */
  label: string
  /** Start expanded. Default closed (the summary already shows the value). */
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details className={styles.section} open={defaultOpen || undefined}>
      <summary className={styles.summary}>{label}</summary>
      <div className={styles.body}>{children}</div>
    </details>
  )
}
