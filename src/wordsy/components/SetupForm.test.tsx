// cs-unmet

/**
 * wordsy's setup form: the players, the dictionary band and how a round ends
 * — and no Timer section, since the round's clock is the game's own.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '@/common/setup-form/fieldNames'
import { errorUnder } from '@/common/fields/errorUnder'
import { DEFAULT_WORDSY_SETUP } from '../lib/setup'
import type { Member } from '@/common/members/member'
import type { FormErrors } from '@/common/forms/formState'

const MEMBERS = [
  { id: 'self', username: 'joel', color: 'red' },
  { id: 'moth', username: 'moth', color: 'blue' },
] as Member[]

function draw({ errors = {} as FormErrors } = {}) {
  const set = vi.fn()
  const view = render(
    <SetupForm
      mode="compete"
      brand="FlipWord"
      clubHandle="moths"
      members={MEMBERS}
      myId="self"
      numberOfPlayers={[2, 6]}
      values={{
        ...DEFAULT_WORDSY_SETUP,
        player_user_ids: new Set(MEMBERS.map((m) => m.id)),
      }}
      set={set}
      setError={vi.fn()}
      errors={errors}
    />,
  )
  return { ...view, set }
}

describe('wordsy setup — what it offers', () => {
  it('offers exactly these settings, in this order, and no timer', () => {
    expect(fieldNames(draw().container)).toEqual(['player_user_ids', 'legal_band', 'round_style'])
  })

  it('reads its choices back in the section summaries', () => {
    draw()
    expect(screen.getByText(/^Dictionary:/)).toBeInTheDocument()
    expect(screen.getByText('Round: 30-second timer')).toBeInTheDocument()
  })
})

describe('wordsy setup — how a round ends', () => {
  it('writes the style the RPC checks', async () => {
    const user = userEvent.setup()
    const { set } = draw()
    await user.click(screen.getByRole('radio', { name: 'No timer' }))
    expect(set).toHaveBeenCalledWith('round_style', 'no-timer')
  })
})

describe('wordsy setup — where a refusal lands', () => {
  it.each([
    ['legal_band', 'Pick a dictionary.'],
    ['round_style', 'Pick how a round ends.'],
  ])('puts a message naming %s under that field', (field, message) => {
    draw({ errors: { [field]: message } })
    expect(errorUnder(field)).toBe(message)
  })
})
