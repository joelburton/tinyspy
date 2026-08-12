import { describe, expect, it } from 'vitest'
import { cleanSides, formatSides, parseSides } from './customBoard'

/**
 * The typed-board reader. These rules are what stand between "I retyped the
 * board my friend sent me" and "I am playing a different puzzle" — a board
 * that parses wrong doesn't fail loudly, it hands you twelve letters in the
 * wrong arrangement, which is a different game that looks like the right one.
 *
 * The edge function imports the same functions (the boggle seam), so what
 * passes here is what the server will read.
 */
const SIDES = 'abcdefghijkl'

describe('cleanSides', () => {
  it('strips every separator a board might be written with', () => {
    // The shapes a player will actually paste: what the app writes today
    // (title, recap row, PDF), the middot title older games still carry, and
    // hand-typed triples.
    expect(cleanSides('ABC-DEF-GHI-JKL')).toBe(SIDES)
    expect(cleanSides('ABC·DEF·GHI·JKL')).toBe(SIDES)
    expect(cleanSides('abc def ghi jkl')).toBe(SIDES)
    expect(cleanSides('  a b/c,d.e\nf g h i j k l  ')).toBe(SIDES)
  })

  it('lowercases, so case is never a difference the server sees', () => {
    expect(cleanSides('AbC-dEf-GhI-jKl')).toBe(SIDES)
  })

  it('does NOT truncate — a thirteenth letter has to stay visible', () => {
    // The field shows raw text, so silently dropping the extra would start a
    // game on the first twelve while the box still read thirteen. parseSides
    // rejects it instead.
    expect(cleanSides('abcdefghijklm')).toBe('abcdefghijklm')
  })

  it('survives partial input — every keystroke goes through it', () => {
    expect(cleanSides('')).toBe('')
    expect(cleanSides('ab')).toBe('ab')
    expect(cleanSides('123')).toBe('')
    expect(cleanSides('ABC-')).toBe('abc')
  })
})

describe('formatSides', () => {
  it('groups into four sides of three, clockwise from the top-left', () => {
    expect(formatSides(SIDES)).toBe('ABC-DEF-GHI-JKL')
  })

  it('chunks a half-typed board honestly rather than throwing', () => {
    expect(formatSides('')).toBe('')
    expect(formatSides('ab')).toBe('AB')
    expect(formatSides('abcde')).toBe('ABC-DE')
  })
})

describe('parseSides', () => {
  it('round-trips with formatSides', () => {
    // The load-bearing property: read a board off the screen, type it back,
    // get the same board — same letters, same sides, same positions.
    const parsed = parseSides(formatSides(SIDES))
    expect(parsed).toEqual({ ok: true, sides: SIDES })
  })

  it('accepts a board written any of the ways cleanSides allows', () => {
    for (const written of ['ABC-DEF-GHI-JKL', 'ABC·DEF·GHI·JKL', 'abc def ghi jkl']) {
      expect(parseSides(written)).toEqual({ ok: true, sides: SIDES })
    }
  })

  it('rejects a short board, naming the count it actually read', () => {
    const r = parseSides('abcdefghijk')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('11')
  })

  it('rejects a LONG board too, rather than silently taking the first twelve', () => {
    // The regression this guards: with the field showing raw text, a truncating
    // reader would start a game on a board the player never typed.
    const r = parseSides('abcdefghijklm')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('13')
  })

  it('rejects a repeated letter', () => {
    // 'a' twice — the transposition-typo shape, and the one the board itself
    // could not represent (a letter can't sit on two sides).
    const r = parseSides('abcdefghijka')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toBe('A board never repeats a letter.')
  })

  it('treats blank as unreadable, not as a valid empty board', () => {
    expect(parseSides('').ok).toBe(false)
  })
})
