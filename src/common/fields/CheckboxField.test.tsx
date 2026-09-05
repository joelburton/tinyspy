// cs-unmet

/**
 * ONE ON/OFF SETTING (see CheckboxField.tsx) — and the shape that makes it the
 * one field not built on `<Field>`: its caption sits BESIDE the box rather than
 * above it, so the words are inside the box's own `<label>`.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CheckboxField } from './CheckboxField'
import { expectFieldContract, FIELD_NAME } from './fieldContract'

expectFieldContract((props) => (
  render(<CheckboxField value={false} onChange={() => {}} {...props}>to the bag</CheckboxField>)
))

describe('CheckboxField', () => {
  it('reports the NEW state, not the event', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CheckboxField name={FIELD_NAME} value={false} onChange={onChange}>to the bag</CheckboxField>)

    await user.click(screen.getByRole('checkbox'))

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('puts its words inside the box, so the whole row is the click target', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CheckboxField name={FIELD_NAME} value={false} onChange={onChange}>to the bag</CheckboxField>)

    // Clicking the WORDS ticks the box — the reason they live in the label.
    await user.click(screen.getByText('to the bag'))

    expect(onChange).toHaveBeenCalledWith(true)
  })
})
