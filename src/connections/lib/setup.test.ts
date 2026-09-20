// cs-fixed-connections

import { describe, expect, it } from 'vitest'
import { DEFAULT_CONNECTIONS_SETUP } from './setup'

/**
 * The default setup, pinned by what it LEAVES OUT.
 *
 * Both rules here are about an absent key, which is why neither is visible in
 * a rendered dialog and why nothing else catches them: `manifest.test.ts`
 * proves the dialog's values reach `create_game` untouched, and untouched is
 * exactly how a bad default would arrive.
 */

describe('DEFAULT_CONNECTIONS_SETUP', () => {
  it('carries NO puzzle_id key — that is how the server is told to choose', () => {
    // Absent means "pick the next puzzle none of these players has played".
    // `''` is present-but-unparseable and fails the uuid cast as a fault, so
    // the assertion is on the KEY: `puzzle_id: undefined` would read as absent
    // here while still being a key someone wrote on purpose.
    expect('puzzle_id' in DEFAULT_CONNECTIONS_SETUP).toBe(false)
  })

  it('carries no first_turn_user_id — a real member id cannot live in a default', () => {
    // The coop section seeds it from the club's roster once turn-by-turn is
    // picked. Anything baked in here would name a person who may not be in
    // this club, let alone at this table.
    expect('first_turn_user_id' in DEFAULT_CONNECTIONS_SETUP).toBe(false)
  })
})
