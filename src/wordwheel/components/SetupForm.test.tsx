// cs-unmet

/**
 * wordwheel's setup form — what it offers, and where a refusal lands.
 *
 * The inventory is the spine (see `fieldNames`): these are the settings the
 * friends get, and losing one silently is the failure this catches. Each name
 * is also the `setup` key it writes and the FIELD `wordwheel-build-board` or
 * `wordwheel.create_game` names when it refuses one, so the list doubles as the
 * routing contract.
 *
 * It is spellingbee's fork, with the same two-key custom-letters box and one
 * setting of its own — `unique_letters`. That option is why wordwheel has a
 * refusal spellingbee cannot make: asking for a wheel with nine distinct tiles
 * at a narrow band can empty the seed pool entirely, and the message lands on
 * the checkbox that narrowed it rather than on the band, because turning it off
 * is the one-click fix and the sentence names the other lever anyway.
 *
 * The wheel is a MULTISET — the difference from spellingbee that matters here.
 * There is no S rule and no distinctness rule, so `custom_letters` refuses far
 * less, and what it does refuse is only ever about shape or the dictionary.
 */
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '../../common/components/setup/fieldNames'
import { errorUnder } from '../../common/components/fields/errorUnder'
import { DEFAULT_WORDWHEEL_SETUP_COOP } from '../lib/setup'
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
      brand="MooseWheel"
      clubHandle="moths"
      members={members}
      selfId="self"
      numberOfPlayers={[1, 6]}
      values={{
        ...DEFAULT_WORDWHEEL_SETUP_COOP,
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

describe('wordwheel setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    const { container } = draw()
    expect(fieldNames(container)).toEqual([
      'player_user_ids',
      'target_rank',
      'required',
      'legal',
      'unique_letters',
      'custom_letters',
      'timer',
    ])
  })

  it('offers the same settings in a race — only the target-rank caption changes', () => {
    expect(fieldNames(draw({ mode: 'compete' }).container)).toEqual(
      fieldNames(draw().container),
    )
  })

  it('drops the picker in a solo club, where there is nothing to choose', () => {
    const { container } = draw({ members: [MEMBERS[0]!] })
    expect(fieldNames(container)).not.toContain('player_user_ids')
  })
})

describe('wordwheel setup — writing a setting', () => {
  it('drops the unique-letters key rather than storing false', async () => {
    // Absence is the off state: the builder reads a missing `unique_letters` as
    // "no constraint", and storing `false` would put a key in every club's
    // saved default that means the same as not being there.
    const user = userEvent.setup()
    const { set } = draw({ values: { unique_letters: true } })

    await user.click(document.querySelector('[name="unique_letters"]')!)

    expect(set).toHaveBeenCalledWith('unique_letters', undefined)
  })
})

describe('wordwheel setup — where a refusal lands', () => {
  it('puts letters that make no puzzle under the box they were typed into', () => {
    // PN188 from create_game, PN194 from wordwheel-build-board — the same
    // sentence from whichever got there first.
    const message = 'No words for those letters at that difficulty.'
    draw({ errors: { custom_letters: message } })
    expect(errorUnder('custom_letters')).toBe(message)
  })

  it('puts an empty seed pool under Required words', () => {
    // PN195 and PN198: a band with no nine-letter seeds at all, and a band no
    // seed can clear the word-count gate at. Both are about that select.
    const message = 'No pangram seeds at required difficulty 1'
    draw({ errors: { required: message } })
    expect(errorUnder('required')).toBe(message)
  })

  it('puts the unique-letters refusal on the checkbox that caused it', () => {
    // PN196 — the one refusal wordwheel has that spellingbee cannot make.
    const message =
      'No unique-letter boards at required difficulty 1 — try a higher difficulty or turn off "unique letters only"'
    draw({ errors: { unique_letters: message } })
    expect(errorUnder('unique_letters')).toBe(message)
  })

  it('leaves the other fields able to carry one, whoever writes it', () => {
    draw({ errors: { legal: 'nope', target_rank: 'also nope' } })
    expect(errorUnder('legal')).toBe('nope')
    expect(errorUnder('target_rank')).toBe('also nope')
  })
})
