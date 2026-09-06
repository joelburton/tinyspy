// cs-audited-buttons

import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * NEVER MIND — the way out of a form or a dialog, without doing the thing.
 *
 * It earns a purpose button of its own because it is the one invariant in the
 * family: always the word "Cancel", always the outline, always the least
 * emphatic thing in its row, never a glyph. Its commit partner deliberately
 * does NOT get one — that button is Save
 * here, Start there, Create, Send, Reload, so its name is different at every
 * site and there is nothing to package.
 *
 * It is a `<StandardButton>` and nothing more: the tone vocabulary has a value
 * documented as "a dialog's Cancel", which a bare outline defaults to anyway.
 * No new paint, just the packaging.
 *
 * Inside a `<form>`, pass `type="button"`: it is not the submit.
 */
export function CancelButton({
  name = 'Cancel',
  tone = 'quiet',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton name={name} tone={tone} {...rest} />
}
