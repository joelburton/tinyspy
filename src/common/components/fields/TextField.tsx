// cs-fixed

import type { ReactNode } from 'react'
import styles from './TextField.module.css'

type Props = {
  /** The caption above the control. A ReactNode, because CreateClubPage's
   *  carries a live hint beside the word ("Club name (becomes handle: jb)"). */
  label: ReactNode
  value: string
  onChange: (value: string) => void
  /** A textarea instead of a one-line input. Same field, more room — not a
   *  different kind, which is why it's a prop and not a second component. */
  multiline?: boolean
  /** Textarea height, in rows. Ignored for a single-line field. */
  rows?: number
  /** Anything that belongs UNDER the control and inside the field — the muted
   *  rule line ("3–15 characters…"), a validation hint. Left as children rather
   *  than named `help`, because two of the three callers style theirs by state
   *  (muted when valid, error when not) and a `help` prop would have to grow a
   *  tone before it was worth the name. */
  children?: ReactNode
  placeholder?: string
  maxLength?: number
  required?: boolean
  autoFocus?: boolean
  disabled?: boolean
  name?: string
}

/**
 * A LABELLED TEXT BOX — the field type the app uses most, and the last one with
 * no component.
 *
 * Every form that needed one invented `.field` again: `ClaimHandleScreen`,
 * `CreateClubPage`, `WordEditDialog` and `EditProfileModal` each declared a
 * flex-column caption-over-control, three of them byte-identical
 * (`gap: 0.4rem; border: none; margin: 0; padding: 0; min-width: 0`) and the
 * fourth at its own size. That is the same signature that made spellingbee's
 * and wordwheel's setup stylesheets a finding (plans/areas/forms.md → F34).
 *
 * `ManualBoardField` is a SPECIALISED text field — the board you type — and its
 * existence is why this one's absence went unnoticed: the setup forms had the
 * text field they needed, and every other form had none.
 *
 * **The signature is the point.** `label` / `value` / `onChange` / `disabled` is
 * what every field in `fields/` takes, so a prop added to all of them later
 * (a `help`, a required marker) is one edit rather than eleven.
 */
export function TextField({
  label,
  value,
  onChange,
  multiline,
  rows,
  children,
  placeholder,
  maxLength,
  required,
  autoFocus,
  disabled,
  name,
}: Props) {
  const shared = {
    className: styles.control,
    value,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    placeholder,
    maxLength,
    required,
    autoFocus,
    disabled,
    name,
  }

  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {multiline ? <textarea rows={rows} {...shared} /> : <input type="text" {...shared} />}
      {children}
    </label>
  )
}
