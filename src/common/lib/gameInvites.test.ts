import { describe, expect, it } from 'vitest'
import { newInviteCandidates, type InviteCandidate } from './gameInvites'

const me = 'me-id'
const candidate = (over: Partial<InviteCandidate>): InviteCandidate => ({
  id: 'g1',
  gametype: 'freebee_coop',
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
