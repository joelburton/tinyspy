// cs-unmet

import { describe, expect, it } from 'vitest'
import { DICE_SETS } from './dice'
import { mulberry32, rollBoard } from './generate'
import { capBoard, cleanCustomBoard, formatBoard, parseCustomBoard, readTiles } from './customBoard'

/**
 * The custom-board round trip. The feature's whole promise is "read the letters
 * off one game, paste them into the next", so the property that matters isn't
 * that either function is individually sensible — it's that they COMPOSE:
 * `parse(format(board)) === board`, for boards that really occur.
 */
describe('formatBoard / parseCustomBoard round trip', () => {
  // Every dice set, many rolls each: the multiface tiles and the blank are rare
  // per-roll (one `1` die in 4×4 Revised, three `0` faces on one 6×6 die), so a
  // handful of boards would mostly exercise plain letters and prove nothing
  // about the interesting cases. This reaches them by volume; the hand-written
  // cases below pin them by name.
  for (const set of DICE_SETS) {
    it(`survives ${set.desc}`, () => {
      const rand = mulberry32(20260811)
      for (let i = 0; i < 200; i++) {
        const board = rollBoard(set, rand)
        expect(parseCustomBoard(formatBoard(board, set.n), set.n)).toEqual({ ok: true, board })
      }
    })
  }

  it('reaches the multiface + blank faces it claims to cover', () => {
    // Guards the loop above against becoming vacuous: if the rolls stopped
    // producing special faces (a dice-set edit, a seed change), the round trip
    // would still pass while covering nothing but A–Z.
    const seen = new Set<string>()
    for (const set of DICE_SETS) {
      const rand = mulberry32(20260811)
      for (let i = 0; i < 200; i++) {
        for (const ch of rollBoard(set, rand)) if (!/[A-Z]/.test(ch)) seen.add(ch)
      }
    }
    expect([...seen].sort()).toEqual(['0', '1', '2', '3', '4', '5', '6'])
  })
})

describe('formatBoard', () => {
  it('reads top-to-bottom, left-to-right, one DASH per row', () => {
    // Matches what <ManualBoardField> draws as you type, so a board reads back
    // in the form you would paste it.
    expect(formatBoard('ABCDEFGHIJKLMNOP', 4)).toBe('ABCD-EFGH-IJKL-MNOP')
  })

  it('writes the two-letter tiles and the blank as a player sees them', () => {
    expect(formatBoard('AB1D0FGH123456IJ', 4)).toBe('ABQuD-?FGH-QuInThEr-HeAnIJ')
  })
})

/** The parsed board, asserting it parsed at all — so a case that unexpectedly
 *  fails reads as the parser's own reason, not as `undefined`. */
function parseCustomBoardOk(text: string, n: number): string {
  const r = parseCustomBoard(text, n)
  if (!r.ok) throw new Error(`expected "${text}" to parse, but: ${r.error}`)
  return r.board
}

/** The rejection reason, asserting there IS one — so a case that unexpectedly
 *  succeeds fails here rather than passing a vacuous `toContain` on undefined. */
function parseCustomBoardErr(text: string, n: number): string {
  const r = parseCustomBoard(text, n)
  if (r.ok) throw new Error(`expected "${text}" to be rejected, got ${r.board}`)
  return r.error
}

describe('parseCustomBoard', () => {
  it('ignores how the rows are spaced', () => {
    for (const written of ['ABCD EFGH IJKL MNOP', 'ABCDEFGHIJKLMNOP', ' ABCD\nEFGH  IJKL MNOP ']) {
      expect(parseCustomBoardOk(written, 4)).toBe('ABCDEFGHIJKLMNOP')
    }
  })

  it('accepts lowercase for ordinary tiles', () => {
    expect(parseCustomBoardOk('abcd efgh ijkl mnop', 4)).toBe('ABCDEFGHIJKLMNOP')
  })

  // The mixed-case rule (customBoard.ts → The mixed-case rule). `Qu` is one
  // tile; `QU` and `qu` are two. This is the load-bearing disambiguation — a
  // bare Q face exists (4×4 Classic's ABJMOQ), so the spelling has to decide.
  it('takes a capital-then-lowercase pair as ONE tile', () => {
    // Fifteen written letters, sixteen tiles: `Qu` spends one.
    expect(parseCustomBoardOk('AQuB CDEF GHIJ KLMNO', 4)).toBe('A1BCDEFGHIJKLMNO')
  })

  it('takes the same two letters in any other case as TWO tiles', () => {
    expect(parseCustomBoardOk('AQUB CDEF GHIJ KLMN', 4)).toBe('AQUBCDEFGHIJKLMN')
    expect(parseCustomBoardOk('aqub cdef ghij klmn', 4)).toBe('AQUBCDEFGHIJKLMN')
  })

  it('does not swallow a digraph out of ordinary lowercase letters', () => {
    // "an", "in", "th", "er", "he" are common pairs; a case-insensitive parse
    // would turn this 16-letter board into 11 tiles.
    expect(parseCustomBoardOk('anin ther hexx yzab', 4)).toBe('ANINTHERHEXXYZAB')
  })

  it('takes ? as the blank tile', () => {
    expect(parseCustomBoardOk('?BCD EFGH IJKL MNOP', 4)).toBe('0BCDEFGHIJKLMNOP')
  })

  it('counts tiles, not characters', () => {
    // 15 written letters, but 13 tiles — the two-letter tiles each cost one.
    expect(parseCustomBoardErr('AQuB CThD EFGH IJK', 4)).toBe(
      "A 4×4 board needs 16 tiles — that's 13.",
    )
  })

  it('rejects a board of the wrong size for the dice set', () => {
    expect(parseCustomBoardErr('ABCDEFGHIJKLMNOP', 5)).toContain('needs 25 tiles')
  })

  it('names the character it could not read', () => {
    expect(parseCustomBoardErr('AB3D EFGH IJKL MNOP', 4)).toContain('"3" isn\'t a tile')
  })
})

describe('cleanCustomBoard', () => {
  it('keeps letters and ?, drops everything else — separators included', () => {
    // Separators are the FIELD's to draw now, counted in tiles, so a player
    // never has to type one and whatever they do type is normalized away.
    expect(cleanCustomBoard('ABQu-D! EFGH_ 1234 ?')).toBe('ABQuDEFGH?')
  })

  it('caps the length', () => {
    expect(cleanCustomBoard('A'.repeat(300))).toHaveLength(128)
  })
})

/**
 * `readTiles` is the split BOTH the echo and the parser walk, which is what
 * keeps the reading a player is shown identical to the one that reaches the
 * board.
 */
describe('readTiles', () => {
  it('is tolerant — an unreadable character comes back as itself', () => {
    // The echo can then show it in place; deciding it is an ERROR is
    // parseCustomBoard's job, and it still says so.
    expect(readTiles('A3B')).toEqual(['A', '3', 'B'])
    expect(parseCustomBoardErr('A3B', 4)).toContain('"3" isn\'t a tile')
  })
})

/**
 * The cap has to count TILES, which is the whole reason it exists as a function
 * rather than a `maxLength` on the input.
 */
describe('capBoard', () => {
  it('lets a full board through untouched', () => {
    expect(capBoard('ABCDEFGHIJKLMNOP', 4)).toBe('ABCDEFGHIJKLMNOP')
  })

  it('stops at the last tile a board can hold', () => {
    expect(capBoard('ABCDEFGHIJKLMNOPQRS', 4)).toBe('ABCDEFGHIJKLMNOP')
  })

  it('counts Qu as ONE tile, so a board of digraphs is not cut short', () => {
    // Sixteen Qu tiles is 32 characters and a legal 4×4. A character cap would
    // have bitten this in half at the eighth tile.
    const allQu = 'Qu'.repeat(16)
    expect(capBoard(allQu, 4)).toBe(allQu)
    expect(capBoard(allQu + 'Qu', 4)).toBe(allQu)
  })

  it('never splits a two-letter tile', () => {
    // 15 singles then a Qu is exactly 16 tiles; a 17th must not leave a bare Q.
    expect(capBoard('ABCDEFGHIJKLMNOQuZ', 4)).toBe('ABCDEFGHIJKLMNOQu')
  })
})
