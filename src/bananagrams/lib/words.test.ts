import { describe, expect, it } from 'vitest'
import { emptyBoard, idx, setChar } from './board'
import { boardWords } from './words'

/**
 * `boardWords` is the FE twin of the server's win-time spell check
 * (`bananagrams._win_blockers`): every maximal run of 2+ tiles, across and down.
 * It backs the print's word list. These pin the run rules — 2+ only, both axes,
 * board order, duplicates kept (the caller de-dupes).
 */

/** Place `word` on a fresh board starting at (x, y), going `dir`. */
function place(word: string, x: number, y: number, dir: 'h' | 'v', board = emptyBoard()): string {
  let b = board
  for (let i = 0; i < word.length; i++) {
    const cx = x + (dir === 'h' ? i : 0)
    const cy = y + (dir === 'v' ? i : 0)
    b = setChar(b, idx(cx, cy), word[i])
  }
  return b
}

describe('boardWords', () => {
  it('an empty board has no words', () => {
    expect(boardWords(emptyBoard())).toEqual([])
  })

  it('a lone tile is not a word', () => {
    expect(boardWords(setChar(emptyBoard(), idx(5, 5), 'A'))).toEqual([])
  })

  it('reads an across run left-to-right, uppercased', () => {
    expect(boardWords(place('cat', 3, 4, 'h'))).toEqual(['CAT'])
  })

  it('reads a down run top-to-bottom', () => {
    expect(boardWords(place('dog', 6, 2, 'v'))).toEqual(['DOG'])
  })

  it('finds both words of a crossword (across first, then down)', () => {
    // CAT across at (3,4); CAR down sharing the C at (3,4).
    const b = place('car', 3, 4, 'v', place('cat', 3, 4, 'h'))
    expect(boardWords(b)).toEqual(['CAT', 'CAR'])
  })

  it('keeps duplicates — the caller de-dupes', () => {
    // "AN" placed twice on separate rows.
    const b = place('an', 1, 1, 'h', place('an', 1, 5, 'h'))
    expect(boardWords(b)).toEqual(['AN', 'AN'])
  })

  it('splits runs at a gap and ignores the lone leftover', () => {
    // "HI" then a gap then a single "X" on the same row → only HI.
    let b = place('hi', 0, 0, 'h')
    b = setChar(b, idx(4, 0), 'X')
    expect(boardWords(b)).toEqual(['HI'])
  })

  it('flushes a run that reaches the last column', () => {
    // Two tiles ending exactly at the right edge (x = 23, 24).
    expect(boardWords(place('ok', 23, 7, 'h'))).toEqual(['OK'])
  })
})
