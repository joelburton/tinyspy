// cs-unmet

/**
 * The board's geometry and rules, FE-side. Pure functions over the `sides`
 * string — no React, no network — so they unit-test directly.
 *
 * `sides` is twelve lowercase letters in SIDE ORDER: positions 0-2 are one
 * side, 3-5 the next, 6-8 the next, 9-11 the last. That single string carries
 * both the board's letters and its partition, which is why nothing here needs
 * a second structure to stay in sync with.
 *
 * The server is the authority on every rule below — `letterboxed.submit_word`
 * re-checks all of it. These exist so the board can SHOW the rules (which
 * letters are still available from here, which move would be illegal) instead
 * of making the player discover them through rejections.
 */

/** Letters on a board — four sides of three. */
export const BOARD_SIZE = 12
/** Letters per side. */
export const SIDE_SIZE = 3
/** Letter Boxed's own floor; shorter words are never accepted. */
export const MIN_WORD_LEN = 3
/**
 * Words needed to solve ANY board this game can build — a constant, not a
 * measurement. The board builder partitions the twelve letters so that the
 * seeded word pair stays playable, so that pair is always a two-word solution
 * (and no board is solvable in one; the builder rejects those).
 *
 * It is a named constant rather than a magic 2 because it is the number the
 * whole difficulty vocabulary hangs off: the setup asks for slack ABOVE par,
 * and the info column shows par so "3/5 words" means something.
 */
export const PAR = 2

/** The box's tiles as the `sides` string everything here reads: their letters,
 *  in side order. Takes the tile's shape rather than `GTile`, because the
 *  board-building edge function loads this file and cannot load `types.ts`. */
export function joinSides(tiles: readonly { letter: string }[]): string {
  return tiles.map((t) => t.letter).join('')
}

/** Which side (0..3) each letter sits on. */
export function sideOf(sides: string): Map<string, number> {
  return new Map([...sides].map((c, i) => [c, Math.floor(i / SIDE_SIZE)]))
}

/**
 * May `next` follow `prev` in a word? Only when they are on DIFFERENT sides —
 * every step of a word crosses the box. A letter can never follow itself,
 * which is why `sides` needs no special case for doubled letters.
 *
 * `prev` undefined means "first letter of the word", where anything goes.
 */
export function canFollow(sides: string, prev: string | undefined, next: string): boolean {
  const side = sideOf(sides)
  if (!side.has(next)) return false
  if (prev === undefined) return true
  return side.get(prev) !== side.get(next)
}

/** The distinct letters a chain has touched. The win condition is this set
 *  reaching all twelve. */
export function coveredLetters(chain: string[]): Set<string> {
  return new Set(chain.join(''))
}

/**
 * The letter the NEXT word must start with — the last letter of the chain's
 * last word, or null when the chain is empty and anything may open.
 */
export function tailLetter(chain: readonly string[]): string | null {
  const last = chain[chain.length - 1]
  return last ? last[last.length - 1] : null
}

/**
 * Why this word can't be submitted, as a player-facing phrase — or null when
 * it can. Ordered so the most useful complaint wins: a chain-rule break is
 * more actionable than "Not a word", because it tells you what to do instead.
 *
 * Each one is SHORT and starts with a capital: these land in the below-board
 * pill, which is a one-line ellipsizing label at phone width, so it is a
 * caption rather than a sentence (docs/ui.md → the feedback pill).
 *
 * `playable` is the board's shipped word list, which already folds together
 * the dictionary, the board's letters and the side rule — so anything missing
 * from it is simply not playable here, and we don't try to say which of the
 * three reasons applied.
 */
export function rejectReason(
  word: string,
  { sides, chain, playable, maxWords }: {
    sides: string
    chain: string[]
    playable: Set<string>
    maxWords: number
  },
): string | null {
  if (word.length < MIN_WORD_LEN) return 'Too short'

  const tail = tailLetter(chain)
  if (tail && word[0] !== tail) return `Must start with ${tail.toUpperCase()}`

  if (chain.length >= maxWords) return 'Chain is full'
  if (chain.includes(word)) return 'Already played'

  // A same-side pair is the rule players trip over most, so name it rather
  // than folding it into the generic "can't be played here".
  const side = sideOf(sides)
  for (let i = 1; i < word.length; i++) {
    if (!side.has(word[i])) return `No ${word[i].toUpperCase()} on the board`
    if (side.get(word[i]) === side.get(word[i - 1])) {
      return `${word[i - 1].toUpperCase()}${word[i].toUpperCase()} is one side`
    }
  }
  if (!side.has(word[0])) return `No ${word[0].toUpperCase()} on the board`

  if (!playable.has(word)) return 'Not a word'
  return null
}

/**
 * The board is drawn as an SVG on a 0-100 square, so it scales to whatever the
 * board column gives it without any of the positions needing to know about
 * pixels. `EDGE` insets the square enough that a letter node straddling the
 * line still has room for its circle.
 */
export const EDGE = 14
export const SPAN = 100 - EDGE * 2
/** Where along a side the three letters sit, as fractions of the side. */
const STOPS = [0.2, 0.5, 0.8]
export const NODE_R = 7.2

/** A tile's shape as far as the geometry cares — `GTile`'s, written out
 *  because the board-building edge function loads this file and cannot load
 *  `types.ts`. */
type BoxTile = { letter: string; side: number }

/** A tile and the center it is drawn at, on the 0-100 square. */
type Placed<T extends BoxTile> = { tile: T; x: number; y: number }

/**
 * Lay the twelve tiles out CLOCKWISE from the top-left: side 0 across the
 * top, 1 down the right, 2 back along the bottom, 3 up the left. Reversing the
 * bottom and left runs is what makes it read as one loop rather than four
 * left-to-right rows. Each side's tiles keep the order they are given in.
 */
export function layout<T extends BoxTile>(tiles: readonly T[]): Placed<T>[] {
  const at = (f: number) => EDGE + SPAN * f
  const onSide = (side: number) => tiles.filter((t) => t.side === side)
  return [
    ...onSide(0).map((tile, i) => ({ tile, x: at(STOPS[i]), y: EDGE })),
    ...onSide(1).map((tile, i) => ({ tile, x: 100 - EDGE, y: at(STOPS[i]) })),
    ...onSide(2).map((tile, i) => ({ tile, x: at(STOPS[SIDE_SIZE - 1 - i]), y: 100 - EDGE })),
    ...onSide(3).map((tile, i) => ({ tile, x: EDGE, y: at(STOPS[SIDE_SIZE - 1 - i]) })),
  ]
}

/**
 * The polyline a word traces across the board, as an SVG `points` string —
 * `""` when there's nothing to draw.
 *
 * Pure, and here rather than in the component, because two different lines are
 * built from it now: the word being typed, and the GHOST of the last submitted
 * word (Board.tsx). One derivation means the two can't disagree about where a
 * word goes.
 *
 * A word maps to exactly one path because the board's twelve letters are
 * DISTINCT — that's what makes the ghost possible at all without storing a path
 * alongside the word. A repeated letter (ONION) revisits its node, so the line
 * doubles back on itself rather than drawing a loop; that's the geometry being
 * honest, not a bug.
 *
 * A single point produces a `points` string that renders no visible segment,
 * which is what makes a one-letter word (the carried-over first letter) draw
 * nothing without needing a special case.
 */
export function pathPoints(word: string, placed: readonly Placed<BoxTile>[]): string {
  const byLetter = new Map(placed.map((p) => [p.tile.letter, p]))
  return [...word]
    .map((c) => byLetter.get(c))
    .filter((p) => p !== undefined)
    .map((p) => `${p.x},${p.y}`)
    .join(' ')
}
