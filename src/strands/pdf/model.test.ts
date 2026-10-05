// cs-unmet

/**
 * Tests for strands' print model — the pure half.
 *
 * The judgment under test is **what may be printed**. strands hides its answer,
 * so paper must not reveal what the screen withholds: no missed words before the
 * reveal, and no rival's board before the game is over. The rest (glyphs,
 * summaries) is formatting, and gets one case each.
 */
import { describe, expect, it } from 'vitest'
import { buildStrandsPrintModel } from './model'
import {
  ZTest_find,
  ZTest_guess,
  ZTest_hint,
  ZTest_makeGameDataRaw,
  ZTest_rowIds,
  type ZTest_GameDataFacts,
} from '../lib/gameData.fixture'
import { makeGameData } from '../hooks/useGame'

const TWO = [
  { id: 'u1', username: 'ada', color: 'red' },
  { id: 'u2', username: 'bea', color: 'blue' },
]
const STOPPED = { ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null }, outcome: 'neutral' } as const

/** The model for these facts, as Print builds it, the solution shown or not. */
function print(facts: ZTest_GameDataFacts, solutionShown = false) {
  const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, ...facts }), 'u1')
  return buildStrandsPrintModel({
    header: { mode: gd.mode, brand: 'PaulPath', gameTitle: 't', date: 'd', summary: 's', setupRows: [] },
    tiles: gd.puzzle.tiles,
    mode: gd.mode,
    ended: gd.ended,
    players: gd.players,
    me: gd.me,
    events: gd.events,
    nFoundPuzzleWords: gd.stateLineData.nFoundPuzzleWords,
    nHintsUsed: gd.stateLineData.nHintsUsed,
    puzzleWords: solutionShown ? gd.puzzle.puzzleWords : null,
  })
}

describe('buildStrandsPrintModel — the shield holds on paper', () => {
  it('prints NO missed words while the solution is hidden', () => {
    const m = print({ events: [ZTest_find(1, 'u1', 0)], ...STOPPED })
    expect(m.tracks[0]!.puzzleWords.map((w) => w.word)).toEqual(['zzqabc'])
    expect(m.tracks[0]!.puzzleWords.some((w) => w.missed)).toBe(false)
  })

  it('prints the missed words while the solution is shown', () => {
    const m = print({ events: [ZTest_find(1, 'u1', 0)], ...STOPPED }, true)
    expect(m.tracks[0]!.puzzleWords.filter((w) => w.missed)).toHaveLength(7)
  })

  it('compete prints ONLY my track mid-game', () => {
    // `gd` holds no rival's board yet, so a rival's column would be an empty
    // grid claiming they'd found nothing.
    const m = print({ mode: 'compete', events: [ZTest_find(1, 'u1', 0), ZTest_find(2, 'u2', 4)] })
    expect(m.tracks.map((t) => t.who)).toEqual(['ada'])
  })

  it('compete prints EVERY player once ended, each with their own words', () => {
    const m = print({ mode: 'compete', events: [ZTest_find(1, 'u1', 0), ZTest_find(2, 'u2', 4)], ...STOPPED })
    expect(m.tracks.map((t) => t.who)).toEqual(['ada', 'bea'])
    // Each column holds that player's OWN find — the whole reason compete
    // prints in tracks rather than one merged log.
    expect(m.tracks[0]!.puzzleWords.map((w) => w.word)).toEqual(['zzqabc'])
    expect(m.tracks[1]!.puzzleWords.map((w) => w.word)).toEqual(['zzqejk'])
  })
})

describe('buildStrandsPrintModel — formatting', () => {
  it('coop is ONE unnamed track: the board and the log are the team\'s', () => {
    const m = print({
      events: [ZTest_find(1, 'u1', 0), ZTest_guess(2, 'u2', ZTest_rowIds(1, 4), 'hint_word'), ZTest_hint(3, 'u2', ZTest_rowIds(2))],
    })
    expect(m.tracks).toHaveLength(1)
    expect(m.tracks[0]!.who).toBeNull()
    expect(m.tracks[0]!.turns).toHaveLength(3)
    expect(m.tracks[0]!.summary).toBe('1 word · 1 hint')
  })

  it('marks each verdict, and notes only what the glyph cannot say', () => {
    const m = print({
      events: [
        ZTest_find(1, 'u1', 4),
        ZTest_find(2, 'u1', 0),
        ZTest_guess(3, 'u1', ZTest_rowIds(1, 4), 'hint_word'),
        ZTest_guess(4, 'u1', ZTest_rowIds(1, 2), 'too_short'),
      ],
    })
    expect(m.tracks[0]!.turns.map((t) => [t.word, t.mark, t.note])).toEqual([
      ['ZZQEJK', 'best', ''],
      ['ZZQABC', 'find', ''],
      ['ZZQB', 'ok', ''],
      // Every rejection shares one glyph, so the note is the only thing saying
      // WHICH rejection it was.
      ['ZZ', 'no', 'too short'],
    ])
  })

  it('omits the hint count when none were spent', () => {
    expect(print({ events: [ZTest_find(1, 'u1', 0)] }).tracks[0]!.summary).toBe('1 word')
  })

  it('prints a spent hint as its own row, in sequence, with no word', () => {
    const m = print({ events: [ZTest_find(1, 'u1', 0), ZTest_hint(2, 'u1', ZTest_rowIds(2)), ZTest_find(3, 'u1', 4)] })
    // Position matters: the printed log keeps the same numbering as the screen,
    // so the two can be read side by side.
    expect(m.tracks[0]!.turns.map((t) => [t.seq, t.word, t.mark])).toEqual([
      [1, 'ZZQABC', 'find'],
      [2, 'Hint used', 'hint'],
      [3, 'ZZQEJK', 'best'],
    ])
  })

  it('a hint never reaches the printed BOARD — it revealed, it did not place', () => {
    const m = print({ events: [ZTest_find(1, 'u1', 0), ZTest_hint(2, 'u1', ZTest_rowIds(2))] })
    // The hint's tiles are a puzzle word's; drawing them among the found words
    // would print an answer nobody found — the shield's whole concern.
    expect(m.tracks[0]!.puzzleWords.map((w) => w.word)).toEqual(['zzqabc'])
  })
})
