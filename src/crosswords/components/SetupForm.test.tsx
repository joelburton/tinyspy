// cs-unmet

/**
 * crosswords' setup form — what it offers, and where a refusal lands.
 *
 * The inventory is the spine (see `fieldNames`): these are the settings the
 * friends get, and losing one silently is the failure this catches.
 *
 * **The shortest list in the roster, and it used to be the longest file.** Four
 * puzzle sources were four tab bodies held in one component, all mounted at
 * once so the dialog never resized (plans/areas/forms.md →
 * `puzzle-source-picks-in-a-dialog`). They are one field now, and the whole
 * form is players, that field, and the timer.
 *
 * So the thing worth pinning here is a NEGATIVE: no `puzzle_id`, no `weekday`,
 * no `series`, no `custom_board`. Those are still setup keys — `create_game`
 * reads every one of them — but they are no longer FIELDS, because the pickers
 * write them. A test that listed them would be describing the form this stopped
 * being, and would go green again the day someone put a tab back.
 */
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '../../common/components/setup/fieldNames'
import { errorUnder } from '../../common/components/fields/errorUnder'
import { CROSSWORDS_DEFAULTS } from '../lib/setup'
import type { Member } from '../../common/lib/members/member'
import type { FormErrors } from '../../common/components/fields/formState'

// jsdom doesn't implement scrollIntoView, and SelectionList keeps its cursor
// row in view with it — reached because a picker takes focus on open.
Element.prototype.scrollIntoView = vi.fn()

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
vi.mock('../db', () => ({ db: { rpc: mockRpc } }))

const MEMBERS = [
  { user_id: 'self', username: 'joel', color: 'red' },
  { user_id: 'moth', username: 'moth', color: 'blue' },
] as Member[]

function draw({
  values = {},
  errors = {} as FormErrors,
  members = MEMBERS,
} = {}) {
  const set = vi.fn()
  const view = render(
    <SetupForm
      mode="coop"
      brand="CrossPlay"
      clubHandle="moths"
      members={members}
      selfId="self"
      numberOfPlayers={[1, 8]}
      values={{
        ...CROSSWORDS_DEFAULTS,
        player_user_ids: new Set(members.map((m) => m.user_id)),
        ...values,
      }}
      set={set}
      setError={vi.fn()}
      errors={errors}
    />,
  )
  return { ...view, set }
}

beforeEach(() => {
  mockRpc.mockReset()
  mockRpc.mockResolvedValue({ data: null })
})

describe('crosswords setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    const { container } = draw()
    expect(fieldNames(container)).toEqual(['player_user_ids', 'source', 'timer'])
  })

  it('offers ONE puzzle field, not one per source', () => {
    // The four sources are pickers behind `source`, so none of the keys they
    // write is a field of this form. Listing any of them here would describe
    // the tabs this replaced.
    const names = fieldNames(draw().container)
    for (const gone of ['puzzle_id', 'weekday', 'date', 'series', 'custom_board', 'filename']) {
      expect(names).not.toContain(gone)
    }
  })

  it('drops the picker in a solo club, where there is nothing to choose', () => {
    const { container } = draw({ members: [MEMBERS[0]!] })
    expect(fieldNames(container)).not.toContain('player_user_ids')
  })

  it('keeps the same three settings whichever source is chosen', () => {
    // A picker changes what the field SAYS, never what the form contains — the
    // property the tab stack could not have, since each tab brought its own
    // controls into the dialog.
    for (const source of ['library', 'nyt', 'guardian', 'upload'] as const) {
      expect(fieldNames(draw({ values: { source } }).container), source).toEqual([
        'player_user_ids',
        'source',
        'timer',
      ])
    }
  })
})

describe('crosswords setup — the puzzle field', () => {
  it('says nothing is chosen yet rather than implying a default', () => {
    const { getByText } = draw()
    expect(getByText('Puzzle: choose one')).toBeInTheDocument()
  })

  it('writes EVERY puzzle key when a picker answers, including the absences', async () => {
    // The seam this form owns. A picker hands back the whole choice, and the
    // form applies all seven keys — so the ones the chosen source did not set
    // are written as `undefined` rather than left alone. That is what stops a
    // board parsed on the upload picker riding into `setup` after you switch to
    // Guardian, which would leak the answers.
    //
    // What the caption then SAYS is the field's own business, and is tested
    // there: `set` is a spy here, so `values` never advances.
    const user = userEvent.setup()
    const { getByRole, getByText, set } = draw({
      values: { source: 'upload', filename: 'moth.puz' },
    })

    await user.click(getByRole('button', { name: 'Guardian' }))
    await user.click(getByText('Quiptic'))

    expect(set).toHaveBeenCalledWith('source', 'guardian')
    expect(set).toHaveBeenCalledWith('series', 'quiptic')
    expect(set).toHaveBeenCalledWith('board', undefined)
    expect(set).toHaveBeenCalledWith('filename', undefined)
    expect(set).toHaveBeenCalledWith('puzzle_id', undefined)
  })
})

describe('crosswords setup — where a refusal lands', () => {
  it('puts a puzzle refusal under the field that picks one', () => {
    // PN222 from create_game, and the four `validate` messages. All of them are
    // about the same thing — you have not got a playable puzzle — and the button
    // row they ring is on screen whichever source was used, which is what the
    // tabs could not offer.
    const message = 'That puzzle is no longer in the library'
    draw({ errors: { source: message } })
    expect(errorUnder('source')).toBe(message)
  })

  it('leaves the other two able to carry one', () => {
    draw({ errors: { player_user_ids: 'nope', timer: 'also nope' } })
    expect(errorUnder('player_user_ids')).toBe('nope')
    expect(errorUnder('timer')).toBe('also nope')
  })
})
