import { describe, expect, it } from 'vitest'
import { isSuggestion, suggest } from './solve'

/**
 * The board these tests reason on: `abcdefghijkl`, three to a side —
 * `abc | def | ghi | jkl`. Every "word" here is a synthetic letter string, the
 * same trick the pgTAP and e2e fixtures use: the solver never consults a
 * dictionary, it only walks the list it is handed, so real words would add
 * nothing but noise.
 */
const SIDES = 'abcdefghijkl'

describe('suggest', () => {
  it('finds the two-word solution from an empty chain', () => {
    const r = suggest(['adgjbehk', 'kcfil', 'adg'], SIDES, [])
    expect(isSuggestion(r) && r.word).toBe('adgjbehk')
    expect(isSuggestion(r) && r.wordsToFinish).toBe(2)
  })

  it('respects the start letter — the next word must follow the tail', () => {
    // The chain ends on G, so only a G-word may be suggested — ADGJBEHK is
    // the better word but starts with A and is therefore not a legal move.
    const r = suggest(['adgjbehk', 'gjbehkcfil'], SIDES, ['adg'])
    expect(isSuggestion(r) && r.word).toBe('gjbehkcfil')
  })

  it('counts only NEWLY covered letters', () => {
    // 'adg' is already played, so GJ adds J alone.
    const r = suggest(['gj', 'jbehkcfil'], SIDES, ['adg'])
    expect(isSuggestion(r) && r.newLetters).toBe(1)
  })

  it('breaks a tie between equally short routes on the most new letters', () => {
    // Both routes finish in two words. GJBEHKC covers more of the board now
    // than GJ does, so it is the better thing to be shown.
    const r = suggest(['gj', 'gjbehkc', 'jbehkcfil', 'cfil'], SIDES, ['adg'])
    expect(isSuggestion(r) && r.word).toBe('gjbehkc')
  })

  it('reports STUCK when nothing can follow the current letter', () => {
    // The chain ends on G and no word starts with G.
    const r = suggest(['adg', 'kcfil'], SIDES, ['adg'])
    expect(r).toEqual({ kind: 'stuck' })
  })

  it('reports UNREACHABLE when words exist but cannot cover the board', () => {
    // 'gjb' chains on fine, but L and the rest are never reachable.
    const r = suggest(['gjb', 'bad'], SIDES, ['adg'])
    expect(r).toEqual({ kind: 'unreachable' })
  })

  it('names a word that finishes the board as one-to-go', () => {
    const r = suggest(['gjbehkcfil'], SIDES, ['adg'])
    expect(isSuggestion(r) && r.wordsToFinish).toBe(1)
  })

  it('ignores words using letters that are not on the board', () => {
    const r = suggest(['adgz', 'adgjbehk', 'kcfil'], SIDES, [])
    expect(isSuggestion(r) && r.word).toBe('adgjbehk')
  })

  it('never suggests a word already in the chain — the server refuses repeats', () => {
    // GADG is the only word that can follow the tail G, but it has been
    // played. Excluding it, the honest answer is STUCK (take a word back) —
    // not a word the server would refuse as a repeat.
    const r = suggest(['gadg', 'kcfil'], SIDES, ['gadg'])
    expect(r).toEqual({ kind: 'stuck' })
  })

  it('reports OFF PAR when the shortest finish exceeds the room left', () => {
    // Finishing needs two words but only one slot remains under the cap.
    const r = suggest(['adgjbehk', 'kcfil'], SIDES, [], 1)
    expect(r).toEqual({ kind: 'offPar', wordsToFinish: 2 })
  })

  it('still suggests when the shortest finish exactly fits the room left', () => {
    const r = suggest(['adgjbehk', 'kcfil'], SIDES, [], 2)
    expect(isSuggestion(r) && r.word).toBe('adgjbehk')
  })
})
