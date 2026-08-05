import { describe, expect, it } from 'vitest'
import { buildLetterboxedPrintModel } from './model'
import type { EventRow, PlayerRow } from '../hooks/useGame'
import type { GamePlayer } from '../../common/lib/games'

const ALICE = 'a1111111-1111-1111-1111-111111111111'
const BEA = 'b2222222-2222-2222-2222-222222222222'

const player = (user_id: string, username: string): GamePlayer =>
  ({ user_id, username, color: 'blue', conceded: false, result: null }) as unknown as GamePlayer

const row = (user_id: string, chain: string[] | null): PlayerRow => ({
  game_id: 'g',
  user_id,
  chain,
  word_count: chain?.length ?? 0,
  letters_covered: new Set((chain ?? []).join('')).size,
  hints_used: 0,
  solved: false,
  solved_at: null,
})

let seq = 0
const ev = (user_id: string, kind: EventRow['kind'], word: string | null): EventRow => ({
  id: ++seq,
  game_id: 'g',
  user_id,
  kind,
  word,
  letters_covered: 3,
  created_at: '2026-08-05T00:00:00Z',
})

const base = {
  brand: 'SnakeBox',
  gameTitle: 'ABC·DEF·GHI·JKL',
  date: '5 Aug 2026',
  sides: 'abcdefghijkl',
  solution: ['adgjbehk', 'kcfil'],
  selfId: ALICE,
  summary: '3/12 letters · 1/5 words',
  setup: [{ label: 'Dictionary', value: '5 (Obscure)' }],
}

describe('buildLetterboxedPrintModel', () => {
  it('coop prints ONE track, for the board rather than a person', () => {
    const m = buildLetterboxedPrintModel({
      ...base,
      mode: 'coop',
      solutionRevealed: false,
      players: [player(ALICE, 'alice'), player(BEA, 'bea')],
      playerRows: [row(ALICE, ['adg']), row(BEA, ['adg'])],
      events: [ev(ALICE, 'played', 'adg')],
    })
    expect(m.tracks).toHaveLength(1)
    expect(m.tracks[0].who).toBe('Team')
    expect(m.tracks[0].chain).toEqual(['adg'])
  })

  it('compete prints one track per player, each with only their own moves', () => {
    const m = buildLetterboxedPrintModel({
      ...base,
      mode: 'compete',
      solutionRevealed: false,
      players: [player(ALICE, 'alice'), player(BEA, 'bea')],
      playerRows: [row(ALICE, ['adg']), row(BEA, ['gjb', 'beh'])],
      events: [ev(ALICE, 'played', 'adg'), ev(BEA, 'played', 'gjb'), ev(BEA, 'played', 'beh')],
    })
    expect(m.tracks.map((t) => t.who)).toEqual(['alice', 'bea'])
    expect(m.tracks[0].turns).toHaveLength(1)
    expect(m.tracks[1].turns).toHaveLength(2)
  })

  it('omits a compete rival whose chain is still masked', () => {
    // Mid-race players_state nulls a rival's chain, so their column would be a
    // blank board — printing only what the viewer may see is the honest thing.
    const m = buildLetterboxedPrintModel({
      ...base,
      mode: 'compete',
      solutionRevealed: false,
      players: [player(ALICE, 'alice'), player(BEA, 'bea')],
      playerRows: [row(ALICE, ['adg']), row(BEA, null)],
      events: [ev(ALICE, 'played', 'adg')],
    })
    expect(m.tracks.map((t) => t.who)).toEqual(['alice'])
  })

  it('DOES NOT print the solution until it has been revealed on screen', () => {
    const args = {
      ...base,
      mode: 'coop' as const,
      players: [player(ALICE, 'alice')],
      playerRows: [row(ALICE, ['adg'])],
      events: [],
    }
    expect(buildLetterboxedPrintModel({ ...args, solutionRevealed: false }).solution).toBeNull()
    expect(buildLetterboxedPrintModel({ ...args, solutionRevealed: true }).solution).toEqual([
      'adgjbehk',
      'kcfil',
    ])
  })

  it('marks exactly the letters the chain covered', () => {
    const m = buildLetterboxedPrintModel({
      ...base,
      mode: 'coop',
      solutionRevealed: false,
      players: [player(ALICE, 'alice')],
      playerRows: [row(ALICE, ['adg', 'gjb'])],
      events: [],
    })
    expect([...m.tracks[0].covered].sort()).toEqual(['a', 'b', 'd', 'g', 'j'])
  })

  it('keeps retreats and help in the printed log', () => {
    const m = buildLetterboxedPrintModel({
      ...base,
      mode: 'coop',
      solutionRevealed: false,
      players: [player(ALICE, 'alice')],
      playerRows: [row(ALICE, [])],
      events: [ev(ALICE, 'undone', 'adg'), ev(ALICE, 'hint', 'kcfil'), ev(ALICE, 'spoiler', 'kcfil')],
    })
    expect(m.tracks[0].turns.map((t) => t.text)).toEqual([
      'took back ADG',
      'took a hint',
      'was shown KCFIL',
    ])
  })
})
