// cs-fixed-outcome-fix

import { tailLetter } from './board'
import type { suggest } from './solve'

/** `suggest`'s answer when it has no word to offer. */
type NoSuggestion = Exclude<ReturnType<typeof suggest>, { word: string }>

/**
 * The hint's opening letters: 3 normally, 4 for a long word (> 8) — enough to
 * find the word's start on the board without handing the whole thing over.
 * The hint's pill (`lib/answer.ts`) and the event log's row both read it, so
 * the same hint reads as the same information to everyone.
 */
export function hintPrefix(word: string): string {
  return word.slice(0, word.length > 8 ? 4 : 3).toUpperCase()
}

/**
 * What the hint says when it has no word to offer — DIAGNOSIS ONLY, naming
 * which wall the chain hit. The remedy is the same in every case and the chain
 * strip's × is right there, and the pill is `nowrap` + ellipsis inside a
 * reserved-height slot, so the characters go on the wall, not the way out.
 *
 * `chain` is my chain; `words` every word the board accepts, since `suggest`
 * searched only the clean ones.
 */
export function makeNoSuggestionText(
  r: NoSuggestion,
  chain: readonly string[],
  words: readonly string[],
): string {
  const tail = tailLetter(chain)
  // `suggest`'s "stuck" means "no word I'd offer follows the tail", which is
  // not "no legal move" once the accept list is wider than the clean one. "No
  // word starts with G" is a claim about the RULES, so it is made only when no
  // word of either kind follows; otherwise there is a move, just no route the
  // hint can name, and the unreachable line is the honest one.
  const stuck = r.kind === 'stuck'
    && !(tail !== null && words.some((w) => w.startsWith(tail) && !chain.includes(w)))
  if (stuck) {
    // An empty chain has no tail and can't be stuck — every word is an opener —
    // so the fallback is for the type, not for a state that happens.
    if (tail === null) return 'No words to play'
    // Two ways to be stuck on G: the board never had a G-word, or I already
    // spent it. The second is the crueller one — the player can see a G-word in
    // their own chain — so it says "other" and stops reading as a bug.
    const spentTail = chain.some((w) => w.startsWith(tail))
    return `No ${spentTail ? 'other ' : ''}word starts with ${tail.toUpperCase()}`
  }
  // The one case carrying a number, and the reason it exists: the board IS
  // solvable, just not in the words left under the cap.
  if (r.kind === 'offPar') {
    return `Best solution needs ${r.wordsToFinish} ${r.wordsToFinish === 1 ? 'word' : 'words'}`
  }
  return 'No winning path from here'
}
