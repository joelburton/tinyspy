// cs-unmet

/**
 * WHAT THE FIELD CALLED `name` IS SAYING — for the tests that prove a server
 * validation reached the box it was about.
 *
 * **Found through the CONTROL, not by searching the page.** That is the whole
 * value of it: a test that asserted the message merely appeared SOMEWHERE would
 * pass with the raise's `column`, the input's `name` and the RPC's parameter
 * all disagreeing, which is the exact failure the error system exists to stop.
 *
 * Three shapes of field, one lookup:
 *
 *   - one control carrying the name        `<input name="club_name">`
 *   - a GROUP composing each control's     `<input name="player_user_ids.a">`
 *   - no control at all, so `data-field`   `<span data-field="username">`
 *
 * The wrapper is then the nearest `div` or `fieldset` above it whose last
 * element is a `<span>` — which is where `<Field>` puts the error, after the
 * caption, the control and the entry help.
 *
 * CAVEAT: a field with `entryHelp` and NO error has that as its last span, so
 * this reports the entry help. Comparing against the message a test supplied
 * still fails correctly; it is asserting the ABSENCE of an error that wants
 * `aria-invalid` on the control instead.
 */
export function errorUnder(name: string): string | null {
  const control =
    document.querySelector(`[name="${name}"]`) ??
    document.querySelector(`[name^="${name}."]`) ??
    document.querySelector(`[data-field="${name}"]`)
  if (!control) return null

  for (let el = control.parentElement; el; el = el.parentElement) {
    if (el.tagName !== 'DIV' && el.tagName !== 'FIELDSET') continue
    const last = el.lastElementChild
    if (last?.tagName !== 'SPAN') continue
    // Not the CONTROL, which can itself be the last span: `<ReadOnlyField>`
    // shows its value in one. Mistaking that for the error reports the value
    // as the message — "expected 'joel' to be …" — which reads as a routing
    // bug rather than as the absent error it is.
    if (last === control || last.contains(control)) return null
    return last.textContent
  }
  return null
}
