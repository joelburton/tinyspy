# StackDown (codename `stackdown`)

A mahjong-style word game. Thirty letter tiles are stacked so only "exposed"
tiles are selectable; the player clears the board by finding six 5-letter
words in sequence, each found word permanently removing its tiles and exposing
the ones beneath.

> **Brand = codename here.** User-facing name is **StackDown**; the identifier
> everywhere in code / DB / schema is `stackdown`. (Unlike SyrupSwap/`waffle`
> and WordNerd/`wordle`, the two happen to be the same word — only the casing
> differs.)

StackDown is a **coop / compete sibling pair** like the other multiplayer
games (`stackdown_coop`, `stackdown_compete`), and inherits the shared chrome
— timer (or none), chat, presence-pause, manual "End game" — through
`<GamePage>` + `useCommonGame`.

---

## 1. Rules

- The board holds **30 tiles** on a fixed geometry with a covering (stacking)
  relationship. A tile is **exposed** (selectable) iff no remaining tile covers
  it. Every tile's letter is visible from the start — there is no hidden board;
  the puzzle is figuring out the words, not uncovering letters.
- You build a word by clicking exposed tiles **one at a time, in order**. Each
  clicked tile is **removed at the moment of selection** (it leaves the board
  and joins the word-in-progress strip below), which may **expose** tiles it was
  covering — those become available for the *same* word, later in the sequence.
- **The word is the selection sequence.** Letters are read off in click order.
  This is the rule that matters: because a tile can only be reached once its
  coverers are gone, the order tiles can be reached constrains which words are
  spellable — even among anagrams (you can spell `BROAD` but not `BOARD` if the
  `A` only frees up after its covering `R` is removed). See §2.3.
- When five clicked tiles spell a word **in the lexicon**, the word is accepted:
  those five tiles are removed **permanently** and the word is logged. Play
  continues with the next word.
- A five-letter sequence that is **not** in the lexicon is rejected — the tiles
  **return to their original board positions** and "invalid word" is logged. You
  can try again.
- A word in progress can be **abandoned** before completion: clicking a tile in
  the word-in-progress strip returns it *and every tile selected after it* to
  the board (in their correct positions). Only a **completed, accepted** word is
  irreversible.
- The board is solved when all 30 tiles are cleared as **six** accepted words.

### Coop vs compete

- **Coop** — one **shared** board. Any player can click; the in-progress
  selection is shared live (the wordknit peer-selection pattern) so everyone
  watches the same word form. A word accepted by anyone advances the shared
  board. The team wins when all six words are found; the countdown expiring (if
  a timer is set) is a shared loss.
- **Compete** — every player gets the **same starting board** but plays it
  **independently**. You see nothing of opponents except their running tally —
  `Found words: Joel 2 · Moth 1`. It's a **race**: the **first** player to clear
  all six words wins immediately; if the timer expires with no winner, everyone
  loses.

---

## 2. Board model

### 2.1 Geometry (fixed)

An integer 9×9 grid: each tile occupies a cell `(x, y, z)` (`z = 0` base, higher
= raised). Neighbouring tiles are two cells apart; a raised tile sits one
diagonal step from each base tile it rests on. **Positions and the covering DAG
are a constant** — the same physical shape every puzzle (like the reference
board). Only the *letters* vary between boards. This shrinks generation to a
letter-assignment problem on a fixed DAG.

### 2.2 Covering rule

Tile **A covers B** iff `A.z > B.z` **and** `|A.x − B.x| ≤ 1 && |A.y − B.y| ≤ 1`
(the `≤ 1`, not `< 1`, is because the integer layout places overlapping tiles
exactly one cell apart diagonally). A tile is **exposed** iff no *remaining* tile
covers it. The covering relation is a DAG; exposed tiles are its sources among
the remaining tiles.

### 2.3 Sequence-as-word (the correctness crux)

A candidate word must be read off the **ordered sequence** of clicks, never the
multiset of tiles. Anagrams like `BROAD`/`BOARD` share a tile multiset but the
reveal mechanic gates *which orders are physically achievable*. A validator that
checks "do five reachable tiles anagram to a legal word?" is **wrong** — it
would accept `BOARD`. Read the word off the order.

### 2.4 The hard constraint — uniqueness *and* no traps

There is no undo once a word is *completed*, so the board must never let a
player paint themselves into a corner. The naive invariant (from the original
spec) was:

> At the start of each round, the set of words obtainable as a valid selection
> *sequence* must be exactly `{ Wi }`.

**That is necessary but NOT sufficient**, and we have the regression to prove
it. A board can satisfy it and still be unsolvable: with duplicate letters a
word has multiple tile-completions, and one completion can consume a tile a
later word needs. Real example from a generated board — after the first three
words, `BROOK` had **three** completions; only one removed the `O` whose
departure exposed `LOUSE`'s `L`. The other two stole `LOUSE`'s own `O`, leaving
the board unsolvable — even though `BROOK` was the *only reachable word*.

The invariant we actually enforce (`strictValidate`):

> At each round the only completable lexicon-word is `Wi`, **AND every
> tile-sequence that spells `Wi` leaves a board that is itself strictly valid
> for the remaining words.**

Because completed words can't be returned, *all* completions must stay solvable.
This is checked by enumerating every spelling of `Wi` and recursing (memoized on
the remaining-tile set). The lesson worth carrying: **uniqueness-of-word ≠
no-traps**; validate against *all* completions, not one.

### 2.5 One lexicon, pinned

A single word list serves as both the solution dictionary and the set of
accepted words — currently the **Wordle answer list (~2,314 words)** (this may
become configurable later; no UI for that now). The same list must be used for
**generation and runtime validation**: validating against a larger list reports
phantom forks (rejects good boards), a smaller one misses real forks. So the
runtime word-acceptance check and the generator's lexicon are the same pinned
set (`common.words`, the Wordle-answer slice).

---

## 3. Pre-generated boards (our decision)

**Boards are pre-generated offline and stored in a library table; games claim a
board from it. We are not generating live.**

Why: a board on the fixed geometry is just 30 letters + 6 words — a few hundred
bytes — so a library of thousands is a tiny table and, for a friends group,
effectively infinite (you'd never see a repeat). Live generation that's reliably
fast (~0.5 s) would need the constructive **repair loop** (relabel/swap the
offending tile and re-validate from that round, instead of restarting) — the
spec's deferred hard problem, made harder by strict validation, and the most
complex code in the project. The benefit over a big static library is ~nil, so
it isn't worth that complexity.

Generation throughput is fine for offline use: a few seconds per board under
strict validation (the strict check lowered the accept rate vs. the old weak
one; the occasional pathological word-set is skipped at a 30s budget). An
overnight or lunch-hour run produces a year's worth. The generator is a `gen`
script that writes a committed file; a separate cheap `import` step loads it —
see §5.4.

---

## 4. Board-construction algorithm (strategy)

Do **not** generate random boards and test them — the strict invariant makes the
accept rate vanishingly small. Generate **constructively**, then validate:

1. **Fix the geometry** (§2.1). Only letters vary.
2. **Reverse construction** (guarantees a solution exists). Pick six target
   words `W1…W6`. Take a random topological removal order of all 30 tiles, chop
   it into six consecutive groups of five (group *i* ↔ `Wi`). Because the
   grouping respects a removal order, "play `W1`, then `W2`, …" is always
   physically legal — solvability is free.
3. **Letter assignment** (the genuinely hard step, deferred-smart). For each
   group, find a bijection (letter → tile) such that *some* reveal-respecting
   order of those tiles spells `Wi`. The current approach brute-forces the 5!
   permutations per group and keeps the first spellable one — adequate at this
   scale, explicitly a placeholder for a smarter constructive assignment.
4. **Strict validation** (§2.4). Replay forward; accept only if every round has
   `Wi` as its sole completable word **and** every completion of `Wi` leaves a
   strictly-valid remainder. Reject otherwise and try a fresh order/word-set.
5. **Word selection.** Bias toward six-word sets with low duplicate-letter
   overlap — fewer shared letters → fewer accidental forks/traps → higher accept
   rate and fairer puzzles.

Practical shape: an outer loop over random word-sets, an inner loop over random
topo-orders + assignment, accepting on the first strictly-valid board (~half of
random word-sets yield one; the rest are skipped after a bounded attempt cap).

A **prototype** validated all of this — the model, the sequence-aware validator
(BROAD-yes/BOARD-no), the generator, and a click-to-remove UI — living outside
git in `stackdown-proto/` (gitignored, like `monkeygram-ui/`).

---

## 5. Schema / RPCs / FE

Built as the standard sibling-manifest pair (`stackdown_coop`, `stackdown_compete`)
on a per-gametype `stackdown` schema. Migration: `supabase/migrations/20260626000000_stackdown.sql`.

### 5.1 Tables

| table | what it holds | visibility |
|---|---|---|
| `stackdown.boards` | the pre-generated library: `tiles` jsonb, `words text[]` (the six, in clearing order), `wordlist int` (0 = Wordle list) | **definer-only** — `words` is the full spoiler; no grant to `authenticated` |
| `stackdown.games` | one row per game: `tiles` jsonb (PUBLIC), `solution text[]` (HIDDEN), `wordlist`, `mode`, `board_id` (provenance) | `tiles` granted; `solution` **column-excluded** |
| `stackdown.players` | `(game_id, user_id)` → `found_count` (public tally), `solved` / `solved_at` (compete winner) | club members |
| `stackdown.submissions` | the durable word log, `(game_id, user_id, seq)` → `word`, `tile_ids int[]`, `valid` | coop: all; compete: own (until terminal) |

The hidden-solution pattern is the same as the other answer-hiding games (waffle,
wordle): a column-grant excludes `solution`, and the `games_state`
`security_invoker` view exposes it via `_solution_for(id)`, which returns NULL
until `common.games.is_terminal`. The FE reads `games_state`, never the base
table, so it can read one shape and only ever sees the words once the game ends.

`board_id` is `on delete set null` — **retiring a board does not delete games
built from it**. A game copies the board's `tiles` / `words` / `wordlist` at
creation, so it's self-contained; `board_id` is provenance only.

### 5.2 RPCs (all `security definer`)

- **`create_game(target_club, setup, player_user_ids, mode)`** — club-member +
  player-count (≤6) + timer checks, then claims a random board (`order by
  random() limit 1`, raising if the library is empty), copies its tiles/words/
  wordlist onto a new `stackdown.games`, seeds one `players` row each, flips to
  `playing`.
- **`submit_word(target_game, tile_ids int[]) → jsonb`** — the core move. Locks
  the games row (`for update`); computes the already-removed set (coop = every
  valid submission, compete = the caller's); validates the five tiles are
  distinct, unremoved, and **reachable in the given order** (replaying
  `_is_exposed` tile-by-tile — the server is the authority on legality, not the
  FE); logs the submission (valid OR invalid — both are durable rows); on a valid
  word bumps `found_count` and, on the sixth, ends the game (coop → `won`,
  compete → `won_compete` with `winner = caller`). Returns
  `{result: 'accepted'|'invalid', word, terminal}`.
- **`submit_timeout(target_game)`** — countdown expiry: coop → `lost`, compete →
  `lost_compete` (a race, so no winner if it gets here).
- **`end_game(target_game)`** — manual neutral stop → `ended`.
- **`reveal_next_word(target_game) → text`** — a **cheat**: returns the next
  solution word the caller still has to clear (`solution[cleared + 1]`; NULL once
  all six are gone), defeating the hidden-solution invariant on purpose. It exists
  to verify generated boards are solvable in order (and as a playtest hint), and
  may be removed once boards are trusted. Gated like a move (game player,
  in-progress only). Because strict validity forces clearing in solution order,
  the count of cleared words is exactly the index of the next one. The FE
  surfaces it two ways in the right column during play, both writing to the
  header feedback slot: a **Reveal word** button (the word itself) and a
  **Reveal hint** button that runs the next word through the common `define`
  lookup (read-through cache → Wiktionary, the same path click-to-define uses)
  and shows ONLY its definition, not the word.

`submit_timeout` / `end_game` go through `common.end_game` (which writes
`common.games`, not `stackdown.*`), so each does a realtime "touch"
(`update stackdown.games set club_handle = club_handle`) to wake the FE's
per-schema subscription.

### 5.3 Frontend (`src/stackdown/`)

- **`lib/board.ts`** — the display half of the board logic, ported from the
  prototype: `covers`, `exposedIds`, `depthMap` (layer-below-frontier for the
  depth shading), `letterCorner` (tuck a covered tile's letter into a free
  quadrant). Pure; Vitest in `board.test.ts`.
- **`hooks/useGame.ts`** — the broadcast-coupled realtime hook (the wordknit
  pattern): one stable-name channel carrying postgres-changes on `games_state` /
  `players` / `submissions` **and** the coop shared-word Broadcast. The board the
  player sees is `game.tiles` minus `removedTileIds` (valid-submission tiles, plus
  a brief optimistic hold so an accepted word doesn't flash back during the
  realtime round-trip) minus `currentWord` (the tiles picked up into the word
  being built). In coop the in-progress word is shared peer-to-peer; the
  Broadcast carries `append` / `retract` / `clear` plus a `commit` event (an
  accepted word — kept distinct from `clear` so peers hold its tiles removed
  optimistically too; without it a peer's grid would flash the tiles back on
  between the word clearing and the realtime refetch). In compete the word is
  local (senders short-circuit). Only the client that places the fifth tile
  submits — remote peers just apply the broadcast — so a coop word isn't
  double-submitted.
- **`components/`** — `Board` (stacked tiles, depth color, corner letters, only
  exposed tiles clickable; tiles are percentage-positioned in a responsive square
  canvas — `container-type` + `cqi` typography — so the board grows to fill a
  roomy viewport and stays on-screen on a small one), `WordEntry` (the five-slot
  word under the board; clicking a slot returns that tile and every tile after
  it), `FoundWords` (the right-column submission log — valid words listed,
  clickable to define; invalid attempts struck through and tagged), `PlayArea`
  (two-column compose: board + entry on the left, OpponentStrip [compete] + log
  on the right; owns the submit + game-over), `SetupForm` (just the timer — the
  board is dealt at random), `Help`.
- **Keyboard input** (in `PlayArea`, via the shared `useGlobalKeyHandler`):
  Backspace returns the most recent tile; a letter key plays the matching tile —
  but only when exactly one exposed tile bears it (the word is the selection
  order, so an ambiguous letter can't pick for you). No match flashes feedback;
  more than one flashes feedback AND briefly outlines the candidate tiles in red
  (a `highlight` set passed to `Board`). The handler ignores keys aimed at chat /
  inputs.

### 5.4 Board generation — a two-step split (gen is slow, import is cheap)

Generation is a few seconds per board (the strict validation), too slow to
re-run across hundreds of boards on every `db:reset`. So it's split, mirroring
`words:import`'s vendored-file pattern:

- **`npm run stackdown:gen -- [count] [baseSeed]`** (`generate-stackdown-boards.ts`)
  — the SLOW half, run rarely. Loads the 5-letter Wordle lexicon from
  `common.words` (read-only), generates N strictly-valid boards on the fixed
  geometry, and **appends** them to `supabase/data/stackdown-boards.jsonl` (one
  JSON board per line — a committed, human-readable library that grows across
  runs; duplicate six-word sets are skipped). Reproducible: board *i* uses
  `baseSeed + i`. Does NOT touch the `stackdown` tables. Each board is bounded by
  a wall-clock budget (default 30s, `STACKDOWN_BOARD_TIMEOUT_MS`): a pathological
  word-set whose strict-validation search blows up is skipped rather than hanging
  the run. (Validation is also kept fast by pruning the `reachableWords` DFS to
  letter-prefixes of real words and precomputing the covering relation once.)
- **`npm run stackdown:import`** (`import-stackdown-boards.ts`) — the CHEAP half.
  Reads the JSONL file and replaces `stackdown.boards` with it (delete-all +
  insert, one transaction). **Run after every `db:reset`** — a reset wipes the
  table (plain table, not seeded by migrations), and `create_game` raises if the
  library is empty.

(Heads-up: `db:reset` also wipes `common.words`, which `stackdown:gen` reads — so
the usual post-reset sequence is `words:import` then `stackdown:import`. You only
re-run `stackdown:gen` when you actually want NEW boards.)

### 5.5 Tests

pgTAP under `supabase/tests/stackdown/`: `create_game` (board claim + hidden
solution + board-deletion survival), `gameplay` (a full coop solve), `compete`
(the race + per-player tally), `end_game` (manual stop), `reveal` (the cheat
tracks solution order + is player/in-progress gated). A shared fixture board
lives in `setup.psql` — which **deletes any library boards first** so
`create_game`'s `order by random()` can only pick the fixture (otherwise a
database that has run `stackdown:import` would have real boards in scope and the
fixture-encoded `sd_seq()` would spell the wrong tiles). FE: the `board.test.ts`
Vitest above.
