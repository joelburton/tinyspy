/**
 * Bundled-dictionary access for the boggle board generator.
 *
 * `wordlist.ts` is a gzip+base64 blob of the whole dictionary (all words
 * len>=3), tagged by difficulty AND a clean flag. It is GENERATED and
 * git-ignored (~1.3 MB): run `npm run boggle:wordlist` to (re)create it from
 * `common.words` before `supabase functions serve`; `npm run deploy` does it
 * automatically. We decode it ONCE per isolate (cold start) and build
 * band-filtered tries on demand, memoised by band — so warm invocations reuse
 * both. Shipping it bundled beats querying the DB at cold start (~2× faster, no
 * DB load per isolate; the dictionary is stable). See docs/games/boggle.md §5.
 *
 * Two tries, two filters (the boggle word-set split):
 *   - `requiredTrie(band)` — the CLEAN set (american, no crude/slur/slang): what
 *     a board is generated + judged against.
 *   - `legalTrie(band)` — ALL words at the band (difficulty-only): the wider net
 *     of what else a player may find, so crude/slur/slang/non-american words
 *     count. Used to enumerate a board's bonus words.
 */

import { buildTrie } from '../../../src/common/lib/game/trie.ts'
import type { Trie } from '../../../src/common/lib/game/trie.ts'
import { WORDLIST_GZ_B64 } from './wordlist.ts'

// Bands 1..6 (index 0 unused). `clean` = the required-eligible subset; `all`
// includes every word (difficulty-only).
type Bands = { clean: string[][]; all: string[][] }
let bands: Bands | null = null
const requiredTrieByBand = new Map<number, Trie>()
const legalTrieByBand = new Map<number, Trie>()

async function decodeWordlist(): Promise<Bands> {
  const bytes = Uint8Array.from(atob(WORDLIST_GZ_B64), (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(stream).text()
  const empty = (): string[][] => [[], [], [], [], [], [], []] // index 0 unused; 1..6
  const out: Bands = { clean: empty(), all: empty() }
  for (const line of text.split('\n')) {
    if (!line) continue
    const d = line.charCodeAt(0) - 48 // leading '1'..'6'
    const isClean = line.charCodeAt(1) === 49 // '1'
    const word = line.slice(2)
    out.all[d].push(word)
    if (isClean) out.clean[d].push(word)
  }
  return out
}

// Build (and memoise) a trie for bands 1..band from one of the two sets.
async function trieFor(
  band: number,
  cache: Map<number, Trie>,
  pick: (b: Bands) => string[][],
): Promise<Trie> {
  const cached = cache.get(band)
  if (cached) return cached
  if (!bands) bands = await decodeWordlist()
  const words = pick(bands).slice(1, band + 1).flat() // flat() avoids spread limits
  const trie = buildTrie(words)
  cache.set(band, trie)
  return trie
}

/** The CLEAN trie for `difficulty <= band` (the words a board is generated +
 *  judged against). Async only because the one-time gzip decode is; cached per
 *  band, so repeated game-starts at the same band are instant. */
export function requiredTrie(band: number): Promise<Trie> {
  return trieFor(band, requiredTrieByBand, (b) => b.clean)
}

/** The ALL-words trie for `difficulty <= band` (difficulty-only) — used to
 *  enumerate a board's bonus/legal words. Includes the crude/slur/slang/
 *  non-american words the clean filter drops. Cached per band. */
export function legalTrie(band: number): Promise<Trie> {
  return trieFor(band, legalTrieByBand, (b) => b.all)
}
