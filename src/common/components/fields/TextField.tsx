// cs-fixed

import type { ReactNode } from 'react'
import { Field } from './Field'
import styles from './TextField.module.css'

type Props = {
  /**
   * The caption above the control. A ReactNode, because CreateClubPage's
   * carries a live hint beside the word ("Club name (becomes handle: jb)").
   *
   * **Omit it for no caption row at all** (Joel, 2026-08-26). Some fields ARE
   * the surface — a search box in a lookup dialog, where a caption above one
   * input in a one-input panel says nothing the title has not. Those pass
   * `ariaLabel` instead, so the control still has a name.
   */
  label?: ReactNode
  /** The accessible name when there is no caption. Exactly one of `label` and
   *  `ariaLabel` is expected: a caption names the control by wrapping it, and
   *  this names it when nothing is drawn. It is a plain string because a name
   *  is text, where a caption can be markup. */
  ariaLabel?: string
  value: string
  onChange: (value: string) => void
  /** A textarea instead of a one-line input. Same field, more room — not a
   *  different kind, which is why it's a prop and not a second component. */
  multiline?: boolean
  /** Textarea height, in rows. Ignored for a single-line field. */
  rows?: number
  /** HOW TO TYPE IT — advice about the entry, under the control. Not a
   *  section's help text, which explains what a setting means and leads the
   *  section; this is "3–15 characters, must start with a letter". */
  entryHelp?: ReactNode
  /** WHAT'S WRONG with what's there now. Rings the control in the fault color
   *  and says why underneath. `null` for nothing wrong.
   *
   *  A setup form does NOT use this — its errors collect at the bottom, beside
   *  the Start they gate (Joel, 2026-08-26). This is for a form where the
   *  problem belongs to one entry. */
  error?: string | null
  placeholder?: string
  maxLength?: number
  required?: boolean
  autoFocus?: boolean
  disabled?: boolean
  name?: string
  /** `email` gets the right keyboard on a phone and the browser's own check.
   *  Everything else is text; a number is `<NumberField>`. */
  type?: 'text' | 'email'
  /** Phone-keyboard and autofill hints — the sign-in code wants a numeric pad
   *  and the one-time-code autofill. */
  inputMode?: 'numeric'
  pattern?: string
  autoComplete?: string
  /** Where the field sits in ITS OWN parent — a search box shares a flex row
   *  with its button and has to grow. Placement is the caller's, always. */
  className?: string
}

/**
 * A LABELLED TEXT BOX — the field type the app uses most, and the last one with
 * no component.
 *
 * Every form that needed one invented `.field` again: `ClaimHandleScreen`,
 * `CreateClubPage`, `WordEditDialog` and `EditProfileModal` each declared a
 * flex-column caption-over-control, three of them byte-identical
 * (`gap: 0.4rem; border: none; margin: 0; padding: 0; min-width: 0`) and the
 * fourth at its own size. That is the same signature that made spellingbee's
 * and wordwheel's setup stylesheets a finding (plans/areas/forms.md → F34).
 *
 * `ManualBoardField` is a SPECIALISED text field — the board you type — and its
 * existence is why this one's absence went unnoticed: the setup forms had the
 * text field they needed, and every other form had none.
 *
 * **The signature is the point.** `label` / `value` / `onChange` / `disabled` is
 * what every field in `fields/` takes, so a prop added to all of them later
 * (a `help`, a required marker) is one edit rather than eleven.
 */
export function TextField({
  label,
  ariaLabel,
  entryHelp,
  error,
  value,
  onChange,
  multiline,
  rows,
  placeholder,
  maxLength,
  required,
  autoFocus,
  disabled,
  name,
  type = 'text',
  inputMode,
  pattern,
  autoComplete,
  className,
}: Props) {
  const shared = {
    className: styles.control,
    'aria-label': label === undefined ? ariaLabel : undefined,
    'aria-invalid': error ? true : undefined,
    value,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    placeholder,
    maxLength,
    required,
    autoFocus,
    disabled,
    name,
    inputMode,
    pattern,
    autoComplete,
  }

  return (
    <Field label={label} entryHelp={entryHelp} error={error} className={className}>
      {(id) =>
        multiline ? (
          <textarea id={id} rows={rows} {...shared} />
        ) : (
          <input id={id} type={type} {...shared} />
        )
      }
    </Field>
  )
}
