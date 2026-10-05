// cs-fixed-outcome-fix

import { tailLetter } from './board'
import type { suggest } from './solve'

/** `suggest`'s answer when it has no word to offer. */
type NoSuggestion = Exclude<ReturnType<typeof suggest>, { word: string }>

/**
 * ONE definition of what each rung SHOWS, because three surfaces must agree
 * word-for-word: the requester's own pill (`askForHintOrSpoiler`), the
 * teammates' echoed pill (the peer-events narration), and the event log's
 * lasting record. Drift between them would make the same hint read as
 * different information to different players.
 *
 * What each rung is WORTH is `lib/answer.ts`'s to say.
 */

/**
 * The hint's opening letters: 3 normally, 4 for a long word (> 8) — enough to
 * find the word's start on the board without handing the whole thing over.
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

/** The pill text for a rung: the hint DESCRIBES the word, the spoiler IS it. */
export function hintOrSpoilerPillText(kind: 'hint' | 'spoiler', word: string): string {
  return kind === 'hint'
    ? `${word.length} letters starting with ${hintPrefix(word)}`
    : word.toUpperCase()
}
