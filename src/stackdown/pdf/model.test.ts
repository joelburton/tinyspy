/**
 * Tests for the stackdown print model.
 *
 * The renderer is smoke-tested by `e2e/stackdown-print.e2e.ts`. What's pinned
 * here is the judgment — above all the **hidden solution**: stackdown's six
 * words are the game, and a printout is just another view of it, so paper has
 * to withhold them exactly as long as the screen does.
 */

import { describe, expect, it } from 'vitest'
import { buildStackdownPrintModel } from './model'
import type { Tile } from '../lib/board'
import type { SubmissionRow } from '../hooks/useGame'

const tile = (id: number, x: number, y: number, z = 0, letter = 'A'): Tile => ({ id, x, y, z, letter })

const sub = (over: Partial<SubmissionRow> = {}): SubmissionRow => ({
  user_id: 'u1',
  seq: 1,
  kind: 'word',
  word: 'stack',
  tile_ids: [1, 2, 3, 4, 5],
  valid: true,
  submitted_at: '2026-01-01T00:00:00Z',
  ...over,
})

const base = {
  brand: 'Stackdown',
  gameTitle: 'Board 12',
  date: '1 Jan 2026',
  tiles: [tile(1, 0, 0), tile(2, 1, 0)],
  solution: null as string[] | null,
  submissions: [] as SubmissionRow[],
  players: [
    { user_id: 'u1', username: 'me' },
    { user_id: 'u2', username: 'moth' },
  ],
  selfId: 'u1',
  mode: 'coop' as const,
  isTerminal: false,
  found: 2,
  target: 6,
  setup: [{ label: 'Difficulty', value: 'Standard' }],
}

describe('buildStackdownPrintModel — the hidden solution', () => {
  it('withholds the six words mid-game, even if handed them', () => {
    // The server already gates `solution` behind is_terminal; this is the
    // second lock, so a schema change can't quietly put them on paper.
    const m = buildStackdownPrintModel({ ...base, solution: ['stack', 'crane'] })
    expect(m.solution).toBeNull()
  })

  it('reveals them at terminal, in clearing order', () => {
    const m = buildStackdownPrintModel({
      ...base,
      isTerminal: true,
      solution: ['stack', 'crane', 'blunt', 'dowry', 'fjord', 'gamut'],
    })
    expect(m.solution).toEqual(['stack', 'crane', 'blunt', 'dowry', 'fjord', 'gamut'])
  })

  it('stays null at terminal when the server still sent none', () => {
    const m = buildStackdownPrintModel({ ...base, isTerminal: true, solution: null })
    expect(m.solution).toBeNull()
  })
})

describe('buildStackdownPrintModel — the log', () => {
  it('distinguishes the three kinds in TEXT, so B&W keeps them apart', () => {
    const m = buildStackdownPrintModel({
      ...base,
      submissions: [
        sub({ word: 'stack' }),
        sub({ seq: 2, word: 'qqqq', valid: false }),
        sub({ seq: 3, kind: 'hint', word: 'a pile of things', tile_ids: null, valid: null }),
        sub({ seq: 4, kind: 'reveal', word: 'crane', tile_ids: null, valid: null }),
      ],
    })
    expect(m.turns.map((t) => t.text)).toEqual([
      'STACK',
      'QQQQ — not a word',
      'Hint: a pile of things',
      'Revealed: CRANE',
    ])
  })

  it('names the player on every row', () => {
    const m = buildStackdownPrintModel({
      ...base,
      submissions: [sub(), sub({ seq: 2, user_id: 'u2' })],
    })
    expect(m.turns.map((t) => t.who)).toEqual(['me', 'moth'])
  })

  it('groups compete by player (self first); coop keeps play order', () => {
    const subs = [
      sub({ seq: 1, user_id: 'u2' }),
      sub({ seq: 2, user_id: 'u1' }),
      sub({ seq: 3, user_id: 'u2' }),
    ]
    expect(
      buildStackdownPrintModel({ ...base, mode: 'compete', submissions: subs }).turns.map((t) => t.who),
    ).toEqual(['me', 'moth', 'moth'])
    expect(buildStackdownPrintModel({ ...base, submissions: subs }).turns.map((t) => t.who)).toEqual([
      'moth',
      'me',
      'moth',
    ])
  })
})

describe('buildStackdownPrintModel — summary', () => {
  it('reports words cleared and stack remaining', () => {
    const m = buildStackdownPrintModel({ ...base })
    expect(m.summary).toBe('2/6 words cleared · 2 tiles left')
  })

  it('says "1 tile", not "1 tiles"', () => {
    const m = buildStackdownPrintModel({ ...base, tiles: [tile(1, 0, 0)] })
    expect(m.summary).toContain('1 tile left')
  })
})
