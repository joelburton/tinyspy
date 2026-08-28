// cs-unmet

/**
 * setgame's setup form — two choices of its own, and the one where the
 * setting is not sent to the server at all.
 *
 * `deck` reaches `create_game`, which refuses anything but `full` or `junior`.
 * `palette` does not: it is how the cards are DRAWN, and the RPC never reads
 * it. Both are still fields with the same contract — a name that is the setup
 * key, and an error slot — because the form does not know which of its keys
 * the server happens to look at.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '../../common/components/setup/fieldNames'
import { errorUnder } from '../../common/components/fields/errorUnder'
import { DEFAULT_SETGAME_SETUP_COOP } from '../lib/setup'
import type { Member } from '../../common/lib/games'
import type { FormErrors } from '../../common/components/fields/formState'

const MEMBERS = [
  { user_id: 'self', username: 'joel', color: 'red' },
  { user_id: 'moth', username: 'moth', color: 'blue' },
] as Member[]

function draw({ mode = 'coop' as 'coop' | 'compete', values = {}, errors = {} as FormErrors } = {}) {
  const set = vi.fn()
  const view = render(
    <SetupForm
      mode={mode}
      brand="HareTrigger"
      clubHandle="moths"
      members={MEMBERS}
      selfId="self"
      numberOfPlayers={[1, 6]}
      values={{
        ...DEFAULT_SETGAME_SETUP_COOP,
        player_user_ids: new Set(MEMBERS.map((m) => m.user_id)),
        ...values,
      }}
      set={set}
      errors={errors}
    />,
  )
  return { ...view, set }
}

describe('setgame setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    expect(fieldNames(draw().container)).toEqual([
      'player_user_ids',
      'coop_style',
      'deck',
      'palette',
      'timer',
    ])
  })

  it('names each field for the setup key it writes', () => {
    // They were `setgame-deck` and `setgame-palette` — matching neither the
    // key nor anything a raise could name, so a refusal about the deck had
    // nowhere to land.
    const { container } = draw()
    expect(container.querySelector('[name="deck"]')).toBeInTheDocument()
    expect(container.querySelector('[name="setgame-deck"]')).not.toBeInTheDocument()
  })

  it('asks who goes first only once co-op is played in turns', () => {
    expect(fieldNames(draw().container)).not.toContain('first_turn_user_id')
    const { container } = draw({ values: { coop_style: 'turns', first_turn_user_id: 'self' } })
    expect(fieldNames(container)).toContain('first_turn_user_id')
  })
})

describe('setgame setup — the two decks', () => {
  it('writes the deck the RPC checks', async () => {
    const user = userEvent.setup()
    const { set } = draw()

    await user.click(screen.getByRole('radio', { name: /Junior/ }))

    expect(set).toHaveBeenCalledWith('deck', 'junior')
  })

  it('says what the junior deck actually drops', () => {
    // It is not "a slower version of the same game" — it removes shading, one
    // whole attribute, and the copy says so.
    draw()
    expect(screen.getByText(/drops shading/)).toBeInTheDocument()
  })
})

describe('setgame setup — where a refusal lands', () => {
  it.each([
    ['deck', 'A deck of ‘tarot’ reached the server'],
    ['palette', 'nothing raises this today, but the field can carry one'],
    ['player_user_ids', 'A game with 7 players reached the server'],
  ])('puts a message naming %s under that field', (field, message) => {
    draw({ errors: { [field]: message } })
    expect(errorUnder(field)).toBe(message)
  })
})
