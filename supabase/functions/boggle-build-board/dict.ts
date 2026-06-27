/**
 * Bundled-dictionary access for the boggle board generator.
 *
 * `wordlist.ts` is a gzip+base64 blob of the whole clean dictionary, tagged by
 * difficulty. It is GENERATED and git-ignored (~1.2 MB): run
 * `npm run boggle:wordlist` to (re)create it from `common.words` before
 * `supabase functions serve`; `npm run deploy` does it automatically.
 * We decode it ONCE per isolate (cold start) and build a band-filtered trie on
 * demand, memoised by band — so warm invocations reuse both. Shipping it bundled
 * beats querying the DB at cold start (~2× faster, no DB load per isolate; the
 * dictionary is stable). See docs/games/boggle.md §5.
 */

import { buildTrie } from '../../../src/boggle/lib/solver.ts'
import type { Trie } from '../../../src/boggle/lib/solver.ts'
import { WORDLIST_GZ_B64 } from './wordlist.ts'

// wordsByBand[d] = lowercase words at difficulty exactly d (d = 1..6).
let wordsByBand: string[][] | null = null
const trieByBand = new Map<number, Trie>()

async function decodeWordlist(): Promise<string[][]> {
  const bytes = Uint8Array.from(atob(WORDLIST_GZ_B64), (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(stream).text()
  const bands: string[][] = [[], [], [], [], [], [], []] // index 0 unused; 1..6
  for (const line of text.split('\n')) {
    if (!line) continue
    const d = line.charCodeAt(0) - 48 // leading '1'..'6'
    bands[d].push(line.slice(1))
  }
  return bands
}

/** The required trie for `difficulty <= band` (the words a board is judged
 *  against). Async only because the one-time gzip decode is; the result is
 *  cached per band, so repeated game-starts at the same band are instant. */
export async function requiredTrie(band: number): Promise<Trie> {
  const cached = trieByBand.get(band)
  if (cached) return cached
  if (!wordsByBand) wordsByBand = await decodeWordlist()
  const words = wordsByBand.slice(1, band + 1).flat() // bands 1..band; flat() avoids spread limits
  const trie = buildTrie(words)
  trieByBand.set(band, trie)
  return trie
}
