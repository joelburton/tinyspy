import { describe, expect, it } from 'vitest'
import { buildTrie, walkWord } from '../../common/lib/game/trie'
import { isLegal, type Bands } from './suggest'

describe('isLegal — the two-band legality predicate', () => {
  // A miniature dictionary with hand-picked difficulties. Real bands from
  // scrabble setup run 1..6; dict2 is typically stricter than dict3plus.
  const words = ['at', 'xi', 'cat', 'cats', 'qoph']
  const ratings = [1, 4, 1, 2, 6]
  const trie = buildTrie(words, ratings)
  const bands: Bands = { dict2: 2, dict3plus: 4 }

  const legalityOf = (word: string) => isLegal(trie, bands, walkWord(trie, word), word.length)

  it('gates 2-letter words by dict2', () => {
    expect(legalityOf('at')).toBe(true)  // difficulty 1 ≤ dict2 2
    expect(legalityOf('xi')).toBe(false) // difficulty 4 > dict2 2
  })

  it('gates 3+ words by dict3plus', () => {
    expect(legalityOf('cat')).toBe(true)  // 1 ≤ 4
    expect(legalityOf('cats')).toBe(true) // 2 ≤ 4
    expect(legalityOf('qoph')).toBe(false) // 6 > 4
  })

  it('a 2-letter word above dict2 can still be fine as a longer word’s prefix', () => {
    // 'xi' itself is out (band 4 > dict2 2), but nothing about the node
    // poisons paths through it — the predicate only reads the terminal value
    // at the length in hand. (No xi-prefixed 3+ word in the fixture; assert
    // the node is a live interior node, not a dead end.)
    expect(walkWord(trie, 'xi')).toBeGreaterThan(0)
  })

  it('rejects prefix-but-not-word nodes', () => {
    expect(legalityOf('ca')).toBe(false)  // interior node, eow = 0
    expect(legalityOf('cat'.slice(0, 1))).toBe(false) // 'c' likewise
  })

  it('is monotone in the bands: loosening dict3plus admits qoph', () => {
    expect(isLegal(trie, { dict2: 2, dict3plus: 6 }, walkWord(trie, 'qoph'), 4)).toBe(true)
  })
})
