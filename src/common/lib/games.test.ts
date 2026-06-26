import { describe, expect, it } from 'vitest'
import { playerCountFits, playerCountLabel } from './games'

/**
 * Pure-function tests for the player-count helpers. These drive
 * ClubPage's "enable/disable Start button" decision and the
 * tooltip text the user sees on a disabled button.
 *
 * See src/common/lib/games.ts for the types these consume — the
 * `numberOfPlayers` tuple on each gametype's manifest.
 */

describe('playerCountFits', () => {
  it('returns true when the count falls inside an exact-match range', () => {
    // [2, 2] is codenamesduet's range — only exactly-2-member clubs.
    expect(playerCountFits([2, 2], 2)).toBe(true)
  })

  it('returns false for counts outside an exact-match range', () => {
    expect(playerCountFits([2, 2], 1)).toBe(false)
    expect(playerCountFits([2, 2], 3)).toBe(false)
  })

  it('returns true for counts inside a bounded range, false outside', () => {
    // [1, 6] is the shape connections / psychicnum / spellingbee all use.
    expect(playerCountFits([1, 6], 1)).toBe(true)
    expect(playerCountFits([1, 6], 3)).toBe(true)
    expect(playerCountFits([1, 6], 6)).toBe(true)
    expect(playerCountFits([1, 6], 7)).toBe(false)
  })
})

describe('playerCountLabel', () => {
  it('formats an exact-match range as "exactly N members"', () => {
    expect(playerCountLabel([2, 2])).toBe('Needs exactly 2 members')
  })

  it('singularizes "member" when the exact count is 1', () => {
    // Probably never used in practice (a [1, 1] game in a 0-member
    // club isn't a thing under the solo-club model), but the
    // pluralization rule should still apply.
    expect(playerCountLabel([1, 1])).toBe('Needs exactly 1 member')
  })

  it('formats a bounded range as "N–M members"', () => {
    expect(playerCountLabel([1, 6])).toBe('Needs 1–6 members')
    expect(playerCountLabel([2, 4])).toBe('Needs 2–4 members')
  })
})
