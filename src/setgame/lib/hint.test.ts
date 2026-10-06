// cs-unmet

import { describe, expect, it } from 'vitest'
import { isSet, third } from './tiles'
import { nextHint, ringFromLog } from './hint'
import { makeGameData } from '../hooks/useGame'
import { ZTest_claim, ZTest_hint, ZTest_makeGameDataRaw } from './gameData.fixture'
import type { GEventRaw, GTile } from '../types'

const tiles = (...ids: string[]): GTile[] => ids.map((id) => ({ id }))
const ids = (list: readonly GTile[] | null) => list?.map((t) => t.id) ?? null

// 1111,1112,1113 is a set (same count, color and fill, all three shapes); so is
// 1121,1122,1123.
const BOARD = tiles('1111', '1112', '1113', '1121', '1122', '1123', '2222', '2223', '3112', '3131', '3232', '3323')

describe('nextHint', () => {
  it('starts with a single tile of a real set', () => {
    const first = nextHint(BOARD, [])!
    expect(first).toHaveLength(1)
    expect(BOARD).toContain(first[0])
  })

  it('grows the SAME set rather than picking a new one each press', () => {
    // The property that keeps the ladder from wandering: press twice and the
    // second tile belongs to a set through the first, not to some other set.
    const one = nextHint(BOARD, [])!
    const two = nextHint(BOARD, one)!
    expect(two).toHaveLength(2)
    expect(two[0]).toBe(one[0])
    expect(ids(BOARD)).toContain(third(two[0], two[1]).id)
  })

  it('completes the set on the third press', () => {
    const two = nextHint(BOARD, nextHint(BOARD, [])!)!
    const three = nextHint(BOARD, two)!
    expect(three).toHaveLength(3)
    expect(three.slice(0, 2)).toEqual(two)
    expect(isSet(three[0], three[1], three[2])).toBe(true)
    expect(three.every((t) => BOARD.includes(t))).toBe(true)
  })

  it('does NOTHING once the whole set is showing', () => {
    // Not "returns the set again", which is the version that broke: a complete
    // ring means its claim is already in flight, so a fourth press would
    // re-submit three tiles that are on their way off the board.
    const three = nextHint(BOARD, nextHint(BOARD, nextHint(BOARD, [])!)!)!
    expect(nextHint(BOARD, three)).toBeNull()
  })

  it('starts over when the ringed tiles have left the board', () => {
    // A claim can take the very tiles a hint was pointing at. The stale ring is
    // dropped rather than extended into tiles that are gone.
    const rest = tiles('1121', '1122', '1123', '2222', '2223', '3112')
    const gone = nextHint(rest, tiles('1111', '1112'))
    expect(gone).toHaveLength(1)
    expect(rest).toContain(gone![0])
  })

  it('reports nothing on a board with no set', () => {
    // Part of a known set-free collection.
    expect(nextHint(tiles('1111', '1112', '1121', '1122'), [])).toBeNull()
  })
})

describe('ringFromLog', () => {
  const PLAYERS = [{ id: 'me', username: 'me' }, { id: 'you', username: 'you' }]
  const eventsOf = (...rows: GEventRaw[]) =>
    makeGameData(ZTest_makeGameDataRaw({ players: PLAYERS, events: rows }), 'me').events

  it('recovers my last hint after a reload', () => {
    expect(ids(ringFromLog(eventsOf(ZTest_hint(1, 'me', ['1213', '1221'])), 'me'))).toEqual(['1213', '1221'])
  })

  it('is empty once a claim has happened since', () => {
    // A claim moves the board, so the ring may point at tiles that are gone —
    // and it is the one event that clears the ring during play too.
    expect(ringFromLog(eventsOf(
      ZTest_hint(1, 'me', ['1213', '1221']),
      ZTest_claim(2, 'you', ['1111', '1112', '1113']),
    ), 'me')).toEqual([])
  })

  it('ignores hints somebody else asked for', () => {
    // A hint is private: the log records that a teammate asked, but their ring
    // was never on my board.
    expect(ringFromLog(eventsOf(ZTest_hint(1, 'you', ['1213', '1221'])), 'me')).toEqual([])
  })

  it('is empty with no events at all', () => {
    expect(ringFromLog([], 'me')).toEqual([])
  })
})
