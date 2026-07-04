import type { ReactNode } from 'react'
import styles from './setupForm.module.css'

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
}

/**
 * A horizontal group of radio options for game setup forms — the
 * `<div class="radioRow">{options.map(<label class="radio"><input radio/>…)}</div>`
 * block every setup form was re-authoring. The `.radioRow` / `.radio` styling is
 * the shared one in setupForm.module.css; this owns the markup + a11y wiring.
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
}: Props<T>) {
  return (
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
  )
}
