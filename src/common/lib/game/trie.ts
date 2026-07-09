/**
 * Flat typed-array trie — the shared dictionary structure for word games.
 *
 * Extracted from the boggle solver (its original home; see
 * `src/boggle/lib/solver.ts` for the solver built on top) so scrabble's move
 * suggester can share it (`docs/scrabble-ai.md`). Deliberately a trie, not a
 * minimised DAWG: a DAWG merges shared suffixes, so a node can't identify a
 * word; in a trie every word gets its own terminal node, which is what lets
 * boggle dedup found words by stamping the node and lets scrabble hang a
 * per-word difficulty rating off it.
 *
 * Layout: `children[node * 26 + letter]` is the child node index (0 = none;
 * node 0 is the root, which nothing points back to, so 0 is unambiguous).
 *
 * **Rated terminals.** `eow[node]` is `0` for "not a word"; nonzero marks a
 * word ending. When `buildTrie` is given a parallel `ratings` array the
 * terminal carries the word's difficulty (1..6 from `common.words`), so one
 * all-bands trie can answer band-gated legality at query time — scrabble's
 * `difficulty <= band` predicate. Without ratings every terminal is `1`, and
 * since every existing consumer tests `eow` for truthiness, rated and unrated
 * tries are interchangeable to code that only asks "is this a word?".
 */

const A = 'a'.charCodeAt(0)

export interface Trie {
  children: Int32Array
  eow: Uint8Array
  nNodes: number
}

/** Build a trie from a word list. Words are lower-cased; any word with a
 *  non-`a`–`z` character is skipped. `ratings`, if given, is parallel to
 *  `words` and becomes the terminal value (see "rated terminals" above);
 *  otherwise terminals are `1`.
 *
 *  A supplied rating MUST be an integer in `1..255` — the terminal is a
 *  `Uint8Array` cell whose truthiness IS "this is a word", so a missing
 *  rating (short array → `undefined`), a `0`, or a value that wraps mod 256
 *  would silently turn an accepted word into a non-word and desync a
 *  consumer's legality check from the real dictionary. We throw instead of
 *  storing a self-erasing terminal (docs/scrabble-ai-fixes.md §7). */
export function buildTrie(words: readonly string[], ratings?: readonly number[]): Trie {
  let cap = 1 << 16
  let children = new Int32Array(cap * 26)
  let eow = new Uint8Array(cap)
  let n = 1 // node 0 = root
  const grow = () => {
    cap *= 2
    const c = new Int32Array(cap * 26); c.set(children); children = c
    const e = new Uint8Array(cap); e.set(eow); eow = e
  }
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase()
    let node = 0
    let ok = true
    for (let j = 0; j < w.length; j++) {
      const c = w.charCodeAt(j) - A
      if (c < 0 || c >= 26) { ok = false; break }
      let nx = children[node * 26 + c]
      if (nx === 0) { nx = n++; if (n > cap) grow(); children[node * 26 + c] = nx }
      node = nx
    }
    if (ok) {
      if (ratings) {
        const r = ratings[i]
        if (!Number.isInteger(r) || r < 1 || r > 255)
          throw new Error(`buildTrie: rating for "${w}" must be an integer 1..255, got ${r}`)
        eow[node] = r
      } else {
        eow[node] = 1
      }
    }
  }
  return { children, eow, nNodes: n }
}

/** Walk a (lowercase `a`–`z`) word from the root; the node reached, or -1 if
 *  the trie has no such path. `trie.eow[node]` then answers is-it-a-word (and
 *  at what difficulty). Handy at boundaries — inner loops walk `children`
 *  themselves, one letter at a time. */
export function walkWord(trie: Trie, word: string): number {
  let node = 0
  for (let i = 0; i < word.length; i++) {
    const c = word.charCodeAt(i) - A
    if (c < 0 || c >= 26) return -1
    node = trie.children[node * 26 + c]
    if (node === 0) return -1
  }
  return node
}
