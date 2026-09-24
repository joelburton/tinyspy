# Area: dict-trie

The folders it reads: `shared/dict-trie`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN** (2026-09-24). The READ is done; the findings wait on Joel.

## The roster

Agreed with Joel 2026-09-24 (*"yes, stamp the files and then perform the
audit"*):

| file | lines | stamp |
|---|---|---|
| `src/shared/dict-trie/trie.ts` | 100 | `cs-audited-dict-trie` |
| `src/shared/dict-trie/trie.test.ts` | 85 | `cs-audited-dict-trie` |
| `src/shared/dict-trie/doc.md` | 3 | (markdown carries no stamp) |
| `src/shared/dict-trie/todo.md` | 19 | (markdown carries no stamp) |

Dependencies listed and left, since they belong to boggle's and scrabble's
areas: `boggle/lib/solver.ts` (it re-exports `buildTrie`),
`boggle-build-board/dict.ts`, `scrabble/lib/policy.ts` and `suggest.ts` and
their tests, `scrabble-suggest-move/dict.ts` and `index.ts`,
`supabase/scripts/generate-scrabble-wordlist.ts` and `scrabble-selfplay.ts`.
`boggle-c-solver/solver_trie.c` is outside the stamp scope.

## The READ

**The READ is DONE.** Every roster file was read end to end. The checks made
beside it:

- **The todo first.** It holds one Won't-do item (the growth-path test) and
  nothing open. `docs/deferred.md` holds nothing for the trie.
- **What moved under it.** Nothing. The folder imports nothing and is not on
  the game-page shell, so no shell window applies.
- **Every caller against the contract.** I read every `buildTrie`, `walkWord`,
  `eow` and `nNodes` use in boggle and scrabble, in the app, in the edge
  functions and in the scripts. That was 14 files.
- **The two real dictionaries.** I decoded both bundled word lists and built
  their tries in Node, then in Deno through each edge function's own
  `dict.ts`. I measured node counts, allocation, build time and process
  memory.
- **The platform limit.** Supabase's docs give edge functions a 256 MB
  memory limit.
- **Prod logs.** I read the prod edge-function logs for memory kills. There
  were none in the windows read, which were the last 24 hours and 09-19.
- **The two-runtime rule.** `docs/common-folders.md` says a file on an edge
  function's import graph writes relative `.ts` imports. `trie.ts` has no
  imports at all, and `edgeFunctionImports.test.ts` holds the rule.
- **The guards.** `INTROS_OWED` in `folderDocs.test.ts` still lists
  `shared/dict-trie`.

## Findings

## FIXED · F-dict-trie-1 · `trie-memory` · A full dictionary's trie is about 110 MB, and boggle can hold two against a 256 MB limit

Each node costs 26 × 4 bytes of `children`, which is 104 bytes. The arrays
start at 65,536 nodes and double, and `buildTrie` returns them untrimmed.
Measured:

| trie | words | nodes | allocated | used |
|---|---|---|---|---|
| scrabble, all bands | 276,320 | 609,465 | 110 MB | 64 MB |
| boggle clean, band 6 | 273,138 | 613,131 | 110 MB | 66 MB |
| boggle all, band 6 | 283,380 | 630,289 | 110 MB | 68 MB |
| boggle clean, band 3 (the default) | 88,734 | 214,325 | 28 MB | 23 MB |

- **Boggle at band 6 builds two of the big ones in one call**: `requiredTrie(6)`,
  then `legalTrie(6)`. In Deno the process reached 384 MB resident and 304 MB of
  array memory. Both tries also stay cached for the life of the worker, and so
  does every other band it has been asked for.
- **Verified on the local stack (2026-09-24).** The local edge runtime starts
  every worker with `memoryLimitMb: 256`, the same limit as prod. The test
  called the real functions through a throwaway e2e club:
  - **Boggle band 6 / legal 6 fails.** A warm worker answered HTTP 546
    `WORKER_LIMIT` ("memory limit reached for the worker"). The retry, on a
    fresh worker, crashed with `RangeError: Array buffer allocation failed` in
    `trie.ts`'s `grow`, while building the second trie (`legalTrie`). That was
    `PN111`, "BUG: boggle-build-board threw".
  - **Band 5 / 5, 5 / 6 and 4 / 6 also failed** on workers already holding
    other bands' tries. The per-band caches in `boggle-build-board/dict.ts`
    never evict, so one worker's memory grows with every band it has been
    asked for, and whether a middling pairing fails depends on what came
    before it.
  - **Passed:** 3 / 3, 3 / 5 (the setup form's default), 3 / 6 and 4 / 4.
    **Scrabble's suggester** passed twice. One full trie fits; two do not.
- **Prod** logs show no kill, but the windows read held one boggle board at
  an unknown band.
- **Trimming the arrays on return is not a clear fix.** The steady size drops
  to about 66 MB a trie, but the peak during a build is the last doubling
  (55 MB old plus 110 MB new), and a trial run of the trim measured no better.
- **The options, for Joel:**
  - **(a) Verify first.** Call `boggle-build-board` at band 6 with legal band 6,
    locally or in prod, and see whether it survives.
  - **(b) Make the trie smaller.** A different node layout would do it, such as
    letter-indexed rows only where a node has children, or a
    first-child/next-sibling list. That is a real redesign of this file, and
    both consumers' inner loops read `children[node * 26 + c]` directly.
  - **(c) Make boggle build one trie.** Scrabble already does this: one rated
    trie, with the clean flag and the band both on the terminal. That is
    boggle's change, not this folder's, and it roughly halves boggle's peak.

**Resolution (Joel, 2026-09-24: *"do it"*): boggle builds one trie.** The
change is in `boggle-build-board/dict.ts`; `trie.ts` did not change.
- **One build per isolate.** It holds every word, and each terminal carries
  its difficulty in the low bits plus a `CLEAN` bit. A promise memo means
  concurrent cold starts share the one build.
- **`requiredTrie(band)` and `legalTrie(band)` keep their names and callers.**
  Each now returns a view: the full trie's `children`, and its own
  `Uint8Array` `eow` (one byte a node) marking the words the set admits.
  The solver, `generate.ts` and `index.ts` are unchanged.
- **Verified:**
  - **Same words.** The old per-set tries and the new views listed identical
    words and points on 7,200 rolled boards: 6 bands × 2 sets × 3 dice sets ×
    200 boards, 1.5 million words compared, 0 differences.
  - **Local stack.** All 21 band pairings from 1 / 1 to 6 / 6, plus repeats of
    6 / 6, returned `ok` in about 350 ms each, with no memory errors in the
    runtime log.
  - **Tests.** Boggle's and shared's vitest suites, the guards, `test:edge`,
    `tsc -b`, eslint and `deno check` of the function all pass.
- **Also updated:** `docs/games/boggle.md` (the steps and "Cold start"),
  `generate-boggle-wordlist.ts`'s comments, and `index.ts`'s step list.
- **Not run:** the boggle e2e.

## F-dict-trie-2 · `truthiness-claim` · The header says every consumer tests `eow` for truthiness; scrabble reads the value

`trie.ts`'s header: *"since every existing consumer tests `eow` for
truthiness, rated and unrated tries are interchangeable"*. Scrabble's
`isLegal` compares the value with the band (`d <= bands.dict3plus`), and
`policy.ts` returns it as the word's difficulty. The interchangeability claim
still holds for code that only asks "is this a word?". The "every consumer"
half is false.

The same header names its consumers: the boggle solver by path, and scrabble
by `docs/games/scrabble.md` rather than by code. A roster of consumers in a
docstring rots, and `docs/common-folders.md`'s table already carries it.

## F-dict-trie-3 · `docstring-marker` · Two docstrings carry the implementation's reasons; the `Trie` fields carry nothing

- `buildTrie`'s second paragraph explains why it throws ("a `Uint8Array` cell
  whose truthiness IS…"). The caller needs *that* it throws and when. The
  why belongs on the check at the `throw`.
- `walkWord`'s second paragraph ("Rejecting it here keeps one meaning per
  value…") defends line 91. It belongs there.
- The `Trie` interface has no notes. `children`'s layout lives in the file
  header. `nNodes` is what every consumer sizes its per-node arrays by, and
  nothing says so.
- `const A = 'a'.charCodeAt(0)` is a capital `A` naming the code of a
  lowercase `a`.

## FIXED · F-dict-trie-4 · `empty-word` · `buildTrie` marks the root as a word when the list holds an empty string

`buildTrie(['', 'cat'])` sets `eow[0] = 1`. The test pins that as known
behavior, and `walkWord('')` refuses to reach it. It is harmless today: both
bundled lists hold no empty word (checked), boggle's solvers gate on
`minLen`, and scrabble never evaluates the root. But node 0 then means
"no child" in `children` and "a word" in `eow`. That is the two-meanings
problem `walkWord`'s docstring says it exists to prevent.

- **(a)** Skip an empty word the way a non-a–z word is skipped, and change the
  test to pin that.
- **(b)** Keep it pinned as it is.

**Resolution (Joel, 2026-09-24: *"skip it"*):** `buildTrie` skips an empty
word the way it skips a non-a–z one, and its docstring says so. The test that
pinned the root being marked now pins the skip, rating included. Planting the
old behavior turns that test red. `walkWord`'s test lost the half that
described the old behavior.

## F-dict-trie-5 · `walk-case` · `buildTrie` lower-cases; `walkWord` does not

`walkWord(trie, 'CAT')` answers -1 on a trie built from `['CAT']`. The
docstring says the input is lowercase, and every caller lower-cases first
(`policy.ts`, two sites in `rank.test.ts`, and `suggest.test.ts`'s
`wordLegal`). No caller is wrong today.

- **(a)** Keep it. The inner loops never call `walkWord`, so it is a boundary
  helper and one `toLowerCase` there would cost nothing.
- **(b)** Lower-case inside `walkWord` and drop the callers' copies.

## F-dict-trie-6 · `dense-lines` · `buildTrie`'s growth and insert are three statements a line

```ts
const c = new Int32Array(cap * 26); c.set(children); children = c
if (nx === 0) { nx = n++; if (n > cap) grow(); children[node * 26 + c] = nx }
```

This is the one subtle stretch of the file: the off-by-one between `n` and
`cap` is correct, but only after a careful read. It is written in the file's
densest style. One statement a line, and a note on the `n > cap` test, would
read it for the reader.

## F-dict-trie-7 · `stale-claims` · The test header and the Won't-do note each claim something false

- **`trie.test.ts`'s header** says the boggle solver suite checks word-finding
  "against a C oracle, on every board it generates". The parity suite runs
  fixed fixture boards (4×4, 5×5, 6×6) over a 2000-word dictionary. It does
  not run on generated boards.
- **`todo.md`'s Won't-do note** says "only the scrabble edge function's cold
  start crosses" the 65,536-node first allocation. Boggle crosses it at
  every band: band 1 is already 78,836 nodes. The ruling it records stands.
  Its reason is half wrong. The growth path runs in prod on every boggle
  board, which is stronger evidence for leaving the test out, not weaker.

## What checked out

- **The growth arithmetic.** `n` is the next free index and `grow()` fires
  when it passes `cap`, before any write to the new index. It was verified
  by reading and by building 630,289 nodes.
- **The rating guard.** It covers the missing, `0`, wrapping and
  non-integer cases, and the test pins each. A skipped word's rating is never
  consulted.
- **`walkWord` never returns 0.** Callers test `!== -1` or `> 0`, and both are
  right under that contract.
- **Scrabble's inner loops** (`suggest.ts`) walk `children` themselves and test
  `node !== 0`. That is correct against the layout.
- **Both bundled word lists are clean**: all distinct, all a–z, no empty word.
  So the skip path and the last-rating-wins behavior on duplicates never run
  in prod.
- **The file is Deno-safe.** It has no imports and no browser or Node APIs.
- **Build time.** The full scrabble dictionary builds in about 76 ms in Node.

## Notes

- `deno check supabase/scripts/generate-boggle-wordlist.ts` fails at HEAD:
  `import.meta.dirname` is `string | undefined`, passed to `resolve`. It
  predates this area and is not from this change; it goes to boggle's todo.

- `rank.test.ts` indexes `trie.eow[walkWord(…)]` without checking for -1, which
  reads `undefined` on a miss. That is scrabble's test. It is noted for
  scrabble's area, not raised here.

## Predicted test breaks

*(none yet)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
