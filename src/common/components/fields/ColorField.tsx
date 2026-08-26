// cs-fixed

import type { ReactNode } from 'react'
import { ColorChoiceList } from '../account/ColorChoiceList'
import { Field } from './Field'

type Props = {
  /** The caption. Defaults to "Player color", which is what both callers say. */
  label?: string
  /** What the setting is about, between the caption and the control. */
  help?: ReactNode
  /** How to give it, under the control. */
  entryHelp?: ReactNode
  /** What's wrong with what's there. */
  error?: string | null
  value: string | null
  onChange: (color: string) => void
  disabled?: boolean
}

/**
 * PICK YOUR COLOR — the swatch list with its caption above it.
 *
 * THE WRAPPER IS THE COMPONENT, not just the list. `<ColorChoiceList>` draws the
 * swatches; the caption, the `<fieldset>` and the field chrome around them are
 * the same at both call sites (`EditProfileModal`, `ClaimHandleScreen`), and a
 * shared list with a hand-written wrapper leaves the wrapper to drift.
 *
 * **A `<fieldset>`, not a `<label>`**, because the control is a GROUP of
 * swatches rather than one input, and that is the element's actual job. The
 * shared field class carries the reset that keeps it aligned with the `<label>`
 * fields beside it.
 */
export function ColorField({
  label = 'Player color',
  value,
  onChange,
  disabled,
  help,
  entryHelp,
  error,
}: Props) {
  return (
    // `group`: the control is a SET of swatches, so the caption is a <legend>
    // heading them rather than a label pointing at one.
    <Field label={label} group help={help} entryHelp={entryHelp} error={error}>
      <ColorChoiceList value={value} onChange={onChange} disabled={disabled} />
    </Field>
  )
}
