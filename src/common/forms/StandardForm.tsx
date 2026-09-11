// cs-blessed-forms

import { useCallback, useState, type ComponentPropsWithRef, type FormEvent, type ReactNode } from 'react'
import { cls } from '../utils/cls'
import styles from './StandardForm.module.css'

/**
 * A FORM YOU FILL IN: fields stacked with one gap between them, and the values
 * they hold. Reach for it wherever a player types something and presses a
 * button. A `<form>` that merely submits, like chat's composer, is not one.
 *
 * The children are a function given `values` and `set`, so each field says
 * where its value comes from and where it goes, both typed against `V`. Errors
 * never come through here: the caller that made the call holds them and writes
 * `error={errors.<name>}` itself.
 *
 * forms/doc.md
 */
export function StandardForm<V extends object>({
  className,
  initialValues,
  onSubmit,
  children,
  ...rest
}: Omit<ComponentPropsWithRef<'form'>, 'onSubmit' | 'children'> & {
  // The starting values, keyed by field `name`. Read at mount only.
  initialValues: V
  // Submitted, with what the fields hold. The default action is already
  // prevented — a form's job here is to hand over values, not an event.
  onSubmit: (values: V) => void
  // The fields, given what to render and how to write back.
  children: (form: {
    values: V
    set: <K extends keyof V>(name: K, value: V[K]) => void
  }) => ReactNode
}) {
  // Read ONCE, at mount, so nothing can reset under someone mid-type. A form
  // whose values load later is not rendered until they arrive.
  const [values, setValues] = useState<V>(initialValues)

  // Stable, because a caller may hold it across renders — codenamesduet's
  // setup body lists it in an effect's deps. Only `setValues` is closed over,
  // and that is stable already.
  const set = useCallback(<K extends keyof V>(name: K, value: V[K]) => {
    setValues((prev) => ({ ...prev, [name]: value }))
  }, [])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onSubmit(values)
  }

  return (
    // `ref` rides `rest`: a form that IS the page hangs its tab ring on it
    // (`LoginScreen`); inside a floating panel that ring already covers it.
    <form className={cls(styles.standardForm, className)} onSubmit={handleSubmit} {...rest}>
      {children({ values, set })}
    </form>
  )
}
