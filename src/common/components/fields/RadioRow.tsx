// cs-audited

import type { ReactNode } from 'react'
import { Field } from './Field'
import styles from './RadioRow.module.css'

type Option<T> = { value: T; label: ReactNode }

type Props<T extends string | number> = {
  /** The radio group's `name` (mutually-exclusive within it). */
  name: string
  options: Option<T>[]
  /** The currently-selected value; the matching option renders checked.
   *  `undefined` (no selection yet) leaves them all unchecked. */
  value: T | undefined
  onChange: (value: T) => void
  /** Optional leading text inside the row, before the options
   *  (boggle: "Minimum word length:"). */
  prefix?: ReactNode
  /** A caption above the row, in the position every other field's sits. */
  label?: ReactNode
  /** What the setting is about, between the caption and the control. */
  help?: ReactNode
  /** How to give it, under the control. */
  entryHelp?: ReactNode
  /** What's wrong with what's there. */
  error?: string | null
  /** Where the field sits in ITS OWN parent. */
  className?: string
}

/**
 * A horizontal group of radio options for game setup forms — the
 * `<div class="radioRow">{options.map(<label class="radio"><input radio/>…)}</div>`
 * block every setup form was re-authoring. The `.radioRow` / `.radio` styling is
 * this component's own, alongside the markup it belongs to.
 *
 * Callers map their own options to `{ value, label }` — which absorbs the
 * per-form wrinkles (waffle's `(+N)` suffix as a `label` node, codenamesduet's
 * first-clue-giver keyed on `user_id` rather than the option itself, etc.).
 */
export function RadioRow<T extends string | number>({
  name,
  options,
  value,
  onChange,
  prefix,
  label,
  help,
  entryHelp,
  error,
  className,
}: Props<T>) {
  return (
    // Children as a NODE: each option is its own <label> around its radio, so
    // no id is wanted here and `Field` keeps the caption a plain element rather
    // than a <label> pointing at one member of a group.
    <Field label={label} help={help} entryHelp={entryHelp} error={error} className={className}>
      <div className={styles.radioRow}>
        {prefix != null && <span>{prefix}</span>}
        {options.map((opt) => (
          <label key={String(opt.value)} className={styles.radio}>
            <input
              type="radio"
              name={name}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </Field>
  )
}
