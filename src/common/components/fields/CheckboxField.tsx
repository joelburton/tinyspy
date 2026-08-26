// cs-fixed

import type { ReactNode } from 'react'
import { cls } from '../../lib/util/cls'
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
  /** Where the row sits in ITS OWN parent — EditClubModal's gametype rows carry
   *  a hairline and their own padding. Placement is the caller's, always. */
  className?: string
}

/**
 * A SINGLE ON/OFF SETTING — a checkbox with its meaning beside it.
 *
 * The last field type in a setup form whose vocabulary was a CSS class instead
 * of a component. `.checkRow` has been shared in `setupForm.module.css` for a
 * while, and the comment there says why: bananagrams and wordwheel had
 * byte-identical private copies, one of which carried a note saying it mirrored
 * the other — *"the standing signal to make the match structural rather than
 * remembered"*. The class was made structural and the MARKUP was not, so both
 * games kept re-authoring the same six lines around it.
 *
 * A radio group is `<RadioRow>`, a dropdown is `<SelectField>`, a number is
 * `<NumberField>`. This is the box.
 *
 * **The label is `children`, not a prop**, because some of these want emphasis
 * or an interpolated value in them and a string would force the next one that
 * does into hand-writing the row again — which is how we got here.
 */
export function CheckboxField({ name, checked, onChange, children, disabled, className }: Props) {
  return (
    <label className={cls(styles.row, className)}>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  )
}
