// cs-unmet

/**
 * wordle's setup form — three settings of its own, and the first CROSS-FIELD
 * refusal in the roster.
 *
 * `create_game` names `legal_guess` twice: once for a band outside 1..6
 * (PN055), and once when it sits below the answer band (PN056). The second is
 * about two fields and names the one the form can move — every answer has to be
 * a legal guess, so the legal band rises to meet the answer band rather than
 * the answer band dropping to meet it.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '@/common/setup-form/fieldNames'
import { errorUnder } from '@/common/fields/errorUnder'
import { DEFAULT_WORDLE_SETUP } from '../lib/setup'
import type { Member } from '@/common/members/member'
import type { FormErrors } from '@/common/forms/formState'

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
      brand="Wordle"
      clubHandle="moths"
      members={members}
      selfId="self"
      numberOfPlayers={[1, 6]}
      values={{
        ...DEFAULT_WORDLE_SETUP,
        player_user_ids: new Set(members.map((m) => m.user_id)),
        ...values,
      }}
      set={set}
      setError={vi.fn()}
      errors={errors}
    />,
  )
  return { ...view, set }
}

describe('wordle setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    expect(fieldNames(draw().container)).toEqual([
      'player_user_ids',
      'coop_style',
      'max_guesses',
      'answer_source',
      'legal_guess',
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
})

describe('wordle setup — the two dictionaries', () => {
  it('offers the curated Wordle list as an answer source, below band 1', () => {
    // `answer_source` 0 is not a difficulty at all — it is the published list —
    // which is why this field has an option the band ladder does not.
    draw()
    expect(screen.getByRole('option', { name: /0: Wordle/ })).toBeInTheDocument()
  })

  it('will not let legal guesses sit below the answer band', () => {
    // The form floors the control rather than letting you pick an impossible
    // pair; `create_game` raises PN056 as the backstop.
    draw({ values: { answer_source: 5, legal_guess: 5 } })
    const legal = document.querySelector('[name="legal_guess"]')!
    const options = [...legal.querySelectorAll('option')]
    expect(options.find((o) => o.value === '4')).toBeDisabled()
    expect(options.find((o) => o.value === '5')).not.toBeDisabled()
  })
})

describe('wordle setup — writing a setting', () => {
  it('writes a number, not the string the select handed it', async () => {
    const user = userEvent.setup()
    const { set } = draw()

    await user.selectOptions(document.querySelector('[name="max_guesses"]')!, '8')

    expect(set).toHaveBeenCalledWith('max_guesses', 8)
  })
})

describe('wordle setup — where a refusal lands', () => {
  // `wordle.create_game` raises NO form-validations today: every refusal it can
  // make is about a value this form does not offer, so all of them are faults
  // and land on the dialog's own line. PN057 was the last one that wasn't, and
  // it became a fault on 2026-08-30 — the bands are cumulative, so no choice
  // here can empty the answer pool, and the sentence was inviting the player to
  // re-pick a control that could not help.
  //
  // These two keep testing the WIRING rather than a live raise: a field error
  // that arrives renders under its own control. That is what a future
  // validation would need, and it is cheaper to hold than to rediscover.
  it('lets the answer-source picker carry a field error, if one ever lands', () => {
    const message = 'No answers available from that source'
    draw({ errors: { answer_source: message } })
    expect(errorUnder('answer_source')).toBe(message)
  })

  it('lets the first-player picker carry one too, once it exists', () => {
    draw({
      values: { coop_style: 'turns', first_turn_user_id: 'self' },
      errors: { first_turn_user_id: 'Pick someone who is playing' },
    })
    expect(errorUnder('first_turn_user_id')).toBe('Pick someone who is playing')
  })
})
