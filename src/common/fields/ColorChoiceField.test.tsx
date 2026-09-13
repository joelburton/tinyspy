// cs-blessed-forms

/**
 * PICK YOUR COLOR (see ColorChoiceField.tsx) — a set of swatches, so it is a `group`
 * field with a `<legend>` and carries its name as `data-field`: there is no one
 * control for the name to sit on.
 */
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ColorChoiceField } from './ColorChoiceField'
import { expectFieldContract, FIELD_NAME } from './fieldContract'

expectFieldContract((props) => render(<ColorChoiceField value={null} onChange={() => {}} {...props} />))

describe('ColorChoiceField', () => {
  it('reports the swatch you picked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container } = render(<ColorChoiceField name={FIELD_NAME} value={null} onChange={onChange} />)

    const swatches = container.querySelectorAll('button')
    await user.click(swatches[1]!)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(typeof onChange.mock.calls[0]![0]).toBe('string')
  })

  it('offers more than one color to choose between', () => {
    const { container } = render(<ColorChoiceField name={FIELD_NAME} value={null} onChange={() => {}} />)
    expect(container.querySelectorAll('button').length).toBeGreaterThan(1)
  })
})
