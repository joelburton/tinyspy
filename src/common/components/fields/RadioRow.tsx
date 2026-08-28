// cs-unmet

import type { ReactNode } from 'react'
import { Field } from './Field'
import type { AllFieldProps } from './fieldProps'
import styles from './RadioRow.module.css'

type Option<T> = { value: T; label: ReactNode }

type Props<T extends string | number> = AllFieldProps<T | undefined> & {
  options: Option<T>[]
  onChange: (value: T) => void
  /** Optional leading text inside the row, before the options
   *  (boggle: "Minimum word length:"). */
  prefix?: ReactNode
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
 *
 * WHICH CONTROL — two axes, and this is the top-left of them.
 *
 *   WHAT IT DOES picks the family. This one SETS A VALUE: it looks and acts
 *   like an input, and the game reads what you picked later — every one of
 *   its call sites writes a key the RPC consumes. A control that changes what
 *   you are LOOKING at, recording no answer, is `.segmented`.
 *
 *   HOW MANY OPTIONS picks the shape. Few enough to show at once is this; a
 *   long list collapses into `<SelectField>`'s menu — which is why the
 *   co-op section's style is a radio row and its first-player picker is not.
 *
 * **Revealing a follow-up doesn't make it a tab.** Three of these do it —
 * "turns" reveals the first-player dropdown, `ai_count > 0` reveals Skill,
 * the timer's "Down" enables its MM:SS box. That is a further question that
 * only exists for one answer, not an alternative view of the same job.
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
  disabled,
  className,
}: Props<T>) {
  return (
    // Children as a NODE: each option is its own <label> around its radio, so
    // no id is wanted here and `Field` keeps the caption a plain element rather
    // than a <label> pointing at one member of a group.
    <Field label={label} help={help} entryHelp={entryHelp} error={error} name={name} className={className}>
      <div className={styles.radioRow}>
        {prefix != null && <span>{prefix}</span>}
        {options.map((opt) => (
          <label key={String(opt.value)} className={styles.radio}>
            <input
              type="radio"
              name={name}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              disabled={disabled}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </Field>
  )
}
