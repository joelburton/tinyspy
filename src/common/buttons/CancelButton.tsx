// cs-blessed-buttons

import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * NEVER MIND — the way out of a form or a dialog, without doing the thing.
 *
 * It earns a purpose button of its own because it is the one invariant in the
 * family: always the word "Cancel", always the outline, always the least
 * emphatic thing in its row, never a glyph. Its commit partner is
 * `<FormSubmitButton>`, which packages the opposite half — that button's words
 * differ at every site (Save, Start, Create, Send, Accept), so it defaults no
 * label; what it packages is submitting the form and carrying the emphasis.
 *
 * It is a `<StandardButton>` and nothing more: the tone vocabulary has a value
 * documented as "a dialog's Cancel", which a bare outline defaults to anyway.
 * No new paint, just the packaging.
 *
 * Pass `show="label"`: this is the one button with no glyph of its own, and a
 * Cancel is the word and nothing else.
 */
export function CancelButton({
  label = 'Cancel',
  tone = 'quiet',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton label={label} tone={tone} {...rest} />
}
