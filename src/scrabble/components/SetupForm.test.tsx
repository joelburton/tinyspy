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
import { fieldNames } from '../../common/components/setup/fieldNames'
import { errorUnder } from '../../common/components/fields/errorUnder'
import { DEFAULT_SCRABBLE_SETUP } from '../lib/setup'
import type { Member } from '../../common/lib/games'
import type { FormErrors } from '../../common/components/fields/formState'

const MEMBERS = [
  { user_id: 'self', username: 'joel', color: 'red' },
  { user_id: 'moth', username: 'moth', color: 'blue' },
] as Member[]

function draw({ mode = 'compete' as 'coop' | 'compete', values = {}, errors = {} as FormErrors } = {}) {
  const set = vi.fn()
  const view = render(
    <SetupForm
      mode={mode}
      brand="Scrabble"
      clubHandle="moths"
      members={MEMBERS}
      selfId="self"
      numberOfPlayers={[2, 4]}
      values={{
        ...DEFAULT_SCRABBLE_SETUP,
        player_user_ids: new Set(MEMBERS.map((m) => m.user_id)),
        ...values,
      }}
      set={set}
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
      'timer',
    ])
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
