import { describe, expect, it } from 'vitest'
import { computePause } from './pause'
import type { SetupMember } from './games'

// Stand-ins for the personas the pgTAP suite uses. The values
// don't have to match those uuids — `computePause` is a pure
// set/array derivation — but keeping the names parallel makes the
// test legible alongside the rest of the suite.
// Color isn't relevant to computePause's logic, but the
// SetupMember shape now requires it — pick distinct values so
// any future test that does care can tell the personas apart.
const ada: SetupMember = { user_id: 'ada', username: 'ada', color: 'red' }
const bea: SetupMember = { user_id: 'bea', username: 'bea', color: 'blue' }
const cade: SetupMember = { user_id: 'cade', username: 'cade', color: 'green' }

/**
 * `computePause` is the FE-side derivation of pause-on-disconnect:
 * given the set of currently-connected user_ids (the channel's
 * presence state) and the club's expected member list, return
 * `{ paused, missing }`.
 *
 * Rules:
 *   - paused === true iff at least one expected member is missing
 *   - missing is the subset of `members` whose user_id isn't in
 *     `presentUserIds`
 *   - extra ids in `presentUserIds` (not in `members`) are
 *     ignored — they can't make the game more-paused or
 *     less-paused
 *   - an empty `members` list (mid-load, never-loaded edge) is
 *     not paused — there's nothing to be missing
 *
 * This test pins the matrix so `useCommonGame`'s pause derivation
 * stays correct as the hook itself evolves.
 */
describe('computePause', () => {
  it('returns paused=false when every member is present', () => {
    const { paused, missing } = computePause(
      new Set(['ada', 'bea']),
      [ada, bea],
    )
    expect(paused).toBe(false)
    expect(missing).toEqual([])
  })

  it('returns paused=true with the offline members when one is missing', () => {
    const { paused, missing } = computePause(new Set(['ada']), [ada, bea])
    expect(paused).toBe(true)
    expect(missing).toEqual([bea])
  })

  it('returns paused=true with the whole roster when nobody is present', () => {
    const { paused, missing } = computePause(new Set(), [ada, bea, cade])
    expect(paused).toBe(true)
    expect(missing).toEqual([ada, bea, cade])
  })

  it('ignores extra present user_ids that are not members', () => {
    // dee is present in the channel but isn't on the roster
    // (e.g. an admin-tab in the same realtime channel for some
    // future debug surface). The presence of an unknown id must
    // not flip the result either direction.
    const { paused, missing } = computePause(
      new Set(['ada', 'bea', 'dee']),
      [ada, bea],
    )
    expect(paused).toBe(false)
    expect(missing).toEqual([])
  })

  it('returns paused=false on an empty roster (mid-load edge)', () => {
    // useCommonGame's first render has members=[] for a tick
    // before the roster fetch resolves. Showing the pause overlay
    // immediately on every fresh mount would be a UX bug —
    // computePause has to treat "no roster yet" as "nothing
    // missing yet."
    const { paused, missing } = computePause(new Set(), [])
    expect(paused).toBe(false)
    expect(missing).toEqual([])
  })

  it('preserves the original members array order in `missing`', () => {
    // Stable order matters for the UI — "Bea and Cade have gone
    // offline" should render in roster order, not in iteration
    // order of the Set.
    const { missing } = computePause(new Set(['ada']), [ada, bea, cade])
    expect(missing.map((m) => m.user_id)).toEqual(['bea', 'cade'])
  })
})
