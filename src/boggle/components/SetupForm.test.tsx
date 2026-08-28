// cs-unmet

/**
 * boggle's setup form — what it offers, and where a refusal lands.
 *
 * The inventory is the spine (see `fieldNames`): these are the settings the
 * friends get, and losing one silently is the failure this catches. Each name
 * is also the `setup` key it writes and the FIELD `boggle-build-board` or
 * `boggle.create_game` names when it refuses one, so the list doubles as the
 * routing contract.
 *
 * boggle is the roster's widest setup — seven of its own settings — and every
 * one of them is a control with a closed set of answers. So every refusal is a
 * fault except the two that ask the DICTIONARY something the form cannot answer
 * from its own values, and those two go to different places on purpose: a typed
 * board with nothing in it is about `custom_board`, while a constraint set no
 * roll satisfies is about the pickers TOGETHER and belongs on the form's line.
 */
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '../../common/components/setup/fieldNames'
import { errorUnder } from '../../common/components/fields/errorUnder'
import { DEFAULT_BOGGLE_SETUP_COOP } from '../lib/setup'
import type { Member } from '../../common/lib/games'
import type { FormErrors } from '../../common/components/fields/formState'

const MEMBERS = [
  { user_id: 'self', username: 'joel', color: 'red' },
  { user_id: 'moth', username: 'moth', color: 'blue' },
] as Member[]

function draw({
  mode = 'coop' as 'coop' | 'compete',
  values = {},
  errors = {} as FormErrors,
  members = MEMBERS,
} = {}) {
  const set = vi.fn()
  const view = render(
    <SetupForm
      mode={mode}
      brand="MothCubes"
      clubHandle="moths"
      members={members}
      selfId="self"
      numberOfPlayers={[1, 8]}
      values={{
        ...DEFAULT_BOGGLE_SETUP_COOP,
        player_user_ids: new Set(members.map((m) => m.user_id)),
        ...values,
      }}
      set={set}
      errors={errors}
    />,
  )
  return { ...view, set }
}

describe('boggle setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    const { container } = draw()
    expect(fieldNames(container)).toEqual([
      'player_user_ids',
      'dice_set',
      'custom_board',
      'band',
      'legal_band',
      'scoring_ladder',
      'min_word_length',
      'win_percent',
      'timer',
    ])
  })

  it('drops the picker in a solo club, where there is nothing to choose', () => {
    const { container } = draw({ members: [MEMBERS[0]!] })
    expect(fieldNames(container)).not.toContain('player_user_ids')
  })

  it('offers the same settings in a race — the mode changes the copy, not the knobs', () => {
    expect(fieldNames(draw({ mode: 'compete' }).container)).toEqual(
      fieldNames(draw().container),
    )
  })
})

describe('boggle setup — writing a setting', () => {
  it('writes a number, not the string the select handed it', async () => {
    const user = userEvent.setup()
    const { set } = draw()

    await user.selectOptions(document.querySelector('[name="band"]')!, '5')

    expect(set).toHaveBeenCalledWith('band', 5)
  })
})

describe('boggle setup — where a refusal lands', () => {
  it('puts a typed board with nothing in it under the box it was typed into', () => {
    // PN147 from create_game, PN154 from boggle-build-board — the same sentence
    // from whichever got there first, and the only refusal about this box that
    // the form could not have caught: whether those letters yield words is the
    // dictionary's answer, not the shape check the dialog already runs.
    const message = 'No words for those letters at that difficulty.'
    draw({ errors: { custom_board: message } })
    expect(errorUnder('custom_board')).toBe(message)
  })

  it('leaves every constraint picker able to carry one', () => {
    // The pickers are also where a fault's own field would land if one ever
    // named a single control, and where a client-side check writes today.
    draw({
      errors: {
        band: 'a', legal_band: 'b', scoring_ladder: 'c',
        min_word_length: 'd', win_percent: 'e', dice_set: 'f',
      },
    })
    expect(errorUnder('band')).toBe('a')
    expect(errorUnder('legal_band')).toBe('b')
    expect(errorUnder('scoring_ladder')).toBe('c')
    expect(errorUnder('min_word_length')).toBe('d')
    expect(errorUnder('win_percent')).toBe('e')
    expect(errorUnder('dice_set')).toBe('f')
  })
})
