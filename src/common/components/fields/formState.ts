// cs-unmet

import { createContext, use } from 'react'

/**
 * A FORM'S ERRORS — one object, keyed by field `name`, plus one key for the
 * message that isn't about any single field (plans/areas/forms.md → F48).
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
 *
 * `'_'` is the same marker SQL raises as its `COLUMN` when an author decides a
 * validation isn't about one input, so one string serves the raise, the
 * envelope and the form. No field can collide with it: a `name` is a real RPC
 * parameter name, and no parameter is called `_`.
 */
export const FORM_ERROR = '_'

/**
 * **The form owns what is being typed into it**, and hands it down.
 *
 * A field takes a `name` and nothing else — no `value`, no `onChange`, no
 * `error`. What it renders and where its message goes are both looked up here,
 * so what used to be three props per field is one.
 *
 * ERRORS are the exception: the form does not own them, because they arrive
 * from an async call it knows nothing about. The component that makes the call
 * owns them and passes them in.
 */
export type FormState = {
  values: Record<string, unknown>
  setValue: (name: string, value: unknown) => void
  errors: FormErrors
}

export const FormStateContext = createContext<FormState>({
  values: {},
  setValue: () => {},
  errors: {},
})

/**
 * Everything one field needs, by name.
 *
 * Resolved in the field COMPONENT rather than in `<Field>`, because the same
 * error has to reach the control's `aria-invalid` — which is what draws the
 * ring — and `<Field>` renders beside the control, not around it.
 */
export function useFormField(name: string | undefined) {
  const { values, setValue, errors } = use(FormStateContext)
  return {
    value: name === undefined ? undefined : values[name],
    setValue: (v: unknown) => {
      if (name !== undefined) setValue(name, v)
    },
    error: name === undefined ? undefined : errors[name],
  }
}

/**
 * The live values, for JSX INSIDE the form that reads one — a hint in a label,
 * a section that appears once a box is ticked.
 *
 * Reading them takes a component, which is the small price of the form owning
 * its own state: the parent writes `<HandleHint />` instead of an inline
 * ternary over a variable it was holding.
 */
export function useFormValues<V>(): V {
  return use(FormStateContext).values as V
}
