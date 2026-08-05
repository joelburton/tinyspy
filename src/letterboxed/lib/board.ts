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

/** Which side (0..3) each letter sits on. */
export function sideOf(sides: string): Map<string, number> {
  return new Map([...sides].map((c, i) => [c, Math.floor(i / SIDE_SIZE)]))
}

/** The four sides, as arrays of letters, in the order the string gives them. */
export function sideGroups(sides: string): string[][] {
  return [0, 1, 2, 3].map((s) => [...sides.slice(s * SIDE_SIZE, (s + 1) * SIDE_SIZE)])
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
export function tailLetter(chain: string[]): string | null {
  const last = chain[chain.length - 1]
  return last ? last[last.length - 1] : null
}

/**
 * Why this word can't be submitted, as a player-facing phrase — or null when
 * it can. Ordered so the most useful complaint wins: a chain-rule break is
 * more actionable than "not a word", because it tells you what to do instead.
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
  if (word.length < MIN_WORD_LEN) return 'at least three letters'

  const tail = tailLetter(chain)
  if (tail && word[0] !== tail) return `must start with ${tail.toUpperCase()}`

  if (chain.length >= maxWords) return `${maxWords} words is the limit — undo to try again`
  if (chain.includes(word)) return 'already in the chain'

  // A same-side pair is the rule players trip over most, so name it rather
  // than folding it into the generic "can't be played here".
  const side = sideOf(sides)
  for (let i = 1; i < word.length; i++) {
    if (!side.has(word[i])) return `${word[i].toUpperCase()} is not on the board`
    if (side.get(word[i]) === side.get(word[i - 1])) {
      return `${word[i - 1].toUpperCase()}${word[i].toUpperCase()} is on one side`
    }
  }
  if (!side.has(word[0])) return `${word[0].toUpperCase()} is not on the board`

  if (!playable.has(word)) return 'not a word'
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

/** A letter's place on the square, plus the side it belongs to. */
export type Node = { letter: string; x: number; y: number; side: number }

/**
 * Lay the twelve letters out CLOCKWISE from the top-left: side 0 across the
 * top, 1 down the right, 2 back along the bottom, 3 up the left. Reversing the
 * bottom and left runs is what makes it read as one loop rather than four
 * left-to-right rows.
 */
export function layout(sides: string): Node[] {
  const groups = sideGroups(sides)
  const at = (f: number) => EDGE + SPAN * f
  const out: Node[] = []
  groups[0]?.forEach((letter, i) => out.push({ letter, x: at(STOPS[i]), y: EDGE, side: 0 }))
  groups[1]?.forEach((letter, i) => out.push({ letter, x: 100 - EDGE, y: at(STOPS[i]), side: 1 }))
  groups[2]?.forEach((letter, i) =>
    out.push({ letter, x: at(STOPS[SIDE_SIZE - 1 - i]), y: 100 - EDGE, side: 2 }),
  )
  groups[3]?.forEach((letter, i) =>
    out.push({ letter, x: EDGE, y: at(STOPS[SIDE_SIZE - 1 - i]), side: 3 }),
  )
  return out
}
