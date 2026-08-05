import { BOARD_SIZE, tailLetter } from './board'

/**
 * The hint search: given the board's playable words and the chain so far, find
 * a next word that lies on a SHORTEST path to covering all twelve letters.
 *
 * This runs on the FE, which is the whole reason the board's playable word list
 * ships to the client (see the migration's note on `playable_words`). The
 * alternative was this same breadth-first search in plpgsql — the most complex
 * SQL in the repo, for one button, testable only through pgTAP. Here it is ~40
 * lines of TypeScript with unit tests.
 *
 * ── The search space ────────────────────────────────────────────────────────
 * A position is fully described by two things: WHICH of the twelve letters are
 * already covered, and WHICH letter the next word must start with. That is
 * 2^12 × 12 ≈ 49k states — small enough to walk exhaustively on every click, so
 * the suggestion is genuinely optimal rather than merely plausible.
 *
 * Because the state ignores word ORDER, two different chains that have covered
 * the same letters and end on the same letter are the same position, which is
 * what keeps the search this cheap.
 */

/** What the hint found. */
export type Suggestion = {
  /** A word to play next, on a shortest path to finishing. */
  word: string
  /** How many of the twelve letters it newly covers. */
  newLetters: number
  /** Words still needed AFTER this one, this word included. So 1 means this
   *  word finishes the board. */
  wordsToFinish: number
}

/** Why no suggestion could be made — the three are very different situations. */
export type NoSuggestion =
  /** Nothing at all can follow the current letter: the chain has dead-ended
   *  and the only move is taking a word back. */
  | { kind: 'stuck' }
  /** Words exist, but no sequence of them covers the board from here. */
  | { kind: 'unreachable' }
  /** Off par: the board is still finishable, but the shortest finish needs
   *  more words than the chain has room for. A hint that suggested the first
   *  of those words would be leading the player into the cap. */
  | { kind: 'offPar'; wordsToFinish: number }

type Indexed = { word: string; mask: number; first: number; last: number }

/** Index the playable list into board-slot space (bit i = the i-th letter of
 *  `sides`), so the search is pure integer work. */
function indexWords(playable: readonly string[], sides: string): Indexed[] {
  const slot = new Map([...sides].map((c, i) => [c, i]))
  const out: Indexed[] = []
  for (const word of playable) {
    let mask = 0
    let ok = true
    for (const ch of word) {
      const i = slot.get(ch)
      if (i === undefined) {
        ok = false
        break
      }
      mask |= 1 << i
    }
    if (!ok) continue
    out.push({ word, mask, first: slot.get(word[0])!, last: slot.get(word[word.length - 1])! })
  }
  return out
}

/**
 * Suggest the next word, or explain why there isn't one.
 *
 * Among all next words that lie on a shortest path, it returns the one covering
 * the MOST new letters — equal-length routes are not equally satisfying, and
 * the greedier-looking move is the one a player would rather be shown.
 *
 * `wordsLeft`, when given, is the room left under the cap (max_words minus the
 * chain): a shortest finish longer than that returns `offPar` instead of a
 * word, because the server will refuse the chain before the route completes.
 */
export function suggest(
  playable: readonly string[],
  sides: string,
  chain: readonly string[],
  wordsLeft?: number,
): Suggestion | NoSuggestion {
  const FULL = (1 << BOARD_SIZE) - 1
  // Words already in the chain are excluded outright: the server refuses a
  // repeat, so suggesting one hands the player an error. (Steps DEEPER in a
  // candidate route are not deduped against each other — modelling that would
  // put the played-set in the BFS state — so wordsToFinish is exact for legal
  // routes and merely optimistic in the contrived case where every shortest
  // route repeats itself; the first word shown is always legal.)
  const played = new Set(chain)
  const words = indexWords(playable, sides).filter((w) => !played.has(w.word))

  const slot = new Map([...sides].map((c, i) => [c, i]))
  const byFirst: Indexed[][] = Array.from({ length: BOARD_SIZE }, () => [])
  for (const w of words) byFirst[w.first].push(w)

  // Where we are now.
  let used = 0
  for (const w of chain) for (const ch of w) used |= 1 << (slot.get(ch) ?? 0)
  const tailCh = tailLetter(chain as string[])
  const tail = tailCh === null ? null : (slot.get(tailCh) ?? null)

  const openers = tail === null ? words : byFirst[tail]
  if (openers.length === 0) return { kind: 'stuck' }

  // BFS over (covered letters, tail letter), carrying the FIRST word taken so a
  // completed path can name the move to make now. Layer by layer, so the first
  // layer that reaches FULL is the shortest — and every candidate in that layer
  // is equally short, which is where the most-new-letters tie-break applies.
  //
  // `seen` prunes the FRONTIER, never the winners: two different first words
  // can arrive at the same finished state, and deduping there would throw away
  // one of the very candidates the tie-break exists to choose between.
  const seen = new Uint8Array((FULL + 1) * BOARD_SIZE)
  let frontier: { used: number; tail: number; first: Indexed }[] = []
  const winners: Indexed[] = []
  for (const w of openers) {
    const nu = used | w.mask
    if (nu === FULL) {
      winners.push(w)
      continue
    }
    const state = nu * BOARD_SIZE + w.last
    if (!seen[state]) {
      seen[state] = 1
      frontier.push({ used: nu, tail: w.last, first: w })
    }
  }

  const popcount = (n: number) => {
    let c = 0
    for (let m = n; m; m &= m - 1) c++
    return c
  }
  const best = (cands: Indexed[], depth: number): Suggestion => {
    let pick = cands[0]
    let most = -1
    for (const c of cands) {
      const gained = popcount(c.mask & ~used)
      if (gained > most) {
        most = gained
        pick = c
      }
    }
    return { word: pick.word, newLetters: most, wordsToFinish: depth }
  }

  for (let depth = 1; depth <= BOARD_SIZE; depth++) {
    if (winners.length > 0) {
      // The first layer with winners IS the shortest finish. Longer than the
      // room left under the cap → the truth is "you can't get there from
      // here within N", not a word that starts down that road.
      if (wordsLeft !== undefined && depth > wordsLeft) {
        return { kind: 'offPar', wordsToFinish: depth }
      }
      return best(winners, depth)
    }
    if (frontier.length === 0) break

    const next: typeof frontier = []
    for (const node of frontier) {
      for (const w of byFirst[node.tail]) {
        const nu = node.used | w.mask
        if (nu === FULL) {
          winners.push(node.first)
          continue
        }
        const state = nu * BOARD_SIZE + w.last
        if (seen[state]) continue
        seen[state] = 1
        next.push({ used: nu, tail: w.last, first: node.first })
      }
    }
    frontier = next
  }

  return { kind: 'unreachable' }
}

/** Narrowing helper — `'kind' in result` reads poorly at call sites. */
export function isSuggestion(r: Suggestion | NoSuggestion): r is Suggestion {
  return !('kind' in r)
}
