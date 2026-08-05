/**
 * The PURE board-building core for letterboxed, unit-tested by
 * ./board_test.ts. No network, no Supabase, no Deno APIs — everything here is
 * a function of its arguments (the randomness is injected), so the rules can
 * be tested without a database.
 *
 * The one idea the whole file serves: a letterboxed board is twelve distinct
 * letters PARTITIONED into four sides of three, and the partition is what
 * makes a word playable or not. Two consecutive letters of a word may never
 * sit on the same side.
 *
 * See docs/letterboxed-plan.md §4.
 */

/** Letters on a board — four sides of three. */
export const BOARD_SIZE = 12
/** Letters per side. */
export const SIDE_SIZE = 3
/** Letter Boxed's own floor; shorter words are never accepted. */
export const MIN_WORD_LEN = 3

/**
 * The 26-bit distinct-letter set of a string, bit 0 = 'a'. Same convention as
 * common.words.letter_mask and common.word_letter_mask — it MUST match, since
 * the candidate_words RPC compares this mask against that column.
 */
export function letterMask(s: string): number {
  let m = 0
  for (let i = 0; i < s.length; i++) m |= 1 << (s.charCodeAt(i) - 97)
  return m
}

/**
 * Assign each of the twelve letters to one of four sides of three, so that no
 * two letters ADJACENT IN ANY of `words` land on the same side. Returns the
 * twelve letters re-ordered into side groups — positions 0-2 are one side, 3-5
 * the next, and so on, which is exactly the `sides` column's format — or null
 * if no such partition exists.
 *
 * WHY IT CANNOT RETURN NULL IN PRACTICE: the seed importer proves every stored
 * seed partitionable before writing the row (about 0.2% of candidate pairs are
 * not — a long word can leave one letter adjacent to more letters than there
 * are sides). The null branch stays because this is a pure function that
 * shouldn't assume its caller's data, and the builder treats it as "re-roll".
 *
 * The search is exhaustive backtracking over a randomized letter order and a
 * randomized side order, so it finds A partition whenever one exists, and a
 * DIFFERENT one on each call. That re-roll is what lets one seed back many
 * distinct-feeling boards: the letters repeat, the puzzle doesn't.
 */
export function partitionSides(
  letters: string,
  words: string[],
  rnd: () => number,
): string | null {
  const idx = new Map([...letters].map((c, i) => [c, i]))

  // conflict[i] is the bitset of letter-slots that may not share i's side.
  const conflict = new Array<number>(BOARD_SIZE).fill(0)
  for (const w of words) {
    for (let i = 1; i < w.length; i++) {
      const u = idx.get(w[i - 1])
      const v = idx.get(w[i])
      // A word using a letter off the board can't constrain the partition.
      if (u === undefined || v === undefined || u === v) continue
      conflict[u] |= 1 << v
      conflict[v] |= 1 << u
    }
  }

  const order = shuffle([...Array(BOARD_SIZE).keys()], rnd)
  const sides: number[][] = [[], [], [], []]

  const place = (k: number): boolean => {
    if (k === BOARD_SIZE) return true
    const node = order[k]
    for (const s of shuffle([0, 1, 2, 3], rnd)) {
      if (sides[s].length >= SIDE_SIZE) continue
      if (sides[s].some((m) => conflict[node] & (1 << m))) continue
      sides[s].push(node)
      if (place(k + 1)) return true
      sides[s].pop()
    }
    return false
  }
  if (!place(0)) return null

  // Shuffle WITHIN each side too: which of a side's three letters sits at
  // which position is pure display, and varying it makes two boards from the
  // same seed look less alike.
  return sides
    .map((members) => shuffle(members, rnd).map((i) => letters[i]).join(''))
    .join('')
}

/** Fisher-Yates on a copy, so callers keep their input. */
export function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** letter → side index (0..3), derived from a `sides` string. */
export function sideOf(sides: string): Map<string, number> {
  return new Map([...sides].map((c, i) => [c, Math.floor(i / SIDE_SIZE)]))
}

/**
 * Is this word playable on this board? Every letter must be on the board, and
 * no two CONSECUTIVE letters may share a side — which also rules out doubled
 * letters ('bell'), since a letter is trivially on its own side.
 */
export function isPlayable(word: string, side: Map<string, number>): boolean {
  if (word.length < MIN_WORD_LEN) return false
  let prev = side.get(word[0])
  if (prev === undefined) return false
  for (let i = 1; i < word.length; i++) {
    const cur = side.get(word[i])
    if (cur === undefined || cur === prev) return false
    prev = cur
  }
  return true
}

/**
 * The board's playable word list: every candidate that survives isPlayable.
 * Candidates arrive already filtered to "letters fit the board" by the
 * candidate_words RPC; the side rule is what only this layer knows, because it
 * depends on the partition the builder just chose.
 */
export function buildPlayableWords(candidates: string[], sides: string): string[] {
  const side = sideOf(sides)
  return candidates.filter((w) => isPlayable(w, side))
}

/**
 * Would this board be solvable in ONE word? True when some playable word uses
 * all twelve letters, which makes the puzzle a single lookup.
 *
 * The seed importer already drops letter-sets that spell a band-≤2 word, but
 * it can't see the WHOLE dictionary a game might accept: at legal_band 5 a
 * twelve-letter word from a higher band can still turn up. So this is checked
 * against the real playable list, per game.
 */
export function isOneWordSolvable(playable: string[]): boolean {
  return playable.some((w) => new Set(w).size === BOARD_SIZE)
}
