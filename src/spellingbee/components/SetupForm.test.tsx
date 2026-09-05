// cs-unmet

/**
 * spellingbee's setup form — what it offers, and where a refusal lands.
 *
 * The inventory is the spine (see `fieldNames`): these are the settings the
 * friends get, and losing one silently is the failure this catches. Each name
 * is also the `setup` key it writes and the FIELD `spellingbee-build-board` or
 * `spellingbee.create_game` names when it refuses one, so the list doubles as
 * the routing contract.
 *
 * `custom_letters` is the one box a refusal can land under, and it is worth
 * being precise about why: the dialog already rules out every SHAPE mistake
 * (no S, seven of them, all different), so the server has nothing to add there
 * — those arrive as faults. What it cannot rule out is whether those letters
 * make a puzzle, and that is the one thing the dictionary knows and the form
 * does not.
 *
 * One field, two setup keys: the box writes `custom_center` and `custom_letters`
 * from a single string, split after the first letter. The FIELD is named for
 * the second, which is where both a raise and the edge function address it.
 */
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '@/common/setup-form/fieldNames'
import { errorUnder } from '@/common/fields/errorUnder'
import { DEFAULT_SPELLINGBEE_SETUP_COOP } from '../lib/setup'
import type { Member } from '@/common/members/member'
import type { FormErrors } from '@/common/forms/formState'

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
      brand="FreeBee"
      clubHandle="moths"
      members={members}
      selfId="self"
      numberOfPlayers={[1, 6]}
      values={{
        ...DEFAULT_SPELLINGBEE_SETUP_COOP,
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

describe('spellingbee setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    const { container } = draw()
    expect(fieldNames(container)).toEqual([
      'player_user_ids',
      'target_rank',
      'required',
      'legal',
      'custom_letters',
      'timer',
    ])
  })

  it('offers the same settings in a race — only the target-rank caption changes', () => {
    expect(fieldNames(draw({ mode: 'compete' }).container)).toEqual(
      fieldNames(draw().container),
    )
  })

  it('drops the picker in a solo club, where there is nothing to choose', () => {
    const { container } = draw({ members: [MEMBERS[0]!] })
    expect(fieldNames(container)).not.toContain('player_user_ids')
  })
})

describe('spellingbee setup — writing a setting', () => {
  it('writes a number, not the string the select handed it', async () => {
    const user = userEvent.setup()
    const { set } = draw({ mode: 'compete', values: { target_rank: 3 } })

    await user.selectOptions(document.querySelector('[name="target_rank"]')!, '5')

    expect(set).toHaveBeenCalledWith('target_rank', 5)
  })
})

describe('spellingbee setup — where a refusal lands', () => {
  it('puts letters that make no puzzle under the box they were typed into', () => {
    // PN168 from create_game, PN175 from spellingbee-build-board — the same
    // sentence from whichever got there first, and the only refusal about this
    // box the dialog could not have made itself.
    const message = 'No words for those letters at that difficulty.'
    draw({ errors: { custom_letters: message } })
    expect(errorUnder('custom_letters')).toBe(message)
  })

  it('puts a required band nothing can be built at under Required words', () => {
    // PN177, from the builder: it wants at least thirty words at the REQUIRED
    // band, so a narrow one starves it — and that select is the only lever the
    // player has over it.
    const message = 'No puzzle could be built at that required difficulty. Try a wider one.'
    draw({ errors: { required: message } })
    expect(errorUnder('required')).toBe(message)
  })

  it('leaves the other fields able to carry one, whoever writes it', () => {
    draw({ errors: { legal: 'nope', target_rank: 'also nope' } })
    expect(errorUnder('legal')).toBe('nope')
    expect(errorUnder('target_rank')).toBe('also nope')
  })
})
