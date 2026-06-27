# boggle-c-solver — why the Boggle solver got faster

Scratch folder from an exploration: *should the MothCubes (boggle) board generator
use the existing C solver (compiled to WASM) or a fresh TypeScript solver?*

Along the way the TS/AssemblyScript versions beat the original C, which was
surprising. This folder explains why — and the answer is **not** "JS is faster
than C." It's that the original C uses a heavier algorithm. Port the better
algorithm back into C and C wins again, by 2×.

## The two C files

| file | algorithm |
|---|---|
| `libwords.c` + `bench_before.c` | **before** — minimised DAWG + FNV-hash dedup of word strings + per-word arena `strdup`, run on every board. (Copied verbatim from `~/src/wsboggle/c`.) |
| `solver_trie.c` | **after** — plain trie + a generation-stamp on the trie node for dedup; nothing is materialised in the hot loop. |

A third file, `dump_fixture.c`, reuses `libwords.c` as a size- and
multiface-general oracle: it emits per-board `(count, longest, score)` tuples,
used to generate the TS solver's parity fixture
(`src/boggle/lib/solver.fixture.ts`). The TS solver is tested to reproduce these
exactly.

Read `solver_trie.c` top-to-bottom; the header comment lays out the three
changes. The short version:

1. **DAWG → trie.** A DAWG merges shared suffixes, so `CARS` and `BARS` end at
   the *same* node — a node can't identify a word. A trie gives every word its
   own terminal node. (Costs RAM: 288 KB DAWG → ~22 MB trie. Cheap today.)
2. **Hash-of-strings dedup → node stamp.** Because a trie node *is* a word, the
   same word found along two tile paths is "same terminal node." Dedup becomes
   `seen_gen[node] == this_board` — one array write, no string built, no
   `fnv1a`, no `strcmp`. The DAWG forced the hash table; the trie removes it.
3. **No word materialisation while sampling.** Rejection sampling discards
   ~99.98% of boards. We only need count/longest/score to test the
   constraints, so we compute exactly those. Building the actual word list is a
   separate one-board pass, run only on the winner.

The `max-words`/`max-score` fail-fast is identical in both; it never changes an
accepted board's words.

## Results

Task: generate **100** 4×4 boards meeting **words 30–300, score 40–500, ≥1
word of length 11**, against the *required* word list (`common.words` filtered
`difficulty≤3, american, crude=0, slur=0, slang=0` → 87,915 words). One fixed
board stream, identical for every implementation; best of 5 timed runs.

All implementations agree on the cross-check tuple, so all are correct:

```
solves=529785  accepted=100  sumWords=12488  sumLongest=1105  sumScore=22326
```

| implementation | algorithm | runtime | solves/sec | 100 boards | vs orig C |
|---|---|---|---:|---:|---:|
| **C — `solver_trie.c`** | trie + stamp | native | **93,742** | 5.65s | **2.00×** |
| **C → WASM (emcc)** | trie + stamp | WASM | **82,946** | 6.39s | **1.77×** |
| AssemblyScript → WASM | trie + stamp | WASM | 69,531 | 7.62s | 1.49× |
| TypeScript (Node/V8) | trie + stamp | V8 | 55,379 | 9.57s | 1.18× |
| C — `libwords.c` (orig) | DAWG + hash | native | 46,767 | 11.33s | 1.00× |
| C → WASM (emcc) | DAWG + hash | WASM | 38,773 | 13.66s | 0.83× |

Two clean readings:

- **Same algorithm, expected runtime order.** Among the trie+stamp builds:
  native C (93.7k) > C→WASM (82.9k) > AS→WASM (69.5k) > V8 (55.4k). Nothing
  weird — native wins, WASM costs ~12%, JIT'd JS trails. (emcc's LLVM output
  even edges out AssemblyScript's for the same algorithm.)
- **The original "TS beats C" was an algorithm gap, not a language gap.** Orig C
  (DAWG+hash, 46.8k) is ~2× slower than trie+stamp C. A trie-based TS naturally
  beat it; that's all that was going on. (And a *naive* object-`{}` trie in TS
  runs ~7.5k/sec — ~6× slower than orig C — which is almost certainly the "TS is
  5× slower" number from the earlier exploration: that was the slow data
  structure, not TS itself.)

Takeaway for MothCubes: the solver lives in a TS edge function for
maintainability (builds its trie straight from `common.words` with a difficulty
byte per node). Performance is a non-issue — even the worst constraint here is
~57–96 ms for one board. This folder is the **golden-master oracle**: any of
these implementations reproduces the exact tuple, so the shipping TS solver can
be parity-tested against the battle-tested C.

## Reproduce

```sh
make                 # builds bench_before + solver_trie
make run-before      # original DAWG + hash solver
make run-after       # improved trie + stamp solver
```

Inputs (defaults point at the `/tmp` files the harness produced):

```sh
# required word list (uppercase, len 3–15), from the gamelist TSV
awk -F'\t' '$2<=3 && $3=="t" && $7==0 && $8==0 && $9=="f" \
   && length($1)>=3 && length($1)<=15 && $1 ~ /^[a-z]+$/ {print toupper($1)}' \
   ~/src/gamelist/words.tsv | LC_ALL=C sort -u > /tmp/req_sorted.txt

# the DAWG for bench_before is built from that list via ~/src/cboggle/make-dawg
# the fixed board stream is written by the JS harness (gen_stream.mjs)
```
