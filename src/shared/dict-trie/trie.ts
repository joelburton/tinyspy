// cs-blessed-dict-trie

/**
 * Flat typed-array trie — the shared dictionary structure for word games.
 *
 * Deliberately a trie, not a minimized DAWG: a DAWG merges shared suffixes, so
 * a node can't identify a word; in a trie every word gets its own terminal
 * node, which is what lets a solver dedup found words by stamping the node and
 * lets a word carry a value of its own on it.
 *
 * **Terminals.** `eow[node]` is `0` for "not a word"; nonzero marks a word
 * ending. `buildTrie` stores `1` there, or the caller's own value when given
 * `ratings` — a difficulty, say — so one trie can answer "is this a word, and
 * which kind?" at query time. Code that only asks "is this a word?" tests
 * `eow` for truthiness, and reads a rated trie and an unrated one alike.
 */

const A_CODE = 'a'.charCodeAt(0)

export interface Trie {
  // `children[node * 26 + letter]` is the child's node index, 0 for none. Node 0
  // is the root, which nothing points back to, so 0 is unambiguous.
  children: Int32Array
  // Per node: 0 if no word ends there, else that word's terminal value.
  eow: Uint8Array
  // How many nodes are in use — what a caller sizes a per-node array by. The
  // arrays themselves may be longer.
  nNodes: number
}

/** Build a trie from a word list. Words are lower-cased; an empty word, or any
 *  word with a non-`a`–`z` character, is skipped. `ratings`, if given, is
 *  parallel to `words` and becomes each word's terminal value; otherwise every
 *  terminal is `1`.
 *
 *  **Throws** when a supplied rating is missing or not an integer in `1..255`. */
export function buildTrie(words: readonly string[], ratings?: readonly number[]): Trie {
  let cap = 1 << 16
  let children = new Int32Array(cap * 26)
  let eow = new Uint8Array(cap)
  let n = 1 // the next free node; node 0 is the root
  const grow = () => {
    cap *= 2
    const biggerChildren = new Int32Array(cap * 26)
    biggerChildren.set(children)
    children = biggerChildren
    const biggerEow = new Uint8Array(cap)
    biggerEow.set(eow)
    eow = biggerEow
  }
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase()
    if (w.length === 0) continue // the root is never a word; see walkWord
    let node = 0
    let ok = true
    for (let j = 0; j < w.length; j++) {
      const c = w.charCodeAt(j) - A_CODE
      if (c < 0 || c >= 26) {
        ok = false
        break
      }
      let next = children[node * 26 + c]
      if (next === 0) {
        next = n++
        // `next` is the last index that fits when n === cap; past that, grow
        // before anything is written at `next`.
        if (n > cap) grow()
        children[node * 26 + c] = next
      }
      node = next
    }
    if (ok) {
      if (ratings) {
        const r = ratings[i]
        // The terminal's truthiness IS "this is a word", so a missing rating, a
        // 0, or one that wraps mod 256 would silently turn an accepted word into
        // a non-word. Refuse it rather than store a self-erasing terminal.
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

/** Walk a word, in either case, from the root: `buildTrie` lower-cases what it
 *  stores, and so does this. The node reached, or -1 if there is no such path. `trie.eow[node]` then answers
 *  is-it-a-word (and its terminal value). Handy at boundaries — inner loops walk
 *  `children` themselves, one letter at a time.
 *
 *  **Never returns 0**, so a caller can test `!== -1` and index `eow` safely. */
export function walkWord(trie: Trie, word: string): number {
  // The empty string walks nothing and lands on the root, node 0 — the value
  // `children` uses for "no child". Refusing it keeps one meaning per value.
  if (word.length === 0) return -1
  const w = word.toLowerCase()
  let node = 0
  for (let i = 0; i < w.length; i++) {
    const c = w.charCodeAt(i) - A_CODE
    if (c < 0 || c >= 26) return -1
    node = trie.children[node * 26 + c]
    if (node === 0) return -1
  }
  return node
}
