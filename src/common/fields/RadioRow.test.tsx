// cs-unmet

/**
 * PICK ONE, ALL SHOWN AT ONCE (see RadioRow.tsx) — the same choice
 * `<SelectField>` hides in a menu, for when there are few enough to lay out.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RadioRow } from './RadioRow'
import { expectFieldContract, FIELD_NAME } from './fieldContract'

const OPTIONS = [
  { value: 3, label: '3' },
  { value: 5, label: '5' },
]

expectFieldContract((props) => (
  render(<RadioRow options={OPTIONS} value={3} onChange={() => {}} {...props} />)
))

describe('RadioRow', () => {
  it('reports the option you picked, in its own type', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RadioRow name={FIELD_NAME} options={OPTIONS} value={3} onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: '5' }))

    // The NUMBER 5, not "5": callers write it straight into a setup key.
    expect(onChange).toHaveBeenCalledWith(5)
  })

  it('shares one name across the options, which is what makes them exclusive', () => {
    const { container } = render(
      <RadioRow name={FIELD_NAME} options={OPTIONS} value={3} onChange={() => {}} />,
    )
    const radios = container.querySelectorAll('input[type="radio"]')
    expect(radios).toHaveLength(2)
    for (const radio of radios) expect(radio).toHaveAttribute('name', FIELD_NAME)
  })

  it('checks the option matching the value, and none when there is no pick yet', () => {
    const { container, rerender } = render(
      <RadioRow name={FIELD_NAME} options={OPTIONS} value={5} onChange={() => {}} />,
    )
    expect(screen.getByRole('radio', { name: '5' })).toBeChecked()

    rerender(<RadioRow name={FIELD_NAME} options={OPTIONS} value={undefined} onChange={() => {}} />)
    expect(container.querySelectorAll('input:checked')).toHaveLength(0)
  })

  it('draws its prefix before the options', () => {
    render(
      <RadioRow name={FIELD_NAME} options={OPTIONS} value={3} onChange={() => {}} prefix="Minimum word length:" />,
    )
    expect(screen.getByText('Minimum word length:')).toBeInTheDocument()
  })
})
