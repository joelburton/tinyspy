// cs-unmet

/**
 * bananagrams' setup form — the most settings of any game, and like scrabble
 * every refusal `create_game` can make is a fault.
 *
 * Its manifest's `validate` couples the bunch to the headcount and blocks
 * Start, so the one genuinely cross-field rule (players × hand_size must fit
 * the bunch) never reaches the server from this form. The rest are closed
 * lists.
 *
 * `dump_to_bag` is here for a reason worth noting: `create_game` never reads
 * it — `bananagrams.dump` does, mid-game — and it is still an ordinary field
 * with a name and an error slot. The form cannot know which of its keys any
 * particular RPC looks at.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '../../common/components/setup/fieldNames'
import { errorUnder } from '../../common/components/fields/errorUnder'
import { DEFAULT_BANANAGRAMS_SETUP } from '../lib/setup'
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
      brand="MonkeyGrams"
      clubHandle="moths"
      members={MEMBERS}
      selfId="self"
      numberOfPlayers={[1, 8]}
      values={{
        ...DEFAULT_BANANAGRAMS_SETUP,
        player_user_ids: new Set(MEMBERS.map((m) => m.user_id)),
        ...values,
      }}
      set={set}
      errors={errors}
    />,
  )
  return { ...view, set }
}

describe('bananagrams setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    expect(fieldNames(draw().container)).toEqual([
      'player_user_ids.self',
      'player_user_ids.moth',
      'hand_size',
      'bunch_size',
      'dump_to_bag',
      'word_check',
      'dict_2',
      'dict_3plus',
      'timer',
      'timer.seconds',
    ])
  })

  it('keeps the dictionaries even with checking off', () => {
    // They are the bands checking WOULD use, so turning it off does not
    // discard the choice — `create_game` only requires them when it is on.
    expect(fieldNames(draw({ values: { word_check: 'off' } }).container)).toContain('dict_2')
  })
})

describe('bananagrams setup — the bunch', () => {
  it('says how many tiles this many players actually need', () => {
    // The one cross-field rule, shown before it can be broken: the manifest's
    // validate blocks Start, so PN098 is a backstop rather than an answer.
    draw({ values: { hand_size: 21 } })
    expect(screen.getByText(/2 player/)).toBeInTheDocument()
  })

  it('writes the hand size as a number', async () => {
    // The OTHER option: 15 is the default, and clicking a radio that is
    // already checked fires nothing.
    const user = userEvent.setup()
    const { set } = draw()

    await user.click(screen.getByRole('radio', { name: /21/ }))

    expect(set).toHaveBeenCalledWith('hand_size', 21)
  })
})

describe('bananagrams setup — where a message lands', () => {
  it.each(['hand_size', 'bunch_size', 'word_check', 'dict_2', 'dict_3plus', 'player_user_ids'])(
    'puts one naming %s under that field',
    (field) => {
      draw({ errors: { [field]: 'something to say' } })
      expect(errorUnder(field)).toBe('something to say')
    },
  )

  it('can carry one on the dump setting, which create_game never reads', () => {
    draw({ errors: { dump_to_bag: 'something to say' } })
    expect(errorUnder('dump_to_bag')).toBe('something to say')
  })
})
