// cs-unmet

/**
 * A FIELD IN EVERY WAY EXCEPT THAT IT SHOWS AS TEXT (see ReadOnlyField.tsx).
 *
 * It takes the whole of `AllFieldProps` and adds nothing — including `error`,
 * because a value you cannot edit can still be the one the server complains
 * about. Having no control is why it carries its `name` as `data-field`.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReadOnlyField } from './ReadOnlyField'
import { expectFieldContract, FIELD_NAME } from './fieldContract'

expectFieldContract(
  (props) => render(<ReadOnlyField value="mothcubes" {...props} />),
  // No control to disable — the field IS the text.
  { interactive: false },
)

describe('ReadOnlyField', () => {
  it('shows its value as text, with nothing to type into', () => {
    const { container } = render(<ReadOnlyField name={FIELD_NAME} value="mothcubes" />)

    expect(screen.getByText('mothcubes')).toBeInTheDocument()
    expect(container.querySelector('input, select, textarea')).not.toBeInTheDocument()
  })
})
