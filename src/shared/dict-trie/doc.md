# dict-trie

The dictionary trie behind boggle's board solver and scrabble's move suggester:
one flat structure, walked a letter at a time, that says whether a word can
still start this way and whether it has just ended. It runs in the browser and
inside edge functions alike.

## Intro to area

A word game's solver never asks the dictionary about a whole word. Boggle's
solver walks the board a tile at a time, and after every step it needs to know
whether any word still begins with the letters so far; scrabble's move
generator asks the same thing along a row. A trie answers exactly that: each
node is a prefix, and its children are the letters that may follow. This folder
is one, laid out so that both games' inner loops can walk it with nothing but
array reads.

It is a trie rather than the smaller DAWG a dictionary is often squeezed into.
A DAWG shares the endings of words, so one node can finish many of them; here
every word ends on a node of its own. That is what lets boggle notice a word it
has already found by marking its node, with no string built, and what lets each
word carry a small value where it ends. Scrabble keeps the word's difficulty
there, and boggle its difficulty and whether it is clean — American, and not
crude, a slur or slang — which is what a required word must be. A caller that
only asks "is this a word?" reads the value as true or false and never sees it.

The layout costs memory, and that is the fact that shapes how the games use it.
Every node is a row of 26 slots, one per letter, however few children it has,
so the full dictionary comes to about 110 MB. An edge function's worker is
killed at 256 MB, so a worker can hold one full trie and not two. Scrabble only
ever needs one. Boggle needs two sets of words, the clean ones a board is built
from and every word a player may find, so it builds one trie of everything and
treats each set as a view of it: the same rows, and a small array of its own
saying which word endings count.

The edge functions import the file straight out of `src/`, so it has to stay
something Deno compiles on its own. It imports nothing at all, which is the
simplest way to keep that true.

## Details

```
shared/dict-trie/trie.ts  (buildTrie · walkWord · Trie)
 ├── boggle/lib/solver.ts               re-exports buildTrie; createSolver and listWords walk `children`
 │    └── boggle/lib/generate.ts        generateBoard · listBonusWords
 ├── functions/boggle-build-board/dict.ts    one trie, rated; requiredTrie / legalTrie are views of it
 ├── scrabble/lib/suggest.ts            generateMoves walks `children`; isLegal reads the rating
 ├── scrabble/lib/policy.ts             walkWord, for a word's difficulty
 ├── functions/scrabble-suggest-move/   dict.ts builds one rated trie; index.ts calls walkWord
 └── supabase/scripts/scrabble-selfplay.ts
```

- **The layout.** `children[node * 26 + letter]` is the child's node index, and
  0 means none. Node 0 is the root, which nothing points back to, so 0 is never
  ambiguous. `eow[node]` is 0 where no word ends, else that word's terminal
  value.
- **Size per-node arrays by `nNodes`, not by an array's length.** The arrays
  start at room for 65,536 nodes, double when full, and are returned untrimmed,
  so they are usually longer than what is in use. A view's `eow` is exactly
  `nNodes` long.
- **Terminal values.** `buildTrie` stores 1, or the caller's `ratings`. A
  rating must be an integer in 1..255, and `buildTrie` throws otherwise, because
  a 0 (or a value that wraps) would silently turn an accepted word into a
  non-word. Scrabble's ratings are the word's difficulty, 1..6. Boggle's add a
  clean bit: the difficulty in the low three bits, plus 8 when the word is
  clean (`boggle-build-board/dict.ts`).
- **What `buildTrie` skips.** It lower-cases every word, and skips an empty word
  and any word with a character outside `a`–`z`. A skipped word's rating is
  never checked.
- **`walkWord` is for boundaries.** It takes a word in either case and returns
  its node, or -1, and never 0 — the empty string would otherwise land on the
  root — so a caller tests `!== -1` and reads `eow`. The inner loops never call
  it: they index `children` a letter at a time and test for 0.
- **The numbers.** The full word lists are about 610,000 to 630,000 nodes: about
  65 MB in use, 110 MB allocated after the last doubling, and about 165 MB for a
  moment during that doubling, while the old and new arrays both exist. A build
  takes under 100 ms. A view costs one byte a node.
- **The growth path has no unit test.** The unit suites' word lists never
  outgrow the first allocation, while both edge functions' do on every cold
  start. Why a test was ruled against is in `todo.md`.
- **If it ever imports anything**, the path is relative and carries its `.ts`
  ([docs/common-folders.md → Imports use the `@/` alias when they leave their
  folder](../../../docs/common-folders.md#imports-use-the--alias-when-they-leave-their-folder),
  where Deno is the exception).
  `src/guards/edgeFunctionImports.test.ts` holds the line.
