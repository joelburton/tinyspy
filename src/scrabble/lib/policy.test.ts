// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildTrie } from '../../common/lib/game/trie'
import { mulberry32 } from '../../common/lib/util/mulberry32'
import type { Cell } from './board'
import type { Bands } from './suggest'
import { choosePlay, playSelfGame, LEVELS, type StrengthKnobs } from './policy'

const N = 15
const emptyBoard = (): Cell[] => new Array<Cell>(N * N).fill(null)
const FULL_BANDS: Bands = { dict2: 6, dict3plus: 6 }

// A tiny rated dictionary for the targeted choosePlay tests, and a broader one
// (below) rich enough that a self-played game actually progresses.
const trieOf = (entries: [string, number][]) =>
  buildTrie(entries.map(([w]) => w), entries.map(([, r]) => r))

describe('choosePlay', () => {
  it('asks to exchange the whole rack when nothing is playable', () => {
    // 'zz' isn't in the dict and the board is empty, so no opening word exists.
    const trie = trieOf([['at', 1], ['cat', 1]])
    const choice = choosePlay(emptyBoard(), ['Z', 'Z', 'Z'], trie, FULL_BANDS, LEVELS.best, mulberry32(1))
    expect(choice.kind).toBe('exchange')
    if (choice.kind === 'exchange') expect(choice.tiles).toEqual(['Z', 'Z', 'Z'])
  })

  it('is deterministic given the same rng seed (even with noise)', () => {
    const trie = trieOf([['at', 1], ['cat', 1], ['cats', 1], ['act', 1]])
    const rack = ['C', 'A', 'T', 'S']
    const noisy: StrengthKnobs = { useLeave: true, bingoMissProb: 0, equityNoise: 20 }
    const a = choosePlay(emptyBoard(), rack, trie, FULL_BANDS, noisy, mulberry32(42))
    const b = choosePlay(emptyBoard(), rack, trie, FULL_BANDS, noisy, mulberry32(42))
    expect(a).toEqual(b)
  })

  it('vocabCap keeps the AI off words above its band', () => {
    // CAT scores more than AT, but sits in band 5; a cap of 4 forces AT.
    const trie = trieOf([['at', 1], ['cat', 5]])
    const rack = ['C', 'A', 'T']
    const capped = choosePlay(emptyBoard(), rack, trie, FULL_BANDS,
      { vocabCap: 4, useLeave: true, bingoMissProb: 0, equityNoise: 0 }, mulberry32(1))
    const full = choosePlay(emptyBoard(), rack, trie, FULL_BANDS,
      { useLeave: true, bingoMissProb: 0, equityNoise: 0 }, mulberry32(1))
    expect(capped.kind === 'word' && capped.words.map((w) => w.word)).toEqual(['AT'])
    expect(full.kind === 'word' && full.words.map((w) => w.word)).toEqual(['CAT'])
  })

  it('bingoMissProb makes the AI pass over an otherwise-best bingo', () => {
    // COASTER lays all 7 tiles (+50 bingo) and would dominate; a missProb of 1
    // forces the best non-bingo instead.
    const trie = trieOf([
      ['at', 1], ['cat', 1], ['oat', 1], ['coats', 2], ['coaster', 3], ['coat', 1], ['taco', 2],
    ])
    const rack = ['C', 'O', 'A', 'S', 'T', 'E', 'R']
    const plays = choosePlay(emptyBoard(), rack, trie, FULL_BANDS,
      { useLeave: true, bingoMissProb: 0, equityNoise: 0 }, mulberry32(1))
    const misses = choosePlay(emptyBoard(), rack, trie, FULL_BANDS,
      { useLeave: true, bingoMissProb: 1, equityNoise: 0 }, mulberry32(1))
    expect(plays.kind === 'word' && plays.bingo).toBe(true)
    expect(misses.kind === 'word' && misses.bingo).toBe(false)
  })
})

// A broader (still small) common-word dictionary so games run to a natural end.
const GAME_DICT: [string, number][] = [
  // 2s — the parallel-play glue
  ['aa', 3], ['ab', 2], ['ad', 1], ['ae', 3], ['ag', 3], ['ai', 3], ['an', 1], ['ar', 2], ['as', 1],
  ['at', 1], ['aw', 2], ['ax', 3], ['ay', 2], ['ba', 2], ['be', 1], ['bi', 2], ['bo', 2], ['by', 1],
  ['de', 2], ['do', 1], ['ed', 2], ['ef', 3], ['eh', 2], ['el', 2], ['em', 2], ['en', 1], ['er', 1],
  ['es', 2], ['et', 3], ['ex', 2], ['fa', 3], ['go', 1], ['ha', 2], ['he', 1], ['hi', 1], ['ho', 2],
  ['id', 2], ['if', 1], ['in', 1], ['is', 1], ['it', 1], ['jo', 4], ['la', 2], ['li', 3], ['lo', 2],
  ['ma', 1], ['me', 1], ['mi', 3], ['mo', 3], ['mu', 3], ['my', 1], ['na', 3], ['ne', 3], ['no', 1],
  ['nu', 3], ['od', 2], ['oe', 3], ['of', 1], ['oh', 1], ['oi', 3], ['om', 3], ['on', 1], ['op', 3],
  ['or', 1], ['os', 3], ['ow', 2], ['ox', 2], ['oy', 3], ['pa', 2], ['pe', 3], ['pi', 2], ['qi', 4],
  ['re', 1], ['sh', 2], ['si', 3], ['so', 1], ['ta', 3], ['ti', 3], ['to', 1], ['uh', 2], ['um', 2],
  ['un', 2], ['up', 1], ['us', 1], ['ut', 4], ['we', 1], ['wo', 3], ['xi', 4], ['ya', 3], ['ye', 2],
  ['yo', 2], ['za', 4],
  // 3s–5s — bread and butter
  ['cat', 1], ['cot', 2], ['dog', 1], ['ear', 1], ['eat', 1], ['tea', 1], ['ate', 1], ['toe', 1],
  ['oat', 1], ['are', 1], ['rat', 1], ['tar', 1], ['sat', 1], ['set', 1], ['sit', 1], ['tin', 1],
  ['ten', 1], ['net', 1], ['not', 1], ['ton', 1], ['nod', 2], ['rod', 1], ['red', 1], ['den', 1],
  ['end', 1], ['and', 1], ['ant', 1], ['tan', 1], ['ran', 1], ['run', 1], ['sun', 1], ['son', 1],
  ['one', 1], ['ore', 2], ['roe', 2], ['ice', 1], ['ire', 2], ['air', 1], ['aid', 1], ['ado', 2],
  ['dot', 1], ['dote', 2], ['note', 1], ['tone', 1], ['tore', 2], ['rote', 3], ['rate', 1], ['tear', 1],
  ['seat', 1], ['east', 1], ['eats', 1], ['teas', 1], ['sate', 2], ['star', 1], ['rats', 1], ['arts', 1],
  ['tars', 2], ['cats', 1], ['oats', 1], ['coat', 1], ['taco', 2], ['cane', 1], ['acne', 2], ['dean', 1],
  ['dare', 1], ['read', 1], ['dear', 1], ['sand', 1], ['nods', 2], ['rods', 1], ['dens', 2], ['ends', 1],
  ['nest', 1], ['rent', 1], ['tens', 1], ['nets', 2], ['sent', 1], ['tone', 1], ['stone', 1], ['tones', 1],
  ['notes', 1], ['onset', 2], ['store', 1], ['rates', 1], ['tears', 1], ['stare', 1], ['reads', 1],
  ['dares', 2], ['sedan', 2], ['acres', 2], ['cares', 2], ['races', 2], ['scare', 2], ['coats', 2],
  ['tacos', 2], ['coast', 2], ['actor', 2],
]

describe('playSelfGame', () => {
  const trie = trieOf(GAME_DICT)

  it('is fully deterministic given (knobs, seed)', () => {
    const a = playSelfGame(trie, FULL_BANDS, LEVELS.best, 12345)
    const b = playSelfGame(trie, FULL_BANDS, LEVELS.best, 12345)
    expect(a).toEqual(b)
  })

  it('produces a coherent result (internally consistent tallies)', () => {
    const r = playSelfGame(trie, FULL_BANDS, LEVELS.intermediate, 7)
    expect(r.score).toBe(r.turnScores.reduce((s, x) => s + x, 0))
    expect(r.turnScores.length).toBeGreaterThan(0)     // at least the opening word
    expect(r.turns).toBe(r.turnScores.length + r.exchanges)
    expect(r.leaveTrajectory.length).toBe(r.turns)      // one reading per action
    expect(r.bingos).toBeLessThanOrEqual(r.turnScores.length)
    expect(r.tilesLeft).toBeGreaterThanOrEqual(0)
    expect(r.tilesLeft).toBeLessThanOrEqual(100)
  })

  it('different levels are different games from the same bag seed', () => {
    // Same seed → identical bag; only the policy differs, so the scripts diverge.
    const best = playSelfGame(trie, FULL_BANDS, LEVELS.best, 999)
    const beginner = playSelfGame(trie, FULL_BANDS, LEVELS.beginner, 999)
    expect(best.turnScores).not.toEqual(beginner.turnScores)
  })
})
