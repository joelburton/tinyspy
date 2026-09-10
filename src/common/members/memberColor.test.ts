// cs-blessed-members

import { describe, expect, it } from 'vitest'
import {
  MEMBER_COLORS,
  borderVarFor,
  colorByUserIdMap,
  colorVarFor,
  defaultColorFor,
} from './memberColor'

/**
 * The module turns profile color NAMES into things the rest of the app can
 * use: the two CSS-variable resolvers and the map built from them, plus the
 * hash that picks a starting color for a new player.
 *
 * The DB's CHECK constraint keeps the palette closed, but the resolvers defend
 * in depth: an unknown name falls through to body text rather than producing a
 * broken `var(--member-undefined-fill-color)` reference.
 *
 * **The palette is spelled out here on purpose.** A test that imports
 * `MEMBER_COLORS` and checks `colorVarFor` against it proves only that the
 * function interpolates, whatever the list happens to say — so the eight names
 * are written by hand below. Whether every spelling of them across the app
 * agrees is a separate question with its own guard,
 * `src/guards/memberPalette.test.ts`.
 */

describe('colorVarFor', () => {
  it('returns the matching CSS var for every palette name', () => {
    const palette = [
      'red',
      'orange',
      'yellow',
      'green',
      'brown',
      'blue',
      'purple',
      'pink',
    ]
    for (const name of palette) {
      expect(colorVarFor(name)).toBe(`var(--member-${name}-fill-color)`)
    }
  })

  it('falls back to body text color for unknown names', () => {
    // Defensive: a hypothetical future palette entry the DB
    // knows about but this FE bundle hasn't been updated for.
    // Better to render in body text than to ship a broken var.
    expect(colorVarFor('chartreuse')).toBe('var(--page-text-color)')
  })

  it('falls back to body text color for null / undefined / empty', () => {
    expect(colorVarFor(null)).toBe('var(--page-text-color)')
    expect(colorVarFor(undefined)).toBe('var(--page-text-color)')
    expect(colorVarFor('')).toBe('var(--page-text-color)')
  })
})

describe('borderVarFor', () => {
  it('returns the paired EDGE var, not the fill', () => {
    // The two resolvers answer different halves of the same name, and the
    // whole point of the pair is that a disc can draw both at once.
    expect(borderVarFor('yellow')).toBe('var(--member-yellow-edge-color)')
    expect(colorVarFor('yellow')).toBe('var(--member-yellow-fill-color)')
  })

  it('falls back to body text color on the same terms as colorVarFor', () => {
    expect(borderVarFor('chartreuse')).toBe('var(--page-text-color)')
    expect(borderVarFor(null)).toBe('var(--page-text-color)')
    expect(borderVarFor(undefined)).toBe('var(--page-text-color)')
    expect(borderVarFor('')).toBe('var(--page-text-color)')
  })
})

describe('defaultColorFor', () => {
  it('always returns a palette name', () => {
    // The claim form sends whatever this returns straight to `claim_username`,
    // which rejects anything outside the palette (PN015) — so an off-palette
    // answer would be a fault raised on a value no player chose.
    for (const name of ['a', 'joel', 'moth', 'leah', '', 'ZZZZZZZZZZZZ', '🎲']) {
      expect(MEMBER_COLORS).toContain(defaultColorFor(name))
    }
  })

  it('gives the same username the same color every time', () => {
    // Stability is the contract: a player who reloads the claim form before
    // submitting should not watch their pre-selected color change.
    expect(defaultColorFor('joel')).toBe(defaultColorFor('joel'))
    expect(defaultColorFor('moth')).toBe(defaultColorFor('moth'))
  })

  it('spreads across the whole palette rather than favoring a few', () => {
    // A hash that reached only three colors would still be "deterministic and
    // in-palette" while making the pre-selection nearly useless. Every name in
    // MEMBER_COLORS should be reachable.
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(defaultColorFor(`player${i}`))
    expect([...seen].sort()).toEqual([...MEMBER_COLORS].sort())
  })
})

describe('colorByUserIdMap', () => {
  it('maps each member to their pre-resolved color var', () => {
    const m = colorByUserIdMap([
      { user_id: 'ada', color: 'red', username: 'ada' },
      { user_id: 'bea', color: 'blue', username: 'bea' },
    ])
    expect(m.get('ada')).toBe('var(--member-red-fill-color)')
    expect(m.get('bea')).toBe('var(--member-blue-fill-color)')
  })

  it('returns undefined for a user_id not in the roster', () => {
    // Callers should treat missing values as "no color known
    // yet" and skip the styling — the helper doesn't synthesize.
    const m = colorByUserIdMap([{ user_id: 'ada', color: 'red' }])
    expect(m.get('dee')).toBeUndefined()
  })

  it('honors the unknown-name fallback for individual members', () => {
    // If one member somehow has a stale-palette color, that
    // member's entry should fall through to body-text — not
    // poison the rest of the map.
    const m = colorByUserIdMap([
      { user_id: 'ada', color: 'red' },
      { user_id: 'bea', color: 'chartreuse' },
    ])
    expect(m.get('ada')).toBe('var(--member-red-fill-color)')
    expect(m.get('bea')).toBe('var(--page-text-color)')
  })

  it('handles an empty roster', () => {
    const m = colorByUserIdMap([])
    expect(m.size).toBe(0)
  })
})
