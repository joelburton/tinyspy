// cs-audited-forms

import { Field } from './Field'
import type { AllFieldProps } from './fieldProps'
import styles from './TextField.module.css'

type Props = AllFieldProps<string> & {
  onChange: (value: string) => void
  // A textarea rather than an input, for a value with room to breathe.
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
 * A LABELED TEXT BOX — the field type the app uses most.
 *
 * `ManualBoardField` is a SPECIALISED text field — the board you type — with
 * its own tracking, grouping and case rules. This is the plain one: a name, a
 * word, a search, a note.
 *
 * **The signature is the point.** It takes `AllFieldProps` and adds only what
 * a text box needs, so a prop added to every field later (a required marker,
 * say) is one edit in `fieldProps.ts` and not one per field.
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
