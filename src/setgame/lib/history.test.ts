// cs-unmet

import { describe, expect, it } from 'vitest'
import { makeHistorySnapshot } from './history'
import { makeGameData } from '../hooks/useGame'
import { ZTest_claim, ZTest_hint, ZTest_makeGameDataRaw } from './gameData.fixture'

// The ids are what the viewer addresses, and are deliberately not 0,1 — a
// builder that still indexed would pass by accident.
const { events } = makeGameData(ZTest_makeGameDataRaw({
  events: [
    ZTest_hint(11, 'u1', ['1121'], ['1111', '1112', '1113', '1121', '1122', '1123']),
    ZTest_claim(12, 'u1', ['1111', '1112', '1113'], ['3111', '3112', '3113', '1121', '1122', '1123']),
  ],
}), 'u1')
const ids = (tiles: readonly { id: string }[]) => tiles.map((t) => t.id)

describe('makeHistorySnapshot', () => {
  it('shows the table that row recorded, not the live one', () => {
    // The whole point of storing board_after: no replay, no second
    // implementation of the deal rule to disagree with the server's.
    expect(ids(makeHistorySnapshot(events, 11, 1)!.tiles)).toEqual(['1111', '1112', '1113', '1121', '1122', '1123'])
    expect(ids(makeHistorySnapshot(events, 12, 2)!.tiles)).toEqual(['3111', '3112', '3113', '1121', '1122', '1123'])
  })

  it('rings the tiles that turn was about', () => {
    expect(ids(makeHistorySnapshot(events, 11, 1)!.litTiles)).toEqual(['1121'])
    expect(ids(makeHistorySnapshot(events, 12, 2)!.litTiles)).toEqual(['1111', '1112', '1113'])
  })

  it('names the turn, and says how far a hint went', () => {
    expect(makeHistorySnapshot(events, 11, 1)!.label).toBe('Turn 1 — hint (1 of 3)')
    expect(makeHistorySnapshot(events, 12, 2)!.label).toBe('Turn 2 — set claimed')
  })

  it('prints the number it was GIVEN — the log numbers what it shows', () => {
    // The banner has to say what the reader clicked.
    expect(makeHistorySnapshot(events, 12, 1)!.label).toBe('Turn 1 — set claimed')
    // No number at all when the opening carried none.
    expect(makeHistorySnapshot(events, 12, null)!.label).toBe('Turn — set claimed')
  })

  it('returns null for a row that is not there', () => {
    expect(makeHistorySnapshot(events, 99, 1)).toBeNull()
    expect(makeHistorySnapshot([], 11, 1)).toBeNull()
  })
})
