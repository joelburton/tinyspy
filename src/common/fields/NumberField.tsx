// cs-unmet

import { Field } from './Field'
import type { AllFieldProps } from './fieldProps'
import styles from './NumberField.module.css'

type Props = AllFieldProps<number> & {
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** How many characters wide the box is, so a 1-digit band doesn't get a
   *  20-character input. */
  chars: number
}

/**
 * A NUMBER a player picks — a bag size, a word count, a percentage.
 *
 * One caller today (bananagrams' bunch size), which is normally too few to name
 * a type. It is named anyway because every OTHER field in a setup form is a
 * component, and the one raw `<input>` left is the one a future setting reaches
 * for and copies. That is exactly how five games ended up hand-rolling the
 * manual-board input, and how two hand-rolled the checkbox row.
 *
 * **`valueAsNumber`, not a parsed string.** It gives `NaN` for an empty or
 * half-typed box, which is honest — the box really does hold no number — and
 * lets the caller's validator say so rather than the field silently coercing to
 * zero.
 *
 * NOT for boggle's constraints grid: six of these in a 3×2 layout with column
 * heads is a grid, not six fields, and it is filed as boggle's own
 * (docs/games/boggle.md → Deferred).
 */
export function NumberField({
  name,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  chars,
  disabled,
  help,
  entryHelp,
  error,
}: Props) {
  return (
    <Field label={label} help={help} entryHelp={entryHelp} error={error} name={name}>
      {(id) => (
        <input
          id={id}
          type="number"
          name={name}
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          className={styles.input}
          // Sized from the largest value it holds rather than a hand-picked
          // rem — the same `ch` sizing <ManualBoardField> uses. The constant is
          // the box's own furniture: 1.8rem of padding plus the spinner arrows.
          // MEASURED, after 2.6rem shipped and clipped a single digit — it left
          // 50px of content box for 54px of content.
          style={{ width: `calc(${chars}ch + 3.4rem)` }}
          aria-invalid={error ? true : undefined}
        />
      )}
    </Field>
  )
}
