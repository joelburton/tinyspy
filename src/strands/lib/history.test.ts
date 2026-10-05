// cs-unmet

import { describe, it, expect } from 'vitest'
import { makeHistorySnapshot } from './history'
import {
  ZTest_find,
  ZTest_guess,
  ZTest_hint,
  ZTest_makeGameDataRaw,
  ZTest_rowIds,
} from './gameData.fixture'
import { makeGameData } from '../hooks/useGame'

// A six-turn session with every interesting row kind: a find, a reject, a
// hint word, the spangram, a duplicate — and a SPENT HINT, which is the one
// row that isn't a guess. The ids are what the viewer addresses, and are
// deliberately not 0..5 — a builder that still indexed would pass these by
// accident.
const { events } = makeGameData(
  ZTest_makeGameDataRaw({
    events: [
      ZTest_find(11, 'u1', 0),
      ZTest_guess(12, 'u1', ZTest_rowIds(1, 2), 'too_short'),
      ZTest_guess(13, 'u1', ZTest_rowIds(2, 4), 'hint_word'),
      ZTest_find(14, 'u1', 4),
      ZTest_guess(15, 'u1', ZTest_rowIds(2, 4), 'duplicate'),
      ZTest_hint(16, 'u1', ZTest_rowIds(5)),
    ],
  }),
  'u1',
)

const words = (id: number) => makeHistorySnapshot(events, id, 1).board.words.map((w) => w.word)

describe('makeHistorySnapshot', () => {
  it('is a filter: the board at turn N is the theme finds among rows 0..N', () => {
    expect(words(11)).toEqual(['zzqabc'])
    // Rejects and hint words never reach the board.
    expect(words(13)).toEqual(['zzqabc'])
  })

  it('the boundary is INCLUSIVE: viewing a find shows that find placed', () => {
    expect(words(14)).toEqual(['zzqabc', 'zzqejk'])
    expect(makeHistorySnapshot(events, 14, 4).board.words[1]!.spangram).toBe(true)
  })

  it('lights the viewed turn even when it changed nothing', () => {
    // A rejected word's tiles are exactly what reviewing it wants to see.
    expect(makeHistorySnapshot(events, 12, 2).litTiles.map((t) => t.id)).toEqual(['1,0', '1,1'])
    expect(words(12)).toEqual(['zzqabc'])
  })

  it('describes the turn in the log wording, numbered by what it was GIVEN', () => {
    expect(makeHistorySnapshot(events, 11, 1).label).toBe('#1 ZZQABC — theme word')
    expect(makeHistorySnapshot(events, 12, 2).label).toBe('#2 ZZ — too short')
    expect(makeHistorySnapshot(events, 14, 4).label).toBe('#4 ZZQEJK — spangram')
    expect(makeHistorySnapshot(events, 15, 5).label).toBe('#5 ZZQC — already found')
    // The number is the LOG's, not this list's: filtered to one player, row 15
    // printed as "#2", and the banner echoes what the reader clicked.
    expect(makeHistorySnapshot(events, 15, 2).label).toBe('#2 ZZQC — already found')
    // No number at all when the opening carried none.
    expect(makeHistorySnapshot(events, 15, null).label).toBe('ZZQC — already found')
  })

  describe('a spent hint', () => {
    it('re-rings its revealed tiles as a HINT, not as a traced route', () => {
      const snap = makeHistorySnapshot(events, 16, 6)
      expect(snap.board.hintTiles?.map((t) => t.id)).toEqual(ZTest_rowIds(5))
      expect(snap.litTiles).toEqual([])
    })

    it('names the act without naming the word', () => {
      expect(makeHistorySnapshot(events, 16, 6).label).toBe('#6 Hint — a word was revealed')
    })

    it('leaves the board exactly as the finds before it left it', () => {
      // A hint reveals; it never places. So turn 6's board is turn 5's board.
      expect(words(16)).toEqual(words(15))
    })

    it('carries no hint ring on a guess turn', () => {
      expect(makeHistorySnapshot(events, 11, 1).board.hintTiles).toBeNull()
    })
  })

  it('an id these rows do not hold replays nothing', () => {
    const snap = makeHistorySnapshot(events, 99, 1)
    expect(snap.litTiles).toEqual([])
    expect(snap.board).toEqual({ words: [], hintTiles: null })
    expect(snap.label).toBe('')
  })
})
