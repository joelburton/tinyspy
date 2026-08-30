// cs-unmet

/**
 * codenamesduet's setup form — the only single-mode game, and the only one
 * whose first-player question is asked of a fixed pair.
 *
 * Every refusal `create_game` can make is a fault: turns come from a closed
 * list, the clue-giver picker offers only the two players, and the game is
 * exactly two people. The one thing that is not a fault is `PN093` — the word
 * pool being too small to build a board — and it is an `error` on the form's
 * own line rather than a validation, because no control the player can reach
 * would change it.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '../../common/components/setup/fieldNames'
import { errorUnder } from '../../common/components/fields/errorUnder'
import { DEFAULT_CODENAMESDUET_SETUP } from '../lib/setup'
import type { Member } from '../../common/lib/games'
import type { FormErrors } from '../../common/components/fields/formState'

const MEMBERS = [
  { user_id: 'self', username: 'joel', color: 'red' },
  { user_id: 'moth', username: 'moth', color: 'blue' },
] as Member[]

function draw({ values = {}, errors = {} as FormErrors } = {}) {
  const set = vi.fn()
  const view = render(
    <SetupForm
      mode="coop"
      brand="Codenames Duet"
      clubHandle="moths"
      members={MEMBERS}
      selfId="self"
      numberOfPlayers={[2, 2]}
      values={{
        ...DEFAULT_CODENAMESDUET_SETUP,
        first_clue_giver_user_id: 'self',
        player_user_ids: new Set(MEMBERS.map((m) => m.user_id)),
        ...values,
      }}
      set={set}
      setError={vi.fn()}
      errors={errors}
    />,
  )
  return { ...view, set }
}

describe('codenamesduet setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    expect(fieldNames(draw().container)).toEqual([
      'player_user_ids',
      'turns',
      'first_clue_giver_user_id',
      'timer',
    ])
  })

  it('names the clue-giver field for the setup key it writes', () => {
    // It was `firstClueGiver` — matching neither the key nor anything a raise
    // could name, so PN089/PN090/PN092 had nowhere to land.
    const { container } = draw()
    expect(container.querySelector('[name="first_clue_giver_user_id"]')).toBeInTheDocument()
    expect(container.querySelector('[name="firstClueGiver"]')).not.toBeInTheDocument()
  })

  it('has no co-op pacing question — the whole game is two people taking turns', () => {
    expect(fieldNames(draw().container)).not.toContain('coop_style')
  })

  it('offers only the two players as first clue-giver', () => {
    // A radio row rather than a menu: two options, both worth seeing at once.
    // Read by LABEL, because <RadioRow> carries no `value` attribute — it
    // tracks the selection through `checked` and reports it through onChange.
    const { container } = draw()
    const rows = container.querySelectorAll('[name="first_clue_giver_user_id"]')
    expect([...rows].map((r) => r.closest('label')?.textContent)).toEqual(['joel', 'moth'])
  })
})

describe('codenamesduet setup — writing a setting', () => {
  it('writes turns as a number, not the label it was drawn from', async () => {
    const user = userEvent.setup()
    const { set } = draw()

    await user.click(screen.getByRole('radio', { name: '11' }))

    expect(set).toHaveBeenCalledWith('turns', 11)
  })
})

describe('codenamesduet setup — where a message lands', () => {
  it.each(['turns', 'first_clue_giver_user_id', 'player_user_ids'])(
    'puts one naming %s under that field',
    (field) => {
      draw({ errors: { [field]: 'something to say' } })
      expect(errorUnder(field)).toBe('something to say')
    },
  )
})
