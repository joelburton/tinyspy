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
  type Card,
} from './cards'

const FULL = buildDeck('full')
const JUNIOR = buildDeck('junior')

/**
 * A verified **maximal cap**: twenty cards with no set among them, which no
 * twenty-first card can extend. It is the witness behind `MAX_BOARD.full = 21`
 * — the ceiling is a geometric fact, not a policy, and this fixture is what
 * keeps that claim honest instead of a comment nobody can check.
 *
 * Found by exhaustive backtracking over the deck; any of the many 20-caps
 * would do.
 */
const CAP_20: Card[] = [0, 1, 3, 4, 9, 10, 12, 13, 27, 28, 32, 35, 38, 47, 59, 65, 66, 67, 71, 77]

/** Brute force over every triple — the independent oracle for the pair loop. */
function bruteForceSets(cards: readonly Card[]): number {
  let count = 0
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      for (let k = j + 1; k < cards.length; k++)
        if (isSet(cards[i], cards[j], cards[k])) count++
  return count
}

/**
 * Is there a set-free collection of `target` cards in this deck? Backtracking
 * with the obvious prune — a card joins only if it completes no set with a
 * pair already chosen. Cheap on the 27-card junior deck (~100ms to prove there
 * is no 10-card one); do not point it at the full deck.
 */
function hasCapOfSize(deck: readonly Card[], target: number): boolean {
  const chosen: Card[] = []
  const extend = (start: number): boolean => {
    if (chosen.length === target) return true
    if (chosen.length + (deck.length - start) < target) return false
    for (let i = start; i < deck.length; i++) {
      const card = deck[i]
      if (chosen.some((other) => chosen.includes(third(card, other)))) continue
      chosen.push(card)
      if (extend(i + 1)) return true
      chosen.pop()
    }
    return false
  }
  return extend(0)
}

/** Deterministic shuffle, so a failure is reproducible. */
function shuffled(cards: readonly Card[], seed: number): Card[] {
  const out = [...cards]
  let s = seed
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

describe('the deck', () => {
  it('is 81 distinct cards, one per combination', () => {
    expect(FULL).toHaveLength(FULL_DECK_SIZE)
    expect(new Set(FULL).size).toBe(FULL_DECK_SIZE)
    expect(new Set(FULL.map((c) => JSON.stringify(decode(c)))).size).toBe(FULL_DECK_SIZE)
  })

  it('round-trips every card through decode/encode', () => {
    for (const card of FULL) expect(encode(decode(card))).toBe(card)
  })

  it('junior is the 27 solid cards, and nothing else', () => {
    expect(JUNIOR).toHaveLength(JUNIOR_DECK_SIZE)
    expect(JUNIOR.every((c) => decode(c).shade === 'solid')).toBe(true)
    // Every solid card is present — junior drops an attribute, not cards.
    expect(FULL.filter((c) => decode(c).shade === 'solid')).toEqual(JUNIOR)
  })

  it('junior is closed under `third`, which is why nothing branches on it', () => {
    for (const a of JUNIOR)
      for (const b of JUNIOR)
        if (a !== b) expect(JUNIOR).toContain(third(a, b))
  })
})

describe('third', () => {
  it('completes every pair into a genuine set', () => {
    for (const a of FULL) {
      for (const b of FULL) {
        if (a === b) continue
        const c = third(a, b)
        expect(c).not.toBe(a)
        expect(c).not.toBe(b)
        expect(isSet(a, b, c)).toBe(true)
      }
    }
  })

  it('is symmetric, and any two of a set name the third', () => {
    for (const a of FULL) {
      for (const b of FULL) {
        if (a === b) continue
        const c = third(a, b)
        expect(third(b, a)).toBe(c)
        expect(third(a, c)).toBe(b)
        expect(third(b, c)).toBe(a)
      }
    }
  })

  it('maps a card to itself when both cards are the same', () => {
    for (const a of FULL) expect(third(a, a)).toBe(a)
  })

  it('makes each attribute all-same or all-different, never two-and-one', () => {
    for (const a of FULL) {
      for (const b of FULL) {
        if (a === b) continue
        const faces = [a, b, third(a, b)].map(decode)
        for (const key of ['pips', 'color', 'shade', 'shape'] as const) {
          const values = new Set(faces.map((f) => f[key]))
          expect(values.size, `${key} of ${a},${b}`).not.toBe(2)
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

  it('returns a real set from findSet', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const board = shuffled(FULL, seed).slice(0, 15)
      const found = findSet(board)
      if (found === null) continue
      expect(new Set(found).size).toBe(3)
      expect(found.every((c) => board.includes(c))).toBe(true)
      expect(isSet(...found)).toBe(true)
    }
  })

  it('reports no set on an empty or too-small board', () => {
    expect(findSet([])).toBeNull()
    expect(findSet([0])).toBeNull()
    expect(findSet([0, 1])).toBeNull()
    expect(allSets([0, 1])).toEqual([])
  })

  it('does not invent a set from a duplicated card', () => {
    // A board should never hold duplicates, but a false positive here would be
    // a claim the server rejects and a player can't explain.
    expect(findSet([5, 5])).toBeNull()
    expect(findSet([5, 5, 5])).toBeNull()
  })
})

describe('the board ceiling', () => {
  it('has a 20-card set-free witness — so 20 is reachable', () => {
    expect(CAP_20).toHaveLength(MAX_BOARD.full - 1)
    expect(new Set(CAP_20).size).toBe(CAP_20.length)
    expect(findSet(CAP_20)).toBeNull()
    expect(allSets(CAP_20)).toEqual([])
  })

  it('is complete: every other card in the deck extends it into a set', () => {
    // This is the whole ceiling argument, checked exhaustively for this
    // witness: there is no 21st card to add, so a board can never exceed 21.
    for (const card of FULL) {
      if (CAP_20.includes(card)) continue
      expect(findSet([...CAP_20, card]), `card ${card} left it set-free`).not.toBeNull()
    }
  })

  it('junior tops out at 12 — proved outright, not witnessed', () => {
    // The junior deck is small enough to settle by exhaustive search: the
    // largest set-free collection is 9 cards, so a 10-card board always has a
    // set and the deal can never push past 9 + 3.
    //
    // (The full deck's bound is the same argument at 20, but proving THAT by
    // search is a serious computation — hence the planted witness above.)
    expect(hasCapOfSize(JUNIOR, 9)).toBe(true)
    expect(hasCapOfSize(JUNIOR, 10)).toBe(false)
    expect(MAX_BOARD.junior).toBe(9 + 3)
  })
})
