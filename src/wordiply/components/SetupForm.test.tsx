// cs-unmet

/**
 * wordiply's setup form — what it offers, and where a refusal lands.
 *
 * The inventory is the spine (see `fieldNames`): these are the settings the
 * friends get, and losing one silently is the failure this catches. Each name
 * is also the `setup` key it writes and the FIELD `wordiply-build-board` or
 * `wordiply.create_game` names when it refuses one, so the list doubles as the
 * routing contract.
 *
 * `custom_base` is the interesting one. Every other setting here is a control
 * with a closed set of answers, so a bad value means a broken frontend — a
 * fault. This is a box you type letters into, and two of the things you can
 * type (ING matches too much, YAKS matches too little) are only knowable to
 * the dictionary. Those are the game's only validations, and this pins that
 * they can reach the box the letters came from.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '@/common/setup-form/fieldNames'
import { errorUnder } from '@/common/fields/errorUnder'
import { DEFAULT_WORDIPLY_SETUP_COOP } from '../lib/setup'
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
      brand="WordWire"
      clubHandle="moths"
      members={members}
      selfId="self"
      numberOfPlayers={[1, 6]}
      values={{
        ...DEFAULT_WORDIPLY_SETUP_COOP,
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

describe('wordiply setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    const { container } = draw()
    expect(fieldNames(container)).toEqual([
      'player_user_ids',
      'coop_style',
      'difficulty',
      'custom_base',
      'timer',
    ])
  })

  it('asks who goes first only once co-op is played in turns', () => {
    expect(fieldNames(draw().container)).not.toContain('first_turn_user_id')

    const { container } = draw({ values: { coop_style: 'turns', first_turn_user_id: 'self' } })
    expect(fieldNames(container)).toContain('first_turn_user_id')
  })

  it('drops the co-op pacing question in a race, where nobody takes a turn', () => {
    expect(fieldNames(draw({ mode: 'compete' }).container)).not.toContain('coop_style')
  })

  it('drops the picker in a solo club, where there is nothing to choose', () => {
    const { container } = draw({ members: [MEMBERS[0]!] })
    expect(fieldNames(container)).not.toContain('player_user_ids')
  })

  it('shows the chosen starter in the section summary, so a closed section still says it', () => {
    draw({ values: { custom_base: 'moth' } })
    expect(screen.getByText('Starter: MOTH')).toBeInTheDocument()
  })
})

describe('wordiply setup — writing a setting', () => {
  // ONE change per assertion, not a typed string: the field is controlled and
  // `set` is a spy here, so `value` never advances and each keystroke would be
  // cleaned on its own rather than on what came before it.
  const starter = () => screen.getByPlaceholderText('MOTH')

  it('cleans what you type before it becomes the setup key', () => {
    // `cleanBase` is what makes the shape rule the server re-checks (2–4
    // lowercase ASCII) reachable from a box that accepts anything.
    const { set } = draw()

    fireEvent.change(starter(), { target: { value: 'M0t!' } })

    expect(set).toHaveBeenCalledWith('custom_base', 'mt')
  })

  it('clears to UNDEFINED, not an empty string', () => {
    // Absence is the instruction: the edge function reads a missing
    // custom_base as "pick one for me". An empty string is a starter of no
    // letters, which fails the shape check.
    const { set } = draw({ values: { custom_base: 'ar' } })

    fireEvent.change(starter(), { target: { value: '' } })

    expect(set).toHaveBeenCalledWith('custom_base', undefined)
  })
})

describe('wordiply setup — where a refusal lands', () => {
  it('puts a dictionary refusal under the starter box it is about', () => {
    // PN133 / PN134, from wordiply-build-board. The two things the form cannot
    // know from its own values, and the only two sentences here that belong
    // beside a control rather than in a modal.
    draw({ errors: { custom_base: 'ING matches too many words.' } })
    expect(errorUnder('custom_base')).toBe('ING matches too many words.')
  })

  it('leaves the other fields able to carry one, whoever writes it', () => {
    draw({ errors: { difficulty: 'nope', player_user_ids: 'also nope' } })
    expect(errorUnder('difficulty')).toBe('nope')
    expect(errorUnder('player_user_ids')).toBe('also nope')
  })
})
