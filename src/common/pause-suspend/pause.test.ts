// cs-blessed-pause-suspend

import { describe, expect, it } from 'vitest'
import { computePause } from './pause'
import type { Member } from '../members/member'

/**
 * The rule that stops a game while somebody is missing, pinned as a matrix.
 *
 * Everything about presence-pause that could go wrong lives in this one
 * derivation, and two of its cases are the kind that only show up in front of
 * players: an **empty roster** must not read as "everyone is missing" (every
 * fresh mount would raise the overlay for a tick), and an **unknown id in the
 * channel** must not read as anyone at all (it can make the game neither more
 * nor less paused). The other two — nobody missing, somebody missing — are the
 * feature itself.
 *
 * `useCommonGame` owns the harder half and it is not tested here: which people
 * count as expected (this game's players, minus anyone who conceded, is done
 * playing, or is a bot) and how presence arrives. What this file defends is that, given those two inputs, the
 * answer is right.
 */

// Stand-ins for the personas the pgTAP suite uses. The values
// don't have to match those uuids — `computePause` is a pure
// set/array derivation — but keeping the names parallel makes the
// test legible alongside the rest of the suite.
// Color isn't relevant to computePause's logic, but the
// Member shape requires it — pick distinct values so any
// future test that does care can tell the personas apart.
const ada: Member = { user_id: 'ada', username: 'ada', color: 'red' }
const bea: Member = { user_id: 'bea', username: 'bea', color: 'blue' }
const cade: Member = { user_id: 'cade', username: 'cade', color: 'green' }

describe('computePause', () => {
  it('is false when every member is present', () => {
    expect(computePause(new Set(['ada', 'bea']), [ada, bea])).toBe(false)
  })

  it('is true when one member is missing', () => {
    expect(computePause(new Set(['ada']), [ada, bea])).toBe(true)
  })

  it('is true when nobody is present', () => {
    expect(computePause(new Set(), [ada, bea, cade])).toBe(true)
  })

  it('ignores extra present user_ids that are not members', () => {
    // dee is present in the channel but isn't on the roster
    // (e.g. an admin-tab in the same realtime channel for some
    // future debug surface). The presence of an unknown id must
    // not flip the result either direction.
    expect(computePause(new Set(['ada', 'bea', 'dee']), [ada, bea])).toBe(false)
  })

  it('is false on an empty roster (mid-load edge)', () => {
    // useCommonGame's first render has players=[] for a tick
    // before the roster fetch resolves. Showing the pause overlay
    // immediately on every fresh mount would be a UX bug —
    // computePause has to treat "no roster yet" as "nothing
    // missing yet."
    expect(computePause(new Set(), [])).toBe(false)
  })
})
