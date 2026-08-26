// cs-fixed

import type { ReactNode } from 'react'
import { Field } from './Field'
import styles from './ReadOnlyField.module.css'

type Props = {
  /** The caption above the value. Optional, like every field's. */
  label?: ReactNode
  /** What the field is about, between the caption and the value. */
  help?: ReactNode
  /** How the value gets set, since you can't set it here — "chosen when you
   *  claimed your handle". Same slot every other field has (Joel, 2026-08-26:
   *  it takes the same props), and it reads as the note under a value rather
   *  than as typing advice, because there is no typing to advise. */
  entryHelp?: ReactNode
  /** What's wrong — a value that couldn't be loaded, say. Rings nothing, since
   *  there is no control to ring, but the sentence still belongs to the field. */
  error?: string | null
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
export function ReadOnlyField({ label, help, entryHelp, error, children }: Props) {
  return (
    <Field label={label} help={help} entryHelp={entryHelp} error={error}>
      <span className={styles.value}>{children}</span>
    </Field>
  )
}
