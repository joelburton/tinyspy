import { describe, expect, it } from 'vitest'
import { colorForUserId } from './peerColor'

describe('colorForUserId', () => {
  it('returns the same color for the same user_id every call', () => {
    const u = 'ada11111-1111-1111-1111-111111111111'
    expect(colorForUserId(u)).toBe(colorForUserId(u))
  })

  it('returns a different color for different user_ids', () => {
    // Not strictly guaranteed by the API (a 5-color palette will
    // collide on some pairs), but the persona UUIDs in this
    // codebase happen to map to distinct colors — pin that so
    // a regression in the hash is obvious. If a future persona
    // collides, the right fix is to either reshuffle the palette
    // order or just accept the collision (the visual problem is
    // small).
    const ada = colorForUserId('ada11111-1111-1111-1111-111111111111')
    const bea = colorForUserId('bea22222-2222-2222-2222-222222222222')
    expect(ada).not.toBe(bea)
  })

  it('returns a CSS-color string (hex)', () => {
    expect(colorForUserId('ada11111-1111-1111-1111-111111111111')).toMatch(
      /^#[0-9a-f]{6}$/i,
    )
  })
})
