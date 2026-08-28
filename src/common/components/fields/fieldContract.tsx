// cs-unmet

/**
 * THE ASSERTIONS EVERY FIELD SHARES — called once from each field's own test
 * file, which then goes on to test what is peculiar to it.
 *
 * `AllFieldProps` makes the compiler check that a field ACCEPTS `name`,
 * `label`, `error` and `disabled`. It cannot check that any of them is WIRED: a
 * component can take `disabled` and never hand it to its control, or take
 * `error` and never draw it, and nothing about that fails to compile. That gap
 * is the whole reason this exists.
 *
 * **Shared assertions, not a shared table.** The knowledge of how to render
 * each field minimally has to live somewhere, and next to the field is where it
 * belongs — a table of fourteen rows in one file is the same data with the
 * locality thrown away, and leaves a field with no obvious home for its own
 * tests (which is how a "simple" field ends up never getting any).
 */
import { describe, expect, it } from 'vitest'
import type { RenderResult } from '@testing-library/react'
import { within } from '@testing-library/react'
import { errorUnder, fieldBox } from './errorUnder'

/** The name every field under test is given. Fields that hold a GROUP of
 *  controls compose each one's from it (`tested_field.a`), so assertions match
 *  on the prefix. */
export const FIELD_NAME = 'tested_field'
export const FIELD_LABEL = 'The caption'
export const FIELD_ERROR = 'That will not do.'

/** The props the contract varies. A field's own test supplies everything else
 *  — its value, its options, whatever it needs to render at all. */
export type ContractProps = {
  /** Required, as it is on `AllFieldProps` — every call below passes it, and a
   *  field spreading these props must end up with one. */
  name: string
  label?: string
  error?: string
  disabled?: boolean
}

type Options = {
  /** Does this field draw a control you can operate? `<ReadOnlyField>` does
   *  not — it is a field in every way except that it shows as text — so the
   *  disabled assertion has nothing to check and is skipped for it. */
  interactive?: boolean
}

function controlsIn(container: HTMLElement) {
  return Array.from(container.querySelectorAll('input, select, textarea, button'))
}

/**
 * @param draw renders the field under test, spreading the contract's props over
 *   whatever else that field needs.
 */
export function expectFieldContract(
  draw: (props: ContractProps) => RenderResult,
  { interactive = true }: Options = {},
) {
  describe('the AllFieldProps contract', () => {
    it('puts its name into the DOM, so a test can find it without reading the copy', () => {
      // On the control — or composed onto each control of a group — which is
      // what lets a server validation naming a column reach the box that wrote
      // it. A field that draws no control at all (`<ReadOnlyField>`) is found
      // by its wrapper, asserted next.
      const { container } = draw({ name: FIELD_NAME })
      expect(
        container.querySelector(`[name^="${FIELD_NAME}"], [data-field="${FIELD_NAME}"]`),
      ).toBeInTheDocument()
    })

    it('wraps everything it draws in one box wearing its name', () => {
      // `<Field>` stamps this, not the component, so no field can be the one
      // that forgot — and a test can then ask what THIS field says instead of
      // searching the whole page and hoping nothing else matches.
      const { container } = draw({ name: FIELD_NAME, label: FIELD_LABEL })
      const box = container.querySelector(`[data-field="${FIELD_NAME}"]`)
      expect(box).toBeInTheDocument()
      expect(controlsIn(container).every((c) => box!.contains(c))).toBe(true)
    })

    it('draws its caption, inside its own box', () => {
      draw({ name: FIELD_NAME, label: FIELD_LABEL })
      expect(within(fieldBox(FIELD_NAME)!).getByText(FIELD_LABEL)).toBeInTheDocument()
    })

    it('draws its error, under its own name', () => {
      // Both halves, because drawing it is not the same as drawing it in the
      // right place. `errorUnder` reads `data-field-error`, which `<Field>`
      // stamps from the `name` this component forwards — so a component that
      // takes `name`, hands it to its control and forgets to pass it on draws
      // a perfectly good message that no form can prove belongs to this field.
      const { getByText } = draw({ name: FIELD_NAME, error: FIELD_ERROR })
      expect(getByText(FIELD_ERROR)).toBeInTheDocument()
      expect(errorUnder(FIELD_NAME)).toBe(FIELD_ERROR)
    })

    it('says nothing when there is no error', () => {
      const { queryByText } = draw({ name: FIELD_NAME })
      expect(queryByText(FIELD_ERROR)).not.toBeInTheDocument()
    })

    if (interactive) {
      it('disables every control it draws', () => {
        const { container } = draw({ name: FIELD_NAME, disabled: true })
        const controls = controlsIn(container)
        expect(controls.length).toBeGreaterThan(0)
        for (const control of controls) expect(control).toBeDisabled()
      })
    }
  })
}
