import { describe, expect, it } from 'vitest'
import {
  boardLetters,
  multisetSubtract,
  deriveHand,
  reconcileHandOrder,
  shuffleString,
  emptyBoard,
  idx,
} from './board'

/**
 * The hand in MonkeyGram v2 is DERIVED, not stored: hand = tiles − placed.
 * These helpers are the multiset algebra behind that (letters repeat, so the
 * set-based connections reconcile won't do). Pure + deterministic, except
 * shuffleString — for which we test invariants, not output.
 */

describe('multisetSubtract', () => {
  it('removes one occurrence of each char in b, preserving a-order', () => {
    expect(multisetSubtract('AAB', 'A')).toBe('AB')
    expect(multisetSubtract('ABCABC', 'AB')).toBe('CABC')
  })
  it('ignores chars in b not present in a', () => {
    expect(multisetSubtract('ABC', 'XYZ')).toBe('ABC')
    expect(multisetSubtract('AB', 'AAB')).toBe('') // more A's removed than exist → just drop what's there
  })
  it('empty cases', () => {
    expect(multisetSubtract('', 'A')).toBe('')
    expect(multisetSubtract('ABC', '')).toBe('ABC')
  })
})

describe('deriveHand', () => {
  it('is the held tiles minus the letters on the board', () => {
    const board = boardLetters // sanity: helper exists
    expect(board).toBeTypeOf('function')
    // place 'C' at one cell, 'A' at another
    let b = emptyBoard()
    b = b.slice(0, idx(0, 0)) + 'C' + b.slice(idx(0, 0) + 1)
    b = b.slice(0, idx(1, 1)) + 'A' + b.slice(idx(1, 1) + 1)
    // holds A, A, C, Q → placed C and one A → hand = A, Q
    expect(deriveHand('AACQ', b)).toBe('AQ')
  })
  it('full hand when nothing placed', () => {
    expect(deriveHand('AAQ', emptyBoard())).toBe('AAQ')
  })
})

describe('reconcileHandOrder', () => {
  it('keeps existing order, drops removed, appends new (multiset-aware)', () => {
    // placed one tile: canonical lost a 'B'
    expect(reconcileHandOrder('CABD', 'CAD')).toBe('CAD')
    // peel added an 'E' (not in current order) → appended at the end
    expect(reconcileHandOrder('CAD', 'CADE')).toBe('CADE')
    // duplicate letters: order keeps first occurrences up to the canonical count
    expect(reconcileHandOrder('ABABA', 'AAB')).toBe('ABA')
  })
  it('no-op when order already matches the canonical multiset', () => {
    expect(reconcileHandOrder('QWERTY', 'QWERTY')).toBe('QWERTY')
  })
})

describe('shuffleString', () => {
  it('preserves length and multiset', () => {
    const out = shuffleString('AABBCC')
    expect(out).toHaveLength(6)
    expect(out.split('').sort().join('')).toBe('AABBCC')
  })
  it('does not mutate the input', () => {
    const input = 'HELLO'
    shuffleString(input)
    expect(input).toBe('HELLO')
  })
})
