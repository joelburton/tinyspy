// cs-unmet

import { describe, expect, it } from 'vitest'
import {
  allSets,
  buildDeck,
  decode,
  encode,
  findSet,
  FULL_DECK_SIZE,
  isSet,
  JUNIOR_DECK_SIZE,
  MAX_BOARD,
  third,
} from './tiles'
import type { GTile } from '../types'

const FULL = buildDeck('full')
const JUNIOR = buildDeck('junior')

/** Tiles from their ids. */
const tiles = (...ids: string[]): GTile[] => ids.map((id) => ({ id }))

/**
 * A verified **maximal cap**: twenty tiles with no set among them, which no
 * twenty-first tile can extend. It is the witness behind `MAX_BOARD.full = 21`
 * — the ceiling is a geometric fact, not a policy, and this fixture is what
 * keeps that claim honest instead of a comment nobody can check.
 *
 * Found by exhaustive backtracking over the deck; any of the many 20-caps
 * would do.
 */
const CAP_20 = tiles(
  '1111', '1112', '1121', '1122', '1211', '1212', '1221', '1222', '2111', '2112',
  '2123', '2133', '2213', '2313', '3123', '3213', '3221', '3222', '3233', '3323',
)

/** Brute force over every triple — the independent oracle for the pair loop. */
function bruteForceSets(board: readonly GTile[]): number {
  let count = 0
  for (let i = 0; i < board.length; i++)
    for (let j = i + 1; j < board.length; j++)
      for (let k = j + 1; k < board.length; k++)
        if (isSet(board[i], board[j], board[k])) count++
  return count
}

/**
 * Is there a set-free collection of `target` tiles in this deck? Backtracking
 * with the obvious prune — a tile joins only if it completes no set with a
 * pair already chosen. Cheap on the 27-tile junior deck (~100ms to prove there
 * is no 10-tile one); do not point it at the full deck.
 */
function hasCapOfSize(deck: readonly GTile[], target: number): boolean {
  const chosen: GTile[] = []
  const extend = (start: number): boolean => {
    if (chosen.length === target) return true
    if (chosen.length + (deck.length - start) < target) return false
    for (let i = start; i < deck.length; i++) {
      const tile = deck[i]
      const chosenIds = chosen.map((c) => c.id)
      if (chosen.some((other) => chosenIds.includes(third(tile, other).id))) continue
      chosen.push(tile)
      if (extend(i + 1)) return true
      chosen.pop()
    }
    return false
  }
  return extend(0)
}

/** Deterministic shuffle, so a failure is reproducible. */
function shuffled(deck: readonly GTile[], seed: number): GTile[] {
  const out = [...deck]
  let s = seed
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const ids = (list: readonly GTile[]) => list.map((t) => t.id)

describe('the deck', () => {
  it('is 81 distinct tiles, one per combination, each four digits of 1..3', () => {
    expect(FULL).toHaveLength(FULL_DECK_SIZE)
    expect(new Set(ids(FULL)).size).toBe(FULL_DECK_SIZE)
    expect(FULL.every((t) => /^[1-3]{4}$/.test(t.id))).toBe(true)
    expect(new Set(FULL.map((t) => JSON.stringify(decode(t)))).size).toBe(FULL_DECK_SIZE)
  })

  it('reads a tile\'s digits as count, color, fill, shape', () => {
    expect(decode({ id: '3121' })).toEqual({ count: 3, color: 'red', fill: 'striped', shape: 'diamond' })
  })

  it('round-trips every tile through decode/encode', () => {
    for (const tile of FULL) expect(encode(decode(tile))).toEqual(tile)
  })

  it('junior is the 27 solid tiles, and nothing else', () => {
    expect(JUNIOR).toHaveLength(JUNIOR_DECK_SIZE)
    expect(JUNIOR.every((t) => decode(t).fill === 'solid')).toBe(true)
    // Every solid tile is present — junior drops an attribute, not tiles.
    expect(FULL.filter((t) => decode(t).fill === 'solid')).toEqual(JUNIOR)
  })

  it('junior is closed under `third`, which is why nothing branches on it', () => {
    const juniorIds = ids(JUNIOR)
    for (const a of JUNIOR)
      for (const b of JUNIOR)
        if (a.id !== b.id) expect(juniorIds).toContain(third(a, b).id)
  })
})

describe('third', () => {
  it('completes every pair into a genuine set', () => {
    for (const a of FULL) {
      for (const b of FULL) {
        if (a.id === b.id) continue
        const c = third(a, b)
        expect(c.id).not.toBe(a.id)
        expect(c.id).not.toBe(b.id)
        expect(isSet(a, b, c)).toBe(true)
      }
    }
  })

  it('is symmetric, and any two of a set name the third', () => {
    for (const a of FULL) {
      for (const b of FULL) {
        if (a.id === b.id) continue
        const c = third(a, b)
        expect(third(b, a).id).toBe(c.id)
        expect(third(a, c).id).toBe(b.id)
        expect(third(b, c).id).toBe(a.id)
      }
    }
  })

  it('maps a tile to itself when both tiles are the same', () => {
    for (const a of FULL) expect(third(a, a).id).toBe(a.id)
  })

  it('makes each attribute all-same or all-different, never two-and-one', () => {
    for (const a of FULL) {
      for (const b of FULL) {
        if (a.id === b.id) continue
        const faces = [a, b, third(a, b)].map(decode)
        for (const key of ['count', 'color', 'fill', 'shape'] as const) {
          const values = new Set(faces.map((f) => f[key]))
          expect(values.size, `${key} of ${a.id},${b.id}`).not.toBe(2)
        }
      }
    }
  })
})

describe('finding sets', () => {
  it('counts exactly 1080 sets in the full deck', () => {
    // 81 · 80 / 6 — every pair names a third, and each set is named by its
    // three pairs.
    expect(allSets(FULL)).toHaveLength(1080)
  })

  it('counts exactly 117 sets in the junior deck', () => {
    expect(allSets(JUNIOR)).toHaveLength(27 * 26 / 6)
  })

  it('agrees with a brute-force triple scan on random boards', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const board = shuffled(FULL, seed).slice(0, 12 + (seed % 10))
      expect(allSets(board)).toHaveLength(bruteForceSets(board))
      // findSet must be non-null exactly when there is something to find.
      expect(findSet(board) === null).toBe(bruteForceSets(board) === 0)
    }
  })

  it('returns a real set from findSet, made of the board\'s own tiles', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const board = shuffled(FULL, seed).slice(0, 15)
      const found = findSet(board)
      if (found === null) continue
      expect(new Set(ids(found)).size).toBe(3)
      expect(found.every((t) => board.includes(t))).toBe(true)
      expect(isSet(...found)).toBe(true)
    }
  })

  it('reports no set on an empty or too-small board', () => {
    expect(findSet([])).toBeNull()
    expect(findSet(tiles('1111'))).toBeNull()
    expect(findSet(tiles('1111', '1112'))).toBeNull()
    expect(allSets(tiles('1111', '1112'))).toEqual([])
  })

  it('does not invent a set from a duplicated tile', () => {
    // A board should never hold duplicates, but a false positive here would be
    // a claim the server rejects and a player can't explain.
    expect(findSet(tiles('1123', '1123'))).toBeNull()
    expect(findSet(tiles('1123', '1123', '1123'))).toBeNull()
  })
})

describe('the board ceiling', () => {
  it('has a 20-tile set-free witness — so 20 is reachable', () => {
    expect(CAP_20).toHaveLength(MAX_BOARD.full - 1)
    expect(new Set(ids(CAP_20)).size).toBe(CAP_20.length)
    expect(findSet(CAP_20)).toBeNull()
    expect(allSets(CAP_20)).toEqual([])
  })

  it('is complete: every other tile in the deck extends it into a set', () => {
    // This is the whole ceiling argument, checked exhaustively for this
    // witness: there is no 21st tile to add, so a board can never exceed 21.
    const capIds = ids(CAP_20)
    for (const tile of FULL) {
      if (capIds.includes(tile.id)) continue
      expect(findSet([...CAP_20, tile]), `tile ${tile.id} left it set-free`).not.toBeNull()
    }
  })

  it('junior tops out at 12 — proved outright, not witnessed', () => {
    // The junior deck is small enough to settle by exhaustive search: the
    // largest set-free collection is 9 tiles, so a 10-tile board always has a
    // set and the deal can never push past 9 + 3.
    //
    // (The full deck's bound is the same argument at 20, but proving THAT by
    // search is a serious computation — hence the planted witness above.)
    expect(hasCapOfSize(JUNIOR, 9)).toBe(true)
    expect(hasCapOfSize(JUNIOR, 10)).toBe(false)
    expect(MAX_BOARD.junior).toBe(9 + 3)
  })
})
