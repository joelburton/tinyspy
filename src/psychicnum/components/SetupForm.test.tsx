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
  it('puts the one validation create_game can still raise under its field', () => {
    // PN049 — the dictionary has too few words at that band for a board this
    // size. The ONLY thing here the form cannot prevent, so the only thing that
    // arrives as a validation rather than a fault.
    const message = 'Not enough words at that difficulty for a board this size'
    draw({ errors: { difficulty: message } })
    expect(errorUnder('difficulty')).toBe(message)
  })

  it('leaves the other fields able to carry one, whoever writes it', () => {
    // The routing is not create_game's alone: a client-side check writes into
    // the same object, and every field reads its own key.
    draw({ errors: { guesses: 'nope', word_count: 'also nope' } })
    expect(errorUnder('guesses')).toBe('nope')
    expect(errorUnder('word_count')).toBe('also nope')
  })
})
