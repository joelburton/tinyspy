// cs-unmet

/**
 * The shape every field has (see Field.tsx) — and specifically the CAPTION,
 * which is the one thing in here that branches three ways.
 *
 * `TextField.test.tsx` already covers the slots (help, entry help, error, and
 * that the last two appear together) through a real field. What it only ever
 * exercises is the middle branch: one control, taking the id. The other two
 * are `<CheckboxField>` and the group fields, and nothing tests them.
 *
 * The branch matters because getting it wrong is invisible on screen: a
 * `<label>` around a checkbox that already has its own nests two labels, and a
 * `<legend>` carrying an `htmlFor` points at a control that does not exist.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from './Field'

describe('Field — the caption', () => {
  it('points at the control when the control takes the id', () => {
    render(
      <Field label="Word">{(id) => <input id={id} name="word" readOnly value="" />}</Field>,
    )
    // Found BY its caption: the label's `for` reached the control.
    expect(screen.getByLabelText('Word')).toHaveAttribute('name', 'word')
  })

  it('does not point at anything when nobody took the id', () => {
    // `<CheckboxField>`'s shape: the control sits inside its own <label>, so a
    // second one here would nest, and its accessible name would be this
    // caption joined onto that one.
    const { container } = render(
      <Field label="Dump to bag">
        <label>
          <input type="checkbox" name="dump_to_bag" readOnly checked={false} /> to the bag
        </label>
      </Field>,
    )
    const captions = container.querySelectorAll('label')
    expect(captions).toHaveLength(1)
    expect(captions[0]!.textContent).toBe(' to the bag')
    expect(screen.getByText('Dump to bag').tagName).toBe('SPAN')
  })

  it('heads a GROUP as a legend, with no control to point at', () => {
    const { container } = render(
      <Field label="Players" group>
        <input type="checkbox" name="player_user_ids.a" readOnly checked={false} />
        <input type="checkbox" name="player_user_ids.b" readOnly checked={false} />
      </Field>,
    )
    expect(container.querySelector('fieldset')).toBeInTheDocument()
    const legend = screen.getByText('Players')
    expect(legend.tagName).toBe('LEGEND')
    expect(legend).not.toHaveAttribute('for')
  })

  it('draws no caption row at all when there is no label', () => {
    const { container } = render(<Field>{(id) => <input id={id} name="query" readOnly value="" />}</Field>)
    expect(container.querySelector('label')).not.toBeInTheDocument()
    expect(container.querySelector('legend')).not.toBeInTheDocument()
  })
})
