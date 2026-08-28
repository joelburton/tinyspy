// cs-unmet

/**
 * waffle's setup form — what it offers, and where a refusal lands.
 *
 * The inventory is the spine (see `fieldNames`): these are the settings the
 * friends get, and losing one silently is the failure this catches. Each name
 * is also the `setup` key it writes and the FIELD `waffle-build-board` or
 * `waffle.create_game` names when it refuses one, so the list doubles as the
 * routing contract.
 *
 * waffle's board is built in Deno rather than in SQL, which changes nothing
 * here: the edge function relays the RPC's envelope untouched and writes its own
 * in the same shape, so a refusal from either arrives under a field name this
 * form already knows.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '../../common/components/setup/fieldNames'
import { errorUnder } from '../../common/components/fields/errorUnder'
import { DEFAULT_WAFFLE_SETUP } from '../lib/setup'
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
      brand="Waffle"
      clubHandle="moths"
      members={members}
      selfId="self"
      numberOfPlayers={[1, 6]}
      values={{
        ...DEFAULT_WAFFLE_SETUP,
        player_user_ids: new Set(members.map((m) => m.user_id)),
        ...values,
      }}
      set={set}
      errors={errors}
    />,
  )
  return { ...view, set }
}

describe('waffle setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    const { container } = draw()
    expect(fieldNames(container)).toEqual([
      'player_user_ids.self',
      'player_user_ids.moth',
      'coop_style',
      'difficulty',
      'extra_swaps',
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

describe('waffle setup — writing a setting', () => {
  it('writes the key create_game reads, under the name the field carries', async () => {
    const user = userEvent.setup()
    const { set } = draw()

    await user.click(screen.getByRole('radio', { name: /Relaxed/ }))

    expect(set).toHaveBeenCalledWith('extra_swaps', 8)
  })
})

describe('waffle setup — where a refusal lands', () => {
  it('puts the one refusal a player can act on under Difficulty', () => {
    // PN121, from waffle-build-board: the generator could not produce a board
    // at that band. Everything else waffle refuses is a fault — the form's own
    // controls bound it, or the player never touched it — so this is the only
    // sentence that belongs beside a control rather than in a modal.
    const message = 'No board could be built at that difficulty. Try another.'
    draw({ errors: { difficulty: message } })
    expect(errorUnder('difficulty')).toBe(message)
  })

  it('leaves the other fields able to carry one, whoever writes it', () => {
    // The routing is not the server's alone: a client-side check writes into
    // the same object, and every field reads its own key.
    draw({ errors: { extra_swaps: 'nope', player_user_ids: 'also nope' } })
    expect(errorUnder('extra_swaps')).toBe('nope')
    expect(errorUnder('player_user_ids')).toBe('also nope')
  })
})
