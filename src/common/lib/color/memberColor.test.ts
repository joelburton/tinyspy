import { describe, expect, it } from 'vitest'
import { colorByUserIdMap, colorVarFor } from './memberColor'

/**
 * `colorVarFor` and `colorByUserIdMap` are the two pure
 * helpers that translate profile color names into CSS values
 * the FE can drop into style props. The DB's CHECK constraint
 * keeps the palette closed, but these helpers defend in depth:
 * unknown names fall through to body text rather than producing
 * a broken `var(--member-undefined-dot-color)` reference.
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
      expect(colorVarFor(name)).toBe(`var(--member-${name}-dot-color)`)
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

describe('colorByUserIdMap', () => {
  it('maps each member to their pre-resolved color var', () => {
    const m = colorByUserIdMap([
      { user_id: 'ada', color: 'red', username: 'ada' },
      { user_id: 'bea', color: 'blue', username: 'bea' },
    ])
    expect(m.get('ada')).toBe('var(--member-red-dot-color)')
    expect(m.get('bea')).toBe('var(--member-blue-dot-color)')
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
    expect(m.get('ada')).toBe('var(--member-red-dot-color)')
    expect(m.get('bea')).toBe('var(--page-text-color)')
  })

  it('handles an empty roster', () => {
    const m = colorByUserIdMap([])
    expect(m.size).toBe(0)
  })
})
