// cs-unmet

/**
 * A FORM'S ERRORS — one object, keyed by field `name`, plus one key for the
 * message that isn't about any single field (plans/areas/forms.md).
 *
 * The same shape whoever wrote the message: a client-side check writes into it
 * directly, and a server `validation` contributes one entry from the envelope's
 * `field` + `message`. That is why a field's `name` matches the RPC parameter
 * its value is sent as — then `column = 'member_usernames'` in SQL, an input
 * named `member_usernames`, and `db.rpc('create_club', { member_usernames })`
 * are one string derived from the function signature, with nothing invented on
 * either side for the other to guess.
 */
export type FormErrors = Record<string, string>

/**
 * The key for a message that belongs to the FORM rather than to a field.
 */
export const FORM_ERROR_KEYNAME = '_'
