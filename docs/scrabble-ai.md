# Scrabble move suggester (AI) — exploration + plan

Status: **SHIPPED — all six stages built 2026-07-08 on branch `scrabble-ai`**
(S1 trie groundwork `62043bf` · S2 generator `d1ad7a6` · S3 ranking `83ef421` ·
S4 RPC + edge function `48d9e3b` · S5 FE `5e7e865` · S6 docs). The shipped
architecture at a glance lives in
[games/scrabble.md §12](games/scrabble.md#12-the-move-suggester-ai); this file
remains the **design record** — the algorithm survey, the decisions and their
rationale, the per-stage specs the build followed, and the
designed-but-deferred extensions (strength slider, AI opponent, exchange
suggestions). Captured from a design conversation on 2026-07-08; the same day
the plan was evaluated against the actual code, expanded (the "Verified
codebase anchors" section + the per-stage specs — including the correction to
how the edge function reads the dictionary bands), and then built. Companion to
[games/scrabble.md](games/scrabble.md) (the game itself) and
[games/boggle.md](games/boggle.md) (the trie/solver + edge-function patterns
this reuses).

## Goal

A "suggest a move" AI for scrabble: given the live board and rack, recommend
good plays. Target strength is **good play, not super-expert play** — a strong
club player, not Maven. Primary UX is a hint button in **coop** mode (the
codenamesduet clue-suggester shape); an AI *opponent* and a compete-mode
"hints allowed" house-rules toggle are possible later extensions, and the
architecture below supports both without change.

## Algorithm survey — what's known

Scrabble AI is one of the most thoroughly solved problems in classic game AI.
The literature splits cleanly into **move generation** (enumerate every legal
play — solved, mandatory) and **ranking** (pick which one to recommend — where
all the strength lives).

### Move generation

- **Appel & Jacobson 1988, "The World's Fastest Scrabble Program"** — complete
  legal-move enumeration over a DAWG (a suffix-merged trie), walking outward
  from *anchor* squares adjacent to existing tiles, with per-square
  *cross-check sets* (which letters legally form the perpendicular word here).
- **Gordon 1994, the GADDAG** — the modern standard. Stores each word once per
  letter position (reversed-prefix ◊ suffix) so plays extend bidirectionally
  from any anchor in one pass. ~2× a DAWG's memory, several times faster
  generation. Every serious engine (Quackle, Macondo) uses one.

Crucially: **the choice between these has zero effect on move quality.** Both
find every legal move; GADDAG is only faster. Speed matters when an engine
sims thousands of positions per second — not for a hint button that runs once
per click.

### Ranking, in ascending sophistication

1. **Greedy highest score.** Already beats most casual humans.
2. **Score + leave evaluation** (Brian Sheppard's *Maven*): a move's value is
   `points scored + equity of the rack you keep`. Leave can be hand-rolled
   (keep the blank, keep an S, penalize duplicates and Q-without-U, stay
   roughly balanced on vowels/consonants) or learned (Quackle ships
   leave-value tables). Hand-rolled ≈ strong club player.
3. **Monte Carlo simulation ("simming")**: roll the top ~10 candidates forward
   2 plies against sampled opponent racks. Maven / Quackle / Macondo territory
   — the stretch from strong-club to expert.
4. **Endgame search** (bag empty → perfect information; Maven used B*).

**LLMs are the wrong tool for generation** — legality and scoring are exact
combinatorial facts and an LLM will hallucinate placements. The right split is
algorithmic engine for *finding* moves, LLM (optionally, later) for *explaining*
them in a coaching sentence (the `crosswords-explain-clue` shape).

Reference engines: **Quackle** (open-source C++, learned leaves),
**Macondo** (Go, powers Woogles.io bots).

## Decisions

These were settled in the exploration conversation; revisit deliberately, not
accidentally.

| decision | choice | why |
|---|---|---|
| generator | **A&J-style over a plain flat trie** (not GADDAG) | same completeness; A&J finds every legal move in tens of ms — imperceptible for a hint. See "why not GADDAG" below. |
| ranking | **score + hand-rolled leave heuristic** (tier 2) | matches the good-not-expert target; simming is a big complexity jump for strength we don't want anyway |
| where it runs | **edge function `scrabble-suggest-move`**, trie built at cold start from the bundled word list, cached per isolate | the exact `boggle-build-board` pattern; the FE deliberately has no dictionary |
| legality | the **two-band difficulty predicate**, applied to *every* word a placement forms — including cross-check sets | a word is legal iff `difficulty ≤ (len == 2 ? dict_2 : dict_3plus)` (american OR british), same as `play_word`; suggester and server agree by construction |
| bands input | edge fn takes a **game id** and calls a new SECURITY DEFINER RPC `scrabble.get_suggest_context` that returns board + rack + bands + version in one atomic read | bands are server-only config, never exposed to the FE ([scrabble.md §3.3](games/scrabble.md)) — they are deliberately **excluded from the column grant** on `scrabble.games`, so a read-as-the-caller can't see them; the definer RPC (codenamesduet's `get_clue_context` pattern) is the one sanctioned door. The client can't ask for hints under the wrong gate. |
| scoring | candidate placements scored by **`src/scrabble/lib/play.ts`, reused verbatim** | single source of truth — a hint's score can't disagree with what the game awards |
| UX home | **coop-mode suggest button** | hints help the whole table in coop (shared rack, no turns); compete is a house-rules question, deferred |

### Why not GADDAG (and why boggle's cold-start rationale flips)

Boggle builds its trie at cold start because the input is the raw word list:
~283k words, ~2.5M characters, one linear insertion pass, sub-second, modest
memory. A GADDAG explodes that input: each word of length *n* is inserted *n*
times, so insertion volume is ~sum of *length²* ≈ **10× the characters**, and
the *unminimized* trie runs to tens of millions of nodes — plausibly
100–200MB, against the edge runtime's ~256MB ceiling. What makes published
GADDAGs small (a few MB) is **minimization**, which is exactly the expensive
step you don't want on every cold start.

So the options were:

- **GADDAG built at cold start** — ruled out: slowest cold start *and* the
  riskiest memory profile. Worst of both worlds.
- **GADDAG precomputed at deploy** (Node script builds + minimizes + serializes
  to a flat-integer binary; edge fn wraps the bytes in an `Int32Array`) — the
  known upgrade path *if* we ever want simming-grade generation speed. Costs a
  binary format and a build artifact kept in sync with the word list.
- **A&J over a plain flat trie, built at cold start** — **chosen.** Same input,
  scale, build cost, and memory profile as boggle's existing trie; no new
  artifact. The complexity moves into the generator code (anchors, cross-check
  sets, left-part/right-extension, blanks) — a one-time educational cost, and
  this codebase is explicitly partly for the pleasure of owning a good
  implementation of a classic algorithm.

### The trie: boggle's flat trie + one addition

Scrabble's generator needs exactly what boggle's solver needs from its trie —
child-by-letter, terminal flag, enumerate-children (blanks, cross-checks). Two
deltas, both in what's fed in, not the structure:

- **2-letter words must be included** (essential for parallel plays; boggle
  filters to 3+), cap at 15 letters (board width).
- **Terminal nodes carry the word's difficulty rating (1..6)** so the single
  all-words, band-agnostic trie can answer the two-band predicate at query
  time. A 2-letter word in the trie is harmless under a strict `dict_2` — its
  terminal check just fails the difficulty test.

This makes the trie builder a candidate for promotion from
`src/boggle/lib/solver.ts` into `common/` with both games consuming it
(the extract-early-to-seed-design pattern) — **decision point for Joel** at
build time: extract shared vs. copy scrabble-local (extraction touches boggle,
which needs its own regression pass).

### Strength slider (later, designed now)

The generator always produces the *complete* scored move list, so strength is
purely post-processing on that list — no new architecture, and it composes as
a per-game setup option if this ever becomes an AI opponent. Three levers,
best used together:

1. **Vocabulary difficulty cap** — the AI only *plays* words with
   `difficulty ≤ cap` (game-band legality unchanged). The most human-feeling
   nerf: a weak bot that still drops QOPH on a triple feels wrong; a bot that
   knows fewer words loses the way a real friend loses. `common.words` already
   has the 1..6 rating — a one-line predicate in the ranking pass. (Woogles'
   weaker bots use restricted lexica for exactly this reason.)
2. **Score-fraction target** — pick the move closest to X% of the best
   available score (100% → best play, ~60% → gentle). Smooth and directly
   slider-tunable. **Do not use pick-the-Nth-best**: rank is a noisy proxy —
   sometimes 1st..3rd are 42/41/40 (no nerf), sometimes 95/38/36 (erratic
   nerf). A variant with personality: sample from the top handful weighted by
   score.
3. **Leave heuristic fade-out** at the low end — a diffuse, long-horizon
   weakening (worse racks over time); invisible per-move, so it's a component,
   not the headline lever.

Sketch: max strength = full vocab, 100% target, leave on; low = difficulty ≤ 2
vocab, ~60% target, leave off.

## Verified codebase anchors

Facts checked against the code on 2026-07-08 — build on these, don't re-derive
(or worse, guess) them:

- **Board / play model** (`src/scrabble/lib/board.ts`, `play.ts`): the board is
  a flat 225-element `Cell[]` (`Cell = { l: string; b: boolean } | null`,
  uppercase letters, `b` = came-from-a-blank); `cellIndex(x, y) = y * 15 + x`
  (x = column, y = row). A move is `Placement[] =
  [{ x, y, letter, blank }]` — `letter` is the played (declared, for a blank)
  uppercase letter. Rack glyphs are `'A'..'Z'` plus `'?'` (`BLANK`).
  `evaluatePlay(board, placements)` is pure and returns
  `{ valid, words, score, bingo }` — the single scoring authority the suggester
  reuses.
- **The server predicate** (`play_word`, scrabble migration): a word is legal
  iff `common.words.difficulty <= (len = 2 ? dict_2 : dict_3plus)` **and**
  `(american or british)`. Nothing about crude/slur/slang — profanity is legal
  in scrabble. The suggester must match this exactly.
- **The bands are grant-hidden.** `scrabble.games`' column grant enumerates
  safe columns and deliberately omits `dict_2`/`dict_3plus` (and `bag`). An
  edge function using the anon key + the caller's Authorization header can
  read `board` and `shared_rack` but **not the bands** — hence the definer
  RPC in S4. Precedent: `codenamesduet.get_clue_context` (same shape: definer,
  `common.require_game_player`, play-state check, returns jsonb, execute
  granted to `authenticated`).
- **Coop state**: `shared_rack` + `board` + `version` (optimistic-concurrency
  move counter) all live on the `scrabble.games` row → one `SELECT` is an
  atomic, mutually consistent snapshot.
- **The boggle trie** (`src/boggle/lib/solver.ts`): flat typed-array trie,
  `children: Int32Array` (`node * 26 + letter`), `eow: Uint8Array` (0/1),
  lowercase a–z only, self-contained module (no imports). `buildTrie(words)`
  grows by doubling; ~283k words build sub-second.
- **The boggle bundle can NOT be reused** (`generate-boggle-wordlist.ts` /
  `boggle-build-board/wordlist.ts`): it ships only `len >= 3`, carries no
  dialect flag (its `clean` flag = american AND non-crude — not the
  `american OR british` scrabble needs), and has no length cap. Scrabble needs
  its own generated asset (S1).
- **Deno import graph**: edge functions import FE `src/` modules directly
  (boggle's `dict.ts` → `src/boggle/lib/solver.ts`) but Deno requires
  **explicit `.ts` extensions on the whole transitive graph**.
  `allowImportingTsExtensions` is already on in both tsconfigs and the boggle
  libs already follow the convention. Concretely: `play.ts` imports
  `'./board'` extensionless today — that one import must become
  `'./board.ts'` before an edge function can pull in `play.ts` (S2/S4).
- **Deploy pipeline**: `npm run deploy` runs `boggle:wordlist` first; the
  generated `wordlist.ts` is git-ignored. The scrabble equivalent slots in
  beside it (npm script + `.gitignore` entry + deploy chain).
- **pgTAP** lives in `supabase/tests/scrabble/`; baseline-migration edits are
  the alpha-stage convention for schema changes.

## Plan

Stages are ordered so each lands green (tsc / eslint / Vitest) and independently
committable. One small schema change — the read-only definer RPC in S4 — goes
into the baseline scrabble migration (alpha convention) with a small pgTAP
block; everything else is read-only over existing state.

### S1 — trie groundwork

Give the flat trie difficulty-carrying terminals and a scrabble word set
(2..15 letters, all bands, `american OR british`).

**Rated terminals — one byte, backward compatible.** Repurpose `eow` from a
0/1 flag to `0 = not a word, 1..6 = the word's difficulty`. Every existing
boggle check is a truthiness test (`if (eow[node])`), so rated terminals
degrade to the old behavior for free. Builder change:
`buildTrie(words, ratings?)` — an optional parallel `readonly number[]`;
`eow[node] = ratings ? ratings[i] : 1`. Boggle call sites don't change.

The legality predicate the whole feature hangs on (main words AND
cross-checks — write it once):

```ts
// matches play_word's SQL by construction; the dialect filter is applied
// at bundle time, so the trie only contains american-or-british words
const isLegal = (node: number, len: number): boolean => {
  const d = trie.eow[node]
  return d !== 0 && d <= (len === 2 ? bands.dict2 : bands.dict3plus)
}
```

- **Decision point first**: extract the trie builder to `common/lib/` (boggle
  migrates onto it; run boggle's solver tests + the C parity oracle) vs. copy
  into `src/scrabble/lib/`. **Ask Joel.** → **RESOLVED at build time: extract.**
  The trie lives at `common/lib/game/trie.ts`; boggle's `solver.ts` re-exports
  it (so `./solver` stays boggle's import surface) and the C parity oracle
  stayed green. Concrete diff surface of each:
  - *Extract*: move `Trie`/`buildTrie` (~40 lines) to a `common/lib/` home
    (consult [common-layout.md](common-layout.md) placement rules); boggle's
    `solver.ts` re-exports or imports it; touched boggle surface = one import
    in `solver.ts` + one in `boggle-build-board/dict.ts`; regression pass =
    boggle solver Vitest + the C parity oracle test. The change to the trie
    itself is additive, so risk is low — this is the
    extract-early-to-seed-design default.
  - *Copy*: `src/scrabble/lib/trie.ts`, ~90 duplicated lines, zero boggle
    risk, permanent double-maintenance of a core structure.
- **New bundling script** `supabase/scripts/generate-scrabble-wordlist.ts`
  (clone the boggle one), emitting
  `supabase/functions/scrabble-suggest-move/wordlist.ts`. Line format
  `"<difficulty><word>"` (no clean flag — scrabble doesn't filter on it).
  Query: `select difficulty, word from common.words where len between 2 and
  15 and (american or british) order by difficulty, word`. Wire up:
  `"scrabble:wordlist"` npm script, prepend to `deploy` beside
  `boggle:wordlist`, add the generated file to `.gitignore` (same comment
  block).
- Vitest: build a rated trie from a small fixture list and assert
  `isLegal` against a hand-computed table — both lengths (a 2-letter word
  gated by `dict2`, a 3+ word by `dict3plus`), a word above the band, a
  non-word, and prefix-but-not-word nodes.

### S2 — the move generator (the hard part)

`src/scrabble/lib/suggest.ts` (pure TS, no I/O):

```ts
export type Bands = { dict2: number; dict3plus: number }

/** Every legal move, as placement sets. Words + score come from
 *  evaluatePlay (play.ts stays the single scoring authority). */
export function generateMoves(
  board: Cell[], rack: readonly string[], trie: Trie, bands: Bands,
): Placement[][]
```

Inputs are the FE's own shapes: `Cell[]` (flat 225) and rack glyphs
(`'A'..'Z'` / `'?'`). The trie is lowercase — convert at the boundary, once.
Emitted `Placement.letter` is uppercase (what `play.ts` and `play_word`
expect). The generator returns **placements only**; S3 runs `evaluatePlay`
over each for words/score — so the suggester's scores can't drift from the
game's, and `evaluatePlay`'s geometry gate doubles as a free internal
assertion (a generator bug surfaces as `valid: false`, which tests treat as a
failure).

**The A&J recipe, adapted to this codebase.** Implement for horizontal
(across) plays only, then run twice — once on the board, once on its
transpose — and swap x/y back on the second pass's placements. Details that
are easy to get wrong, spelled out:

1. **Rack as a multiset.** Track `counts[27]` (26 letters + blank), not an
   array of glyphs — decrement/increment around recursion. This makes dedup
   of repeated tiles (two E's, two blanks) automatic: identical tiles can't
   generate the same move twice.
2. **Cross-check masks, per pass.** For every *empty* square, a 26-bit mask
   of letters that keep the perpendicular word legal, plus a "has
   perpendicular neighbors" flag. No vertical neighbors → all-ones mask.
   Otherwise read the contiguous run above (prefix) and below (suffix); walk
   the prefix through the trie **once**, then for each candidate letter `c`
   step to `children[prefixNode * 26 + c]` and walk the suffix; allowed iff
   `isLegal(endNode, prefixLen + 1 + suffixLen)`. Cross words are routinely
   length 2 — this is why the trie must carry 2-letter words, and the
   per-length band split (`dict2`) applies *here*, not just to main words.
   Board blanks participate as their declared letter (`Cell.l`), exactly as
   `formedWords` reads them.
3. **Anchors.** Empty squares orthogonally adjacent to ≥1 occupied square
   (any of the 4 directions — a square with only a *vertical* neighbor is
   still an anchor in the across pass; the main word may be just that one new
   tile riding on cross words… see point 7). Empty board: the single anchor
   is `CENTER`, masks are all-ones.
4. **Left parts.** For each anchor, if the square left of it is **occupied**:
   the left part is forced — walk the maximal occupied run ending at
   `anchor - 1` through the trie from the root (if the walk dies, this anchor
   yields nothing across; that's correct — existing tiles need not spell a
   word prefix). Otherwise recursively build left parts from the rack over
   the squares left of the anchor, up to
   `limit = number of consecutive empty NON-anchor squares immediately left`.
   Two invariants ride on "non-anchor": (a) *dedup* — a play whose tiles
   reach further left would cover an earlier anchor and is generated there
   instead, so every move is emitted exactly once; (b) *no cross-checks
   needed in left parts* — non-anchor ⇒ no perpendicular neighbors ⇒ any
   letter is vertically safe. Build the left part as a letter list; when
   recursing into ExtendRight, materialize its placements at columns
   `anchor - len .. anchor - 1` (you only know the offset once the length is
   fixed).
5. **ExtendRight(col, node, placements)** — from the anchor rightward:
   - *Occupied square*: follow the board letter through the trie
     (`children[node*26 + lower(cell.l)]`); dead node → return. No rack use,
     no cross-check, no emit while standing on it.
   - *Empty square (or past the right edge)*: **emit-check first** — record a
     move iff `col > anchorCol` (the anchor square itself has been filled)
     AND `isLegal(node, col - wordStartCol)`. Then, if
     in bounds and empty, for each letter with `counts > 0` that is both a
     trie child and in the square's cross-check mask: place
     (`{x: col, y: row, letter, blank: false}`), recurse to `col + 1`,
     backtrack. If `counts[blank] > 0`, additionally branch over every
     mask∩children letter with `blank: true` — a natural tile and a blank
     playing the same letter are *both* emitted (different scores; both
     legal; ranking sorts them out).
   - **The emit guard is the subtle part.** `col > anchorCol` is what
     enforces "the move covers its anchor": since the anchor is empty by
     definition, covering it means a tile was placed, which simultaneously
     guarantees ≥1 new tile (no all-board "moves") *and* connectivity to the
     existing tiles (or center coverage on the first move) *and* kills the
     duplicate/floating emissions a left-part-only word would produce.
     Emitting only on an empty square or past the edge enforces right-side
     maximality (never emit a run that abuts an existing tile on the right);
     left-side maximality is structural (forced-prefix or non-anchor-empty
     left neighbor). Word length for the band check is
     `col - wordStartCol` where `wordStartCol = anchorCol - leftLen`
     (forced prefixes count). Length ≥ 2 needs no explicit check — 1-letter
     strings aren't in the trie.
6. **First move**: no occupied squares → anchor = `CENTER` only, left-part
   limit up to 7 (rack size bounds it anyway). Both passes run; a horizontal
   opening and its vertical twin are *different* placements — keep both.
7. **Dedup across the two passes.** A single-tile play that forms both an
   across and a down word is emitted by both passes with identical
   placements. Canonicalize each move — placements sorted by `(y, x)`,
   serialized `"x,y,letter,blank"` joined — and collapse via a `Map`. (This
   key is also the parity-test currency, below.)

Performance framing: cross-check masks are O(225 × 26 × walk) per pass and
generation is bounded by rack permutations against a 15-wide row — single-digit
milliseconds typical, tens worst case. This runs once per click, not in a
rejection-sampling loop, so **clarity beats boggle-solver-style
micro-optimization**; plain recursion, allocate freely.

**Test strategy is the load-bearing choice.** Alongside example-based Vitest
cases, write a naive brute-force reference generator *in the test file*:

```
for k in 1..rackSize, for each distinct k-permutation of the rack multiset
  (each '?' expanded to all 26 letters, flagged blank):
  for each orientation × each start square:
    lay the tiles in order, skipping over occupied squares (bail if off-board)
    keep iff evaluatePlay(board, placements).valid
         AND every formed word passes the trie isLegal predicate
    → collect canonical keys
```

and assert **exact move-set equality** (both directions, with a readable diff
of missing/extra keys) against `generateMoves`. Keep the brute force dumb —
its only virtue is being obviously correct. Cost control: racks ≤ 5 tiles,
≤ 1 blank; that's ~325 permutations × 450 start/orientation pairs, and
`evaluatePlay` fails fast — comfortably fast for ~50 randomized cases. Use a
seeded PRNG (mulberry32-style) and print the seed in the failure message.
Randomized boards can be **random connected tile soup** — existing runs don't
need to be real words, because *neither* generator revalidates untouched runs
(matching `play_word`, which only checks the submitted words); soup shakes out
cross-check bugs that curated boards hide. Handcrafted classics to pin
alongside:

- hook: one S pluralizing an existing word while starting a new one (found by
  both passes → exercises dedup)
- parallel play forming several 2-letter cross words (exercises `dict2` in
  cross-checks: same board, strict vs loose `dict2`, different move sets)
- bridge play through existing tiles; extension of an existing word on both
  ends
- blank duplicating a natural rack letter (both variants present, scores
  differ)
- left part limited by a neighboring anchor (the dedup rule, exercised
  deliberately)
- words ending flush at column 14; first-move cases (must cover center,
  min 2 tiles)

### S3 — ranking

`src/scrabble/lib/rank.ts`: score every candidate via the existing `play.ts`
scoring, add the hand-rolled leave heuristic, return sorted top-N.

```ts
export type RankOptions = {
  topN?: number           // default 5
  vocabCap?: number       // strength lever 1: only *play* words with difficulty <= cap
  scoreFraction?: number  // strength lever 2: target this fraction of the best equity
  useLeave?: boolean      // strength lever 3: default true
}
export type RankedMove = {
  placements: Placement[]
  words: FormedWord[]   // from evaluatePlay — what the FE displays
  score: number         // what the game will actually award (incl. bingo)
  leave: number         // heuristic equity of the tiles kept
  equity: number        // score + leave — the sort key
}
export function rankMoves(
  board: Cell[], moves: Placement[][], rack: readonly string[],
  wordDifficulty: (word: string) => number,  // trie lookup; vocabCap needs it
  opts?: RankOptions,
): RankedMove[]
```

`leave` is computed on `rack minus tilesUsed(placements)` (the helper already
exists in `play.ts`). Hand-rolled heuristic — first-order Maven, all weights
as named constants with teaching comments (they're the tunable surface; the
values below are sane starting points, in points of expected future score):

- **Per-tile residual values** (`LEAVE_TILE`): blank **+24** (its worth is
  option value — it converts near-bingos into bingos), S **+8** (the premier
  hook tile; each *additional* S only ~+3 — hooks don't stack), Z +4, X +3,
  then small positives for the flexible workers (E +2, R/N/T/L/A/H +1) and
  negatives for the clunkers (G −1, U −2, W −2, V −3, J −2, **Q −8** — Q's
  face value flatters a tile that regularly strands a turn).
- **Q-without-U** (`LEAVE_Q_NO_U = −4`, on top of Q's base): applies when the
  leave holds Q with no U and no blank.
- **Duplicates** (`LEAVE_DUP = −2.5` per copy beyond the first, per letter):
  duplicate tiles overlap in the words they enable.
- **Vowel/consonant balance** (`LEAVE_IMBALANCE = −1.5` per unit of
  `abs(vowels − consonants)` beyond 1, blanks counting as neither): a
  6-consonant leave and a 5-vowel leave are both stuck racks.

One deliberate simplification, worth its comment: leave value is a *future*
-turns quantity, so it overweights late in the game — when the bag is empty
the truth is closer to "unplayed tiles are pure liability." Good-not-expert
target says ignore that; note it as a known bias rather than modeling it.

Strength levers (S5 ships max strength only; the signature is ready):
`vocabCap` filters any move whose formed words include one with
`wordDifficulty(w) > cap`; `scoreFraction` picks the move nearest
`fraction × best equity` instead of the max; `useLeave: false` drops the
leave term.

### S4 — the context RPC + edge function `scrabble-suggest-move`

**Correction from the original sketch.** "Read the game row as the caller"
doesn't work for the bands: `dict_2`/`dict_3plus` are deliberately excluded
from the column grant on `scrabble.games` (that's *how* they're server-only).
The sanctioned door is a SECURITY DEFINER context RPC —
`codenamesduet.get_clue_context`'s exact shape. Still no service role: the
RPC does the authorization itself.

**`scrabble.get_suggest_context(target_game uuid) returns jsonb`** — added to
the baseline scrabble migration (alpha convention), definer,
`set search_path = scrabble, common, public, extensions`:

1. `caller_id := common.require_game_player(target_game)` — membership is the
   authorization.
2. Reject unless the game's `common.games.play_state = 'playing'` and
   `mode = 'coop'` ("suggestions are a coop feature" lives *here*, not in the
   edge fn).
3. Return `jsonb_build_object('board', board, 'rack', shared_rack,
   'dict_2', dict_2, 'dict_3plus', dict_3plus, 'version', version)` from one
   `SELECT` — an atomic snapshot (a teammate's concurrent play can't tear
   board from rack), and `version` lets the FE detect a suggestion that went
   stale in flight (coop has no turns, so this race is real).
4. `revoke execute … from public; grant execute … to authenticated` (repo
   convention).

pgTAP (`supabase/tests/scrabble/`): non-member rejected; compete game
rejected; non-playing game rejected; coop player gets all five keys with the
right values.

**The edge function** (`supabase/functions/scrabble-suggest-move/`), the
boggle-fn skeleton:

- `index.ts`: preflight → POST only → `{ game_id }` → require Authorization →
  `callerClient(authHeader)` from `_shared/startGame.ts` →
  `.schema('scrabble').rpc('get_suggest_context', …)` (forward errors as 403,
  the suggest-clue pattern; the `.schema()` call is required — supabase-js
  defaults to `public`) → `await` the cached trie → **synchronous**
  generate + rank (the boggle no-await-inside-the-loop lesson: awaits before
  and after the compute, never inside) → log the full ranked output
  (keep-logs convention) → respond.
- `dict.ts`: decode the gzip+base64 `wordlist.ts` (`"<difficulty><word>"`
  lines) once per isolate; build **one** all-bands rated trie, memoised as a
  singleton — unlike boggle there are no per-band tries, because the band
  check moved to query time via the rated terminals.
- Response: `{ moves: RankedMove[] /* top 5 */, version }`. Placements ride
  along so the FE can later stage/preview them; `words` + `score` feed the
  text display.
- Imports reach into `src/scrabble/lib/` with explicit `.ts` extensions —
  including fixing `play.ts`'s `'./board'` import (see anchors).

### S5 — FE

Coop-mode suggest button + result display in scrabble's `InfoCol`, following
the codenamesduet clue-suggester conventions (busy state, generic feedback
tone). **Reserve fixed-height space for the suggestion display** — the
no-reflow-on-state-change rule; a suggestion appearing must not grow the
column and shift the board.

- **Staleness**: compare the response's `version` to the FE's current
  `games.version`; if a teammate played while the suggestion was in flight,
  show a "board changed — ask again" feedback instead of a wrong hint.
- **The natural "apply" affordance** is the suggest-clue convention mapped to
  scrabble: a suggestion fills the *staging* state (the same mechanism a
  player placing tiles uses — and that `SharePreviewButton` already
  broadcasts), so the player reviews the ghost tiles on the board and commits
  through the normal play flow. Suggest-then-stage keeps the suggester
  advisory — it never submits. If wiring staging is more than trivial, a
  text-only list (word · score · start square · direction) is an acceptable
  first cut; say so in the commit rather than half-staging.

### S6 — docs

- New section in [games/scrabble.md](games/scrabble.md) (suggester
  architecture, band predicate, edge fn calling shape).
- Update this file's Status; move open questions to answers.
- cheatsheet.md entry.

### Deferred (explicitly out of scope for the first build)

- Strength slider (designed above; ranking signature ready for it).
- AI opponent (would sit on the same edge fn + a turn-taking loop).
- Compete-mode "hints allowed" setup toggle.
- LLM coaching explanations for suggested moves.
- Suggesting an **exchange** (or pass) when the best play's equity is poor and
  the bag has tiles — a real strategic move the generator can't express; the
  leave heuristic already contains the machinery to rank which tiles to dump.
- Endgame-aware leave (bag empty → leave value flips sign; noted in S3).
- Precomputed minimized GADDAG + simming (the known upgrade path; only if
  generation throughput ever matters).

## References

- Appel & Jacobson, *The World's Fastest Scrabble Program*, CACM 1988.
- Gordon, *A Faster Scrabble Move Generation Algorithm*, Software P&E 1994.
- Sheppard, *World-championship-caliber Scrabble*, Artificial Intelligence 2002
  (Maven: leaves, simming, B* endgame).
- Quackle (github.com/quackle/quackle); Macondo (github.com/domino14/macondo).
