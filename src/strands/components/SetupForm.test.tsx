// cs-unmet

/**
 * strands' setup form — the puzzle-derived shape of connections, plus three
 * settings of its own (the hint economy).
 *
 * Same two refusals a setup form cannot predict, and BOTH name the date box:
 * PN067 because a group told the archive is spent will try another date rather
 * than drop a player, PN072 because a retired puzzle is fixed by clearing it.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
vi.mock('../db', () => ({ db: { rpc: mockRpc } }))

import { SetupForm } from './SetupForm'
import { fieldNames } from '../../common/components/setup/fieldNames'
import { errorUnder } from '../../common/components/fields/errorUnder'
import { DEFAULT_STRANDS_SETUP_COOP } from '../lib/setup'
import type { Member } from '../../common/lib/games'
import type { FormErrors } from '../../common/components/fields/formState'

const MEMBERS = [
  { user_id: 'self', username: 'joel', color: 'red' },
  { user_id: 'moth', username: 'moth', color: 'blue' },
] as Member[]

function draw({ mode = 'coop' as 'coop' | 'compete', values = {}, errors = {} as FormErrors } = {}) {
  mockRpc.mockResolvedValue({ data: [{ id: 'p1', label: '2026-08-20: TIDE, WAVE' }], error: null })
  const set = vi.fn()
  const view = render(
    <SetupForm
      mode={mode}
      brand="PaulPath"
      clubHandle="moths"
      members={MEMBERS}
      selfId="self"
      numberOfPlayers={[1, 6]}
      values={{
        ...DEFAULT_STRANDS_SETUP_COOP,
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

describe('strands setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    expect(fieldNames(draw().container)).toEqual([
      'player_user_ids',
      'coop_style',
      'puzzle_id',
      'band',
      'hint_cost',
      'min_word_length',
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

describe('strands setup — the hint economy', () => {
  it('says what a wider hint dictionary does to the difficulty', () => {
    // Counter-intuitive enough that the form says it out loud: a WIDER
    // dictionary makes the game EASIER, because more words earn hints.
    draw()
    expect(screen.getByText(/easier/)).toBeInTheDocument()
  })
})

describe('strands setup — where a refusal lands', () => {
  it('puts a spent archive under the date box, because another date is the fix', () => {
    const message = 'Everyone here has played every puzzle. You can open one already played by its date.'
    draw({ errors: { puzzle_id: message } })
    expect(errorUnder('puzzle_id')).toBe(message)
  })

  it('puts a retired puzzle under the date box, because clearing it is the fix', () => {
    const message = 'That puzzle is no longer available'
    draw({ errors: { puzzle_id: message } })
    expect(errorUnder('puzzle_id')).toBe(message)
  })

  it('leaves the hint settings able to carry one, whoever writes it', () => {
    draw({ errors: { band: 'nope', hint_cost: 'also nope', min_word_length: 'still nope' } })
    expect(errorUnder('band')).toBe('nope')
    expect(errorUnder('hint_cost')).toBe('also nope')
    expect(errorUnder('min_word_length')).toBe('still nope')
  })
})
