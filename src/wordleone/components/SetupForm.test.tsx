// cs-unmet

/**
 * wordleone's setup form — two settings of its own beside the shared players,
 * coop pacing and timer: the legal band and the difficulty.
 */
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '@/common/setup-form/fieldNames'
import { errorUnder } from '@/common/fields/errorUnder'
import { DEFAULT_WORDLEONE_SETUP } from '../lib/setup'
import type { Member } from '@/common/members/member'
import type { FormErrors } from '@/common/forms/formState'

const MEMBERS = [
  { id: 'self', username: 'joel', color: 'red' },
  { id: 'moth', username: 'moth', color: 'blue' },
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
      brand="WordNerdier"
      clubHandle="moths"
      members={members}
      myId="self"
      numberOfPlayers={[1, 6]}
      values={{
        ...DEFAULT_WORDLEONE_SETUP,
        player_user_ids: new Set(members.map((m) => m.id)),
        ...values,
      }}
      set={set}
      setError={vi.fn()}
      errors={errors}
    />,
  )
  return { ...view, set }
}

describe('wordleone setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    expect(fieldNames(draw().container)).toEqual([
      'player_user_ids',
      'coop_style',
      'legal_band',
      'difficulty',
      'timer',
    ])
  })

  it('asks who goes first only once co-op is played in turns', () => {
    expect(fieldNames(draw().container)).not.toContain('first_turn_user_id')
    const { container } = draw({ values: { coop_style: 'turns', first_turn_user_id: 'self' } })
    expect(fieldNames(container)).toContain('first_turn_user_id')
  })

  it('drops the co-op pacing question in a race', () => {
    expect(fieldNames(draw({ mode: 'compete' }).container)).not.toContain('coop_style')
  })

  it('offers every band, 1 to 6', () => {
    draw()
    const band = document.querySelector('[name="legal_band"]')!
    expect([...band.querySelectorAll('option')].map((o) => o.value)).toEqual(['1', '2', '3', '4', '5', '6'])
  })
})

describe('wordleone setup — writing a setting', () => {
  it('writes a difficulty as the key the server reads', async () => {
    const user = userEvent.setup()
    const { set } = draw()

    await user.selectOptions(document.querySelector('[name="difficulty"]')!, 'hard')

    expect(set).toHaveBeenCalledWith('difficulty', 'hard')
  })

  it('writes a band as a number, not the string the select handed it', async () => {
    const user = userEvent.setup()
    const { set } = draw()

    await user.selectOptions(document.querySelector('[name="legal_band"]')!, '4')

    expect(set).toHaveBeenCalledWith('legal_band', 4)
  })
})

describe('wordleone setup — where a refusal lands', () => {
  // The one refusal the form can meet is the edge function's PN532: no puzzle
  // at that difficulty. It is a validation under `difficulty`, so it renders
  // under that control.
  it('shows a refusal under the difficulty it is about', () => {
    const message = 'No puzzle could be built at that difficulty. Try another.'
    draw({ errors: { difficulty: message } })
    expect(errorUnder('difficulty')).toBe(message)
  })

  it('lets the first-player picker carry one too, once it exists', () => {
    draw({
      values: { coop_style: 'turns', first_turn_user_id: 'self' },
      errors: { first_turn_user_id: 'Pick someone who is playing' },
    })
    expect(errorUnder('first_turn_user_id')).toBe('Pick someone who is playing')
  })
})
