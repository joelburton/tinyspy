import { describe, expect, it } from 'vitest'
import { isSet, third } from './cards'
import { nextHint, ringFromLog } from './hint'

// 0,1,2 is a set (same count/color/shade, all three shapes); so is 3,4,5.
const BOARD = [0, 1, 2, 3, 4, 5, 40, 41, 55, 60, 70, 77]

describe('nextHint', () => {
  it('starts with a single card of a real set', () => {
    const first = nextHint(BOARD, [])!
    expect(first).toHaveLength(1)
    expect(BOARD).toContain(first[0])
  })

  it('grows the SAME set rather than picking a new one each press', () => {
    // The property that keeps the ladder from wandering: press twice and the
    // second card belongs to a set through the first, not to some other set.
    const one = nextHint(BOARD, [])!
    const two = nextHint(BOARD, one)!
    expect(two).toHaveLength(2)
    expect(two[0]).toBe(one[0])
    expect(BOARD).toContain(third(two[0], two[1]))
  })

  it('completes the set on the third press', () => {
    const two = nextHint(BOARD, nextHint(BOARD, [])!)!
    const three = nextHint(BOARD, two)!
    expect(three).toHaveLength(3)
    expect(three.slice(0, 2)).toEqual(two)
    expect(isSet(three[0], three[1], three[2])).toBe(true)
    expect(three.every((c) => BOARD.includes(c))).toBe(true)
  })

  it('does NOTHING once the whole set is showing', () => {
    // Not "returns the set again", which is the version that broke: a complete
    // ring means its claim is already in flight, so a fourth press would
    // re-submit three cards that are on their way off the board.
    const three = nextHint(BOARD, nextHint(BOARD, nextHint(BOARD, [])!)!)!
    expect(nextHint(BOARD, three)).toBeNull()
  })

  it('starts over when the ringed cards have left the board', () => {
    // A claim can take the very cards a hint was pointing at. The stale ring is
    // dropped rather than extended into cards that are gone.
    const gone = nextHint([3, 4, 5, 40, 41, 55], [0, 1])
    expect(gone).toHaveLength(1)
    expect([3, 4, 5, 40, 41, 55]).toContain(gone![0])
  })

  it('reports nothing on a board with no set', () => {
    // 0,1,3,4 is part of a known set-free collection.
    expect(nextHint([0, 1, 3, 4], [])).toBeNull()
  })
})

describe('ringFromLog', () => {
  const hint = (user_id: string, cards: number[]) => ({ kind: 'hint' as const, user_id, cards })
  const claim = (user_id: string, cards: number[]) => ({ kind: 'claim' as const, user_id, cards })

  it('recovers my last hint after a reload', () => {
    expect(ringFromLog([hint('me', [7, 8])], 'me')).toEqual([7, 8])
  })

  it('is empty once a claim has happened since', () => {
    // A claim moves the board, so the ring may point at cards that are gone —
    // and it is the one event that clears the ring during play too.
    expect(ringFromLog([hint('me', [7, 8]), claim('you', [1, 2, 3])], 'me')).toEqual([])
  })

  it('ignores hints somebody else asked for', () => {
    // A hint is private: the log records that a teammate asked, but their ring
    // was never on my board.
    expect(ringFromLog([hint('you', [7, 8])], 'me')).toEqual([])
  })

  it('is empty with no events at all', () => {
    expect(ringFromLog([], 'me')).toEqual([])
  })
})
