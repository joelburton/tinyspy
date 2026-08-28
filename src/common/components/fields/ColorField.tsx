// cs-unmet

import { ColorChoiceList } from '../account/ColorChoiceList'
import { Field } from './Field'
import type { AllFieldProps } from './fieldProps'

type Props = AllFieldProps<string | null> & {
  onChange: (color: string) => void
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
  name,
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
      {/* `data-field` rather than a name attribute — see the prop. It is what
          lets a test find this field the way it finds any other. */}
      <div data-field={name}>
        <ColorChoiceList value={value} onChange={onChange} disabled={disabled} />
      </div>
    </Field>
  )
}
