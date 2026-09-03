// cs-unmet

/**
 * letterboxed's setup form — what it offers, and where a refusal lands.
 *
 * The inventory is the spine (see `fieldNames`): these are the settings the
 * friends get, and losing one silently is the failure this catches. Each name
 * is also the `setup` key it writes and the FIELD `letterboxed-build-board`
 * names when it refuses one, so the list doubles as the routing contract.
 *
 * **`letterboxed.create_game` makes no validations at all** — the only game in
 * the roster where that is true. Its two settings are bounded by their own
 * selects, and everything else it checks is a board the player never composed.
 * Every refusal a player can actually act on comes from the edge function,
 * because judging a board needs the seed table and the frontend does not have
 * it: the dialog's own gate stops at shape (twelve distinct letters).
 *
 * Those four split across TWO fields, which is the thing worth pinning. Three
 * say "check what you typed" and belong on the board box; the fourth names a
 * number to raise the dictionary to, so it belongs on that select — a message
 * under the wrong one of the two would send the player to change a setting
 * that is fine.
 */
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '../../common/components/setup/fieldNames'
import { errorUnder } from '../../common/components/fields/errorUnder'
import { DEFAULT_LETTERBOXED_SETUP_COOP } from '../lib/setup'
import type { Member } from '../../common/lib/members/member'
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
      brand="SnakeBox"
      clubHandle="moths"
      members={members}
      selfId="self"
      numberOfPlayers={[1, 6]}
      values={{
        ...DEFAULT_LETTERBOXED_SETUP_COOP,
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

describe('letterboxed setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    const { container } = draw()
    expect(fieldNames(container)).toEqual([
      'player_user_ids',
      'coop_style',
      'extra_words',
      'legal_band',
      'custom_sides',
      'timer',
    ])
  })

  it('asks who goes first only once co-op is played in turns', () => {
    expect(fieldNames(draw().container)).not.toContain('first_turn_user_id')

    const { container } = draw({ values: { coop_style: 'turns', first_turn_user_id: 'self' } })
    expect(fieldNames(container)).toContain('first_turn_user_id')
  })

  it('drops the co-op pacing question in a race, where the chain is not shared', () => {
    expect(fieldNames(draw({ mode: 'compete' }).container)).not.toContain('coop_style')
  })

  it('drops the picker in a solo club, where there is nothing to choose', () => {
    const { container } = draw({ members: [MEMBERS[0]!] })
    expect(fieldNames(container)).not.toContain('player_user_ids')
  })
})

describe('letterboxed setup — writing a setting', () => {
  it('writes a number, not the string the select handed it', async () => {
    const user = userEvent.setup()
    const { set } = draw()

    await user.selectOptions(document.querySelector('[name="extra_words"]')!, '5')

    expect(set).toHaveBeenCalledWith('extra_words', 5)
  })
})

describe('letterboxed setup — where a refusal lands', () => {
  it('puts a board the seed table does not know under the board box', () => {
    // PN214 and PN215. The letters missed, or the arrangement did — either way
    // the only thing to do is check what you typed, so both ring that box.
    const message = 'No known solution for the letters in ABCDEFGHIJKL'
    draw({ errors: { custom_sides: message } })
    expect(errorUnder('custom_sides')).toBe(message)
  })

  it('puts the one refusal with an in-dialog fix on the dictionary select', () => {
    // PN216 and PN217: a board whose solution needs a wider dictionary, and a
    // roll that never landed. Both name the dictionary because raising it is
    // the fix — putting either on the board box would ring a board that is
    // fine.
    const message = 'That board needs dictionary 5 or higher'
    draw({ errors: { legal_band: message } })
    expect(errorUnder('legal_band')).toBe(message)
    expect(errorUnder('custom_sides')).toBeNull()
  })

  it('leaves the other fields able to carry one, whoever writes it', () => {
    draw({ errors: { extra_words: 'nope', player_user_ids: 'also nope' } })
    expect(errorUnder('extra_words')).toBe('nope')
    expect(errorUnder('player_user_ids')).toBe('also nope')
  })
})
