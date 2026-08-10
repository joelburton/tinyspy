import { describe, expect, it } from 'vitest'
import { canFollow, coveredLetters, layout, pathPoints, rejectReason, tailLetter } from './board'

/**
 * The FE half of the rulebook. The server re-checks every rule (pgTAP pins
 * that side), but these functions are what give the player INSTANT feedback —
 * a broken one wouldn't corrupt a game, it would silently downgrade every
 * mistake to a server round-trip. Same synthetic board as everywhere else:
 * `abc | def | ghi | jkl`, words are letter strings, no dictionary involved.
 */
const SIDES = 'abcdefghijkl'

describe('canFollow', () => {
  it('crossing a side boundary is legal', () => {
    expect(canFollow(SIDES, 'a', 'd')).toBe(true)
  })

  it('two letters on one side may not touch', () => {
    expect(canFollow(SIDES, 'a', 'b')).toBe(false)
  })

  it('a letter can never follow itself — a doubled letter is trivially same-side', () => {
    expect(canFollow(SIDES, 'e', 'e')).toBe(false)
  })

  it('the first letter of a word may be anything on the board', () => {
    expect(canFollow(SIDES, undefined, 'k')).toBe(true)
  })

  it('a letter not on the board never follows anything', () => {
    expect(canFollow(SIDES, undefined, 'z')).toBe(false)
  })
})

describe('tailLetter / coveredLetters', () => {
  it('the tail is the last letter of the last word; an empty chain has none', () => {
    expect(tailLetter(['adg', 'gjb'])).toBe('b')
    expect(tailLetter([])).toBe(null)
  })

  it('coverage is the distinct letters across the whole chain', () => {
    expect(coveredLetters(['adg', 'gjb'])).toEqual(new Set(['a', 'd', 'g', 'j', 'b']))
  })
})

describe('rejectReason', () => {
  const board = {
    sides: SIDES,
    chain: ['adg'],
    playable: new Set(['adg', 'gjb', 'gjbehkcfil']),
    maxWords: 5,
  }

  it('accepts a legal follow-up', () => {
    expect(rejectReason('gjb', board)).toBe(null)
  })

  it('too short beats every other complaint', () => {
    expect(rejectReason('gj', board)).toBe('Too short')
  })

  it('the chain rule: the next word must start on the tail letter', () => {
    expect(rejectReason('jbe', board)).toBe('Must start with G')
  })

  it('a full chain refuses composition outright', () => {
    expect(rejectReason('gjb', { ...board, chain: ['adg', 'gjb', 'beh', 'hea', 'adg'], maxWords: 5 })).toBe(
      'Chain is full',
    )
  })

  it('a repeat is refused — the server would too', () => {
    expect(rejectReason('adg', { ...board, chain: ['adg', 'gja'] })).toBe('Already played')
  })

  it('THE side rule, named per pair: two same-side letters in a row', () => {
    // g→h are both on side 2 — the complaint names the offending pair, since
    // this is the rule players trip over most.
    expect(rejectReason('ghi', board)).toBe('GH is one side')
  })

  it('a letter the board lacks is named', () => {
    expect(rejectReason('gzb', board)).toBe('No Z on the board')
  })

  it('everything legal but absent from the playable list is simply not a word', () => {
    // g→a→d crosses sides fine; it just is not in the shipped list.
    expect(rejectReason('gad', board)).toBe('Not a word')
  })
})

describe('pathPoints', () => {
  // Top side a b c, right d e f, bottom g h i (right-to-left), left j k l.
  const nodes = layout('abcdefghijkl')
  const at = (letter: string) => {
    const n = nodes.find((x) => x.letter === letter)!
    return `${n.x},${n.y}`
  }

  it('is empty for an empty word, so nothing renders', () => {
    expect(pathPoints('', nodes)).toBe('')
  })

  it('gives ONE point for a single letter — no visible segment', () => {
    // This is what lets the carried-over first letter draw nothing without a
    // special case in the component.
    expect(pathPoints('a', nodes)).toBe(at('a'))
  })

  it('walks the letters in order', () => {
    expect(pathPoints('cad', nodes)).toBe([at('c'), at('a'), at('d')].join(' '))
  })

  it('revisits a node for a repeated letter, doubling the line back', () => {
    // Deliberate: the board's letters are distinct, so a repeat can only mean
    // returning to the same place.
    expect(pathPoints('aba', nodes)).toBe([at('a'), at('b'), at('a')].join(' '))
  })

  it('skips a letter that is not on the board rather than throwing', () => {
    // Entry only admits board letters, so this is belt-and-braces — but a
    // ghost is built from a SUBMITTED word, and a board rebuilt under it
    // shouldn't crash the surface.
    expect(pathPoints('azb', nodes)).toBe([at('a'), at('b')].join(' '))
  })
})
