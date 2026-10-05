// cs-unmet

import { describe, expect, it } from 'vitest'
import { makeGameData } from '../hooks/useGame'
import {
  ZTest_hint,
  ZTest_makeGameDataRaw,
  ZTest_spoiler,
  ZTest_WORD_TILES,
  ZTest_word,
} from './gameData.fixture'
import { makeHistorySnapshot } from './history'

/**
 * A four-turn coop log covering every kind the viewer must handle, as `gd`
 * holds it — rows with their players and tiles. The ids are what the viewer
 * addresses, and are deliberately not 0..3 — a builder that still indexed
 * would pass these by accident.
 *
 *   11  me    EAGLE   valid    → clears EAGLE's tiles
 *   12  me    EBATL   invalid  → clears nothing
 *   13  moth  hint             → clears nothing
 *   14  moth  TABLE   valid    → clears TABLE's tiles
 */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
const gd = makeGameData(
  ZTest_makeGameDataRaw({
    players: TWO,
    events: [
      ZTest_word(11, 'u1', 'eagle'),
      ZTest_word(12, 'u1', 'ebatl', ['10', '5', '11', '6', '2']),
      ZTest_hint(13, 'u2', 'something to eat off'),
      ZTest_word(14, 'u2', 'table'),
    ],
  }),
  'u1',
)
const EAGLE = new Set(ZTest_WORD_TILES.eagle)
const TABLE = new Set(ZTest_WORD_TILES.table)

describe('makeHistorySnapshot — offTileIds (strictly-before boundary)', () => {
  it('the first turn has nothing removed yet', () => {
    expect(makeHistorySnapshot(gd.events, 11).offTileIds).toEqual(new Set())
  })

  it('removes earlier valid words, whoever played them, but skips refusals and cheats', () => {
    // A coop board is one board: viewing moth's TABLE, my EAGLE is already
    // gone, and the refused word and the hint cleared nothing — so TABLE's own
    // tiles are still there to ring.
    expect(makeHistorySnapshot(gd.events, 14).offTileIds).toEqual(EAGLE)
  })
})

describe('makeHistorySnapshot — litTileIds (only on a valid word)', () => {
  it("rings the viewed valid word's own tiles", () => {
    expect(makeHistorySnapshot(gd.events, 14).litTileIds).toEqual(TABLE)
  })
  it('rings nothing for a refused word', () => {
    expect(makeHistorySnapshot(gd.events, 12).litTileIds).toEqual(new Set())
  })
  it('rings nothing for a hint', () => {
    expect(makeHistorySnapshot(gd.events, 13).litTileIds).toEqual(new Set())
  })
})

describe('makeHistorySnapshot — label (kind-aware)', () => {
  it('a valid word reads "Cleared WORD"', () => {
    expect(makeHistorySnapshot(gd.events, 11).label).toBe('Cleared EAGLE')
  })
  it('a refused word reads "Entered WORD — not a word"', () => {
    expect(makeHistorySnapshot(gd.events, 12).label).toBe('Entered EBATL — not a word')
  })
  it('a hint shows its clue', () => {
    expect(makeHistorySnapshot(gd.events, 13).label).toBe('Hint: something to eat off')
  })
  it('a spoiler names the word it handed over', () => {
    const spoiled = makeGameData(ZTest_makeGameDataRaw({ events: [ZTest_spoiler(9, 'u1', 'eagle')] }), 'u1')
    expect(makeHistorySnapshot(spoiled.events, 9).label).toBe('Revealed EAGLE')
  })
})

describe('makeHistorySnapshot — an id the list does not hold', () => {
  it('replays nothing', () => {
    const snap = makeHistorySnapshot(gd.events, 99)
    expect(snap.offTileIds).toEqual(new Set())
    expect(snap.litTileIds).toEqual(new Set())
    expect(snap.label).toBe('This turn')
  })
})
