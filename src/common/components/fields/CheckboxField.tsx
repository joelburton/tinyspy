// cs-fixed

import type { ReactNode } from 'react'
import { Field } from './Field'
import styles from './CheckboxField.module.css'

type Props = {
  /** The `name` on the underlying input. */
  name: string
  /** On or off. */
  checked: boolean
  onChange: (checked: boolean) => void
  /** What the box means, sitting beside it — "Unique letters only". The whole
   *  row is the click target, so this is inside the `<label>`. */
  children: ReactNode
  disabled?: boolean
  /** A caption ABOVE the row, in the position every other field's sits.
   *  Separate from `children`, which is the text beside the box — and optional,
   *  because no caller passes one today: a checkbox whose inline text already
   *  says what it does needs no second heading. The prop exists so this field
   *  has the same shape as the rest. */
  label?: ReactNode
  /** What the setting is about, between the caption and the control. */
  help?: ReactNode
  /** How to give it, under the control. */
  entryHelp?: ReactNode
  /** What's wrong with what's there. */
  error?: string | null
  /** Where the row sits in ITS OWN parent — EditClubModal's gametype rows carry
   *  a hairline and their own padding. Placement is the caller's, always. */
  className?: string
}

/**
 * A SINGLE ON/OFF SETTING — a checkbox with its meaning beside it.
 *
 * The one field whose caption sits BESIDE the control rather than above it, so
 * it wears `<Field>` for the wrapper and keeps its own inline row inside. With
 * no `label` and no `help` — which is every caller today — the wrapper adds
 * nothing visible.
 *
 * A COMPONENT rather than a shared class, because the six lines of markup around
 * the box are the part that gets re-typed. A class makes two copies of that
 * markup agree on their paint; only a component stops there being two.
 *
 * A radio group is `<RadioRow>`, a dropdown is `<SelectField>`, a number is
 * `<NumberField>`. This is the box.
 *
 * **The label is `children`, not a prop**, because some of these want emphasis
 * or an interpolated value in them and a string would force the next one that
 * does into hand-writing the row again — which is how we got here.
 */
export function CheckboxField({
  name,
  checked,
  onChange,
  children,
  disabled,
  label,
  help,
  entryHelp,
  error,
  className,
}: Props) {
  return (
    // Children as a NODE, not a function: the row is its own <label> wrapping
    // the box, so nothing here wants the id — and `Field` reads that and makes
    // the caption a plain element rather than a second, nesting <label>.
    <Field label={label} help={help} entryHelp={entryHelp} error={error} className={className}>
      <label className={styles.row}>
        <input
          type="checkbox"
          name={name}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        {children}
      </label>
    </Field>
  )
}
