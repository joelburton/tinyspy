# stackdown

A mahjong-style word game. Thirty letter tiles are stacked so only "exposed"
tiles are selectable; the player clears the board by finding six 5-letter
words in sequence, each found word permanently removing its tiles and exposing
the ones beneath.

> **Brand ≈ codename here.** User-facing brand is **StackDown**; the identifier
> everywhere in code / DB / schema is the codename `stackdown`. (Unlike
> waffle/SyrupSwap, wordle/WordNerd, or scrabble/RackAttack — where brand and
> codename are genuinely different words — here the two are the same word, only
> the casing differs.)

stackdown is a **coop / compete sibling pair** like the other multiplayer
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
- When five clicked tiles spell a real word, the word is accepted: those five
  tiles are removed **permanently** and the word is logged. Play continues with
  the next word. (The board only ever exposes the six solution words, so "a real
  word" and "the next solution word" coincide — the server checks the latter, no
  dictionary needed; see §2.5.)
- A five-letter sequence that is **not** in the lexicon is rejected — the tiles
  **return to their original board positions** and "invalid word" is logged. You
  can try again.
- A word in progress can be **abandoned** before completion: clicking a tile in
  the word-in-progress strip returns it *and every tile selected after it* to
  the board (in their correct positions). Only a **completed, accepted** word is
  irreversible.
- The board is solved when all 30 tiles are cleared as **six** accepted words.

### Coop vs compete

- **Coop** — one **shared** board, but each player builds words
  **independently**: in-progress selections are *private*, not broadcast, so
  teammates try words in parallel instead of taking turns on one shared word.
  What's shared is the result — a word accepted by anyone removes its tiles from
  the board for everyone, and every submission (found / bad word, hint / word
  request) shows up in the right-column history for the whole team. The team
  wins when all six words are found; the countdown expiring (if a timer is set)
  is a shared loss. (Two players can build from the same tile at once; whoever
  submits a valid word first claims it, and the other's in-progress word — now
  missing a tile — resets.)
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

### 2.5 The lexicon is a *generation-time* concern only

The word list is chosen per generation run by a **band** — a
`common.words.difficulty` level (`difficulty = band AND american AND slur = 0
AND crude = 0 AND len = 5`). `band 1` is the everyday set; `band 2` is the next
tier, and a band-N board is made **entirely** of band-N words (no lower-band
words mixed in). Whichever set a board is generated against is what the no-trap
check enumerates completions against, so a board is solvable and fork-free
*with respect to it*. The band is recorded on the board (and copied onto the
game); the setup form offers bands 1–2 today (that's what the board library
holds), and `create_game` claims a random board **of the chosen band**.

> **Hints + higher bands.** `reveal_next_hint` reads `common.words.hint`, which
> is populated for the band-1 (len-5) set but not yet for every band-2 word — so
> a band-2 clue can come back blank until those hints are backfilled.

**Runtime does not consult a lexicon at all.** Because the strict invariant
(§2.4) guarantees the only completable word at each round is the solution word
`Wi`, `submit_word` simply checks the submission against the next solution word
(`solution[cleared + 1]`, the same cleared-count math as `reveal_next_word`).
Even if a stray board ever slipped a non-solution legal word past the generator,
we'd never want to accept it — so there's nothing to gain from a dictionary
lookup, and adding one would only couple runtime validation to the generator's
exact word list ("pin runtime to the same list or get phantom forks") for no benefit.

**Word case.** Words are stored **lowercase** everywhere — `boards.words`,
`games.solution`, and the logged `submissions.word` — matching `common.words`
and the app's "store lowercase, display uppercase" convention; the FE uppercases
for display. Tile `letter`s stay **uppercase** (they're board glyphs, rendered
as-is), so `submit_word` lowercases the letters it reads off the tiles before
comparing to the (lowercase) solution.

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
git in `stackdown-proto/` (gitignored, like `bananagrams-ui/`).

---

## 5. Schema / RPCs / FE

Built as the standard sibling-manifest pair (`stackdown_coop`, `stackdown_compete`)
on a per-gametype `stackdown` schema. Migration: `supabase/migrations/20260626000000_stackdown.sql`.

### 5.1 Tables

| table | what it holds | visibility |
|---|---|---|
| `stackdown.boards` | the pre-generated library: `tiles` jsonb, `words text[]` (the six, in clearing order), `band int` (word-difficulty 1..6; the pool `create_game` filters on) | **definer-only** — `words` is the full spoiler; no grant to `authenticated` |
| `stackdown.games` | one row per game: `tiles` jsonb (PUBLIC), `solution text[]` (HIDDEN), `band`, `mode`, `board_id` (provenance) | `tiles` granted; `solution` **column-excluded** |
| `stackdown.players` | `(game_id, user_id)` → `found_count` (public tally), `solved` / `solved_at` (compete winner) | club members |
| `stackdown.submissions` | the durable game log, `(game_id, user_id, seq)`. `kind`: `'word'` (a played word → `word` / `tile_ids` / `valid`) or `'hint'` / `'reveal'` (a logged cheat request → `for_word_index`, plus the revealed text in `word`: the hint clue or the revealed word, for the log to show). | coop: all; compete: own (until terminal) |

The hidden-solution pattern is the standard [SECURITY DEFINER helper + security_invoker view](../code-conventions.md#security-definer-helper--security_invoker-view) shared with the other answer-hiding games (waffle, wordle): a column-grant excludes `solution`, and the `games_state` view exposes it via `_solution_for(id)`, which returns NULL until `common.games.is_terminal`. The FE reads `games_state`, never the base table.

`board_id` is `on delete set null` — **retiring a board does not delete games
built from it**. A game copies the board's `tiles` / `words` / `band` at
creation, so it's self-contained; `board_id` is provenance only.

### 5.2 RPCs (all `security definer`)

- **`create_game(target_club, setup, player_user_ids, mode)`** — club-member +
  player-count (≤6) + timer + band (1..6) checks, then claims a random board
  **of the chosen band** (`where band = <setup.band, default 1> order by random()
  limit 1`, raising if no board of that band exists), copies its tiles/words/
  band onto a new `stackdown.games`, seeds one `players` row each, flips to
  `playing`.
- **`submit_word(target_game, tile_ids int[]) → jsonb`** — the core move. Locks
  the games row (`for update`); computes the already-removed set (coop = every
  valid submission, compete = the caller's); validates the five tiles are
  distinct, unremoved, and **reachable in the given order** (replaying
  `_is_exposed` tile-by-tile — the server is the authority on legality, not the
  FE); logs the submission (valid OR invalid — both are durable rows); on a valid
  word bumps `found_count` and, on the sixth, ends the game (coop → `won`,
  compete → `won_compete` with `winner = caller`). Returns
  `{result: 'accepted'|'invalid', word, terminal}`. On a valid **coop** word it
  also rewrites `common.games.title` to the cleared words (see [Title
  formula](#title-formula)).
- **`submit_timeout(target_game)`** — countdown expiry: coop → `lost`, compete →
  `lost_compete` (a race, so no winner if it gets here).
- **`end_game(target_game)`** — manual neutral stop → `ended` (**coop**; compete shows Concede).
- **`concede(target_game)`** — the compete per-player drop-out. stackdown is a race to clear (first to clear wins, no elimination), so it's a **thin wrapper over `common.concede`** (compete-only guard): marks the caller out, ends as a collective loss only when the last racer drops. FE: `<ConcedeGameButton>` in compete, conceder "out" in the OpponentStrip, "You conceded" locally-terminal look. See [common.md → Concede](../common.md#concede--per-player-drop-out). pgTAP: `concede_test.sql`.
- **`reveal_next_word(target_game) → text`** — a **cheat**: returns the next
  solution word the caller still has to clear (`solution[cleared + 1]`; NULL once
  all six are gone), defeating the hidden-solution invariant on purpose. It exists
  to verify generated boards are solvable in order (and as a playtest hint), and
  may be removed once boards are trusted. Gated like a move (game player,
  in-progress only). Because strict validity forces clearing in solution order,
  the count of cleared words is exactly the index of the next one. The FE surfaces
  it as a **Reveal word** action button in the info-column action row during play
  (writing its answer to the **local** below-board feedback slot — it's the
  player's own request). It also **logs the request** — a `kind='reveal'`
  submission row storing the revealed word (shown in the log as "Revealed:
  <WORD>") so the ask persists in the game log; deduped
  per `(player, for_word_index)` so repeated clicks don't spam, and serialized by
  the games-row `for update` lock (for a collision-free `seq`).
- **`reveal_next_hint(target_game) → text`** — the softer sibling: returns the
  next word's **hint** (`common.words.hint` — a curated clue that points at the
  word without naming it), NULL once all six are cleared. Same gating + next-word
  math as `reveal_next_word`, but the word never reaches the client — only the
  hint text crosses the wire. Every stackdown word is a 5-letter Wordle word, so
  it's always in `common.words`' hint set; no fallback. The FE's **Reveal hint**
  action button shows it in the same local below-board feedback slot. Logs a `kind='hint'` request row
  storing the clue text (shown in the log as "Hint: <clue>") the same way. Both requests ride the submissions RLS, so a
  coop request shows to everyone and a compete one only to the requester.

`submit_timeout` / `end_game` go through `common.end_game` (which writes
`common.games`, not `stackdown.*`), so each does a realtime "touch"
(`update stackdown.games set club_handle = club_handle`) to wake the FE's
per-schema subscription.

### Title formula

A stackdown game is created titled **"New game"** (the gametype logo, not the
title, identifies the game in the club list — so a static "stackdown" title
would just be noise).

**Coop** then rewrites the title to the words cleared so far, on every valid
word: the first three, uppercased and `-`-joined, with a trailing `…` once a
fourth is cleared — `EAGLE`, `EAGLE-TABLE`, `EAGLE-TABLE-PLANS`,
`EAGLE-TABLE-PLANS…`. The club list reads a coop game's progress at a glance,
and the final value persists into history (`end_game` doesn't touch the title).
This reveals nothing new — coop's cleared words are shared and already on the
GameTurnLog panel. The formula is `stackdown._found_title(solution, n)`.

**Compete** keeps the create-time "New game". Its found words are hidden from
the opponent (same board, same hidden solution, raced independently — only
`found_count` is public), so putting them in the *shared* club-list title would
hand a trailing racer the upcoming words. The non-spoiler invariant wins over a
prettier title here.

### 5.3 Frontend (`src/stackdown/`)

stackdown is a **v3** game (`docs/design-decisions.md`): it renders on the shared
two-column PlayArea scaffold (`common/components/game/PlayArea.module.css` — `.layout` /
`.boardCol` / `.infoCol` / `.actionSlot`). The board column holds the stacked-tile
board, the five-slot `WordEntry`, and a fixed-height **local feedback slot**; the
info column runs **state → opponent strip → action row → help → setup → log** in
that fixed order. Feedback is **split** the canonical way: the player's OWN move
results (a rejected word, a keystroke matching no/too-many exposed tiles, a
reveal's answer, an error, the terminal verdict) show as a centered
`<FeedbackPill>` in the local slot; **peer** narration goes to the GLOBAL header
pill (with the teammate's identity disc). An accepted / rejected word additionally
flashes its letters green/red in the `WordEntry` ring (strong outcome colors) — so
the local pill carries only the results a ring can't.

- **`lib/board.ts`** — the display half of the board logic, ported from the
  prototype: `covers`, `exposedIds`, `depthMap` (layer-below-frontier for the
  depth shading), `letterCorner` (tuck a covered tile's letter into a free
  quadrant). Pure; Vitest in `board.test.ts`.
- **`lib/history.ts`** — the turn-history replay (pure + unit-tested; stackdown is
  where this feature was born — see docs/playarea-decomposition.md). Given the
  submission log and a turn's **position** in it, reconstruct the board *as it was
  about to be played*: the full stack minus tiles cleared by valid words at positions
  **strictly before** it — so the viewed turn's own word is still ON the board (ringed
  green) and the stack is *fuller* than live — plus a kind-aware description ("entered
  EBATL — not a word", "requested hint", "revealed LEMON"). The removal-based twin of
  scrabble's `boardUpToSeq`; keyed by **log position** (the `#N` the log shows), not
  `submissions.seq`, because the per-submitter `seq` is ambiguous and non-chronological
  across a shared coop log. Clicking a `GameTurnLog` row's `#N` opens that turn on the
  board via the shared viewer (the same one scrabble/waffle use — frame + banner +
  keystroke/click/✕ exits documented in [ui.md → Turn-history viewer](../ui.md#turn-history-viewer)).
- **`hooks/useGame.ts`** — the realtime hook: one channel carrying
  postgres-changes on `games_state` / `players` / `submissions` (no Broadcast).
  The board the player sees is `game.tiles` minus `removedTileIds`
  (valid-submission tiles, plus a brief optimistic hold so an accepted word
  doesn't flash back during the realtime round-trip) minus `currentWord` (the
  tiles picked up into the word being built). **The in-progress word is local in
  both modes** — selections are never broadcast, so teammates build words in
  parallel; `append` / `retract` / `clear` / `commit` are now just a local
  reducer's actions (`commit` still distinct from `clear` for the
  submitter's optimistic tile-hold). Sharing happens entirely through the
  `submissions` rows: coop RLS shows everyone's, so a teammate's accepted word
  reaches you via the realtime refetch (board + history). If that refetch shows
  a tile you were mid-building with is now gone (a teammate claimed it), `load()`
  resets your local word. Per-effect channel name (`channelDedupSuffix`) — the
  shared Broadcast room that needed a stable name is gone.
- **Peer narration** (coop-only) is the SHARED `common/hooks/feedback/useGlobalFeedback`,
  wired inline in PlayArea — no game-local hook. It diffs the `submissions` list
  (via `keyOf: (user_id, seq)`), bootstrapping quietly on the first loaded render so
  a reconnect doesn't replay the backlog. Each *new* teammate submission fires a
  **global** header feedback pill — carrying the teammate's identity disc (`● moth
  found SCARE` / `● moth tried FOOFS — not a word` [error] / `● moth revealed a hint`
  / `● moth revealed a word` [warning]) — and, for a played word, `messageFor` also
  calls back into PlayArea (`onPeerWord`) to flash that word (green/red) in the entry
  row. No-ops off coop (compete hides peers' submissions) and skips the caller's own
  rows (those are reported in the local below-board slot / ring instead).
- **`components/`** — `Board` (stacked tiles, depth color, corner letters, only
  exposed tiles clickable; tiles are percentage-positioned in a responsive square
  canvas — `container-type` + `cqi` typography — so the board grows to fill a
  roomy viewport and stays on-screen on a small one. **Post-terminal `PlayArea`
  passes an empty `offBoard`** so the whole ORIGINAL board renders for review —
  a won game has cleared every tile, so it'd otherwise be blank), `WordEntry`
  (the five-slot word under the board; clicking a slot returns that tile and
  every tile after it. When nothing's being spelled it flashes a word for ~1s
  — PlayArea's `flash` timer, cleared early when a new word starts: green for
  the player's own just-accepted word OR a teammate's valid find, red for a
  teammate's rejected word. The flash carries plain letters, not tile ids, so
  it can show a teammate's word whose tiles this client never picked up),
  `GameTurnLog` (the info-column submission log — heading "Turns" — rendered on
  the shared `<TurnLog>`: a `<tr>` per submission with the shared outcome bar:
  valid words green + clickable to define, invalid attempts red + struck through +
  tagged, cheat requests amber showing the revealed text ("Hint: <clue>" /
  "Revealed: <WORD>"); coop shows the actor via the shared `<ActorTag>`, compete
  suppresses it. Each row's `#N` is the shared `<TurnLogNumber>` history handle — see
  `lib/history.ts`), `BoardCol` (the board + WordEntry input engine + the local
  feedback slot; takes the board to render — live or a `lib/history` snapshot — plus
  `readOnly`, and emits the completed word up), `InfoCol` (the info column: state,
  compete OpponentStrip, action row of Reveal-hint/Reveal-word cheats + End/Concede
  via the semantic buttons, help, setup, terminal words-reveal, and the GameTurnLog
  log), `PlayArea` (the thin two-column coordinator: `useGame` + the submit + game-over
  + the history `viewingIndex`; in compete it filters the log to the caller's own so
  it doesn't swap to an everyone's-words view at terminal), `SetupForm` (the
  word-difficulty band + timer — the board is dealt at random from the chosen
  band's pool), `Help`.
- **Keyboard input** (in `PlayArea`, via the shared `useGlobalKeyHandler`):
  Backspace returns the most recent tile; a letter key plays the matching tile —
  but only when exactly one exposed tile bears it (the word is the selection
  order, so an ambiguous letter can't pick for you). No match shows a local
  **error** pill ("No 'X' tile is on top"); more than one shows a **warning** pill
  ("N 'X' tiles are on top — click one") AND briefly outlines the candidate tiles
  in red (a `highlight` set passed to `Board`). The handler ignores keys aimed at
  chat / inputs.

### 5.4 Board generation — a two-step split (gen is slow, import is cheap)

Generation is a few seconds per board (the strict validation), too slow to
re-run across hundreds of boards on every `db:reset`. So it's split, mirroring
`words:import`'s vendored-file pattern:

- **`npm run stackdown:gen -- <count> [baseSeed] [band]`** (`generate-stackdown-boards.ts`)
  — the SLOW half, run rarely. `count` is required — running with no arguments
  just prints usage and generates nothing. Loads the 5-letter lexicon at the chosen `band`
  (`difficulty = band` exactly, default 1) from `common.words` (read-only),
  generates N strictly-valid boards on the fixed geometry, and **appends** them
  to `supabase/data/stackdown-boards.jsonl` (one JSON board per line — a
  committed, human-readable library that grows across runs; duplicate six-word
  sets are skipped, so band-1 and band-2 boards coexist in the one file, each
  line tagged with its `band`). A band-N board is made entirely of band-N words.
  Reproducible: board *i* uses `baseSeed + i`. Does NOT touch the `stackdown`
  tables. Each board is bounded by
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
