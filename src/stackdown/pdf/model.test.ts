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
  // Six tiles: enough that clearing a five-tile word leaves one behind, which
  // is what distinguishes "stopped part-way" from "cleared".
  allTiles: [tile(1, 0, 0), tile(2, 1, 0), tile(3, 2, 0), tile(4, 3, 0), tile(5, 4, 0), tile(6, 5, 0)],
  currentWord: [] as number[],
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
  setup: [{ key: 'difficulty', label: 'Difficulty', value: 'Standard' }],
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
    expect(m.tracks[0].turns.map((t) => t.text)).toEqual([
      'STACK',
      'QQQQ — not a word',
      'Hint: a pile of things',
      'Spoiler: CRANE',
    ])
  })

  it("names the player on coop's shared log", () => {
    const m = buildStackdownPrintModel({
      ...base,
      submissions: [sub(), sub({ seq: 2, user_id: 'u2' })],
    })
    expect(m.tracks[0].turns.map((t) => t.who)).toEqual(['me', 'moth'])
  })
})

describe('buildStackdownPrintModel — one track per board', () => {
  const subs = [
    sub({ seq: 1, user_id: 'u1', word: 'stack' }),
    sub({ seq: 2, user_id: 'u2', word: 'crane' }),
  ]

  it('coop is ONE shared stack, however many players', () => {
    const m = buildStackdownPrintModel({ ...base, submissions: subs })
    expect(m.tracks.map((t) => t.who)).toEqual(['Team'])
  })

  it('compete at terminal gives every player their own board and log', () => {
    // The bug this replaces: one board and one MERGED log, so a two-player race
    // printed as though one person had played alone.
    const m = buildStackdownPrintModel({
      ...base, mode: 'compete', isTerminal: true, submissions: subs,
    })
    expect(m.tracks.map((t) => t.who)).toEqual(['me (you)', 'moth'])
    expect(m.tracks.map((t) => t.turns.map((r) => r.text))).toEqual([['STACK'], ['CRANE']])
    // A compete column's log doesn't name anybody — the heading already did.
    expect(m.tracks.flatMap((t) => t.turns.map((r) => r.who))).toEqual(['', ''])
  })

  it('compete MID-GAME shows only the viewer — RLS hides the rest', () => {
    // A column built from rows the viewer can't see would draw a full untouched
    // stack, which reads as "they've cleared nothing" rather than "not yet visible".
    const m = buildStackdownPrintModel({ ...base, mode: 'compete', submissions: subs })
    expect(m.tracks.map((t) => t.who)).toEqual(['You'])
    expect(m.tracks[0].turns.map((r) => r.text)).toEqual(['STACK'])
  })

  it('each compete board reflects only ITS OWN cleared tiles', () => {
    const m = buildStackdownPrintModel({
      ...base,
      mode: 'compete',
      isTerminal: true,
      submissions: [sub({ seq: 1, user_id: 'u1', tile_ids: [1, 2, 3, 4, 5] })],
    })
    // u1 spent five of the six; u2 played nothing, so their stack is untouched.
    expect(m.tracks[0].tiles.map((t) => t.id)).toEqual([6])
    expect(m.tracks[1].tiles.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('restores a CLEARED board, and leaves an uncleared one where it stopped', () => {
    const all = [tile(1, 0, 0), tile(2, 1, 0), tile(3, 2, 0), tile(4, 3, 0), tile(5, 4, 0)]
    const cleared = buildStackdownPrintModel({
      ...base, allTiles: all, isTerminal: true,
      submissions: [sub({ tile_ids: [1, 2, 3, 4, 5] })],
    })
    // Every tile gone => put them all back; a blank page is nothing to review.
    expect(cleared.tracks[0].tiles).toHaveLength(5)

    const stopped = buildStackdownPrintModel({
      ...base, allTiles: all, isTerminal: true,
      submissions: [sub({ tile_ids: [1, 2] })],
    })
    expect(stopped.tracks[0].tiles.map((t) => t.id)).toEqual([3, 4, 5])
  })
})

describe('buildStackdownPrintModel — summary', () => {
  it('reports words cleared and stack remaining', () => {
    const m = buildStackdownPrintModel({ ...base })
    expect(m.summary).toBe('2/6 words cleared · 6 tiles left')
  })

  it('says "1 tile", not "1 tiles"', () => {
    const m = buildStackdownPrintModel({ ...base, allTiles: [tile(1, 0, 0)] })
    expect(m.summary).toContain('1 tile left')
  })

  it('drops the tile count in compete — several boards, no single number', () => {
    const m = buildStackdownPrintModel({ ...base, mode: 'compete' })
    expect(m.summary).toBe('2/6 words cleared')
  })
})
