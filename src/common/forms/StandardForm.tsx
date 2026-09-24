// cs-blessed-forms

import { useCallback, useState, type ComponentPropsWithRef, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { cls } from '../utils/cls'
import { pressed } from '../keyboard/componentKeys'
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
 * **Enter commits it, from anywhere in it** — see `handleEnter`. The browser
 * only does that from a text box, which left a form of checkboxes and radios
 * (a game's setup) with no key that starts the game.
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

  /**
   * ENTER COMMITS THE FORM, wherever in it the keyboard happens to be.
   *
   * The browser's own rule is narrower — it submits from a text box and from
   * nothing else — so a form whose controls are checkboxes, radios and buttons
   * has no key that finishes it. Every game's setup dialog is such a form.
   *
   * Three targets keep their own Enter rather than handing it here: a button
   * (Enter presses it, which is how Cancel and the setup pickers work), a
   * textarea (Enter is a newline), and a native select (Enter closes its
   * dropdown, and the browser then submits from it anyway).
   *
   * It goes through the SUBMIT BUTTON rather than calling `onSubmit`, so a
   * commit the caller has disabled stays disabled: Enter is that button being
   * pressed, not a way around it.
   */
  function handleEnter(e: KeyboardEvent<HTMLFormElement>) {
    if (!pressed('keys-form-commit', e)) return
    const target = e.target as HTMLElement
    // A PORTAL still bubbles through the React tree, so a blocking modal a
    // field opened elsewhere in the DOM reaches this handler. Containment is
    // asked of the DOM, which is where the answer is.
    if (!e.currentTarget.contains(target)) return
    if (target.closest('button, textarea, select') !== null) return
    const commit = e.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]')
    if (commit === null || commit.disabled) return
    // Before the click, so the browser's own implicit submission — which fires
    // from a text box — cannot land a second one.
    e.preventDefault()
    commit.click()
  }

  return (
    // `ref` rides `rest`: a form that IS the page hangs its tab ring on it
    // (`LoginScreen`); inside a floating panel that ring already covers it.
    <form
      className={cls(styles.standardForm, className)}
      onSubmit={handleSubmit}
      onKeyDown={handleEnter}
      {...rest}
    >
      {children({ values, set })}
    </form>
  )
}
