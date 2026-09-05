// cs-unmet

/**
 * PICK ONE OF MANY (see SelectField.tsx) — the menu form of the choice
 * `<RadioRow>` shows all at once.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SelectField } from './SelectField'
import { expectFieldContract, FIELD_NAME } from './fieldContract'

const OPTIONS = (
  <>
    <option value="a">Apples</option>
    <option value="b">Bees</option>
  </>
)

expectFieldContract((props) => (
  render(<SelectField value="a" onChange={() => {}} {...props}>{OPTIONS}</SelectField>)
))

describe('SelectField', () => {
  it('reports the chosen value, not the event', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SelectField name={FIELD_NAME} value="a" onChange={onChange}>{OPTIONS}</SelectField>)

    await user.selectOptions(screen.getByRole('combobox'), 'b')

    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('shows the current value as the selected option', () => {
    render(<SelectField name={FIELD_NAME} value="b" onChange={() => {}}>{OPTIONS}</SelectField>)

    expect(screen.getByRole('combobox')).toHaveValue('b')
  })
})
