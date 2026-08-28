// cs-unmet

/**
 * psychicnum's setup form — what it offers, and where a refusal lands.
 *
 * The inventory is the spine (see `fieldNames`): these are the settings the
 * friends get, and losing one silently is the failure this catches. Each name
 * is also the `setup` key it writes and the COLUMN `psychicnum.create_game`
 * names when it refuses one, so the list doubles as the routing contract.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '../../common/components/setup/fieldNames'
import { errorUnder } from '../../common/components/fields/errorUnder'
import { DEFAULT_PSYCHICNUM_SETUP } from '../lib/setup'
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
      brand="PsychicNum"
      clubHandle="moths"
      members={members}
      selfId="self"
      numberOfPlayers={[1, 6]}
      values={{
        ...DEFAULT_PSYCHICNUM_SETUP,
        player_user_ids: new Set(members.map((m) => m.user_id)),
        ...values,
      }}
      set={set}
      errors={errors}
    />,
  )
  return { ...view, set }
}

describe('psychicnum setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    const { container } = draw()
    expect(fieldNames(container)).toEqual([
      'player_user_ids.self',
      'player_user_ids.moth',
      'coop_style',
      'guesses',
      'word_count',
      'difficulty',
      'timer',
      'timer.seconds',
    ])
  })

  it('asks who goes first only once co-op is played in turns', () => {
    expect(fieldNames(draw().container)).not.toContain('first_turn_user_id')

    const { container } = draw({ values: { coop_style: 'turns', first_turn_user_id: 'self' } })
    expect(fieldNames(container)).toContain('first_turn_user_id')
  })

  it('drops the co-op pacing question in a race, where nobody shares a budget', () => {
    expect(fieldNames(draw({ mode: 'compete' }).container)).not.toContain('coop_style')
  })

  it('drops the picker in a solo club, where there is nothing to choose', () => {
    const { container } = draw({ members: [MEMBERS[0]!] })
    expect(fieldNames(container)).not.toContain('player_user_ids.self')
  })
})

describe('psychicnum setup — writing a setting', () => {
  it('writes the key the RPC reads, under the name the field carries', async () => {
    const user = userEvent.setup()
    const { set } = draw()

    await user.click(screen.getByRole('radio', { name: '9' }))

    expect(set).toHaveBeenCalledWith('guesses', 9)
  })
})

describe('psychicnum setup — where a refusal lands', () => {
  // `create_game` raises `column = 'guesses'` (PN044), `'word_count'` (PN046),
  // `'difficulty'` (PN048) and — through common.require_valid_timer —
  // `'timer'` (PN035/PN039). Each has to reach its own box.
  it.each([
    ['guesses', 'Guesses must be 3, 5, 7 or 9'],
    ['word_count', 'The board holds 5 to 20 words'],
    ['difficulty', 'Word difficulty runs from 1 to 6'],
    ['timer', 'A countdown runs from 1 second to 60 minutes'],
    ['player_user_ids', 'A race needs at least two players'],
  ])('puts a validation naming %s under that field', (field, message) => {
    draw({ errors: { [field]: message } })
    expect(errorUnder(field)).toBe(message)
  })
})
