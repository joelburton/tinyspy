// cs-unmet

/**
 * A DATE (see DateField.tsx). Its value is the `YYYY-MM-DD` string the DOM
 * uses, not a `Date` — the puzzle-date callers pass it straight to an RPC.
 */
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DateField } from './DateField'
import { expectFieldContract, FIELD_NAME } from './fieldContract'

expectFieldContract((props) => render(<DateField value="2026-08-27" onChange={() => {}} {...props} />))

describe('DateField', () => {
  it('reports the date as the string it was given', () => {
    const onChange = vi.fn()
    const { container } = render(
      <DateField name={FIELD_NAME} value="2026-08-27" onChange={onChange} />,
    )
    // `user.type` can't drive a date input in jsdom, and React tracks an
    // input's value so a raw assignment never reaches it. `fireEvent.change`
    // is the one that does.
    fireEvent.change(container.querySelector('input')!, { target: { value: '2026-09-01' } })

    expect(onChange).toHaveBeenCalledWith('2026-09-01')
  })

  it('passes its bounds to the control', () => {
    const { container } = render(
      <DateField name={FIELD_NAME} value="2026-08-27" onChange={() => {}} min="2026-01-01" max="2026-12-31" />,
    )
    const box = container.querySelector('input')!
    expect(box).toHaveAttribute('min', '2026-01-01')
    expect(box).toHaveAttribute('max', '2026-12-31')
  })

  it('rings the control when there is an error', () => {
    const { container } = render(
      <DateField name={FIELD_NAME} value="2026-08-27" onChange={() => {}} error="Too early." />,
    )
    expect(container.querySelector('input')).toHaveAttribute('aria-invalid', 'true')
  })
})
