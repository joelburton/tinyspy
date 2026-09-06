// cs-audited-buttons

import { IconSubmit } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * SEND MY MOVE — reach for this wherever a player hands a finished move to the
 * game: codenamesduet's clue, a word entry, a staged play. It is the main
 * action of the row it sits in, and is filled to say so.
 *
 * Default label "Submit"; pass `label` to deviate ("Submitting…"), or
 * `show="icon"` for the icon-only square.
 *
 * Kept deliberately thin for now. When we wire submit behavior (a `submitting`
 * state that swaps the label to "Submitting…" and auto-disables), it lands HERE
 * — the file already exists and every call site already routes through it.
 */
export function SubmitButton({
  label = 'Submit',
  icon = IconSubmit,
  weight = 'primary',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} weight={weight} {...rest} />
}
