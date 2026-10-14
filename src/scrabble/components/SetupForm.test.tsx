// cs-unmet

/**
 * scrabble's setup form — the only one with an opponent to configure, and the
 * only game so far whose refusals are ALL faults.
 *
 * `validateScrabbleSetup` gates Start on all three cross-field rules (seats
 * over four, seats under two, dictionaries below the AI's band), and every
 * other control offers a closed set. So `create_game` has nothing left it can
 * refuse that the form would have allowed — ten raises, ten faults, and the
 * form's own line is where they all land.
 *
 * The fields still carry their error slots: a client-side check writes into
 * the same object, and the form cannot know which of its keys the server
 * happens to look at.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '@/common/setup-form/fieldNames'
import { errorUnder } from '@/common/fields/errorUnder'
import { DEFAULT_SCRABBLE_SETUP } from '../lib/setup'
import type { Member } from '@/common/members/member'
import type { FormErrors } from '@/common/forms/formState'

const MEMBERS = [
  { id: 'self', username: 'joel', color: 'red' },
  { id: 'moth', username: 'moth', color: 'blue' },
] satisfies Member[]

// The bot accounts, as create_game seats them: by username.
const BOTS = [
  { id: 'ada-id', username: 'ada-bot', color: 'brown' },
  { id: 'bjarne-id', username: 'bjarne-bot', color: 'purple' },
  { id: 'claude-id', username: 'claude-bot', color: 'pink' },
] satisfies Member[]
vi.mock('../hooks/useAiAccounts', () => ({ useAiAccounts: () => BOTS }))

function draw({ mode = 'compete' as 'coop' | 'compete', values = {}, errors = {} as FormErrors } = {}) {
  const set = vi.fn()
  const view = render(
    <SetupForm
      mode={mode}
      brand="Scrabble"
      clubHandle="moths"
      members={MEMBERS}
      myId="self"
      numberOfPlayers={[2, 4]}
      values={{
        ...DEFAULT_SCRABBLE_SETUP,
        player_user_ids: new Set(MEMBERS.map((m) => m.id)),
        ...values,
      }}
      set={set}
      setError={vi.fn()}
      errors={errors}
    />,
  )
  return { ...view, set }
}

describe('scrabble setup — what it offers', () => {
  it('offers exactly these settings in a race, in this order', () => {
    expect(fieldNames(draw().container)).toEqual([
      'player_user_ids',
      'dict_2',
      'dict_3plus',
      'ai_count',
      'first_turn_user_id',
      'timer',
    ])
  })

  it('offers a point goal and a swap cost in co-op only, after the dictionaries', () => {
    expect(fieldNames(draw({ mode: 'coop' }).container)).toEqual([
      'player_user_ids',
      'coop_style',
      'dict_2',
      'dict_3plus',
      'goal_kind',
      'swap_cost',
      'timer',
    ])
    expect(fieldNames(draw({ mode: 'coop' }).container)).not.toContain('first_turn_user_id')
    expect(fieldNames(draw().container)).not.toContain('goal_kind')
    expect(fieldNames(draw().container)).not.toContain('swap_cost')
  })

  it('asks for the points only once there is a goal', () => {
    expect(fieldNames(draw({ mode: 'coop', values: { goal_score: 300 } }).container))
      .toContain('goal_score')
  })

  it('choosing a goal starts it at 300', async () => {
    const { set } = draw({ mode: 'coop' })
    await userEvent.click(screen.getByRole('radio', { name: 'Goal' }))
    expect(set).toHaveBeenCalledWith('goal_score', 300)
  })

  it('offers no AI in co-op, where there is nobody to play against', () => {
    // The RPC agrees (PN081), but the form never puts the question.
    expect(fieldNames(draw({ mode: 'coop' }).container)).not.toContain('ai_count')
  })

  it('asks how good the AI is only once there is one', () => {
    expect(fieldNames(draw().container)).not.toContain('ai_level')
    expect(fieldNames(draw({ values: { ai_count: 1 } }).container)).toContain('ai_level')
  })
})

describe('scrabble setup — the AI', () => {
  it('writes the count as a number, not the label', async () => {
    const user = userEvent.setup()
    const { set } = draw()

    await user.click(screen.getByRole('radio', { name: '2' }))

    expect(set).toHaveBeenCalledWith('ai_count', 2)
  })
})

describe('scrabble setup — the first player', () => {
  const menu = () => screen.getByRole('combobox', { name: 'First player' })
  const offered = () =>
    [...menu().querySelectorAll('option')].map((o) => o.textContent)

  it('offers Random, the people, and the bots the AI count seats', () => {
    draw({ values: { ai_count: 2 } })
    expect(offered()).toEqual(['Random', 'joel', 'moth', 'ada-bot', 'bjarne-bot'])
    expect(menu()).toHaveValue('')
  })

  it('writes a pick as its id, and Random as no pick', async () => {
    const user = userEvent.setup()
    const { set } = draw({ values: { ai_count: 1, first_turn_user_id: 'moth' } })

    await user.selectOptions(menu(), 'ada-bot')
    expect(set).toHaveBeenCalledWith('first_turn_user_id', 'ada-id')

    await user.selectOptions(menu(), 'Random')
    expect(set).toHaveBeenCalledWith('first_turn_user_id', undefined)
  })

  it('drops a bot the new AI count no longer seats', async () => {
    const user = userEvent.setup()
    const { set } = draw({ values: { ai_count: 2, first_turn_user_id: 'bjarne-id' } })

    await user.click(screen.getByRole('radio', { name: '1' }))

    expect(set).toHaveBeenCalledWith('first_turn_user_id', undefined)
  })

  it('keeps a person through a change to the AI count', async () => {
    const user = userEvent.setup()
    const { set } = draw({ values: { ai_count: 2, first_turn_user_id: 'moth' } })

    await user.click(screen.getByRole('radio', { name: '1' }))

    expect(set).not.toHaveBeenCalledWith('first_turn_user_id', undefined)
  })
})

describe('scrabble setup — where a message lands', () => {
  it.each(['dict_2', 'dict_3plus', 'ai_count', 'player_user_ids'])(
    'puts one naming %s under that field',
    (field) => {
      draw({ errors: { [field]: 'something to say' } })
      expect(errorUnder(field)).toBe('something to say')
    },
  )

  it('puts one under the skill picker, once it exists', () => {
    draw({ values: { ai_count: 1 }, errors: { ai_level: 'something to say' } })
    expect(errorUnder('ai_level')).toBe('something to say')
  })
})
