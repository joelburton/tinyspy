// cs-unmet

import { describe, expect, it } from 'vitest'
import { buildTrie, walkWord } from './trie'

/**
 * What this file defends is NOT that the trie finds words — the boggle solver
 * suite does that, against a C oracle, on every board it generates. This covers
 * what the extraction added on top and what a caller can get wrong.
 *
 * **Rated terminals**, including the guard: the terminal is a `Uint8Array` cell
 * whose truthiness IS "this is a word", so a rating outside 1..255 would erase
 * an accepted word silently, and `buildTrie` throws instead. The subtle case is
 * the last one — a word skipped for non-`a`–`z` characters never writes a
 * terminal, so its rating is never consulted and never validated.
 *
 * **`walkWord`'s contract**, which exists for callers rather than for the code:
 * it returns a real node or -1, and never 0. The empty-string case is the one
 * that makes that a promise rather than an accident.
 */

describe('buildTrie', () => {
  it('marks terminals 1 when no ratings are given (the boggle contract)', () => {
    const trie = buildTrie(['cat', 'cats'])
    expect(trie.eow[walkWord(trie, 'cat')]).toBe(1)
    expect(trie.eow[walkWord(trie, 'cats')]).toBe(1)
  })

  it('stores each word’s rating on its terminal node', () => {
    const trie = buildTrie(['at', 'cat', 'qoph'], [2, 1, 6])
    expect(trie.eow[walkWord(trie, 'at')]).toBe(2)
    expect(trie.eow[walkWord(trie, 'cat')]).toBe(1)
    expect(trie.eow[walkWord(trie, 'qoph')]).toBe(6)
  })

  it('leaves prefix-but-not-word nodes at 0', () => {
    const trie = buildTrie(['cats'], [3])
    expect(trie.eow[walkWord(trie, 'cat')]).toBe(0)
    expect(trie.eow[walkWord(trie, 'ca')]).toBe(0)
  })

  it('lower-cases words and skips any with non-a–z characters', () => {
    const trie = buildTrie(['CAT', "don't"], [2, 5])
    expect(trie.eow[walkWord(trie, 'cat')]).toBe(2)
    expect(walkWord(trie, 'don')).toBeGreaterThan(0) // partial insert before the bail…
    expect(trie.eow[walkWord(trie, 'don')]).toBe(0)  // …but no terminal anywhere on it
  })

  it('throws when a supplied rating is missing or outside 1..255', () => {
    // The terminal is a Uint8Array cell whose truthiness IS "is a word", so a
    // missing rating (short array), a 0, or a value that wraps mod 256 would
    // silently erase an accepted word. Reject at build time instead.
    expect(() => buildTrie(['at', 'cat'], [1])).toThrow(/rating for "cat"/) // undefined
    expect(() => buildTrie(['at'], [0])).toThrow(/1\.\.255/)
    expect(() => buildTrie(['at'], [256])).toThrow(/1\.\.255/)
    expect(() => buildTrie(['at'], [2.5])).toThrow(/1\.\.255/)
    // A word skipped for non-a–z chars never writes a terminal, so its rating
    // is never consulted and never validated.
    expect(() => buildTrie(["don't"], [0])).not.toThrow()
  })
})

describe('walkWord', () => {
  it('returns -1 when the path does not exist', () => {
    const trie = buildTrie(['cat'])
    expect(walkWord(trie, 'dog')).toBe(-1)
    expect(walkWord(trie, 'catsup')).toBe(-1)
    expect(walkWord(trie, 'c-t')).toBe(-1)
  })

  it('returns -1 for the empty string rather than the root node', () => {
    // Walking nothing lands on node 0, which is also `children`'s "no child"
    // sentinel — so returning it would hand back a value that means the
    // opposite everywhere else in this structure. A caller testing `!== -1`
    // would then read eow[0], and eow[0] is only 0 for as long as no word list
    // contains an empty string: buildTrie accepts one silently and marks the
    // ROOT as a word, at which point every empty query answers "yes".
    const trie = buildTrie(['cat'])
    expect(walkWord(trie, '')).toBe(-1)

    const withEmpty = buildTrie(['', 'cat'])
    expect(withEmpty.eow[0]).toBe(1) // the root really does get marked
    expect(walkWord(withEmpty, '')).toBe(-1) // and it is still unreachable
  })
})
