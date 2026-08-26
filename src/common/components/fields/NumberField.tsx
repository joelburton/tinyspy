// cs-fixed

import styles from './NumberField.module.css'

type Props = {
  /** The `name` on the underlying input. */
  name: string
  /** The accessible name — the label is usually the section summary above it. */
  label: string
  /** The current value. `NaN` shows an empty box, which is what a half-typed
   *  number looks like: the caller decides whether that blocks Start. */
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** How wide, in characters of the largest value it can hold. `3` fits 144. */
  chars: number
  disabled?: boolean
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
}: Props) {
  return (
    <input
      type="number"
      name={name}
      aria-label={label}
      inputMode="numeric"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.valueAsNumber)}
      className={styles.input}
      // Sized from the largest value it holds rather than a hand-picked rem —
      // the same `ch` sizing <ManualBoardField> uses. The spinner arrows need
      // room of their own, hence the constant.
      style={{ width: `calc(${chars}ch + 2.6rem)` }}
    />
  )
}
