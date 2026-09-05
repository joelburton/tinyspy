// cs-unmet

/**
 * A NUMBER (see NumberField.tsx) — and the one thing worth pinning about it:
 * what it hands back is a NUMBER. A `<input type="number">` reports a string,
 * so a field that forwarded it raw would put `"12"` into a setup key the SQL
 * reads as an int.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NumberField } from './NumberField'
import { expectFieldContract, FIELD_NAME } from './fieldContract'

expectFieldContract((props) => render(<NumberField value={3} chars={3} onChange={() => {}} {...props} />))

describe('NumberField', () => {
  it('reports a number, not the string the DOM gave it', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField name={FIELD_NAME} value={3} chars={3} onChange={onChange} />)

    await user.type(screen.getByRole('spinbutton'), '4')

    expect(onChange).toHaveBeenLastCalledWith(34)
    expect(onChange).not.toHaveBeenLastCalledWith('34')
  })

  it('passes its bounds to the control', () => {
    render(<NumberField name={FIELD_NAME} value={3} chars={3} onChange={() => {}} min={1} max={9} />)

    const box = screen.getByRole('spinbutton')
    expect(box).toHaveAttribute('min', '1')
    expect(box).toHaveAttribute('max', '9')
  })
})
