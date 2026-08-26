// cs-fixed

import type { ReactNode } from 'react'
import { Field } from './Field'
import styles from './DateField.module.css'

type Props = {
  /** The accessible name — "Puzzle date". */
  label: string
  /** `YYYY-MM-DD`, or `''` for no date. Kept as the RAW string so the box stays
   *  controlled even for a date that resolves to nothing. */
  value: string
  onChange: (value: string) => void
  /** Bounds, same format. crosswords' archive starts somewhere. */
  min?: string
  max?: string
  disabled?: boolean
  /** What the setting is about, between the caption and the box. */
  help?: ReactNode
  /** How to type it, under the box. */
  entryHelp?: ReactNode
  /** What's wrong with what's there. Rings the box and says why. */
  error?: string | null
}

/**
 * A DATE a player picks — always an override, never the main event.
 *
 * One caller today, `<SetupNextPuzzleSection>`, and named for the same reason
 * `<NumberField>` is: the raw `<input>` left standing is the one the next
 * setting copies. crosswords has two more of these and will want this when its
 * area comes.
 *
 * **Deliberately plain**, and that is inherited from the field it came out of:
 * the common case is leaving it empty, so it should read as a secondary control
 * rather than the section's main event, and it sits at its own intrinsic width —
 * a date input sized to its own content is a smaller target than a full-width
 * box, which is the right weight for something you rarely touch.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  disabled,
  help,
  entryHelp,
  error,
}: Props) {
  return (
    <Field label={label} help={help} entryHelp={entryHelp} error={error}>
      {(id) => (
        <input
          id={id}
          type="date"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={styles.input}
          aria-invalid={error ? true : undefined}
        />
      )}
    </Field>
  )
}
