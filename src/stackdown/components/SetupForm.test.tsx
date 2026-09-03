// cs-unmet

/**
 * stackdown's setup form — the smallest in the roster, and the second game
 * converted, so what it mostly proves is that the shape transplants.
 *
 * One setting of its own (`band`) plus the two every game has. Each name is
 * also the `setup` key it writes and the COLUMN `stackdown.create_game` names
 * when it refuses one, so the inventory doubles as the routing contract.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetupForm } from './SetupForm'
import { fieldNames } from '../../common/components/setup/fieldNames'
import { errorUnder } from '../../common/components/fields/errorUnder'
import { DEFAULT_STACKDOWN_SETUP } from '../lib/setup'
import type { Member } from '../../common/lib/members/member'
import type { FormErrors } from '../../common/components/fields/formState'

const MEMBERS = [
  { user_id: 'self', username: 'joel', color: 'red' },
  { user_id: 'moth', username: 'moth', color: 'blue' },
] as Member[]

function draw({ errors = {} as FormErrors, members = MEMBERS } = {}) {
  const set = vi.fn()
  const view = render(
    <SetupForm
      mode="coop"
      brand="StackDown"
      clubHandle="moths"
      members={members}
      selfId="self"
      numberOfPlayers={[1, 6]}
      values={{
        ...DEFAULT_STACKDOWN_SETUP,
        player_user_ids: new Set(members.map((m) => m.user_id)),
      }}
      set={set}
      setError={vi.fn()}
      errors={errors}
    />,
  )
  return { ...view, set }
}

describe('stackdown setup — what it offers', () => {
  it('offers exactly these settings, in this order', () => {
    expect(fieldNames(draw().container)).toEqual([
      'player_user_ids',
      'band',
      'timer',
    ])
  })

  it('has no co-op pacing question — the whole table plays one board', () => {
    expect(fieldNames(draw().container)).not.toContain('coop_style')
  })

  it('drops the picker in a solo club, where there is nothing to choose', () => {
    expect(fieldNames(draw({ members: [MEMBERS[0]!] }).container)).not.toContain(
      'player_user_ids.self',
    )
  })
})

describe('stackdown setup — writing a setting', () => {
  it('writes the band the RPC reads, under the name the field carries', async () => {
    const user = userEvent.setup()
    const { set } = draw()

    await user.selectOptions(screen.getByRole('combobox'), '2')

    expect(set).toHaveBeenCalledWith('band', 2)
  })

  it('shows the whole difficulty ladder but only enables the two it has boards for', () => {
    // The field draws all six bands and grays the rest, so a player can see
    // where this game sits on the scale rather than wondering what 1–2 means.
    draw()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(6)
    expect(options.filter((o) => !o.hasAttribute('disabled'))).toHaveLength(2)
  })
})

describe('stackdown setup — where a refusal lands', () => {
  // `create_game` names `band` twice: PN051 for a band outside 1..6, and PN052
  // when the library holds no board at that one. Both are answerable at the
  // same control, which is why both are validations rather than faults.
  it('puts the one validation create_game can still raise under its field', () => {
    // PN052 — the board library holds nothing at that band. The form offers
    // both bands, so it cannot know; everything else it CAN prevent, and those
    // arrive as faults.
    const message = 'No boards at that difficulty yet — try the other one'
    draw({ errors: { band: message } })
    expect(errorUnder('band')).toBe(message)
  })
})
