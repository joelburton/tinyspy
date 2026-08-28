// cs-unmet

/**
 * crosswords' Start gate — one check per puzzle source.
 *
 * **These are the only setup messages in the roster still on the form's own
 * line**, and deliberately: crosswords' setup form is the one that has not had
 * its pass, so none of its controls carry a `name` for an error to land under.
 * They are keyed `_` rather than guessed at, which keeps them honest — a key
 * naming a field that does not exist would draw nothing at all, and the player
 * would be refused with no message anywhere.
 *
 * The assertions name `_` explicitly for the same reason: when the form
 * converts, this file goes red, which is the reminder to move them.
 */
import { describe, expect, it } from 'vitest'
import { crosswordsCoopGame } from '../manifest'
import { FORM_ERROR_KEYNAME } from '../../common/components/fields/formState'

const validate = crosswordsCoopGame.setupForm.validate!
const check = (setup: Record<string, unknown>) => validate(setup, 1)

describe('crosswords setup — the NYT source', () => {
  it('accepts a weekday, which is what the form always has', () => {
    expect(check({ source: 'nyt', weekday: 3 })).toEqual({})
  })

  it('accepts an explicit date instead', () => {
    expect(check({ source: 'nyt', date: '2026-08-27' })).toEqual({})
  })

  it('refuses neither, on the form line', () => {
    expect(check({ source: 'nyt' })).toEqual({
      [FORM_ERROR_KEYNAME]: 'Pick a weekday or a date.',
    })
  })
})

describe('crosswords setup — the other sources', () => {
  it('needs a Guardian series', () => {
    expect(check({ source: 'guardian', series: 'quiptic' })).toEqual({})
    expect(check({ source: 'guardian' })).toEqual({
      [FORM_ERROR_KEYNAME]: 'Pick a Guardian series.',
    })
  })

  it('needs an uploaded file', () => {
    expect(check({ source: 'upload', board: { grid: [] } })).toEqual({})
    expect(check({ source: 'upload' })).toEqual({
      [FORM_ERROR_KEYNAME]: 'Choose a .puz or .ipuz file.',
    })
  })

  it('needs a picked puzzle for anything else', () => {
    expect(check({ source: 'library', puzzle_id: 'p1' })).toEqual({})
    expect(check({ source: 'library' })).toEqual({
      [FORM_ERROR_KEYNAME]: 'Pick a puzzle to start.',
    })
  })
})
