// cs-fixed

import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * NEVER MIND — the way out of a form or a dialog, without doing the thing.
 *
 * It earns a purpose button of its own because it is the one invariant in the
 * family: always the word "Cancel", always quiet, always the outline, never a
 * glyph. Its commit partner deliberately does NOT get one — that button is Save
 * here, Start there, Create, Send, Reload, so its name is different at every
 * site and there is nothing to package (Joel, 2026-08-25).
 *
 * **This is the button F9 was about.** It was hand-written at seven sites as
 * `<button className="button secondary">Cancel</button>`, not because anyone
 * wanted a different button but because `ActionButton` required a glyph and a
 * Cancel has none. The tone vocabulary had been describing this control the
 * whole time — `quiet` is documented as "a dialog's Cancel" and a bare outline
 * has always defaulted to it — so nothing here is new paint. It is the same
 * button, finally reachable.
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
