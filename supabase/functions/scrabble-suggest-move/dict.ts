/**
 * Bundled-dictionary access for the scrabble move suggester.
 *
 * `wordlist.ts` is a gzip+base64 blob of play_word's exact word universe
 * (len 2..15, american OR british, all difficulty bands — one line per word,
 * `"<difficulty><word>"`). It is GENERATED and git-ignored (~1.2 MB): run
 * `npm run scrabble:wordlist` to (re)create it from `common.words` before
 * `supabase functions serve`; `npm run deploy` does it automatically.
 *
 * Unlike boggle's dict.ts there are no per-band tries: we build ONE
 * all-bands trie whose terminals carry each word's difficulty (rated
 * terminals — see `src/common/lib/game/trie.ts`), and the per-game band
 * check happens at query time via the `isLegal` predicate. Memoised as a
 * per-isolate singleton, so warm invocations skip both the gzip decode and
 * the build.
 */

import { buildTrie } from '../../../src/common/lib/game/trie.ts'
import type { Trie } from '../../../src/common/lib/game/trie.ts'
import { WORDLIST_GZ_B64 } from './wordlist.ts'

let triePromise: Promise<Trie> | null = null

async function decodeAndBuild(): Promise<Trie> {
  const bytes = Uint8Array.from(atob(WORDLIST_GZ_B64), (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(stream).text()
  const words: string[] = []
  const ratings: number[] = []
  for (const line of text.split('\n')) {
    if (!line) continue
    ratings.push(line.charCodeAt(0) - 48) // leading '1'..'6'
    words.push(line.slice(1))
  }
  return buildTrie(words, ratings)
}

/** The one difficulty-rated, all-bands trie. Async only because the one-time
 *  gzip decode is; the promise is the memo, so concurrent cold-start calls
 *  share a single build. */
export function ratedTrie(): Promise<Trie> {
  if (!triePromise) triePromise = decodeAndBuild()
  return triePromise
}
