// cs-unmet

/**
 * crosswords' Start gate — one check per puzzle source, all four on the SAME
 * field.
 *
 * They were on the form's bottom line until F50
 * (`puzzle-source-picks-in-a-dialog`), because the four sources were tabs and
 * no control carried a `name` for the errors object to key on. This file was
 * written asserting `'_'` explicitly so it would go red the moment that
 * changed, which is what happened — the reminder worked.
 *
 * One field for all four is not a shortcut. "You have not picked a puzzle" is
 * the same complaint however you were going to pick one, and the button row it
 * rings is on screen whichever source is chosen — which is the property the
 * tabs could not have.
 */
import { describe, expect, it } from 'vitest'
import { crosswordsCoopGame } from '../manifest'

const validate = crosswordsCoopGame.setupForm.validate!
const check = (setup: Record<string, unknown>) => validate(setup, 1)

describe('crosswords setup — the NYT source', () => {
  it('accepts a weekday, which is what the form always has', () => {
    expect(check({ source: 'nyt', weekday: 3 })).toEqual({})
  })

  it('accepts an explicit date instead', () => {
    expect(check({ source: 'nyt', date: '2026-08-27' })).toEqual({})
  })

  it('refuses neither, under the puzzle field', () => {
    expect(check({ source: 'nyt' })).toEqual({
      puzzle_source: 'Pick a weekday or a date.',
    })
  })
})

describe('crosswords setup — the other sources', () => {
  it('needs a Guardian series', () => {
    expect(check({ source: 'guardian', series: 'quiptic' })).toEqual({})
    expect(check({ source: 'guardian' })).toEqual({
      puzzle_source: 'Pick a Guardian series.',
    })
  })

  it('needs an uploaded file', () => {
    expect(check({ source: 'upload', board: { grid: [] } })).toEqual({})
    expect(check({ source: 'upload' })).toEqual({
      puzzle_source: 'Choose a .puz or .ipuz file.',
    })
  })

  it('needs a picked puzzle for anything else', () => {
    expect(check({ source: 'library', puzzle_id: 'p1' })).toEqual({})
    expect(check({ source: 'library' })).toEqual({
      puzzle_source: 'Pick a puzzle to start.',
    })
  })
})
