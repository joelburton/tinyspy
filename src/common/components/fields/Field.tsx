// cs-unmet

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
  /**
   * WHAT THIS FIELD IS ABOUT — a sentence under the caption and above the
   * control. "Return dumped tiles to the bag instead of the bunch."
   *
   * Distinct from `entryHelp`, which is about the TYPING rather than the
   * setting: this says what the thing does, that says how to enter it. Two
   * sentences with different jobs, so two slots, and neither has to guess where
   * the other went.
   *
   * A ReactNode, not a string: 4 of the app's 43 carry a `<strong>` and 6 more
   * an interpolated value.
   */
  help?: ReactNode
  /** HOW TO TYPE IT — advice about the entry, under the control. Where `help`
   *  says what the setting is, this says how to give it: "3–15 characters, must
   *  start with a letter", "abc float · ABC pinned in place". */
  entryHelp?: ReactNode
  /** WHAT'S WRONG with what's there now. Rings the control in the fault color
   *  (via `aria-invalid`, which the control sets) and says why underneath.
   *
   *  A setup form does NOT use this — its errors collect at the bottom, beside
   *  the Start they gate. This is for a form where the
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
   * generates the id and hands it over, so no component writes the
   * caption/control association itself and none can get it wrong. The mistake
   * it forecloses is a wrapping `<label>`, which takes its accessible name from
   * its whole text content — swallowing the help and the error into it ("Word
   * Letters only. Two letters or more.") where no test would see.
   */
  children: ReactNode | ((id: string) => ReactNode)
}

/**
 * THE SHAPE EVERY FIELD HAS — caption, control, entry help, error, stacked.
 *
 * Written once, because a shared stylesheet is not a shared shape:
 * `field.module.css` can hold the CSS while each component still lays out its
 * own markup, and then only the field that happened to need an error can show
 * one. Here every field gets all four slots by forwarding two props
 * (plans/areas/forms.md → F34 `label-above-control`).
 *
 * **`<CheckboxField>` is the one field that doesn't use it**, and it is a
 * different shape rather than a variant: its caption sits BESIDE the box, not
 * above. Bending `Field` to cover that would make it the thing it replaced.
 *
 * Two others nearly stayed out and shouldn't have.
 * `<ManualBoardField>` has no caption at TODAY'S five call sites — but "no
 * caller passes one" is not "the field can't have one", and building it unable
 * to means the next caller reinvents the row. `<PlayersField>` wanted a
 * quieter, smaller legend, which is a CSS question about one field, not a
 * reason to lay out its own. *"We want consistency between fields — we're
 * trying to collapse difference where reasonable."*
 */
export function Field({ label, help, entryHelp, error, group, className, children }: Props) {
  const id = useId()
  // Whether the caller TOOK the id is what decides how the caption points at
  // the control — see below.
  const wearsId = typeof children === 'function'
  const control = wearsId ? children(id) : children
  const Wrapper = group ? 'fieldset' : 'div'
  // A <legend> heads a group. A <label htmlFor> names the one control that took
  // the id. And when nobody took it, a plain <span>: the control labels ITSELF
  // — a checkbox's text sits in its own <label>, and a second label would both
  // nest (invalid) and join its name onto the first.
  const Caption = group ? 'legend' : wearsId ? 'label' : 'span'

  return (
    <Wrapper className={cls(styles.field, className)}>
      {label !== undefined && (
        <Caption className={styles.label} {...(group || !wearsId ? {} : { htmlFor: id })}>
          {label}
        </Caption>
      )}
      {help !== undefined && <span className={styles.help}>{help}</span>}
      {control}
      {entryHelp !== undefined && <span className={styles.entryHelp}>{entryHelp}</span>}
      {/* Both, when both — the help says how to type it and the error says what
          is wrong with what is there. Losing the instructions the moment you
          make a mistake takes them away exactly when they matter. */}
      {error && <span className={styles.error}>{error}</span>}
    </Wrapper>
  )
}
