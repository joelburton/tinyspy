import { describe, expect, it } from 'vitest'
import { letterForSlot, slotForKey } from './letters'

/** Slots of a board with `cards` cards, in the array's own (column-major) order. */
const slots = (cards: number) => [...Array(cards).keys()]

/** The letters as they appear on screen, row by row. */
function rows(cards: number): string[] {
  const cols = cards / 3
  return [0, 1, 2].map((row) =>
    Array.from({ length: cols }, (_, col) => letterForSlot(col * 3 + row)).join(''),
  )
}

describe('board letters', () => {
  it('reads left-to-right along each row', () => {
    expect(rows(12)).toEqual(['ABCD', 'HIJK', 'OPQR'])
  })

  it('is a bijection with the slots on the board', () => {
    for (const cards of [9, 12, 15, 18, 21]) {
      const letters = slots(cards).map(letterForSlot)
      expect(new Set(letters).size).toBe(cards)
      expect(letters.every((l) => l !== '')).toBe(true)
    }
  })

  it('round-trips every slot through its key', () => {
    for (const slot of slots(21)) {
      expect(slotForKey(letterForSlot(slot))).toBe(slot)
      expect(slotForKey(letterForSlot(slot).toLowerCase())).toBe(slot)
    }
  })

  it('NEVER re-letters a card when the board grows', () => {
    // The property the whole scheme exists for: a deal adds a column, so each
    // row of the smaller board must survive as the LEADING PART of the same row
    // of the bigger one — same letters, same order, same positions. Otherwise a
    // player typing from muscle memory claims a card they never looked at.
    for (const [from, to] of [[12, 15], [15, 18], [18, 21]]) {
      const before = rows(from)
      const after = rows(to)
      before.forEach((row, i) => {
        expect(after[i].startsWith(row), `row ${i} was re-lettered going ${from} → ${to}`)
          .toBe(true)
      })
      after.forEach((row, i) => expect(row.length).toBe(before[i].length + 1))
    }
  })

  it('…which the obvious scheme would not, hence the fixed grid', () => {
    // Ours holds BY CONSTRUCTION — letterForSlot takes no column count, so a
    // slot's letter cannot depend on the board's width. That makes the test
    // above unfalsifiable on its own, so here is the alternative it rules out,
    // spelled out: number the letters across the CURRENT width and eight of the
    // twelve cards on the table are renamed the moment a column arrives.
    const naive = (slot: number, cols: number) =>
      'ABCDEFGHIJKLMNOPQRSTU'[(slot % 3) * cols + Math.floor(slot / 3)]
    const naiveRows = (cards: number) => {
      const cols = cards / 3
      return [0, 1, 2].map((row) =>
        Array.from({ length: cols }, (_, col) => naive(col * 3 + row, cols)).join(''),
      )
    }
    expect(naiveRows(12)).toEqual(['ABCD', 'EFGH', 'IJKL'])
    expect(naiveRows(15)).toEqual(['ABCDE', 'FGHIJ', 'KLMNO'])
    // Row two went from EFGH to FGHIJ: every card in it changed its address.
    expect(naiveRows(15)[1].startsWith(naiveRows(12)[1])).toBe(false)
  })

  it('ignores keys that are not addresses', () => {
    expect(slotForKey('V')).toBe(-1)
    expect(slotForKey('1')).toBe(-1)
    expect(slotForKey('Enter')).toBe(-1)
  })
})
