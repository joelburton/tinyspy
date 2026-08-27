// cs-unmet

import { useState, type ComponentPropsWithRef, type FormEvent, type ReactNode } from 'react'
import { cls } from '../../lib/util/cls'
import styles from './StandardForm.module.css'

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
 *
 * ─── …and hands them back through the children ───────────────
 * The children are a FUNCTION, given the values and a setter, which is what
 * keeps the wiring visible: `value={values.club_name}` says where the value
 * comes from and `set('club_name', v)` says where it goes. It also gets the
 * field names checked for free — both are typed against `V`, so a typo is a
 * compile error instead of a field that silently does nothing.
 *
 * The alternative was a context each field read by `name`, which buys
 * `<TextField name="club_name" />` and nothing else, at the price of both of
 * those. Nothing here is deep enough to need it: every field is either in the
 * form's own JSX or is already handed `{ value, onChange }` by its parent, the
 * way the sixteen setup bodies are.
 *
 * ─── `initialValues` is read once ────────────────────────────
 * At mount, and never again, so nothing can reset under someone mid-type. A
 * form whose values load asynchronously simply isn't rendered until they
 * arrive; that is also what spares it from disabling every control while it
 * waits.
 *
 * ERRORS never reach this component. They arrive from an async call it knows
 * nothing about, and the caller that makes that call already holds them — so it
 * writes `error={errors.club_name}` from the same scope as everything else.
 *
 * What it does NOT own is the space around itself. That is the gap between this
 * form and whatever sits above or below it, which belongs to the container —
 * `<FloatingPanel density>` for a floating panel, the page for a page.
 */
export function StandardForm<V extends object>({
  className,
  initialValues,
  onSubmit,
  children,
  ...rest
}: Omit<ComponentPropsWithRef<'form'>, 'onSubmit' | 'children'> & {
  /** The starting values, keyed by field `name`. Read at mount only. */
  initialValues: V
  /** Submitted, with what the fields hold. The default action is already
   *  prevented — a form's job here is to hand over values, not an event. */
  onSubmit: (values: V) => void
  /** The fields, given what to render and how to write back. */
  children: (form: {
    values: V
    set: <K extends keyof V>(name: K, value: V[K]) => void
  }) => ReactNode
}) {
  const [values, setValues] = useState<V>(initialValues)

  function set<K extends keyof V>(name: K, value: V[K]) {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onSubmit(values)
  }

  return (
    <form className={cls(styles.standardForm, className)} onSubmit={handleSubmit} {...rest}>
      {children({ values, set })}
    </form>
  )
}
