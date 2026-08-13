import { describe, expect, it } from 'vitest'
import { INVITE_MAX_AGE_MS, inviteCutoffIso, newInviteCandidates, type InviteCandidate } from './gameInvites'

const me = 'me-id'
const candidate = (over: Partial<InviteCandidate>): InviteCandidate => ({
  id: 'g1',
  gametype: 'spellingbee_coop',
  club_handle: 'pals',
  created_by: 'moth-id',
  ...over,
})

describe('newInviteCandidates', () => {
  it('keeps a game someone else added me to that I have not seen', () => {
    const got = newInviteCandidates([candidate({})], { selfId: me, seen: new Set() })
    expect(got.map((c) => c.id)).toEqual(['g1'])
  })

  it('drops a game I created (I am already in it)', () => {
    const got = newInviteCandidates([candidate({ created_by: me })], {
      selfId: me,
      seen: new Set(),
    })
    expect(got).toEqual([])
  })

  it('drops a game whose invite was already surfaced (seen)', () => {
    const got = newInviteCandidates([candidate({ id: 'g1' })], {
      selfId: me,
      seen: new Set(['g1']),
    })
    expect(got).toEqual([])
  })

  it('filters a mixed batch to just the new, not-mine games', () => {
    const got = newInviteCandidates(
      [
        candidate({ id: 'mine', created_by: me }),
        candidate({ id: 'seen' }),
        candidate({ id: 'fresh' }),
      ],
      { selfId: me, seen: new Set(['seen']) },
    )
    expect(got.map((c) => c.id)).toEqual(['fresh'])
  })
})

/**
 * The age bound on the invitation scan. It lives here rather than in
 * `newInviteCandidates` because it rides on the QUERY — stale rows never leave
 * the database — so what's testable is the cutoff arithmetic.
 */
describe('inviteCutoffIso', () => {
  it('is an hour', () => {
    expect(INVITE_MAX_AGE_MS).toBe(60 * 60_000)
  })

  it('returns exactly one window back from the instant given', () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z')
    expect(inviteCutoffIso(now)).toBe('2026-08-13T11:00:00.000Z')
  })

  it('a game newer than the cutoff sorts after it; an older one before', () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z')
    const cutoff = inviteCutoffIso(now)
    // PostgREST compares these as timestamps, but ISO-8601 UTC strings are
    // lexicographically ordered too, so the boundary is easy to state.
    expect('2026-08-13T11:59:00.000Z' > cutoff).toBe(true) // 1 min old — invited
    expect('2026-08-13T10:00:00.000Z' > cutoff).toBe(false) // 2 h old — not
  })
})
