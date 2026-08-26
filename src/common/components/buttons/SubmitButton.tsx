// cs-unmet

import { IconSubmit } from '../icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Submit-a-move button — the up-pointing triangle (the canonical "send my move"
 * glyph, see icons.ts) at the primary weight. Default label "Submit"; pass
 * `label` to deviate, `iconOnly` for the no-text form.
 *
 * Kept deliberately thin for now. When we wire submit behavior (a `submitting`
 * state that swaps the label to "Submitting…" and auto-disables), it lands HERE
 * — the file already exists and every call site already routes through it.
 */
export function SubmitButton({
  name = 'Submit',
  icon = IconSubmit,
  weight = 'primary',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} weight={weight} {...rest} />
}
