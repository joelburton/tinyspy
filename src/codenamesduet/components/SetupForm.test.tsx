// cs-blessed-codenamesduet

/**
 * codenamesduet's setup form: what it offers, in what order, what it writes,
 * and where a message naming one of its fields lands. Every refusal
 * `create_game` can make is a fault, so none of them is a validation the form
 * has to show; the one message it does show is the manifest's own gate, no
 * word pool ticked.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '@/common/setup-form/fieldNames'
import { errorUnder } from '@/common/fields/errorUnder'
import { DEFAULT_CODENAMESDUET_SETUP } from '../lib/setup'
import type { Member } from '@/common/members/member'
import type { FormErrors } from '@/common/forms/formState'

// Three club members, two of them chosen by default: the third is who a
// club-wide picker would wrongly offer.
const MEMBERS = [
  { id: 'self', username: 'joel', color: 'red' },
  { id: 'moth', username: 'moth', color: 'blue' },
  { id: 'dee', username: 'dee', color: 'green' },
] as Member[]

function draw({ values = {}, errors = {} as FormErrors } = {}) {
  const set = vi.fn()
  const view = render(
    <SetupForm
      mode="coop"
      brand="Codenames Duet"
      clubHandle="moths"
      members={MEMBERS}
      myId="self"
      numberOfPlayers={[2, 2]}
      values={{
        ...DEFAULT_CODENAMESDUET_SETUP,
        first_clue_giver_user_id: 'self',
        player_user_ids: new Set(['self', 'moth']),
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
      'word_pools',
      'timer',
    ])
  })

  it('offers the three word pools in pool order, the adult one saying so', () => {
    const boxes = draw().container.querySelectorAll('input[name^="word_pools."]')
    expect([...boxes].map((b) => b.closest('label')?.textContent)).toEqual([
      'Codenames Duet',
      'Codenames',
      'Undercover (adult)',
    ])
  })

  it('sums up the chosen pools in the section summary', () => {
    draw({ values: { word_pools: ['duet', 'undercover'] } })
    expect(screen.getByText('Word pool: Codenames Duet, Undercover (adult)')).toBeInTheDocument()
  })

  it('names the clue-giver field for the setup key it writes', () => {
    // So a message naming the key lands under this field.
    const { container } = draw()
    expect(container.querySelector('[name="first_clue_giver_user_id"]')).toBeInTheDocument()
    expect(container.querySelector('[name="firstClueGiver"]')).not.toBeInTheDocument()
  })

  it('has no co-op pacing question — the whole game is two people taking turns', () => {
    expect(fieldNames(draw().container)).not.toContain('coop_style')
  })

  it('offers only the chosen players as first clue-giver, not the whole club', () => {
    // Read by LABEL, because <RadioRow> carries no `value` attribute — it
    // tracks the choice through `checked` and reports it through onChange.
    const { container } = draw()
    const rows = container.querySelectorAll('[name="first_clue_giver_user_id"]')
    expect([...rows].map((r) => r.closest('label')?.textContent)).toEqual(['joel', 'moth'])
  })
})

describe('codenamesduet setup — seeding the first clue-giver', () => {
  it('picks the first chosen player when none is', () => {
    const { set } = draw({
      values: { first_clue_giver_user_id: '', player_user_ids: new Set(['moth', 'dee']) },
    })
    expect(set).toHaveBeenCalledWith('first_clue_giver_user_id', 'moth')
  })

  it('re-picks when the chosen clue-giver is unticked', () => {
    const { set } = draw({
      values: { first_clue_giver_user_id: 'self', player_user_ids: new Set(['moth', 'dee']) },
    })
    expect(set).toHaveBeenCalledWith('first_clue_giver_user_id', 'moth')
  })

  it('leaves a chosen clue-giver who is still among the players', () => {
    const { set } = draw({ values: { first_clue_giver_user_id: 'moth' } })
    expect(set).not.toHaveBeenCalledWith('first_clue_giver_user_id', expect.anything())
  })
})

describe('codenamesduet setup — writing a setting', () => {
  it('writes turns as a number, not the label it was drawn from', async () => {
    const user = userEvent.setup()
    const { set } = draw()

    await user.click(screen.getByRole('radio', { name: '11' }))

    expect(set).toHaveBeenCalledWith('turns', 11)
  })

  it('writes the word pools in pool order, whichever box was ticked', async () => {
    const user = userEvent.setup()
    const { set } = draw({ values: { word_pools: ['codenames'] } })

    await user.click(screen.getByRole('checkbox', { name: 'Codenames Duet' }))

    expect(set).toHaveBeenCalledWith('word_pools', ['duet', 'codenames'])
  })

  it('writes an empty list when the last pool is unticked, for the gate to refuse', async () => {
    const user = userEvent.setup()
    const { set } = draw()

    await user.click(screen.getByRole('checkbox', { name: 'Codenames Duet' }))

    expect(set).toHaveBeenCalledWith('word_pools', [])
  })
})

describe('codenamesduet setup — where a message lands', () => {
  it.each(['turns', 'first_clue_giver_user_id', 'player_user_ids', 'word_pools'])(
    'puts one naming %s under that field',
    (field) => {
      draw({ errors: { [field]: 'something to say' } })
      expect(errorUnder(field)).toBe('something to say')
    },
  )
})
