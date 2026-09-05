// cs-unmet

import type { ReactNode } from 'react'

/**
 * WHAT EVERY FIELD TAKES.
 *
 * `<TextField>`'s docstring has said for a while that "a prop added to all of
 * them later is one edit rather than eleven" — and left that to discipline,
 * which produced eleven different answers. Before this type: `label` was
 * `string` in three components and `ReactNode` in the rest, `name` was required
 * in three and absent from `RadioRow`, `className` existed on three of twelve,
 * and `PlayersField` called `disabled` `busy`.
 *
 * A component intersects this with its own props and NEVER redeclares one of
 * these. Redeclaring does not error — it intersects, so `error?: string | null`
 * meeting `error?: string` silently loses the `null` a caller can currently
 * pass, and `label?: ReactNode` meeting `label?: string` silently narrows.
 * Quiet narrowing is exactly the drift this exists to stop.
 *
 * ─── Why `onChange` is not here ──────────────────────────────
 * `<ReadOnlyField>` is a field in every way except that it shows as text, so it
 * takes this whole type. A prop it can only satisfy with a handler nobody calls
 * is not an all-fields prop. `value` stays: every field has one, including the
 * one that only displays it.
 */
export type AllFieldProps<T> = {
  /**
   * The field's key — its name in the form's values and errors, and the `name`
   * attribute on its control.
   *
   * REQUIRED, because it is what ties the three layers together: the SQL raise
   * says `column = 'member_usernames'`, the RPC argument is `member_usernames`,
   * and so is this. A field that skipped it would take a server validation
   * meant for it and drop the message on the floor.
   *
   * It is also how a test finds the field. Selecting by caption instead makes a
   * test fail when someone rewords a label, which is a change to the copy and
   * not to the form.
   *
   * A group of controls composes each one's from it (`${name}.${id}`), and a
   * field with no control at all carries it as `data-field` — either way, one
   * string finds it.
   */
  name: string
  /** The caption above the control. */
  label?: ReactNode
  /** What the setting is about, between the caption and the control. */
  help?: ReactNode
  /** How to give it, under the control. Advice about the entry itself —
   *  "3–15 characters, must start with a letter". */
  entryHelp?: ReactNode
  /** What's wrong with what's there now. Rings the control and says why
   *  underneath. Resolved by the field component, since the same value sets the
   *  control's `aria-invalid`. */
  error?: string | null
  disabled?: boolean
  /** Where the field sits in ITS OWN parent. Placement is the caller's. */
  className?: string
  /** What the field holds. */
  value: T
}
