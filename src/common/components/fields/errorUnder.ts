// cs-unmet

/**
 * WHAT THE FIELD CALLED `name` IS SAYING — for the tests that prove a message
 * reached the box it was about.
 *
 * **Read off the error itself, not inferred from where it sits.** `<Field>`
 * stamps every error it draws with `data-field-error={name}`, so this asks the
 * span which field it belongs to rather than walking up from a control and
 * guessing which of the wrapper's spans is the message. The difference matters
 * because the failure being guarded against — a message under the wrong control
 * — is one that LOOKS right: a red sentence under a field, just not that one.
 * A structural walk proves position; the attribute proves identity.
 *
 * It also reaches the half a walk cannot. A form-wide message belongs to no
 * control, so there is nothing to walk up from; `<FailureLine>` stamps itself
 * `_`, the key that message is filed under, and `formError()` reads it.
 */

/**
 * THE WHOLE FIELD called `name` — caption, help, control, entry help, error.
 *
 * `<Field>` stamps its wrapper, so this is one element containing everything
 * that field draws. Scope an assertion to it (`within(fieldBox('legal_guess'))`)
 * and the question becomes "what does THIS field say", which is a different
 * question from "does the page contain these words somewhere" — the second one
 * passes when two fields draw the same caption, or when the message you are
 * looking for is under the field next door.
 */
export function fieldBox(name: string): HTMLElement | null {
  return document.querySelector(`[data-field="${name}"]`)
}

/** The message drawn under the field called `name`, or `null` if it is silent. */
export function errorUnder(name: string): string | null {
  return document.querySelector(`[data-field-error="${name}"]`)?.textContent ?? null
}

/**
 * The message on the form's own line — the one that is about the surface rather
 * than any single entry.
 *
 * `'_'` because that is the key a form's errors object files it under
 * (`FORM_ERROR_KEYNAME`); the same string names it in the object, in a raise's
 * `column`, and here.
 */
export function formError(): string | null {
  return errorUnder('_')
}
