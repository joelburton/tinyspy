/**
 * The deck's algebra — pure functions over a card, no React, no network.
 *
 * A card has four attributes with three values each, so the deck is every
 * combination: 3⁴ = 81 cards, no duplicates. We pack a card into a single
 * integer 0..80 as four base-3 digits:
 *
 *     card = count·27 + color·9 + shade·3 + shape        (each digit 0..2)
 *
 * That packing is not a storage trick — it is what makes the whole game
 * cheap. Three cards are a **set** when every attribute is either all-same or
 * all-different across them, which in base 3 is exactly "the three digits sum
 * to 0 mod 3" in every place. Two consequences we lean on everywhere:
 *
 *   - **Any two cards determine the third** ([`third`]). So checking a claim
 *     is one arithmetic call, not a comparison of four attributes.
 *   - **Searching a board for a set is a pair loop**, not a triple loop —
 *     `findSet` is O(n²) with a membership lookup, ≤210 pairs at the largest
 *     board that can exist.
 *
 * The server re-implements the same algebra in plpgsql and is the authority on
 * every claim. These exist so the board can validate a selection instantly
 * (the whole board is face-up, so the FE genuinely can) and so the hint and
 * the deal-more rule have something to ask.
 */

/** A card, packed as four base-3 digits. Always 0..80. */
export type Card = number

/** Which deck a game is played with — the setup knob. */
export type DeckKind = 'full' | 'junior'

/**
 * Attribute value names, indexed by the digit.
 *
 * The color names are SLOTS, not pigments: they are Set's own vocabulary and
 * the names of the theme tokens, but which hue each one paints depends on the
 * game's `palette` setup choice — the colorblind-safe palette repaints all
 * three. So `red` means "the first color value", and the only place that
 * decides what that looks like is `theme.css`.
 */
export const COLORS = ['red', 'green', 'purple'] as const
export const SHADES = ['solid', 'striped', 'open'] as const
export const SHAPES = ['diamond', 'squiggle', 'oval'] as const

export type Color = (typeof COLORS)[number]
export type Shade = (typeof SHADES)[number]
export type Shape = (typeof SHAPES)[number]

/** A card's four attributes, unpacked for rendering. */
export type CardFace = {
  /** How many symbols are drawn — 1, 2 or 3 (the digit plus one). */
  pips: 1 | 2 | 3
  color: Color
  shade: Shade
  shape: Shape
}

/** Place values of the four digits, most significant first. */
const COUNT = 27
const COLOR = 9
const SHADE = 3
const SHAPE = 1

/** Cards in the full deck — every combination of four ternary attributes. */
export const FULL_DECK_SIZE = 81

/**
 * The **junior** deck drops shading (every card is solid), leaving three
 * attributes and 3³ = 27 cards. It is closed under [`third`] — the completing
 * card of two solid cards is itself solid (same-and-same gives same) — so
 * every function here works on it unchanged, with no junior-specific branch.
 */
export const JUNIOR_DECK_SIZE = 27

/**
 * How many cards a board is topped back up to after a claim. The deal-three
 * rule refills to this floor, and goes ABOVE it only when the board has no set
 * to find.
 */
export const BOARD_MIN: Record<DeckKind, number> = { full: 12, junior: 9 }

/**
 * The largest a board can ever get — a hard ceiling from the geometry, not a
 * policy: a set-free collection tops out at 20 cards in the full deck and 9 in
 * the junior deck, so one more card than that always contains a set and the
 * deal stops.
 *
 * Reaching either is vanishingly rare in play (~1 in a million games needs 21;
 * 18 is what 40k simulated games topped out at), which is exactly why the
 * layout that has to survive it is tested with a planted board rather than
 * trusted. `cards.test.ts` pins the full-deck bound against a real 20-card cap.
 */
export const MAX_BOARD: Record<DeckKind, number> = { full: 21, junior: 12 }

/** Read one base-3 digit out of a packed card. */
const digit = (card: Card, place: number): number => Math.floor(card / place) % 3

/** Unpack a card for rendering. */
export function decode(card: Card): CardFace {
  return {
    pips: (digit(card, COUNT) + 1) as 1 | 2 | 3,
    color: COLORS[digit(card, COLOR)],
    shade: SHADES[digit(card, SHADE)],
    shape: SHAPES[digit(card, SHAPE)],
  }
}

/** Pack four attributes back into a card. The inverse of [`decode`]. */
export function encode(face: CardFace): Card {
  return (
    (face.pips - 1) * COUNT +
    COLORS.indexOf(face.color) * COLOR +
    SHADES.indexOf(face.shade) * SHADE +
    SHAPES.indexOf(face.shape) * SHAPE
  )
}

/**
 * The one card that completes a set with `a` and `b` — always exactly one, and
 * it is `a` itself only when `a === b`.
 *
 * Per digit: if the two agree the third must agree too, and if they differ the
 * third must be the remaining value, which is `3 - x - y` (the three values sum
 * to 3). Both cases are "the digits sum to 0 mod 3".
 */
export function third(a: Card, b: Card): Card {
  let result = 0
  for (const place of [COUNT, COLOR, SHADE, SHAPE]) {
    const x = digit(a, place)
    const y = digit(b, place)
    result += (x === y ? x : 3 - x - y) * place
  }
  return result
}

/** Are these three cards a set? Assumes three DISTINCT cards. */
export function isSet(a: Card, b: Card, c: Card): boolean {
  return third(a, b) === c
}

/**
 * The first set on the board, or null if it holds none — the question behind
 * both "deal three more" and the coop hint.
 *
 * Pairs, not triples: every pair names its completing card directly, so this
 * asks "is that card also on the board?" instead of testing every combination.
 */
export function findSet(cards: readonly Card[]): [Card, Card, Card] | null {
  const present = new Set(cards)
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const completer = third(cards[i], cards[j])
      // A pair of distinct cards can never be completed by either of itself,
      // but guard anyway so a board with a duplicate can't report a false set.
      if (completer === cards[i] || completer === cards[j]) continue
      if (present.has(completer)) return [cards[i], cards[j], completer]
    }
  }
  return null
}

/**
 * Every set on the board, each listed once. Used by tests and by the
 * end-of-game readout; play itself only ever needs [`findSet`].
 *
 * The dedupe: a set would otherwise be found three times, once per pair inside
 * it. Counting it only when the completing card sits LATER in the array than
 * both others picks exactly one of those three.
 */
export function allSets(cards: readonly Card[]): [Card, Card, Card][] {
  const position = new Map(cards.map((card, i) => [card, i]))
  const found: [Card, Card, Card][] = []
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const completer = third(cards[i], cards[j])
      const at = position.get(completer)
      if (at !== undefined && at > j) found.push([cards[i], cards[j], completer])
    }
  }
  return found
}

/** How many cards a deck holds. The plpgsql twin is `setgame._deck_size`. */
export function deckSize(kind: DeckKind): number {
  return kind === 'junior' ? JUNIOR_DECK_SIZE : FULL_DECK_SIZE
}

/**
 * The deck, in order. `create_game` shuffles it server-side; this is here for
 * the FE's own tests and for the setup form's preview of what a junior deck
 * leaves out.
 */
export function buildDeck(kind: DeckKind): Card[] {
  const all = [...Array(FULL_DECK_SIZE).keys()]
  // Junior keeps only the solid cards, which is digit 0 in the shade place.
  return kind === 'junior' ? all.filter((c) => digit(c, SHADE) === 0) : all
}
