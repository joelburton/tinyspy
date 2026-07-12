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

- The board is **nine distinct letters**: one **centre** (drawn bigger, red) and
  **eight outer** tiles on a ring.
- A word is legal when it:
  1. is **≥ 4 letters** long,
  2. **includes the centre letter**, and
  3. **uses each tile at most once** — no letter repeats within a word (a letter can
     only be reused if it happens to appear on two different tiles, which never
     happens here since all nine are distinct).
- **Scoring** (same shape as spellingbee): a 4-letter word is **1 point**; a word of
  5+ letters scores **1 point per letter**. A **pangram** — a word using **all nine**
  letters (necessarily a 9-letter isogram) — earns a **+15** bonus on top of its
  length score. Every board has at least one pangram.
- Unlike spellingbee, **`s` is allowed** on the board and in words. spellingbee bars
  `s` because, when letters may repeat, an `s` pluralises almost everything; word
  wheel uses each tile **once**, so `s` is just an ordinary letter (as the classic
  wheel has it).

### The one algorithmic difference: multiset, not set

This "each tile used once" rule is the *entire* game-logic delta from spellingbee,
and it lives in exactly one conceptual place — **which words ship on the board**:

- spellingbee's legality is a **set** test: a word is legal iff its letter-*set* is a
  subset of the board's letters (multiplicity ignored) and it contains the centre.
  That's why spellingbee lets you reuse letters.
- word wheel's is a **multiset** test: with nine *distinct* wheel letters, a word is
  legal iff it is an **isogram** (all letters distinct) whose letter-set ⊆ the wheel
  **and** it contains the centre. Equivalently: `popcount(letter_mask) === length(word)`
  **and** subset **and** centre.

The board builder ships only isograms in the required/bonus lists (see
[Edge function](#edge-function-wordwheel-build-board)), and the FE membership check
is "is this word in the shipped list?" — so the used-once rule is enforced by list
membership, and `submit_word` can stay a trusting no-validation commit (same as
spellingbee). See [`candidate_words`](#why-candidate_words-does-not-enforce-used-once).

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
| **wheel** | the nine-tile board: one centre + eight outer tiles |
| **centre tile** | the mandatory letter (bigger, red); must appear in every word |
| **outer tiles** | the eight ring letters |
| **pangram** | a word using all nine letters once; +15 bonus |
| **required / legal bands** | vocabulary difficulty bands (see spellingbee.md → *Vocabulary*): `required` (default 3) = the displayed goal words; `legal` (default 5) = the wider accepted set. Words above `required` but ≤ `legal` are **bonus** (accepted + scored, but not part of the goal). |
| **rank ladder** | Start · Good · Solid · Nice · Great · Amazing · Genius (7 tiers); Genius at 70% of the required score. `src/wordwheel/lib/ranks.ts`. |

## Schema: `wordwheel.*`

Migration: `supabase/migrations/20260712000000_wordwheel.sql`. The shape mirrors
spellingbee; the deltas:

- **`wordwheel.games`** — the board row. `outer_letters char(8)` (eight, vs
  spellingbee's six) + `center_letter char(1)`, plus `required_words_score` /
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

A board is nine distinct letters containing a pangram, so the seed pool is the set of
**9-letter isograms**, deduped by letter-mask. spellingbee forces a *band-1* pangram,
which leaves only ~400 nine-letter isograms — too thin. Word wheel instead **tags each
seed with its difficulty** so the builder can scale the pool to the game's required
band:

| column | meaning |
|---|---|
| `mask bigint` (PK) | the 26-bit letter set of the nine letters |
| `difficulty int` | the **min** difficulty band of any 9-letter isogram with this mask (how hard the pangram itself is). The builder samples only seeds with `difficulty ≤ required_band`, so a higher-difficulty game draws from a *larger* pool. |
| `word_counts jsonb` | `[n1..n6]`: the count of required-quality words findable on this wheel at each band (centre-agnostic — a richness proxy). |
| `has_rare_letters boolean` | the diverse-builder weighting flag (`j q x z k v w y b f h`). |

~4,100 seeds after the import gate (≥ 15 required words at the seed's own difficulty).

### Why `candidate_words` does **not** enforce used-once

`wordwheel.candidate_words(puzzle_mask, center_bit, required_band, legal_band)` returns
the **pure subset set** — every legal-band word whose letter-set ⊆ the wheel and that
contains the centre. It deliberately does **not** filter out letter-reusing words
(e.g. `accede` on a wheel with `a c e d`). That **isogram post-filter
(`popcount(letter_mask) === word.length`) lives in the edge function**, where the
mask popcount is cheap. Keeping it there means the SQL helper stays a simple subset
join, and the rule has a single owner. `candidate_words_test.sql` guards this
explicitly (asserts both an isogram *and* a reuse word come back).

### `create_game` gate, custom letters, play states, status, title

- **Quality gate:** a random board must have **≥ 15** required words (`required_words_count`),
  vs spellingbee's ≥ 30 — used-once yields fewer words per board. (Provisional; tune
  against the seed data.) A **custom** board relaxes to ≥ 1.
- **Custom letters:** the player may supply their own **8 outer + 1 centre** (nine
  distinct letters; `s` allowed). Validated identically in `create_game`, the edge
  function, and `src/wordwheel/lib/setup.ts`.
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
  letters / centre / length / dictionary — and, in particular, it does not re-check the
  used-once rule (a non-isogram simply isn't in the shipped list, so the FE never
  submits it).
- `wordwheel.submit_timeout` / `end_game` / `replay_board` / `concede` — as spellingbee.
- Helper: `wordwheel._rank_idx(score, total)` — the shared 7-tier ladder.

## Edge function: `wordwheel-build-board`

`supabase/functions/wordwheel-build-board/index.ts` — a near-twin of
`spellingbee-build-board`. It samples a seed, picks a centre, enumerates words, scores
them, and calls `create_game` in one round-trip. The wordwheel-specific bits:

1. **Seed pool** — sample from `wordwheel.pangrams` **restricted to
   `difficulty ≤ required_band`** (this is what scales the pool with difficulty). Keep
   the diverse-builder heuristics: a previous-board **overlap cap** (≤ 5 of 9 letters
   shared) and **rare-letter weighting** (×3). No ING dampening — used-once removes the
   `-ing` explosion that motivated it in spellingbee.
2. **Centre** — pick uniformly from the nine letters, trying centres until one clears
   the ≥ 15 gate.
3. **Enumerate** — call `candidate_words`, then **post-filter to isograms**
   (`popcount(letter_mask) === word.length`) — the used-once rule. Partition required
   vs bonus exactly as spellingbee.
4. **Score** — `lengthScore(word) + (isPangram ? 15 : 0)`, where `isPangram` ⇔ the word
   uses all nine letters (`wMask === puzzleMask`).
5. Call `wordwheel.create_game(...)`.

A **custom board** path builds from exactly the player's nine letters (no sampling, no
overlap cap, no ≥ 15 gate — only ≥ 1 required word).

## Pangram seed import: `npm run wordwheel:import`

`supabase/scripts/import-wordwheel-pangrams.ts` rebuilds `wordwheel.pangrams`. It scans
`common.words` for **9-letter isograms** (`len === popcount(letter_mask)`), and for each
mask records its `difficulty` (min band), its `word_counts` per band (a mask-subset
scan of the whole required-quality pool), and `has_rare_letters`. Seeds whose required
set at their own difficulty is < 15 are dropped. Runs after `words:import` in the
`npm run import` chain (empty until `words:import` has run — the usual
[db-reset-needs-import](../../CLAUDE.md) gotcha).

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

`src/wordwheel/` mirrors spellingbee's layout (see spellingbee.md → *Folder layout* for
the shared pieces: `PlayArea` + `BoardCol`/`InfoCol` decomposition, `RankBar`, `Stats`,
`SetupForm`, `Help`, `useGame`, `db.ts`, `manifest.ts`, `theme.css`). The
wordwheel-specific parts:

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

### Used-once affordances

The used-once rule is surfaced in the UI two ways, both driven by which letters are
already in the typed word:

- **Disabled tiles** (`Wheel`/`Tile`): once a letter is in the current word, its tile
  is **inert + dimmed** (`pointer-events: none`, `opacity 0.4`, `aria-disabled`,
  `tabIndex -1`). `BoardCol` computes `usedLetters = new Set(word)` and passes it down;
  the tile re-enables the moment the letter leaves the word.
- **Dimmed repeats** (`TypedWord`): as the typed word renders character-by-character, a
  letter that is off the wheel **or repeats an earlier letter** renders dimmed — the
  same affordance used for off-board letters. The first use of a letter stays legal;
  its second occurrence dims.

### Realtime channels & code-splitting

`useGame` subscribes to `wordwheel.found_words` (+ a `wordwheel.games` subscription for
`replay_board`'s realtime touch), channel-prefixed `wordwheel`. The whole game lazy-loads
as its own chunk (help / PlayArea / SetupForm are `lazy`), and `theme.css` ships with it.

## Tests

### pgTAP (`supabase/tests/wordwheel/`)

Twelve files, ported from the spellingbee suite against a **9-letter isogram fixture**
(`setup.psql`: `outer='abcdfghi'`, centre `e`, 19 required words / score 62, with the
rank thresholds recomputed from that total). Notable wordwheel-specific tests:

- **`candidate_words_test.sql`** (no spellingbee analog) — asserts `candidate_words`
  returns both an isogram *and* a letter-reusing word, proving the used-once filter is
  **not** in the SQL helper (it's in the edge function); plus the centre + subset
  exclusions.
- **`schema_test.sql`** — includes the **realtime publication membership** assertion
  described above, alongside the gametype registration, readable seeds, and the
  unconditional word-list exposure on `games_state`.
- `create_game` / `gameplay` / `compete` / `custom_letters` / `concede` / `replay` /
  `reveal_partition` / `rls` / `player_subset` — the standard per-game coverage, with
  8-letter boards, +15 pangrams, the ≥ 15 gate, and `s` accepted.

### FE Vitest (`src/wordwheel/`)

Ports of spellingbee's suite (`ranks`, `letterMask`, `pangram`, `setup`, `displayRows`,
`PlayArea`) adjusted for nine letters / +15 / used-once, plus:

- **`TypedWord.test.tsx`** — the repeat-letter dimming (off-wheel *and* repeat dim; the
  first use of a letter stays legal).
- **`PlayArea.test.tsx`** — a used-once test: typing a letter disables its tile
  (`aria-disabled`), an untyped tile stays enabled, and backspacing re-enables it.
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

- The **≥ 15** quality gate (create_game + edge fn + import) is **provisional** — tune
  against real play / the seed `word_counts` distribution.
- The `SetupForm` custom-letters helper text is still `.muted`, kept for parity with
  spellingbee's form; revisit both together if muted setup copy is retired.
