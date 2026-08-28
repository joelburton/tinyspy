// cs-unmet

/**
 * PICK ANY NUMBER OF THEM (see CheckboxListField.tsx) — a SET of on/off
 * settings answering one question, which is why its value is a `Set<string>`
 * and the form's errors object gets one entry for the whole list.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CheckboxListField } from './CheckboxListField'
import { expectFieldContract, FIELD_NAME } from './fieldContract'

const OPTIONS = [
  { value: 'wordle', label: 'Wordle', description: 'Five letters, six guesses.' },
  { value: 'boggle', label: 'MothCubes' },
]

expectFieldContract((props) => (
  render(<CheckboxListField value={new Set()} options={OPTIONS} onChange={() => {}} {...props} />)
))

describe('CheckboxListField', () => {
  it('hands back the whole next set, not the option that was clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <CheckboxListField
        name={FIELD_NAME}
        value={new Set(['wordle'])}
        options={OPTIONS}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: /MothCubes/ }))

    expect(onChange).toHaveBeenCalledWith(new Set(['wordle', 'boggle']))
  })

  it('unticks by removing from the set', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <CheckboxListField
        name={FIELD_NAME}
        value={new Set(['wordle', 'boggle'])}
        options={OPTIONS}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: /MothCubes/ }))

    expect(onChange).toHaveBeenCalledWith(new Set(['wordle']))
  })

  it('composes each box name from the field name', () => {
    // The FIELD's name is the list's key in the form — one question. Each box
    // still needs a name of its own, so it takes `<field>.<option>`.
    const { container } = render(
      <CheckboxListField name={FIELD_NAME} value={new Set()} options={OPTIONS} onChange={() => {}} />,
    )
    expect(container.querySelector(`[name="${FIELD_NAME}.wordle"]`)).toBeInTheDocument()
    expect(container.querySelector(`[name="${FIELD_NAME}.boggle"]`)).toBeInTheDocument()
  })

  it('draws an option description when it has one', () => {
    render(
      <CheckboxListField name={FIELD_NAME} value={new Set()} options={OPTIONS} onChange={() => {}} />,
    )
    expect(screen.getByText('Five letters, six guesses.')).toBeInTheDocument()
  })
})
