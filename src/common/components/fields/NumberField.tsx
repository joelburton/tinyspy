// cs-unmet

import type { ReactNode } from 'react'
import { Field } from './Field'
import styles from './NumberField.module.css'

type Props = {
  /** The `name` on the underlying input. */
  name: string
  /** The caption above the box. DRAWN, like every other field's — it wasn't at
   *  first, and three number boxes shipped with no captions at all because the
   *  label went only to `aria-label` (Joel spotted it on screen, 2026-08-26). */
  label?: ReactNode
  /** The name, for when there is no caption. */
  ariaLabel?: string
  /** The current value. `NaN` shows an empty box, which is what a half-typed
   *  number looks like: the caller decides whether that blocks Start. */
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** How wide, in characters of the largest value it can hold. `3` fits 144.
   *  The box adds room for its padding and its spinner arrows on top. */
  chars: number
  disabled?: boolean
  /** What the setting is about, between the caption and the box. */
  help?: ReactNode
  /** How to type it, under the box. */
  entryHelp?: ReactNode
  /** What's wrong with what's there. Rings the box and says why. */
  error?: string | null
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
  ariaLabel,
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
    <Field label={label} help={help} entryHelp={entryHelp} error={error}>
      {(id) => (
        <input
          id={id}
          type="number"
          name={name}
          aria-label={label === undefined ? ariaLabel : undefined}
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
