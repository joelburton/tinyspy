import { describe, expect, it } from 'vitest'
import { buildTrie, walkWord } from './trie'

// The trie's behavioral workout is the boggle solver suite (including the
// C-oracle parity test); this covers what's new since the extraction — rated
// terminals and the walkWord boundary helper.

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

  it('throws when a supplied rating is missing or outside 1..255 (§7 guard)', () => {
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
})
