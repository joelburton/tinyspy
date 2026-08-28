// cs-unmet

import { Field } from './Field'
import type { AllFieldProps } from './fieldProps'
import styles from './TextField.module.css'

type Props = AllFieldProps<string> & {
  onChange: (value: string) => void
  /** A textarea rather than an input, for a value with room to breathe. */
  multiline?: boolean
  rows?: number
  placeholder?: string
  maxLength?: number
  required?: boolean
  autoFocus?: boolean
  type?: 'text' | 'email'
  inputMode?: 'numeric'
  pattern?: string
  autoComplete?: string
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
  help,
  entryHelp,
  error,
  value,
  onChange,
  multiline,
  rows,
  placeholder,
  maxLength,
  required,
  autoFocus,
  disabled,
  name,
  type = 'text',
  inputMode,
  pattern,
  autoComplete,
  className,
}: Props) {
  const shared = {
    className: styles.control,
    'aria-invalid': error ? true : undefined,
    value,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    placeholder,
    maxLength,
    required,
    autoFocus,
    disabled,
    name,
    inputMode,
    pattern,
    autoComplete,
  }

  return (
    <Field label={label} help={help} entryHelp={entryHelp} error={error} name={name} className={className}>
      {(id) =>
        multiline ? (
          <textarea id={id} rows={rows} {...shared} />
        ) : (
          <input id={id} type={type} {...shared} />
        )
      }
    </Field>
  )
}
