// cs-blessed-forms

import type { ReactNode } from 'react'
import { Field } from './Field'
import type { AllFieldProps } from './fieldProps'
import styles from './SelectField.module.css'

type Props = AllFieldProps<string | number> & {
  onChange: (value: string) => void
  // The `<option>`s.
  children: ReactNode
}

/**
 * The shared styled `<select>` for game setup forms — app control sizing plus a
 * custom chevron (`appearance: none`), matching the chunky text inputs and
 * buttons around it.
 *
 * **It has to be a component.** A native `<select>` is NOT covered by base.css's
 * `input, textarea` rule, so a form that reaches for a raw one gets an unstyled
 * control and restyles it by hand — which is three different looks as soon as
 * there are three forms.
 *
 * `DictBandField` is "a SelectField over the difficulty bands"; a game's other
 * setup selects compose it with their own `<option>`s.
 *
 * WHICH CONTROL — two axes, and this is the bottom-left of them.
 *
 *   WHAT IT DOES picks the family. This one SETS A VALUE the game reads
 *   later, same as `<RadioRow>`. A menu that changes what you are LOOKING at
 *   is `<FilterSelect>`, which deliberately never takes focus.
 *
 *   HOW MANY OPTIONS picks the shape. A list long enough that showing every
 *   choice would sprawl is this; a short one shows them all as `<RadioRow>`.
 *   The co-op section holds both and says why: style is two options, so it is
 *   a radio row, while first-player is however many players there are.
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
    <Field label={label} help={help} entryHelp={entryHelp} error={error} name={name}>
      {(id) => (
        // The wrapper exists for the chevron: a <select> can hold no child and
        // no pseudo-element, so the arrow is drawn on this span (see the
        // module), and the span is what positions it over the control.
        <span className={styles.wrap}>
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
        </span>
      )}
    </Field>
  )
}
