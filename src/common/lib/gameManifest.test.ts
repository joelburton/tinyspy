// cs-blessed-game-lib

import { describe, expect, it } from 'vitest'
import { playerCountFits, playerCountLabel, playerCountShort } from './gameManifest'

/**
 * Pure-function tests for the player-count helpers — **all three of them.**
 *
 * They read the same `numberOfPlayers` tuple off a gametype's manifest and
 * answer three different questions about it: `playerCountFits` drives
 * ClubPage's enable/disable decision for a Start button, `playerCountLabel`
 * writes the tooltip explaining a disabled one, and `playerCountShort` writes
 * the meta line on every enabled one.
 *
 * See `gameManifest.ts` for the tuple itself, and docs/features.md → Player
 * counts for what each game actually declares.
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
    // [1, 6] is the house default — the coop shape of most gametypes.
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

/**
 * The third sibling, and the one on screen most: `playerCountLabel` writes a
 * tooltip you only see on a DISABLED Start button, while this writes the meta
 * line under every ENABLED one (`StartGameRow.tsx:50`) — so a club sees it
 * once per startable gametype, every visit.
 */
describe('playerCountShort', () => {
  it('formats an exact-match range as "N players"', () => {
    // codenamesduet's [2, 2] — the only fixed-seat game on the roster.
    expect(playerCountShort([2, 2])).toBe('2 players')
  })

  it('singularizes "player" when the exact count is 1', () => {
    // The same branch `playerCountLabel` has its own test for, and reachable
    // the same way: most coop gametypes declare [1, 6], so a [1, 1] is one
    // manifest edit away from rendering "1 players" on a real Start button.
    expect(playerCountShort([1, 1])).toBe('1 player')
  })

  it('formats a bounded range as "N–M players"', () => {
    // The three shapes actually in the roster (docs/features.md → Player
    // counts): the house default, boggle/crosswords' wider board, scrabble's
    // tile-bag cap.
    expect(playerCountShort([1, 6])).toBe('1–6 players')
    expect(playerCountShort([2, 8])).toBe('2–8 players')
    expect(playerCountShort([1, 4])).toBe('1–4 players')
  })

  it('separates a range with an EN DASH, matching its sibling', () => {
    // Invisible in review and easy to "fix" to a hyphen. Both helpers render
    // the same range in the same club — the tooltip and the meta line — so a
    // divergence here shows up as two spellings of one number on one page.
    expect(playerCountShort([1, 6])).toContain('–')
    expect(playerCountLabel([1, 6])).toContain('–')
    expect(playerCountShort([1, 6])).not.toContain('-')
  })
})
