/**
 * Scrabble move suggester — the AI that recommends plays (docs/scrabble-ai.md).
 *
 * This module is pure TS with no I/O: it runs inside the
 * `scrabble-suggest-move` edge function (which builds the rated trie from the
 * bundled word list) and in Vitest. S1 lands the legality predicate; the A&J
 * move generator (S2) and ranking (S3) grow in beside it.
 */

import type { Trie } from '../../common/lib/game/trie.ts'

/** The game's two dictionary difficulty bands, straight off `scrabble.games`
 *  (`dict_2` / `dict_3plus` — server-only columns, fetched through the
 *  `get_suggest_context` definer RPC). 2-letter words get their own, usually
 *  stricter, band because the 2-letter list is where the weird scrabble-ese
 *  lives (AA, XI, QI…). */
export type Bands = { dict2: number; dict3plus: number }

/**
 * The legality predicate the whole suggester hangs on: is the word ending at
 * this trie node playable in this game? Matches `play_word`'s SQL by
 * construction — `difficulty <= (len = 2 ? dict_2 : dict_3plus)` — given a
 * rated trie built from the same `american OR british` word set the server
 * checks against (the dialect filter is applied at bundle time, so the trie
 * only contains eligible words; see generate-scrabble-wordlist.ts).
 *
 * Applied to EVERY word a placement forms: main words and the perpendicular
 * cross-words alike. Cross-words are routinely 2 letters — that's why the
 * per-length band split matters here, not just for main words.
 */
export function isLegal(trie: Trie, bands: Bands, node: number, len: number): boolean {
  const d = trie.eow[node]
  return d !== 0 && d <= (len === 2 ? bands.dict2 : bands.dict3plus)
}
