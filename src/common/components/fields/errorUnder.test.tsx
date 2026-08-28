// cs-unmet

/**
 * THE LOOKUP THE ROUTING TESTS RELY ON (see errorUnder.ts).
 *
 * It needs its own file because of how it fails. Six form tests use it, and
 * seven of those assertions are NEGATIVE — "this message did NOT land here". A
 * broken `errorUnder` that always returned `null` would satisfy every one of
 * them while proving nothing, which is worse than not checking at all.
 *
 * Tested against the REAL field components rather than hand-built markup: what
 * it has to cope with is the three shapes those actually produce, and a
 * hand-drawn approximation would prove it copes with my drawing.
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { errorUnder } from './errorUnder'
import { TextField } from './TextField'
import { CheckboxListField } from './CheckboxListField'
import { ReadOnlyField } from './ReadOnlyField'
import { ColorField } from './ColorField'

const MESSAGE = 'That will not do.'

describe('errorUnder — the three shapes of field', () => {
  it('finds one under a control that carries the name', () => {
    render(<TextField name="club_name" value="" onChange={() => {}} error={MESSAGE} />)
    expect(errorUnder('club_name')).toBe(MESSAGE)
  })

  it('finds one under a GROUP, whose controls compose the name', () => {
    // The boxes are `gametypes.wordle`; nothing is named `gametypes` itself.
    render(
      <CheckboxListField
        name="gametypes"
        value={new Set()}
        options={[{ value: 'wordle', label: 'Wordle' }]}
        onChange={() => {}}
        error={MESSAGE}
      />,
    )
    expect(errorUnder('gametypes')).toBe(MESSAGE)
  })

  it('finds one under a field with no control at all, which uses data-field', () => {
    render(<ColorField name="new_color" value={null} onChange={() => {}} error={MESSAGE} />)
    expect(errorUnder('new_color')).toBe(MESSAGE)
  })
})

describe('errorUnder — when there is nothing to find', () => {
  it('says null for a field with no error', () => {
    render(<TextField name="club_name" value="" onChange={() => {}} />)
    expect(errorUnder('club_name')).toBeNull()
  })

  it('says null for a name that is not on the page', () => {
    render(<TextField name="club_name" value="" onChange={() => {}} />)
    expect(errorUnder('nothing_called_this')).toBeNull()
  })

  it('does not mistake the VALUE for an error', () => {
    // `<ReadOnlyField>` shows its value in a span, which is the last child when
    // there is no error. Reporting that reads as a message the server sent —
    // and it is how this was actually found: "expected 'joel' to be …".
    render(<ReadOnlyField name="username" value="joel" />)
    expect(errorUnder('username')).toBeNull()
  })

  it('still finds the real error on that same field', () => {
    render(<ReadOnlyField name="username" value="joel" error={MESSAGE} />)
    expect(errorUnder('username')).toBe(MESSAGE)
  })
})

describe('errorUnder — telling two fields apart', () => {
  it('reads each field, not whichever error is on the page', () => {
    // The whole point: a page-wide text match would pass with the raise's
    // column, the input's name and the RPC parameter all disagreeing.
    render(
      <>
        <TextField name="club_name" value="" onChange={() => {}} />
        <TextField name="member_usernames" value="" onChange={() => {}} error={MESSAGE} />
      </>,
    )
    expect(errorUnder('member_usernames')).toBe(MESSAGE)
    expect(errorUnder('club_name')).toBeNull()
  })
})
