// cs-unmet

import { Field } from './Field'
import type { AllFieldProps } from './fieldProps'
import styles from './DateField.module.css'

type Props = AllFieldProps<string> & {
  onChange: (value: string) => void
  min?: string
  max?: string
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
  name,
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
          name={name}
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
