// cs-audited

import { useState, type ReactNode } from 'react'
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
  /**
   * Open it without being asked. Default closed — the summary already shows the
   * value, so opening is for changing.
   *
   * **It can go false again, and that must not slam the section shut**
   * (2026-08-25). `<NextPuzzleField>` sets this from "there is nothing to
   * play", which flips back the moment you type a date that has one — and the
   * date box you are typing into is INSIDE the section. Forcing it closed
   * yanked the control out from under the cursor mid-edit, which an e2e spec
   * caught by timing out on an invisible input.
   */
  defaultOpen?: boolean
  children: ReactNode
}) {
  // The user's own toggle, seeded from `defaultOpen` and thereafter theirs.
  const [opened, setOpened] = useState(defaultOpen)

  return (
    // `opened || defaultOpen` is what makes the prop a DEFAULT rather than a
    // controlled value: a later `true` still opens the section (the reason to
    // open often arrives after mount, on an RPC), while a later `false` only
    // lets it close if the user had not opened it themselves. Without the
    // `useState`, React owns `open` outright and every re-render re-imposes it.
    <details
      className={styles.section}
      open={opened || defaultOpen}
      onToggle={(e) => setOpened(e.currentTarget.open)}
    >
      <summary className={styles.summary}>{label}</summary>
      <div className={styles.sectionContent}>{children}</div>
    </details>
  )
}
