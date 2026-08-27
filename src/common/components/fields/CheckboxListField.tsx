// cs-unmet

import type { ReactNode } from 'react'
import { cls } from '../../lib/util/cls'
import { CheckboxField } from './CheckboxField'
import { Field } from './Field'
import styles from './CheckboxListField.module.css'

/** One option in the list. `label` is a node because a caller routinely puts
 *  something beside the words — EditClubModal draws a `<ModePill>` after the
 *  gametype's name. */
export type CheckboxListOption = {
  /** What lands in the value set when this option is ticked. */
  value: string
  label: ReactNode
  /** A second line under the label, for what the option means. */
  description?: ReactNode
}

type Props = {
  /** The field's name — its key in the form's values and errors. */
  name: string
  /** The caption above the list. */
  label?: ReactNode
  /** What the setting is about, between the caption and the list. */
  help?: ReactNode
  /** How to give it, under the list. */
  entryHelp?: ReactNode
  /** What's wrong with what's ticked. */
  error?: string | null
  /** The ticked options. A Set because the question every row asks is "am I in
   *  it?", and an array would make that a scan per row. */
  value: Set<string>
  /** The whole new set — not the option that changed. A caller that wants the
   *  difference can compare, but every caller so far wants the set. */
  onChange: (next: Set<string>) => void
  options: CheckboxListOption[]
  disabled?: boolean
  /** Where the field sits in ITS OWN parent. Placement is the caller's. */
  className?: string
}

/**
 * PICK ANY NUMBER OF THEM — a bordered list of checkboxes as one field.
 *
 * `<CheckboxField>` is one on/off setting; this is a SET of them answering one
 * question, which is a different field rather than a repetition of that one.
 * The difference shows in the value: this holds `Set<string>`, so a form's
 * errors object gets one entry for the whole list and the server's `field` can
 * name it.
 *
 * **A `<fieldset>` with a `<legend>`**, via `<Field group>` — the caption heads
 * a group of controls rather than naming one, which is that element's actual
 * job and what `group` is for.
 *
 * The rows are the LIST's look, not the caller's: EditClubModal grew a private
 * `.gameRow` beside the shared `<CheckboxField>` because top-aligning a
 * two-line option had nowhere else to live. It lives here now.
 */
export function CheckboxListField({
  name,
  label,
  help,
  entryHelp,
  error,
  value,
  onChange,
  options,
  disabled,
  className,
}: Props) {
  function toggle(optionValue: string) {
    const next = new Set(value)
    if (next.has(optionValue)) next.delete(optionValue)
    else next.add(optionValue)
    onChange(next)
  }

  return (
    <Field
      label={label}
      help={help}
      entryHelp={entryHelp}
      error={error}
      group
      className={cls(styles.list, className)}
    >
      {options.map((option) => (
        <CheckboxField
          key={option.value}
          // The option's own name, so each box is a real named control. The
          // FIELD's name is the list's key in the form, which is a different
          // thing — one question, many boxes.
          name={`${name}.${option.value}`}
          checked={value.has(option.value)}
          onChange={() => toggle(option.value)}
          disabled={disabled}
          className={styles.row}
        >
          <span className={styles.text}>
            <span className={styles.label}>{option.label}</span>
            {option.description !== undefined && (
              <span className={styles.description}>{option.description}</span>
            )}
          </span>
        </CheckboxField>
      ))}
    </Field>
  )
}
