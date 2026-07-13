# wordwheel

**Codename:** `wordwheel`  **Brand:** MooseWheel

A Guardian-*Word-Wheel*-style word finder: nine letters arranged on a wheel — one
central letter used in **every** word, eight outer letters around it — and you make
as many words as you can. It is a **targeted fork of [`spellingbee`](spellingbee.md)**;
the two games share almost all of their machinery (trusting-commit scoring, the
required/bonus/legal word bands, the diverse board builder, the rank ladder, the
sibling coop/compete manifest split). This doc documents wordwheel's **rules and
code**, and leans on spellingbee.md for the parts that are identical — read that
first, then this for the deltas.

## What the game is

### Rules

- The board is **nine tiles — a MULTISET of letters**: one **centre** (drawn bigger,
  red) and **eight outer** tiles on a ring. The same letter may appear on two (or
  more) tiles — a wheel with two `B` tiles is an ordinary board, and the centre may
  duplicate an outer.
- A word is legal when it:
  1. is **≥ 4 letters** long,
  2. **uses the centre tile** (⇒ contains the centre letter at least once), and
  3. **spends a tile per use** — a word may use a letter as many times as the wheel
     has tiles carrying it, and no more. When the centre duplicates another tile,
     the centre is considered **spent first** (that's what makes rule 2 and rule 3
     compose — one occurrence of the letter satisfies the centre); this ordering is
     a UI convention, not a separate legality rule.
- **Scoring** (same shape as spellingbee): a 4-letter word is **1 point**; a word of
  5+ letters scores **1 point per letter**. A **pangram** — a word using **all nine
  tiles**, i.e. any 9-letter word whose letters exactly match the wheel's multiset —
  earns a **+15** bonus on top of its length score. Every random board has at least
  one pangram (it's seeded from one).
- Unlike spellingbee, **`s` is allowed** on the board and in words. spellingbee bars
  `s` because, when letters may repeat freely, an `s` pluralises almost everything;
  word wheel spends a tile per use, so `s` pluralises at most once per `s` tile (as
  the classic wheel has it).

### The one algorithmic difference: bounded multiset, not set

This tile-spending rule is the *entire* game-logic delta from spellingbee, and it
lives in exactly one conceptual place — **which words ship on the board**:

- spellingbee's legality is a **set** test: a word is legal iff its letter-*set* is a
  subset of the board's letters (multiplicity ignored) and it contains the centre.
  That's why spellingbee lets you reuse letters without limit.
- word wheel's is a **bounded multiset** test: a word is legal iff, for every letter,
  its occurrences in the word ≤ the wheel's tiles carrying that letter, **and** it
  contains the centre. (A mask can't express this — masks collapse multiplicity — so
  the fit check counts letters.)

The board builder ships only multiset-fitting words in the required/bonus lists (see
[Edge function](#edge-function-wordwheel-build-board)), and the FE membership check
is "is this word in the shipped list?" — so the tile-spend rule is enforced by list
membership, and `submit_word` can stay a trusting no-validation commit (same as
spellingbee). See [`candidate_words`](#why-candidate_words-does-not-enforce-tile-multiplicity).

### Coop vs compete

Same sibling pattern as spellingbee (see spellingbee.md → *Coop vs compete* and
*Sibling-manifest at a glance*):

- **coop** (`wordwheel_coop`, 1–6 players): one shared find-list; everyone's words
  add to a shared score + rank. Ends on the timer or a manual **End game**.
- **compete** (`wordwheel_compete`, 2–6 players): private find-lists; first player to
  reach the chosen **target rank** wins. Opponents see each other's **rank only**, not
  words or numeric score.

`mode` is a positional arg on `create_game` and is **denormalised onto
`wordwheel.games.mode`** so RLS + RPC branching can read it without a join — identical
to spellingbee.

## Vocabulary

| term | meaning |
|---|---|
| **wheel** | the nine-tile board: one centre + eight outer tiles — a **multiset** (a letter may sit on two tiles) |
| **centre tile** | the mandatory tile (bigger, red); every word must use it — and when its letter is duplicated, the centre is spent first |
| **outer tiles** | the eight ring tiles |
| **pangram** | a word using all nine tiles (any 9-letter word fitting the wheel's multiset); +15 bonus |
| **required / legal bands** | vocabulary difficulty bands (see spellingbee.md → *Vocabulary*): `required` (default 3) = the displayed goal words; `legal` (default 5) = the wider accepted set. Words above `required` but ≤ `legal` are **bonus** (accepted + scored, but not part of the goal). |
| **rank ladder** | Start · Good · Solid · Nice · Great · Amazing · Genius (7 tiers); Genius at 70% of the required score. `src/wordwheel/lib/ranks.ts`. |

## Schema: `wordwheel.*`

Migration: `supabase/migrations/20260712000000_wordwheel.sql`. The shape mirrors
spellingbee; the deltas:

- **`wordwheel.games`** — the board row. `outer_letters char(8)` (eight, vs
  spellingbee's six; **duplicates allowed**, and the centre may repeat an outer) +
  `center_letter char(1)`, plus `required_words_score` /
  `required_words_count` and the two shipped word lists. Immutable during play (the
  terminal flag lives on `common.games`).
- **`wordwheel.found_words`** — one row per accepted word. PK `(game_id, user_id, word)`.
  **Published to `supabase_realtime`** — this is load-bearing; see
  [Realtime](#realtime-the-live-update-invariant).
- **`wordwheel.games_state`** — the view the FE reads. Exposes the header columns
  **plus both word lists unconditionally** (during play and at terminal). The word
  lists are **not hidden**: the FE validates + scores guesses locally against them,
  and the missed-words reveal at terminal is a client-side `required − found`. (The
  base `games` table has a column-level grant blocking `authenticated`; the view is
  the only read path.)

### The seeds table: `wordwheel.pangrams`

A board is a nine-letter **multiset** containing a pangram, so the seed pool is the
set of **9-letter words** deduped by their sorted-letter string — any 9-letter word's
letters ARE a pangram-bearing wheel. The multiset is the board's identity, so the
sorted string is the PK (a bitmask can't be — masks collapse multiplicity, and
anagram classes with repeats can share a mask). spellingbee forces a *band-1*
pangram; word wheel instead **tags each seed with its difficulty** so the builder
can scale the pool to the game's required band:

| column | meaning |
|---|---|
| `letters char(9)` (PK) | the wheel's nine letters, sorted (e.g. `aabcdeghi`) — the canonical multiset key |
| `mask bigint` (generated) | the **distinct-letter** set of `letters`, via `common.word_letter_mask` — kept for the two set-semantics consumers (the overlap cap + the `candidate_words` subset pre-filter); generated so it can never drift |
| `difficulty int` | the **min** difficulty band of any required-quality 9-letter word with this multiset (how hard the pangram itself is). The builder samples only seeds with `difficulty ≤ required_band`, so a higher-difficulty game draws from a *larger* pool. |
| `word_counts jsonb` | `[n1..n6]`: the count of required-quality words whose letter-counts **fit** the multiset at each band (centre-agnostic — a richness proxy). |
| `has_rare_letters boolean` | the diverse-builder weighting flag (`j q x z k v w y b f h`). |

**~36,700 seeds** after the import gate (≥ 15 required words at the seed's own
difficulty; ~37,300 candidates, so nearly everything clears — the kept seeds' median
is ~107 required words at their own band, the dropped seeds' median 11). Only ~4,700
of these are all-distinct wheels, so most real boards carry a duplicate letter.

### Why `candidate_words` does **not** enforce tile multiplicity

`wordwheel.candidate_words(puzzle_mask, center_bit, required_band, legal_band)` returns
the **pure subset set** — every legal-band word whose letter-*set* ⊆ the wheel's
distinct letters and that contains the centre. It deliberately does **not** filter out
words demanding more of a letter than the wheel has tiles (e.g. `accede` on a wheel
with one `c` and one `e`). That **multiset-fit post-filter (per-letter counts of the
word ≤ the wheel's tile counts) lives in the edge function**, where counting letters
is cheap. Keeping it there means the SQL helper stays a simple subset join, and the
rule has a single owner. `candidate_words_test.sql` guards this explicitly (asserts
both a fitting word *and* an over-demanding word come back).

### `create_game` gate, custom letters, play states, status, title

- **Quality gate:** a random board must have **≥ 15** required words (`required_words_count`),
  vs spellingbee's ≥ 30 — tile-spending yields fewer words per board than unbounded
  reuse. (The import's distribution print shows kept seeds clear it comfortably —
  median ~107 at their own band.) A **custom** board relaxes to ≥ 1.
- **Custom letters:** the player may supply their own **8 outer + 1 centre**
  (**duplicates allowed** — the wheel is a multiset, and the centre may repeat an
  outer; `s` allowed). Validated identically in `create_game`, the edge function,
  and `src/wordwheel/lib/setup.ts`. A custom board doesn't guarantee a pangram
  (nothing says the player's multiset spells a 9-letter word).
- **Board constraint — "unique letters only"** (`setup.unique_letters`, a
  "Board constraints" disclosure in `SetupForm`): when on, the edge function
  samples only seeds whose nine letters are all distinct (`new Set(letters).size
  === 9`), applied before the overlap cap so both compose. **Random boards only**
  — a custom board keeps the player's letters as chosen. If the constraint empties
  the pool at the required band the builder returns a specific 500 (drop the
  constraint or raise the difficulty). Stored in the `setup` jsonb; no migration
  (`create_game` doesn't whitelist setup keys).
- **Play states, `status` jsonb, title formula** — identical to spellingbee (title is
  `<CENTRE>·<OUTER-SORTED>`, e.g. `E·ABCDFGHI`).

## RPCs

Signatures and behaviour match spellingbee one-for-one (only the schema name + the
board shape differ). See spellingbee.md → *RPCs* for the full contracts.

- `wordwheel.create_game(target_club text, setup jsonb, player_user_ids uuid[], mode text, board jsonb) → table(id uuid)`
- `wordwheel.submit_word(target_game uuid, word text, points int, is_pangram boolean, is_bonus boolean) → jsonb`
  — **trusting-commit**: the FE already validated the word against the shipped list and
  scored it, so this trusts `word`/`points`/`is_pangram`/`is_bonus`, dedups (per mode),
  inserts, and recomputes aggregates + the compete win. It does **not** re-validate
  letters / centre / length / dictionary — and, in particular, it does not re-check
  tile multiplicity (an over-demanding word simply isn't in the shipped list, so the
  FE never submits it).
- `wordwheel.submit_timeout` / `end_game` / `replay_board` / `concede` — as spellingbee.
- Helper: `wordwheel._rank_idx(score, total)` — the shared 7-tier ladder.

## Edge function: `wordwheel-build-board`

`supabase/functions/wordwheel-build-board/index.ts` — a near-twin of
`spellingbee-build-board`. It samples a seed, picks a centre, enumerates words, scores
them, and calls `create_game` in one round-trip. The wordwheel-specific bits:

1. **Seed pool** — sample from `wordwheel.pangrams` **restricted to
   `difficulty ≤ required_band`** (this is what scales the pool with difficulty). Keep
   the diverse-builder heuristics: a previous-board **overlap cap** (≤ 5 *distinct*
   letters shared — set semantics on the generated `mask`, which is all its job needs)
   and **rare-letter weighting** (×3). No ING dampening — tile-spending removes the
   `-ing` explosion that motivated it in spellingbee.
2. **Centre** — pick uniformly from the seed's **distinct** letters, trying centres
   until one clears the ≥ 15 gate. (Two duplicate tiles as centre would make the
   identical board — same centre letter, same outer multiset — so trying both is
   wasted work, and tile-uniform sampling would bias centres toward duplicated
   letters for nothing.) The outer letters are `seed.letters` minus **one**
   occurrence of the centre.
3. **Enumerate** — call `candidate_words`, then **post-filter to multiset fits**
   (per-letter counts of the word ≤ the wheel's tile counts) — the tile-spend rule.
   Partition required vs bonus exactly as spellingbee.
4. **Score** — `lengthScore(word) + (isPangram ? 15 : 0)`, where `isPangram` ⇔
   `word.length === 9` (a 9-letter word that fits nine tiles necessarily uses every
   one of them).
5. Call `wordwheel.create_game(...)`.

A **custom board** path builds from exactly the player's nine letters — duplicates
allowed — (no sampling, no overlap cap, no ≥ 15 gate — only ≥ 1 required word).

## Pangram seed import: `npm run wordwheel:import`

`supabase/scripts/import-wordwheel-pangrams.ts` rebuilds `wordwheel.pangrams`. It scans
`common.words` for **9-letter words**, dedupes them by sorted-letter string (anagrams
share a board), and for each multiset records its `difficulty` (min band), its
`word_counts` per band, and `has_rare_letters`. Seeds whose required set at their own
difficulty is < 15 are dropped (~600 of ~37,300).

**The counting algorithm is submask enumeration**, not a per-seed pool scan: the
~272k-word required-quality pool is grouped by exact letter-mask once (isograms
pre-bucketed by band — they fit any containing wheel unconditionally; repeat-letter
words kept individually with their repeated letters' counts); each seed then walks
only the ≤ 2⁹ = 512 submasks of its own mask, summing isogram counts wholesale and
count-checking just the repeat-words. ~20M map lookups instead of ~10 billion subset
tests — the import runs in seconds. It also prints a percentile report of
required-words-at-own-band for kept vs dropped seeds (the data behind the ≥ 15 gate
decision). Runs after `words:import` in the `npm run import` chain (empty until
`words:import` has run — the usual [db-reset-needs-import](../../CLAUDE.md) gotcha).

## Row-level security

Identical to spellingbee: membership-gated reads; coop shows the shared find-list,
compete restricts opponents to rank-only mid-game and reveals at terminal. See
spellingbee.md → *Row-level security*.

## Realtime: the live-update invariant

Every submission appends a `wordwheel.found_words` row. `src/wordwheel/hooks/useGame.ts`
subscribes (via the shared `useRealtimeRefetch`) to `postgres_changes` on
`wordwheel.found_words` filtered by `game_id`, and **refetches the whole find-list on
each event** (Pattern A). The **score, the word list, and the rank are all derived from
`foundWords`**, so this one event drives every live update — including the submitter's
own.

For this to work, **`wordwheel.found_words` must be a member of the
`supabase_realtime` publication** (the migration does `alter publication
supabase_realtime add table wordwheel.found_words`). If it isn't, submissions still
persist but nothing updates live until a manual refresh — the score sits still and the
word never appears in the list.

> **Operational gotcha:** adding a table to the publication via a migration applied by
> `supabase db reset` does **not** restart the Realtime service, so a service that was
> already running won't deliver the new table's changes until a **`supabase stop &&
> supabase start`**. If live updates seem broken right after adding this game, restart
> the stack.

`schema_test.sql` asserts the publication membership so a *dropped* publish line (the
permanent version of this failure) is caught in CI.

## Frontend

`src/wordwheel/` mirrors spellingbee's layout. After the 2026-07 dedup
(code-review-2026-07-12 → **D2** + **D4**) the two games split cleanly into three buckets:

- **Shared, hoisted into `common/` (D2).** The pieces that were byte-identical
  after a codename rename now live once, so a fix lands for both games: the rank
  ladder (`common/lib/game/rankLadder`), the found-words data model + display +
  leaderboard (`common/lib/game/foundWords*`), the `useGame` factory
  (`common/hooks/game/makeFoundWordsGame`), and the `RankBar` / `Stats`
  components (`common/components/game/`, themed via generic `--rank-*` tokens
  each game's `theme.css` aliases).
- **Deliberately forked — per-game siblings (D4, decision (a)).** `PlayArea`,
  `BoardCol`, `InfoCol`, `SetupForm`, and `lib/setup.ts` are 85–98% identical to
  spellingbee's but are kept as separate copies **on purpose**. Their deltas are
  load-bearing game logic — the bounded-**multiset** legality (per-letter counts,
  tile-spend) vs spellingbee's **set** test, the wheel vs honeycomb geometry, the
  `unique_letters` control, 8 vs 6 outer letters, the `s`-rule — i.e. exactly
  where the two games' identities live, and the two are still diverging
  (`unique_letters` is wordwheel-only). A shared "hive-family" component
  parameterized on set-vs-multiset would bury that distinction behind a flag on
  the hottest path, so we keep the fork. **Implication:** a change to one game's
  `PlayArea` / `BoardCol` / `SetupForm` must be mirrored into the other by hand.
  (`InfoCol` is a ~1-line delta — just the `unique_letters` `<li>` — and could be
  folded via an `extraSetupItems` prop if that ever feels worth it; left forced
  for now for symmetry with its siblings.)
- **Per-game seams by design** (not duplicates to eliminate): `Help` (rules
  copy), `db.ts` (schema-scoped client), `manifest.ts` (brand lives only here),
  `theme.css` (palette).

The genuinely wordwheel-only parts (no spellingbee counterpart):

### The wheel board — `Wheel` / `Tile` + `lib/wheel.ts`

- **`lib/wheel.ts`** is the single geometry source, shared by the on-screen board and
  the PDF export (so they can't drift). The wheel is nine SVG **circles** in a
  300×300 unit box: a bigger centre plus eight outer tiles on a ring. The radii are
  derived from two **tangency** conditions so the tiles **touch** — adjacent outer
  tiles kiss each other (`OUTER_R = RING_R·sin(π/8)`) and each touches the centre
  (`CENTER_R = RING_R − OUTER_R`), making the centre ≈1.6× an outer tile.
- **`Wheel.tsx`** draws the SVG (`viewBox 0 0 300 300`), scaled by `--u` so the whole
  board sizes with the column. **`Tile.tsx`** is one `<circle>` + `<text>`; the centre
  gets the red `--wordwheel-accent` fill + white glyph, the outer tiles the warm
  `--wordwheel-tile` ramp. Clicking a tile appends its letter (no validation — the
  shipped-list check happens on submit).
- **Theme tokens** (`theme.css`): `--wordwheel-accent` (moderately-saturated red, the
  centre tile + the achieved RankBar tier), `--wordwheel-accent-edge`,
  `--wordwheel-center-text` (white), `--wordwheel-tile` / `--wordwheel-tile-text`.

### Tile-spend affordances

The tile-spend rule is surfaced in the UI two ways, both driven by per-letter
**counts** of the typed word (`BoardCol` computes `typedCounts: Map<letter, count>`;
`PlayArea` computes the wheel's `letterCounts` the same way):

- **Spent tiles** (`Wheel`/`Tile`): each occurrence of a letter in the current word
  spends **one** of its tiles — **inert + dimmed** (`pointer-events: none`,
  `opacity 0.4`, `aria-disabled`, `tabIndex -1`) — in the wheel's **spend order**:
  the centre first when it carries the letter (the game rule: the mandatory use
  consumes the centre), then outer duplicates in display order. `Wheel` computes
  each tile's ordinal among same-letter tiles and dims tile *k* when the word holds
  more than *k* occurrences; a tile re-enables the moment an occurrence leaves the
  word (in reverse spend order — the centre frees last). A shuffle can swap *which*
  visual twin is dimmed — accepted: twins are identical and the dimmed count is
  always right.
- **Dimmed over-counts** (`TypedWord`): as the typed word renders
  character-by-character, a letter that is off the wheel **or exceeds its tile
  count** renders dimmed — with *k* tiles of a letter, occurrences 1..k stay legal
  and the (k+1)th dims.
- **Submit is vetoed, not rejected, for a word the wheel can't spell.** A word
  with an off-wheel letter or an over-used tile (`!wordFitsWheel`, the boolean
  twin of the edge fn's `fitsTiles`) leaves the Submit button + Enter inert
  (`EntryRow`'s `submitDisabled`) — editing stays live so you can fix it. So a
  word like `FOOD` on a wheel without F/O can't submit and read as "not a word"
  (i.e. "not in the dictionary"), which was the misleading old behaviour.
  Consequently `explainReject` only ever fires for a *fitting* word: it names the
  `missing center letter` or falls back to `not a word` — the earlier `bad
  letters` / `not enough tiles` reasons are now unreachable (the veto caught them
  first) and were dropped.

### Realtime channels & code-splitting

`useGame` subscribes to `wordwheel.found_words` (+ a `wordwheel.games` subscription for
`replay_board`'s realtime touch), channel-prefixed `wordwheel`. The whole game lazy-loads
as its own chunk (help / PlayArea / SetupForm are `lazy`), and `theme.css` ships with it.

## Tests

### pgTAP (`supabase/tests/wordwheel/`)

Twelve files, ported from the spellingbee suite against two fixtures in `setup.psql`:
the all-distinct board (`outer='abcdfghi'`, centre `e`, 19 required words / score 62,
with the rank thresholds recomputed from that total — a perfectly valid multiset that
keeps all the ported coverage working) and **`wordwheel_dup_board()`**, the
duplicate-letter fixture (wheel `{a,b,c,d,e,e,f,g,g}`, centre `e` duplicated on an
outer tile, `g` on two tiles, the synthetic pangram `abcdeefgg`). Notable
wordwheel-specific tests:

- **`candidate_words_test.sql`** (no spellingbee analog) — asserts `candidate_words`
  returns both a fitting word *and* an over-demanding (letter-repeating) one, proving
  the multiset-fit filter is **not** in the SQL helper (it's in the edge function);
  plus the centre + subset exclusions.
- **`schema_test.sql`** — includes the **realtime publication membership** assertion
  described above, alongside the gametype registration, readable seeds (keyed by
  `letters`, with a guard that the generated `mask` matches
  `common.word_letter_mask`), and the unconditional word-list exposure on
  `games_state`.
- **`create_game_test.sql`** — accepts duplicate outers + a centre repeating an outer
  (title `E·ABCDEFGG` — duplicates appear twice, sorted); `custom_letters_test.sql`
  accepts duplicate custom letters; `gameplay_test.sql` smokes a repeat-letter word
  (`egged`) through trusting-commit on the dup board.
- `compete` / `concede` / `replay` / `reveal_partition` / `rls` / `player_subset` —
  the standard per-game coverage, with 8-letter boards, +15 pangrams, the ≥ 15 gate,
  and `s` accepted.

### FE Vitest (`src/wordwheel/`)

Ports of spellingbee's suite (`ranks`, `letterMask`, `setup`, `displayRows`,
`PlayArea`) adjusted for nine tiles / +15 / tile-spending (the old `pangram.ts` lib +
test were deleted — "is a pangram" can't be answered from the word alone under
multisets, and the shipped entry's `is_pangram` was already the authority
everywhere), plus:

- **`TypedWord.test.tsx`** — count-based dimming: off-wheel dims; on a single-tile
  wheel the 2nd occurrence dims; on a two-e/two-g wheel `BEE` and `EGGED` are fully
  legal and a third `E` dims.
- **`PlayArea.test.tsx`** — tile-spend tests: typing a letter dims its tile
  (`aria-disabled`), an untyped tile stays enabled, backspacing re-enables it; on a
  wheel whose centre is duplicated, one occurrence spends the **centre first** (the
  outer twin stays clickable), the second spends the twin, and backspace frees the
  twin before the centre. Plus the `not enough tiles` reject reason.
- **`src/logos.test.ts`** (repo-wide) — asserts every game's `logo.svg` parses as valid
  standalone XML. Added after the wordwheel logo shipped once with a `--` (double
  hyphen) in an XML comment, which is illegal and made the file fail to render as an
  `<img>`.

## Printing the board (PDF)

`src/wordwheel/pdf/printWordwheelPdf.ts` composes the shared `common/pdf` helpers (frame
+ word-list columns) with a wordwheel-specific board callback that draws the nine-circle
wheel from the same `lib/wheel.ts` geometry. On the greyscale printable page the centre
tile is distinguished the two ways that survive greyscale: it's larger and has a thicker
border. See [docs/pdf.md](../pdf.md).

## File locations

| what | where |
|---|---|
| Migration | `supabase/migrations/20260712000000_wordwheel.sql` |
| Edge function | `supabase/functions/wordwheel-build-board/index.ts` |
| Seed import | `supabase/scripts/import-wordwheel-pangrams.ts` (`npm run wordwheel:import`) |
| Frontend | `src/wordwheel/` |
| Board geometry | `src/wordwheel/lib/wheel.ts` (shared: board + PDF) |
| pgTAP tests | `supabase/tests/wordwheel/` |
| Registry | `src/games.ts`; schema in `supabase/config.toml` `[api].schemas` |

## Open / deferred

- The **≥ 15** quality gate (create_game + edge fn + import) is **provisional** — the
  import's percentile print (kept p50 ≈ 107 required words at own band, dropped
  p50 ≈ 11) says it's comfortably placed for now; tune against real play if boards
  feel thin or bloated.
- **`s`-heavy seeds**: an `s` tile lets each word pluralise once — the classic
  wheel's behavior, kept deliberately. If wheels with an `s` (especially an `s`
  *centre*, which makes every word an s-word) feel too plural-y in play, a
  seed-level filter (or centre exclusion) is a one-line follow-up in the import /
  edge fn.
- The `SetupForm` custom-letters helper text is still `.muted`, kept for parity with
  spellingbee's form; revisit both together if muted setup copy is retired.
