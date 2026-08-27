// cs-unmet

import { useMemo, useState, type ComponentPropsWithRef, type FormEvent } from 'react'
import { cls } from '../../lib/util/cls'
import styles from './StandardForm.module.css'
import { FormStateContext, type FormErrors } from './formState'

/**
 * A FORM YOU FILL IN — fields stacked, one gap between them, and **the values
 * they hold**.
 *
 * `<form>` itself carries no styling, deliberately: it is a SUBMIT BOUNDARY,
 * not a look. Chat's composer and codenamesduet's clue strip are both real
 * forms that submit and neither wants a column of spaced fields, so looking
 * like a form is opt-in — the same reason a bare `<button>` has no chrome and
 * `<StandardButton>` supplies it.
 *
 * ─── Why it owns the values ──────────────────────────────────
 * What is currently being typed belongs to the form, not to the screen around
 * it: clearing, resetting and "has anything changed" are all questions about
 * the form, and every one of them used to be hand-rolled per component —
 * `WordEditDialog` keeps a second copy of its fields purely to diff against.
 * A field then takes a `name` and nothing else, so the wiring that was three
 * props each is one (plans/areas/forms.md → F48).
 *
 * ERRORS are passed IN rather than owned, because they arrive from an async
 * call this component knows nothing about — see `FormState`.
 *
 * ─── `initialValues` is read once ────────────────────────────
 * At mount, and never again, so nothing can reset under someone mid-type. A
 * form whose values load asynchronously simply isn't rendered until they
 * arrive; that is also what spares it from disabling every control while it
 * waits.
 *
 * What it does NOT own is the space around itself. That is the gap between this
 * form and whatever sits above or below it, which belongs to the container —
 * `<FloatingPanel density>` for a floating panel, the page for a page.
 */
export function StandardForm<V extends object>({
  className,
  initialValues,
  errors,
  onSubmit,
  ...rest
}: Omit<ComponentPropsWithRef<'form'>, 'onSubmit'> & {
  /** The starting values, keyed by field `name`. Read at mount only. Omitted
   *  by a form that still holds its own state in the component — the fields
   *  there pass `value`/`onChange` explicitly and never look here. */
  initialValues?: V
  /** Keyed by field `name`; `FORM_ERROR` for the form's own line. */
  errors?: FormErrors
  /** Submitted, with what the fields hold. The default action is already
   *  prevented — a form's job here is to hand over values, not an event. A form
   *  that still holds its own state ignores the argument. */
  onSubmit: (values: V) => void
}) {
  const [values, setValues] = useState<V>(initialValues ?? ({} as V))

  const state = useMemo(
    () => ({
      values: values as Record<string, unknown>,
      setValue: (name: string, value: unknown) =>
        setValues((prev) => ({ ...prev, [name]: value })),
      errors: errors ?? {},
    }),
    [values, errors],
  )

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onSubmit(values)
  }

  return (
    <FormStateContext value={state}>
      <form
        className={cls(styles.standardForm, className)}
        onSubmit={handleSubmit}
        {...rest}
      />
    </FormStateContext>
  )
}
