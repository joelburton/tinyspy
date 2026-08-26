// cs-audited

import type { ReactNode } from 'react'
import { Field } from './Field'
import styles from './SelectField.module.css'

type Props = {
  /** Optional field label rendered above the select. Omit it when the select
   *  sits inside a form section that already supplies a heading (a `<fieldset>`
   *  legend), in which case just the bare styled `<select>` is returned. */
  label?: string
  /** The selected option's value. */
  value: string | number
  /** Fired with the raw selected string; the caller parses (e.g. `Number(v)`)
   *  since a native `<select>` value is always a string. */
  onChange: (value: string) => void
  disabled?: boolean
  /** Optional `name` on the underlying `<select>`. */
  name?: string
  /** What the setting is about, between the caption and the control. */
  help?: ReactNode
  /** How to type it, under the control. */
  entryHelp?: ReactNode
  /** What's wrong with what's there. Rings the control and says why. */
  error?: string | null
  /** The `<option>` elements. */
  children: ReactNode
}

/**
 * The shared styled `<select>` for game setup forms. A native `<select>` isn't
 * covered by base.css's `input, textarea` rule, so each form used to
 * restyle its own — and they drifted into three looks (a custom-chevron one, a
 * native-arrow one, and an unstyled one). This is the single canonical control:
 * app control sizing + a custom chevron (`appearance: none`), matching the
 * chunky text inputs / buttons around it.
 *
 * `DictBandField` is "a SelectField over the difficulty bands"; the other
 * setup selects (boggle dice/ladder, wordle guesses, psychicnum word-count)
 * compose it with their own `<option>`s.
 */
export function SelectField({
  label,
  value,
  onChange,
  disabled,
  name,
  help,
  entryHelp,
  error,
  children,
}: Props) {
  return (
    <Field label={label} help={help} entryHelp={entryHelp} error={error}>
      {(id) => (
        <select
          id={id}
          className={styles.select}
          name={name}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
        >
          {children}
        </select>
      )}
    </Field>
  )
}
