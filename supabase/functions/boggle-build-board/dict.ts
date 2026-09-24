// cs-unmet

/**
 * Bundled-dictionary access for the boggle board generator.
 *
 * `wordlist.ts` is a gzip+base64 blob of the whole dictionary (all words
 * len>=3), tagged by difficulty AND a clean flag. It is GENERATED and
 * git-ignored (~1.3 MB): run `gmake g-boggle-trie` to (re)create it from
 * `common.words` before `supabase functions serve`; `gmake deploy-funcs` does
 * it automatically. Shipping it bundled beats querying the DB at cold start
 * (~2× faster, no DB load per isolate; the dictionary is stable). See
 * docs/games/boggle.md §5.
 *
 * Two word sets, one trie (the boggle word-set split):
 *   - `requiredTrie(band)` — the CLEAN set (american, no crude/slur/slang): what
 *     a board is generated + judged against.
 *   - `legalTrie(band)` — ALL words at the band (difficulty-only): the wider net
 *     of what else a player may find, so crude/slur/slang/non-american words
 *     count. Used to enumerate a board's bonus words.
 *
 * **ONE trie is built, per isolate, holding every word.** Each word's terminal
 * carries its difficulty and its clean flag, and each set is a VIEW of that
 * trie: the same `children`, with an `eow` of its own marking just the words
 * the set admits. A full trie is ~110 MB and a worker's limit is 256 MB, so a
 * trie per set would not fit — band 6 needs two full ones — and a view costs one
 * byte a node. Solvers read a view exactly as they read a trie.
 */

import { buildTrie } from '../../../src/shared/dict-trie/trie.ts'
import type { Trie } from '../../../src/shared/dict-trie/trie.ts'
import { WORDLIST_GZ_B64 } from './wordlist.ts'

// A terminal's value: the difficulty (1..6) in the low bits, plus CLEAN when the
// word is required-eligible. Never 0, so every word still reads as a word.
const DIFFICULTY_BITS = 7
const CLEAN = 8

let fullTriePromise: Promise<Trie> | null = null
const requiredTrieByBand = new Map<number, Trie>()
const legalTrieByBand = new Map<number, Trie>()

async function decodeAndBuild(): Promise<Trie> {
  const bytes = Uint8Array.from(atob(WORDLIST_GZ_B64), (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(stream).text()
  const words: string[] = []
  const terminals: number[] = []
  for (const line of text.split('\n')) {
    if (!line) continue
    const difficulty = line.charCodeAt(0) - 48 // leading '1'..'6'
    const isClean = line.charCodeAt(1) === 49 // then '1' or '0'
    words.push(line.slice(2))
    terminals.push(isClean ? difficulty | CLEAN : difficulty)
  }
  return buildTrie(words, terminals)
}

/** Every word, every band. The promise is the memo, so concurrent cold-start
 *  calls share a single build. */
function fullTrie(): Promise<Trie> {
  if (!fullTriePromise) fullTriePromise = decodeAndBuild()
  return fullTriePromise
}

/** The words at `difficulty <= band` (and clean, when `cleanOnly`), as a view of
 *  the full trie. Cached per band: a view is one byte a node. */
async function viewFor(band: number, cleanOnly: boolean, cache: Map<number, Trie>): Promise<Trie> {
  const cached = cache.get(band)
  if (cached) return cached
  const full = await fullTrie()
  const eow = new Uint8Array(full.nNodes)
  for (let node = 0; node < full.nNodes; node++) {
    const t = full.eow[node]
    if (t !== 0 && (t & DIFFICULTY_BITS) <= band && (!cleanOnly || (t & CLEAN) !== 0)) eow[node] = 1
  }
  const view = { children: full.children, eow, nNodes: full.nNodes }
  cache.set(band, view)
  return view
}

/** The CLEAN words at `difficulty <= band` (the words a board is generated +
 *  judged against). Async only because the one-time gzip decode is. */
export function requiredTrie(band: number): Promise<Trie> {
  return viewFor(band, true, requiredTrieByBand)
}

/** ALL words at `difficulty <= band` (difficulty-only) — used to enumerate a
 *  board's bonus/legal words. Includes the crude/slur/slang/non-american words
 *  the clean filter drops. */
export function legalTrie(band: number): Promise<Trie> {
  return viewFor(band, false, legalTrieByBand)
}
