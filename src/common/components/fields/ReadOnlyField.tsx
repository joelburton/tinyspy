// cs-fixed

import type { ReactNode } from 'react'
import styles from './ReadOnlyField.module.css'

type Props = {
  /** The caption above the value. */
  label: ReactNode
  /** What it says. Not editable, and not pretending to be. */
  children: ReactNode
}

/**
 * A CAPTION OVER A VALUE YOU CANNOT CHANGE — your username on the profile
 * modal, and whatever earns one later.
 *
 * **A field, because a field needn't be editable** (Joel, 2026-08-26). It sits
 * in a form, in the same column as the fields around it, wearing the same
 * caption — so it belongs to the vocabulary even though nothing about it takes
 * input.
 *
 * **NOT `<TextField readOnly>`, and the distinction matters.** `readOnly` on an
 * HTML input still renders an input: a bordered box, focusable, in the tab
 * order, that you simply cannot type into. This is plain text with no box at
 * all. A boolean that swapped `<input>` for `<span>` would be changing the
 * ELEMENT, which is more than a prop should do, and a call site reading
 * `<TextField readOnly>` would reasonably expect the greyed-out box it does not
 * get. The props diverge too: no `onChange`, no `placeholder`, no `maxLength`,
 * and `disabled` is meaningless when there is nothing to disable.
 *
 * If a case ever wants the real HTML behavior — a value you can select and copy
 * but not edit, an invite link say — that IS `<TextField readOnly>`, and both
 * names stay honest.
 */
export function ReadOnlyField({ label, children }: Props) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{children}</span>
    </div>
  )
}
