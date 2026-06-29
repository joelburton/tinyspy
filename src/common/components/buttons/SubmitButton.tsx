import { IconSubmit } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Submit-a-move button — the up-pointing triangle (the canonical "send my move"
 * glyph, see icons.ts) at the primary weight. Default label "Submit"; pass
 * `label` to deviate, `iconOnly` for the no-text form.
 *
 * Kept deliberately thin for now. When we wire submit behaviour (a `submitting`
 * state that swaps the label to "Submitting…" and auto-disables), it lands HERE
 * — the file already exists and every call site already routes through it.
 */
export function SubmitButton({ label = 'Submit', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconSubmit} label={label} weight="primary" {...rest} />
}
