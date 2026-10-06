// cs-unmet

/**
 * The deck's algebra — pure functions over tiles, no React, no network.
 *
 * A tile has four attributes with three values each, so the deck is every
 * combination: 3⁴ = 81 tiles, no duplicates. A tile's id is its four
 * attributes written as digits, each 1..3, in the order count, color, fill,
 * shape:
 *
 *     "3121"  =  three symbols · the first color · the second fill · the first shape
 *
 * Three tiles are a **set** when every attribute is either all-same or
 * all-different across them. Two consequences we lean on everywhere:
 *
 *   - **Any two tiles determine the third** ([`third`]): per digit, the same
 *     digit when the two agree, and the remaining value, `6 - x - y`, when they
 *     differ. So checking a claim is one call, not a comparison of four
 *     attributes.
 *   - **Searching a board for a set is a pair loop**, not a triple loop —
 *     `findSet` is O(n²) with a membership lookup, ≤210 pairs at the largest
 *     board that can exist.
 *
 * The server re-implements the same algebra in plpgsql and is the authority on
 * every claim. These exist so the board can validate a pick instantly (the
 * whole board is face-up, so the frontend genuinely can) and so the hint has
 * something to ask.
 */

import type { GDeckKind, GTile, GTileFace } from '../types'

/**
 * Attribute value names, indexed by the digit less one.
 *
 * The color names are SLOTS, not pigments: they are the names of the theme
 * tokens, but which hue each one paints depends on the game's `palette` setup
 * choice — the colorblind-safe palette repaints all three. So `red` means "the
 * first color value", and the only place that decides what that looks like is
 * `theme.css`.
 */
export const COLORS = ['red', 'green', 'purple'] as const
export const FILLS = ['solid', 'striped', 'open'] as const
export const SHAPES = ['diamond', 'squiggle', 'oval'] as const

/** Tiles in the full deck — every combination of four three-valued attributes. */
export const FULL_DECK_SIZE = 81

/**
 * The **junior** deck drops the fill (every tile is solid), leaving three
 * attributes and 3³ = 27 tiles. It is closed under [`third`] — the completing
 * tile of two solid tiles is itself solid (same-and-same gives same) — so
 * every function here works on it unchanged, with no junior-specific branch.
 */
export const JUNIOR_DECK_SIZE = 27

/**
 * How many tiles a board is topped back up to after a claim. The deal-three
 * rule refills to this floor, and goes ABOVE it only when the board has no set
 * to find.
 */
export const BOARD_MIN: Record<GDeckKind, number> = { full: 12, junior: 9 }

/**
 * The largest a board can ever get — a hard ceiling from the geometry, not a
 * policy: a set-free collection tops out at 20 tiles in the full deck and 9 in
 * the junior deck, so one more tile than that always contains a set and the
 * deal stops.
 *
 * Reaching either is vanishingly rare in play (~1 in a million games needs 21;
 * 18 is what 40k simulated games topped out at), which is exactly why the
 * layout that has to survive it is tested with a planted board rather than
 * trusted. `tiles.test.ts` pins the full-deck bound against a real 20-tile cap.
 */
export const MAX_BOARD: Record<GDeckKind, number> = { full: 21, junior: 12 }

/** A tile's four digits, each 1..3: count, color, fill, shape. */
const digitsOf = (tile: GTile): number[] => [...tile.id].map(Number)

/** Unpack a tile for drawing. */
export function decode(tile: GTile): GTileFace {
  const [count, color, fill, shape] = digitsOf(tile)
  return {
    count: count as 1 | 2 | 3,
    color: COLORS[color - 1],
    fill: FILLS[fill - 1],
    shape: SHAPES[shape - 1],
  }
}

/** The tile with these four attributes. The inverse of [`decode`]. */
export function encode(face: GTileFace): GTile {
  return {
    id: [
      face.count,
      COLORS.indexOf(face.color) + 1,
      FILLS.indexOf(face.fill) + 1,
      SHAPES.indexOf(face.shape) + 1,
    ].join(''),
  }
}

/**
 * The one tile that completes a set with `a` and `b` — always exactly one, and
 * it is `a` itself only when `a` and `b` are the same tile. A new object: the
 * tile may not be on the board at all.
 */
export function third(a: GTile, b: GTile): GTile {
  const bDigits = digitsOf(b)
  return {
    id: digitsOf(a).map((x, i) => (x === bDigits[i] ? x : 6 - x - bDigits[i])).join(''),
  }
}

/** Are these three tiles a set? Assumes three DISTINCT tiles. */
export function isSet(a: GTile, b: GTile, c: GTile): boolean {
  return third(a, b).id === c.id
}

/**
 * The first set on the board, or null if it holds none — the question behind
 * both "deal three more" and the coop hint. The tiles handed back are the
 * board's own.
 *
 * Pairs, not triples: every pair names its completing tile directly, so this
 * asks "is that tile also on the board?" instead of testing every combination.
 */
export function findSet(tiles: readonly GTile[]): [GTile, GTile, GTile] | null {
  const byId = new Map(tiles.map((t) => [t.id, t]))
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      const completerId = third(tiles[i], tiles[j]).id
      // A pair of distinct tiles can never be completed by either of itself,
      // but guard anyway so a board with a duplicate can't report a false set.
      if (completerId === tiles[i].id || completerId === tiles[j].id) continue
      const completer = byId.get(completerId)
      if (completer !== undefined) return [tiles[i], tiles[j], completer]
    }
  }
  return null
}

/**
 * Every set on the board, each listed once. Used by tests; play itself only
 * ever needs [`findSet`].
 *
 * The dedupe: a set would otherwise be found three times, once per pair inside
 * it. Counting it only when the completing tile sits LATER in the array than
 * both others picks exactly one of those three.
 */
export function allSets(tiles: readonly GTile[]): [GTile, GTile, GTile][] {
  const position = new Map(tiles.map((tile, i) => [tile.id, i]))
  const found: [GTile, GTile, GTile][] = []
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      const at = position.get(third(tiles[i], tiles[j]).id)
      if (at !== undefined && at > j) found.push([tiles[i], tiles[j], tiles[at]])
    }
  }
  return found
}

/** How many tiles a deck holds. The plpgsql twin is `setgame._deck_size`. */
export function deckSize(kind: GDeckKind): number {
  return kind === 'junior' ? JUNIOR_DECK_SIZE : FULL_DECK_SIZE
}

/**
 * The deck, in order. `create_game` shuffles it server-side; this is here for
 * the frontend's own tests. Junior keeps only the solid tiles, fill 1 — the
 * same filter `create_game` applies.
 */
export function buildDeck(kind: GDeckKind): GTile[] {
  const tiles: GTile[] = []
  for (let count = 1; count <= 3; count++)
    for (let color = 1; color <= 3; color++)
      for (let fill = 1; fill <= 3; fill++)
        for (let shape = 1; shape <= 3; shape++)
          if (kind === 'full' || fill === 1) tiles.push({ id: `${count}${color}${fill}${shape}` })
  return tiles
}
