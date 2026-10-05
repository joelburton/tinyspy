// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GTile } from '../types'
import { ZTest_makeTiles } from './gameData.fixture'
import { clickTile, typeLetter } from './trace'

const TILES = ZTest_makeTiles()
/** The tile at `[r, c]` of setup.psql's 8×6 board. */
const at = (r: number, c: number, tiles: readonly GTile[] = TILES) => tiles.find((t) => t.id === `${r},${c}`)!
const ids = (trace: readonly GTile[]) => trace.map((t) => t.id)

const none: ReadonlySet<string> = new Set()

/** Click a run of tiles from empty, returning the final trace's ids. */
function clicks(cells: Array<[number, number]>, consumed: ReadonlySet<string> = none) {
  let trace: readonly GTile[] = []
  for (const [r, c] of cells) trace = clickTile(trace, at(r, c), consumed)
  return ids(trace)
}

describe('clickTile — building a trace', () => {
  it('starts a trace on the first click', () => {
    expect(clicks([[3, 3]])).toEqual(['3,3'])
  })

  it('extends through adjacent tiles, keeping click order', () => {
    expect(clicks([[0, 0], [0, 1], [1, 2]])).toEqual(['0,0', '0,1', '1,2'])
  })

  it('extends DIAGONALLY — the same 8-way rule the boards need', () => {
    expect(clicks([[1, 1], [2, 0]])).toEqual(['1,1', '2,0'])
  })
})

describe('clickTile — the last tile is not special', () => {
  // Re-clicking the last tile takes the letter back like any other selected
  // tile; submitting is Enter or the Submit button — both deliberate.
  it('re-clicking the LAST tile takes that letter back', () => {
    expect(clicks([[0, 0], [0, 1], [0, 1]])).toEqual(['0,0'])
  })

  it('re-clicking a single-tile trace empties it', () => {
    expect(clicks([[2, 2], [2, 2]])).toEqual([])
  })

  it('truncates identically wherever in the trace you click', () => {
    // The last tile and a middle tile take the same path through the reducer:
    // both drop themselves and everything after. A regression that special-
    // cased the end again would break exactly one of these.
    expect(clicks([[0, 0], [0, 1], [1, 2], [1, 2]])).toEqual(['0,0', '0,1'])
    expect(clicks([[0, 0], [0, 1], [1, 2], [0, 1]])).toEqual(['0,0'])
  })
})

describe('clickTile — truncating', () => {
  it('clicking the FIRST tile empties the trace — nothing precedes it', () => {
    expect(clicks([[0, 0], [0, 1], [1, 2], [0, 0]])).toEqual([])
  })

  it('the truncated trace can be extended again from its new end', () => {
    // Undo back to [0,0], then step somewhere else — the adjacency check runs
    // against the tile the truncation left as the end, not the discarded one.
    expect(clicks([[0, 0], [0, 1], [1, 2], [0, 1], [1, 0]])).toEqual(['0,0', '1,0'])
  })
})

describe('clickTile — consumed tiles', () => {
  const consumed = new Set(['0,1'])

  it('IGNORES a consumed tile rather than clearing the trace', () => {
    // A found puzzle word's tiles are spent. Clicking one is neither a move nor
    // a mistake, so wiping the player's in-progress trace would punish a
    // misclick — the trace comes back exactly as it was.
    expect(clicks([[0, 0], [0, 1]], consumed)).toEqual(['0,0'])
  })

  it('never starts a trace on a consumed tile', () => {
    expect(clicks([[0, 1]], consumed)).toEqual([])
  })

  it('a consumed tile cannot be traced THROUGH', () => {
    // [0,0] → [0,1] → [0,2] looks like a straight run, but [0,1] is spent. The
    // click on it is ignored, so [0,2] is then judged against [0,0] — two apart,
    // not adjacent — and starts a new trace instead of silently bridging the
    // gap.
    expect(clicks([[0, 0], [0, 1], [0, 2]], consumed)).toEqual(['0,2'])
  })
})

describe('clickTile — a far-away click starts over', () => {
  it('begins a new trace at the clicked tile, dropping the old one', () => {
    // A non-adjacent free tile could either be ignored or start fresh. Starting
    // fresh matches what the click plainly means; ignoring reads as broken.
    expect(clicks([[0, 0], [0, 1], [5, 5]])).toEqual(['5,5'])
  })
})

describe('clickTile — purity', () => {
  it('never mutates the trace it was given', () => {
    const before = [at(0, 0), at(0, 1)]
    clickTile(before, at(1, 2), none)
    clickTile(before, at(0, 0), none)
    expect(ids(before)).toEqual(['0,0', '0,1'])
  })
})

/**
 * `typeLetter` — the keyboard twin of a click. The board below is small and
 * hand-shaped so each case is countable by eye; the real boards are 8×6, and
 * the oracle test already covers the geometry these rules lean on.
 *
 *     col   0 1 2 3
 *   row 0   c a t s
 *       1   a a r e
 *       2   b c d a
 */
const TB = ZTest_makeTiles(['cats', 'aare', 'bcda'])
const tb = (r: number, c: number) => at(r, c, TB)
const type = (trace: GTile[], key: string, consumed: ReadonlySet<string> = none) => {
  const r = typeLetter(trace, key, TB, consumed)
  if (r.kind === 'extend') return r.tile.id
  if (r.kind === 'ambiguous') return ids(r.candidates)
  return r.kind
}

describe('typeLetter — starting a word (empty trace)', () => {
  it('extends when exactly one unconsumed tile bears the letter', () => {
    expect(type([], 't')).toBe('0,2')
  })

  it('is ambiguous when several do — and reports every one, to be marked', () => {
    expect(type([], 'a')).toEqual(['0,1', '1,0', '1,1', '2,3'])
  })

  it('searches the WHOLE board, not just some neighborhood', () => {
    expect(type([], 'b')).toBe('2,0')
  })

  it('says nothing matched when the letter is absent', () => {
    expect(type([], 'z')).toBe('none')
  })

  it('ignores consumed tiles — a spent tile is not a candidate', () => {
    // Consume three of the four a's and the fourth becomes unambiguous.
    expect(type([], 'a', new Set(['0,1', '1,0', '1,1']))).toBe('2,3')
  })

  it('takes the key in either case', () => {
    expect(type([], 'T')).toBe('0,2')
  })
})

describe('typeLetter — continuing a word (non-empty trace)', () => {
  it('considers only the last tile’s 8 neighbors', () => {
    // From c[0,0] the adjacent a's are [0,1], [1,0] and [1,1]; the far a at
    // [2,3] is NOT among them.
    expect(type([tb(0, 0)], 'a')).toEqual(['0,1', '1,0', '1,1'])
  })

  it('resolves to one when only one neighbor bears the letter', () => {
    // Neighbors of e[1,3] are t[0,2], s[0,3], r[1,2], d[2,2], a[2,3].
    expect(type([tb(1, 3)], 's')).toBe('0,3')
  })

  it('counts DIAGONAL neighbors', () => {
    // From c[2,1], the diagonal r[1,2].
    expect(type([tb(2, 1)], 'r')).toBe('1,2')
  })

  it('says nothing matched when no neighbor bears the letter', () => {
    expect(type([tb(0, 0)], 's')).toBe('none')
  })

  it('never re-uses a tile already in the trace', () => {
    // Trace c[0,0] → a[0,1]. Typing 'c' would match [0,0], which is already
    // used, and no OTHER adjacent c exists. (Clicking your own tile still means
    // "undo back to here"; that stays click-only.)
    expect(type([tb(0, 0), tb(0, 1)], 'c')).toBe('none')
  })

  it('excludes a consumed neighbor', () => {
    expect(type([tb(1, 3)], 's', new Set(['0,3']))).toBe('none')
  })

  it('types a whole word once the first letter is anchored', () => {
    // Anchor at c[2,1]: r[1,2] → e[1,3] walk themselves.
    const trace = [tb(2, 1)]
    for (const ch of 're') {
      const r = typeLetter(trace, ch, TB, none)
      expect(r.kind).toBe('extend')
      if (r.kind === 'extend') trace.push(r.tile)
    }
    expect(ids(trace)).toEqual(['2,1', '1,2', '1,3'])
  })
})
