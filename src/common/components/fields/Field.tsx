// cs-fixed

import { useId, type ReactNode } from 'react'
import { cls } from '../../lib/util/cls'
import styles from './field.module.css'

type Props = {
  /** The caption above the control. A ReactNode, because CreateClubPage's
   *  carries a live hint beside the word ("Club name (becomes handle: jb)").
   *
   *  Omit it for no caption row at all — some fields ARE the surface, like a
   *  search box in a one-input panel where the titlebar already says what you
   *  are searching. Those name their control with `aria-label` instead. */
  label?: ReactNode
  /** HOW TO TYPE IT — advice about the entry, under the control. Not a
   *  section's help text, which explains what a setting MEANS and leads the
   *  section; this is "3–15 characters, must start with a letter". */
  entryHelp?: ReactNode
  /** WHAT'S WRONG with what's there now. Rings the control in the fault color
   *  (via `aria-invalid`, which the control sets) and says why underneath.
   *
   *  A setup form does NOT use this — its errors collect at the bottom, beside
   *  the Start they gate (Joel, 2026-08-26). This is for a form where the
   *  problem belongs to one entry. */
  error?: string | null
  /** A GROUP of controls rather than one — a swatch list, a checkbox list. It
   *  renders `<fieldset>` / `<legend>`, which is the element's actual job, and
   *  needs no id because there is no single control to point at. */
  group?: boolean
  /** Where the field sits in ITS OWN parent. Placement is the caller's. */
  className?: string
  /**
   * The control.
   *
   * **A function, for the single-control case, and that is the point.** `Field`
   * generates the id and hands it over, so the caption/control association
   * cannot be got wrong — which it was, on 2026-08-26, when a wrapping
   * `<label>` swallowed the help and the error into the control's accessible
   * name ("Word Letters only. Two letters or more.") and a test found nothing.
   * A component cannot repeat that mistake if it never writes the id itself.
   */
  children: ReactNode | ((id: string) => ReactNode)
}

/**
 * THE SHAPE EVERY FIELD HAS — caption, control, entry help, error, stacked.
 *
 * Written once because it had been written five times. `field.module.css`
 * already shared the CSS, and each component still laid out the markup itself,
 * which is the finding this area keeps re-finding one layer along
 * (plans/areas/forms.md → F34 `label-above-control`): a shared stylesheet is
 * not a shared shape. Only `<TextField>` could show entry help or an error at
 * all; now every field can, by forwarding two props.
 *
 * **`<CheckboxField>` is the one field that doesn't use it**, and it is a
 * different shape rather than a variant: its caption sits BESIDE the box, not
 * above. Bending `Field` to cover that would make it the thing it replaced.
 *
 * Two others nearly stayed out and shouldn't have (Joel, 2026-08-26).
 * `<ManualBoardField>` has no caption at TODAY'S five call sites — but "no
 * caller passes one" is not "the field can't have one", and building it unable
 * to means the next caller reinvents the row. `<PlayersField>` wanted a
 * quieter, smaller legend, which is a CSS question about one field, not a
 * reason to lay out its own. *"We want consistency between fields — we're
 * trying to collapse difference where reasonable."*
 */
export function Field({ label, entryHelp, error, group, className, children }: Props) {
  const id = useId()
  const control = typeof children === 'function' ? children(id) : children
  const Wrapper = group ? 'fieldset' : 'div'
  const Caption = group ? 'legend' : 'label'

  return (
    <Wrapper className={cls(styles.field, className)}>
      {label !== undefined && (
        // `htmlFor` only for the single-control case: a <legend> names the
        // group it heads, and pointing it at one member would be a lie.
        <Caption className={styles.label} {...(group ? {} : { htmlFor: id })}>
          {label}
        </Caption>
      )}
      {control}
      {entryHelp !== undefined && <span className={styles.entryHelp}>{entryHelp}</span>}
      {/* Both, when both — the help says how to type it and the error says what
          is wrong with what is there. Losing the instructions the moment you
          make a mistake takes them away exactly when they matter. */}
      {error && <span className={styles.error}>{error}</span>}
    </Wrapper>
  )
}
