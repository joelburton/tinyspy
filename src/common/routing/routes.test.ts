// cs-audited-routing

/**
 * Tests for the URL shapes. Two things are worth pinning here:
 *
 *   - A path built by `clubPath` / `gamePath` is matched back by the matcher
 *     for it — the round trip, which is the whole reason writers and matchers
 *     share a file.
 *   - The two loosenesses are deliberate and stay: a gametype may carry
 *     underscores and any case, and a game id is anything without a slash.
 *     Both have a reason in `routes.ts`, and a tightening that quietly broke a
 *     sibling game or an ordinary link should fail here.
 *
 * Pure string functions — no DOM, no router state.
 */

import { describe, expect, it } from 'vitest'
import { clubPath, gamePath, matchClubRoute, matchGameRoute } from './routes'

describe('clubPath / gamePath', () => {
  it('builds the two shapes', () => {
    expect(clubPath('joel-leah')).toBe('/c/joel-leah')
    expect(gamePath('wordle', 'abc-123')).toBe('/g/wordle/abc-123')
  })

  it('round-trips through its own matcher', () => {
    expect(matchClubRoute(clubPath('joel-leah'))).toEqual({ handle: 'joel-leah' })
    expect(matchGameRoute(gamePath('connections_coop', 'abc-123'))).toEqual({
      gametype: 'connections_coop',
      gameId: 'abc-123',
    })
  })
})

describe('matchClubRoute', () => {
  it('takes a handle with or without a trailing slash', () => {
    expect(matchClubRoute('/c/joel-leah')).toEqual({ handle: 'joel-leah' })
    expect(matchClubRoute('/c/joel-leah/')).toEqual({ handle: 'joel-leah' })
  })

  it('is null for anything else', () => {
    expect(matchClubRoute('/')).toBeNull()
    expect(matchClubRoute('/c/')).toBeNull()
    expect(matchClubRoute('/c/joel-leah/extra')).toBeNull()
    expect(matchClubRoute('/g/wordle/abc-123')).toBeNull()
  })
})

describe('matchGameRoute', () => {
  it('takes a sibling-manifest gametype, which carries an underscore', () => {
    expect(matchGameRoute('/g/psychicnum_compete/abc-123')).toEqual({
      gametype: 'psychicnum_compete',
      gameId: 'abc-123',
    })
  })

  it('matches the gametype case-insensitively and hands it back as typed', () => {
    // `App.tsx` lowercases before the registry lookup and echoes this spelling
    // in the "no such game type" message.
    expect(matchGameRoute('/g/Wordle/abc-123')?.gametype).toBe('Wordle')
  })

  it('takes any id that is not a slash, uuid-shaped or not', () => {
    // Whether a string could name a game is GamePage's question — a bad id
    // reaches the game page and gets the same "no such game" as a deleted one.
    expect(matchGameRoute('/g/wordle/not-a-uuid')?.gameId).toBe('not-a-uuid')
  })

  it('takes a trailing slash', () => {
    expect(matchGameRoute('/g/wordle/abc-123/')?.gameId).toBe('abc-123')
  })

  it('is null for anything else', () => {
    expect(matchGameRoute('/')).toBeNull()
    expect(matchGameRoute('/g/wordle')).toBeNull()
    expect(matchGameRoute('/g/wordle/abc-123/extra')).toBeNull()
    expect(matchGameRoute('/c/joel-leah')).toBeNull()
  })
})
