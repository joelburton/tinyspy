// cs-blessed-buttons

import { StandardButton, type StandardButtonProps } from './StandardButton'

/**
 * THE COMMIT OF A FORM OR DIALOG — the button that does the thing, opposite the
 * `<CancelButton>` that doesn't. Save here, Start there, Create, Send magic
 * link, Accept, Find, Define: its words differ at every site, so `label` is
 * required and there is no default to lean on.
 *
 * What IS the same everywhere is what this packages: it submits the form rather
 * than handling a click, and it carries the row's emphasis. Both live here, so
 * a call site says what its button is called and nothing else.
 *
 * Pass `show="label"`, like its Cancel partner: a dialog's commit is read as
 * the word — "Save" needs no picture — and a footer where only one of two
 * buttons carries a glyph reads as lopsided. `show` is not defaulted here for
 * the same reason it is defaulted nowhere: the call site saying what it draws
 * is the point.
 */
export function FormSubmitButton(props: StandardButtonProps) {
  return <StandardButton type="submit" weight="primary" {...props} />
}
