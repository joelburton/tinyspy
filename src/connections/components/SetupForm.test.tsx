// cs-unmet

/**
 * connections' setup form — and the first game whose refusals are mostly
 * things the form CANNOT know.
 *
 * Every other converted game offers a closed set of radios and selects, so
 * nearly all its raises are faults. Here the server DERIVES the puzzle — it
 * hands out the earliest one none of the selected players has seen — and two
 * of its refusals are real answers a player can act on:
 *
 *   PN062  the archive is spent for THESE players   → uncheck someone
 *   PN065  the puzzle behind that date is retired   → clear the date
 *
 * The first names the picker, not the puzzle box, which is the interesting
 * part: the fix is who is playing.
 */
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
vi.mock('../db', () => ({ db: { rpc: mockRpc } }))

import { SetupForm } from './SetupForm'
import { fieldNames } from '../../common/components/setup/fieldNames'
import { errorUnder } from '../../common/components/fields/errorUnder'
import { DEFAULT_CONNECTIONS_SETUP } from '../lib/setup'
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
} = {}) {
  mockRpc.mockResolvedValue({ data: [{ id: 'p1', label: '2026-08-20: soup, spoon' }], error: null })
  const set = vi.fn()
  const view = render(
    <SetupForm
      mode={mode}
      brand="Connections"
      clubHandle="moths"
      members={MEMBERS}
      selfId="self"
      numberOfPlayers={[1, 6]}
      values={{
        ...DEFAULT_CONNECTIONS_SETUP,
        player_user_ids: new Set(MEMBERS.map((m) => m.user_id)),
        ...values,
      }}
      set={set}
      errors={errors}
    />,
  )
  return { ...view, set }
}

describe('connections setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    expect(fieldNames(draw().container)).toEqual([
      'player_user_ids',
      'coop_style',
      'puzzle_id',
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

  it('names the puzzle field for the SETTING, not the control', () => {
    // You type a date; what is sent is `puzzle_id`. One string through the
    // form, the setup blob and the raise's COLUMN — which is the only way a
    // refusal about the puzzle can reach the box you would change.
    const { container } = draw()
    expect(container.querySelector('[name="puzzle_id"]')).toHaveAttribute('type', 'date')
  })
})

describe('connections setup — where a refusal lands', () => {
  it('puts a spent archive under the PICKER, because unchecking is the fix', () => {
    const message = 'Everyone here has played every puzzle'
    draw({ errors: { player_user_ids: message } })
    expect(errorUnder('player_user_ids')).toBe(message)
  })

  it('puts a retired puzzle under the date box, because clearing it is the fix', () => {
    const message = 'That puzzle is no longer available'
    draw({ errors: { puzzle_id: message } })
    expect(errorUnder('puzzle_id')).toBe(message)
  })
})
