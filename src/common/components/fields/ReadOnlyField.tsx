// cs-unmet

import type { ReactNode } from 'react'
import { Field } from './Field'
import type { AllFieldProps } from './fieldProps'
import styles from './ReadOnlyField.module.css'

type Props = AllFieldProps<ReactNode>

/**
 * A CAPTION OVER A VALUE YOU CANNOT CHANGE — your username on the profile
 * modal, and whatever earns one later.
 *
 * **A field, because a field needn't be editable**. It sits
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
export function ReadOnlyField({ label, name, help, entryHelp, error, value }: Props) {
  return (
    <Field label={label} help={help} entryHelp={entryHelp} error={error}>
      <span className={styles.value} data-field={name}>
        {value}
      </span>
    </Field>
  )
}
