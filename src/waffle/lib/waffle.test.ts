import { describe, expect, it } from 'vitest'
import {
  boardWords,
  CELLS,
  FILLED,
  HOLES,
  isFilled,
  isHole,
  isValidBoard,
  lettersAt,
  solvedWords,
  WORDS,
  wordsContaining,
} from './waffle'

describe('waffle geometry', () => {
  it('is a 25-cell grid with 4 holes and 21 filled cells', () => {
    expect(CELLS).toBe(25)
    expect([...HOLES].sort((a, b) => a - b)).toEqual([6, 8, 16, 18])
    expect(FILLED).toHaveLength(21)
    expect(FILLED).not.toContain(6)
    expect(FILLED.every(isFilled)).toBe(true)
    expect(HOLES.every(isHole)).toBe(true)
  })

  it('has 6 five-letter words', () => {
    expect(WORDS).toHaveLength(6)
    for (const w of WORDS) expect(w).toHaveLength(5)
  })

  it('covers every filled cell with at least one word, holes with none', () => {
    const covered = new Set(WORDS.flat())
    expect([...covered].sort((a, b) => a - b)).toEqual([...FILLED])
    for (const h of HOLES) expect(covered.has(h)).toBe(false)
  })

  it('has exactly the 9 expected intersection cells (in two words)', () => {
    const intersections = FILLED.filter(
      (p) => wordsContaining(p).length === 2,
    )
    expect(intersections).toEqual([0, 2, 4, 10, 12, 14, 20, 22, 24])
  })

  it('has 12 single-word cells', () => {
    const single = FILLED.filter((p) => wordsContaining(p).length === 1)
    expect(single).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23])
  })

  it('reads words out of a board string in WORDS order', () => {
    // a0=abcde a2=fghij a4=klmno, downs read from the shared cells.
    const board = 'abcde' + 'p.q.r' + 'fghij' + 's.t.u' + 'klmno'
    expect(lettersAt(board, WORDS[0])).toBe('abcde') // a0
    expect(lettersAt(board, WORDS[1])).toBe('fghij') // a2
    expect(boardWords(board)).toEqual([
      'abcde', // a0
      'fghij', // a2
      'klmno', // a4
      'apfsk', // d0 = cells 0,5,10,15,20
      'cqhtm', // d2 = cells 2,7,12,17,22
      'erjuo', // d4 = cells 4,9,14,19,24
    ])
  })

  it('validates board structure (length, holes, letters)', () => {
    const ok = 'abcde' + 'f.g.h' + 'ijklm' + 'n.o.p' + 'qrstu'
    expect(isValidBoard(ok)).toBe(true)
    expect(isValidBoard(ok.slice(0, 24))).toBe(false) // too short
    expect(isValidBoard('x' + ok.slice(1))).toBe(true) // a letter at pos 0 is fine
    // a letter where a hole must be:
    expect(isValidBoard(ok.slice(0, 6) + 'z' + ok.slice(7))).toBe(false)
    // a non-letter in a filled cell:
    expect(isValidBoard('1' + ok.slice(1))).toBe(false)
  })
})

describe('solvedWords — the progressive answer reveal', () => {
  // Same fixture board as the boardWords test: a0=abcde a2=fghij a4=klmno, downs
  // read off the shared cells. Holes (6,8,16,18) are '.'.
  const board = 'abcde' + 'p.q.r' + 'fghij' + 's.t.u' + 'klmno'
  /** A 25-char colors string: `fill` at every filled cell, '.' at the four holes. */
  const colorsOf = (fill: string) =>
    Array.from({ length: CELLS }, (_, i) => (isHole(i) ? '.' : fill)).join('')

  it('reveals every word when the whole board is green', () => {
    expect(solvedWords(board, colorsOf('g'))).toEqual(boardWords(board))
  })

  it('hides every word (all null) when nothing is green', () => {
    expect(solvedWords(board, colorsOf('y'))).toEqual([null, null, null, null, null, null])
  })

  it('hides every word when colors is null (a non-player watcher)', () => {
    expect(solvedWords(board, null)).toEqual([null, null, null, null, null, null])
  })

  it('reveals only the fully-green word; a partly-green word stays hidden', () => {
    // Green just the a0 cells (0–4); everything else yellow. a0 is fully green →
    // revealed; the down words that cross it (d0/d2/d4) still have yellow cells → null.
    const colors = Array.from({ length: CELLS }, (_, i) =>
      isHole(i) ? '.' : WORDS[0].includes(i) ? 'g' : 'y',
    ).join('')
    expect(solvedWords(board, colors)).toEqual(['abcde', null, null, null, null, null])
  })
})
