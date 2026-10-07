# boggle

A find-words-in-a-grid game (Boggle): players trace words through a grid of
letter tiles, stepping between orthogonally **or** diagonally adjacent tiles and
never reusing a tile within one word. The board is pre-solved at creation, so
the game knows every word that's *findable* — which is what makes the "did you
find them all?" reveal and the board-difficulty constraints possible.

> **Brand ≠ codename.** The user-facing brand is **MothCubes** (it lives only in
> the manifest `BRAND` const — see [docs/naming.md](../naming.md) and
> [[feedback_codename_brand_naming]]). Everywhere in *code / DB / schema / tests*
> the codename is `boggle`. Ported from `~/src/wsboggle` (the rules/spec) and
> `~/src/cboggle/make-dawg` (consulted only while building the solver).

boggle is a **coop / compete sibling pair** (`boggle_coop`, `boggle_compete`)
and inherits the shared chrome — timer, chat, presence-pause, manual "Stop game"
— through `<GamePage>` + `useCommonGame`, like every other multiplayer gametype.

> **Status: live.** boggle (its `boggle_coop` / `boggle_compete` are the
> gametypes) is built end-to-end
> (solver, generator edge function, migration, RPCs, FE) and shipping, its page
> drawn from the blobs ([plans/seat-view.md](../../plans/seat-view.md)). The
> design forks are documented in place across §§2–8.

---

## 1. The game

A square board of `n × n` lettered tiles (`n` ∈ 4 / 5 / 6, set by the dice set).
A word is legal when you can trace it as a path of adjacent tiles — each step to
one of the up-to-8 neighbors, no tile visited twice — and the word clears the
minimum length.

- **Dice sets.** All eight wsboggle sets ship (4×4 Classic/Revised, four 5×5
  sets, two 6×6 sets), ported verbatim from `dice.py`. A board is rolled from
  the chosen set's bag of dice. Some faces are **multiface** — a single tile
  that contributes two letters at once: `Qu In Th Er He An` (you can't use half
  a tile). One face on the 6×6 super set is a **blank** that matches no letter,
  so no word can path through it (rendered as a faint `?`, like a scrabble
  blank).
- **Scoring ladders.** wsboggle's four ladders — `flat` (every word 1),
  `basic` (1–11 by length), `fib` (Fibonacci, 1–377), `big` (prefer-big, 1–50) —
  picked in setup, default `basic`. The chosen ladder drives generation scoring,
  the score constraint, and per-word points.
- **Minimum word length.** 3 / 4 / 5, default 3. A guess shorter than this is
  rejected.
- **Timer.** The shared `SetupTimerSection` (none / count-up / count-down
  MM:SS), default none; a countdown lets the player pick the duration.
- **Win target (`setup.win_percent`, stored as `target_win_percent`).** An optional score bar: a dropdown of
  **None / 50 / 55 / … / 100 %**, default None. When set, the game is WON the
  moment the team (coop) or a player (compete) reaches `win_percent` % of the
  required-words **score**, measured against the score of the **required words
  found only** — bonus finds don't count, so 100 % means every required word and
  50 % means required finds worth half the required total. The score itself
  counts bonus words too: a target that needed obscure words would be too
  mean, and bonus words that scored nothing would be no fun to find. Compete
  is a race — the first player to cross wins outright, regardless of the
  others' scores (`submit_word` decides it; see [§7](#7-rpcs-all-security-definer)).
- **Ending.** With no win target, you hunt until the timer expires or a player
  hits **Stop game**. Stop is a neutral end; so is coop's timeout, while
  compete's timeout ranks the racers by score, and a compete game everyone
  conceded is lost. With a target set, reaching it ends the game as a win
  (`reached_goal`, detail `target`). Either way the end-of-game reveal
  lists the **required** words nobody found.

### Modes (sibling-manifest pair)

- **Coop** (`boggle_coop`, 1–8 players, solo-capable): one shared board, one
  shared found-words list — every teammate's accepted word piles into the same
  pool, scored once for the team.
- **Compete** (`boggle_compete`, 2–8 players): everyone hunts the **same** board
  independently. You see only your **own** words until the game ends; an
  `OpponentStrip` shows peers' live scores (not their words or counts). Most
  points wins. Scoring is **independent per player** — no classic dupes-cancel
  (deferred, [§11](#11-deferred)).

---

## 2. Required / legal / bonus words — the core model

The single most important concept in boggle is the split between the *required*
set (the board's goal + reveal) and *bonus* words (extra legal finds). Two
independent difficulty bands govern them, and **both lists are enumerated at
board-build time and shipped to the FE** — the FE validates + scores every guess
locally against required ∪ bonus and submits trusting-commit (the same model as
spellingbee, via the shared `useFoundWordSubmit` hook). No `common.words`
round-trip at guess time.

- **Required words** — the set the board is **built and judged against**:
  `difficulty ≤ band` plus the **clean filter** (`american, crude=0, slur=0,
  slang=0`) and `len ≥ min_word_length`. The solver finds them all at board
  creation; every board constraint (word count, score, longest word) is measured
  **only** against this set, and the unfound ones are the "missed words" reveal.
  Shipped to the FE (it isn't hidden — see [§6](#6-schema-boggle)).

- **Bonus words** — real words that aren't required but are still within the
  **legal band** and traceable on the board. Scored normally, and revealed
  with the required ones once the game has ended. Enumerated once on the accepted
  board (a second `listWords` pass against the legal-band trie — see
  [§4](#4-board-generation-boggle-build-board-edge-function)) and stored in
  `bonus_words`.

- **Legal words** = required ∪ bonus — the acceptance set. A guess is legal iff
  it is a member of that shipped list (membership implies traceable + real,
  since the list was produced by solving *this* board). The FE traces a miss
  on the board (`lib/boardTrace`) only to tell the two refusals apart ("not on
  the board" vs "not a word"); the server trusts the FE's word + points +
  `is_bonus`.

**The two bands and their deliberate asymmetry.** Setup picks *both* a required
band and a legal band, with `legal_band ≥ band` (every required word is also
legal). The required band carries the clean filter because it's the set that's
*surfaced* (constraints, missed-words reveal). The legal band filters on
**difficulty only** — any dialect (us/uk/au/ca) and any register (slurs, crude,
slang) qualifies — because among friends a bonus is "any real word you can dig
up" within the chosen obscurity ceiling. Raise the legal band to reward rarer
finds; lower it to keep bonuses close to the required difficulty. Defaults:
required ≤3 (familiar), legal ≤5.

Enumerating the legal set costs one extra solver pass on the *accepted* board (a
5×5/6×6 legal list is ~a few hundred words, ~10 KB) — it is never part of the
roll→solve→reject loop, so board-creation constraints stay required-only.

---

## 3. The solver (`lib/solver.ts`)

The generator needs to find every required word on a candidate board, fast
enough to reject-sample boards interactively. The solver is **pure TypeScript**
running natively in the Deno edge function — no WASM, no FFI.

- **Algorithm.** A **flat typed-array trie** plus a **generation-stamp** on each
  terminal node: each solve bumps a counter and stamps a word's node when found,
  so dedup needs no word-string building and no hash set. This algorithm — not
  the language — is the lever; it's ~2× faster than the original C's DAWG +
  hash-table approach, and in V8 a TS port of it beats that original C.
- **Board sizes.** Because the 6×6 sets ship (36 tiles), the DFS tracks visited
  tiles with a **two-word 64-bit mask** (`usedLo` / `usedHi`) — one code path
  for 4×4 / 5×5 / 6×6. A single 32-bit JS-number bitmask tops out at 32 tiles.
- **Multiface + blanks.** Multiface faces expand to their letter pairs during
  the trace; the blank face matches nothing, so paths can't cross it.
- **Shape.** A `createSolver(trie)` factory returns `{ solve }`; a fresh solver
  per generation means concurrent games share no mutable state. (A module-global
  singleton was measured and is *identical* in the shipping runtimes — Deno
  ~38k solves/sec either way — so the clean factory wins.)

`boggle-c-solver/` (repo root) holds the original C, the improved C, and a
six-way native/WASM × C/TS benchmark, all reproducing an identical correctness
tuple. It stays as the **golden-master parity oracle**: the shipping TS solver
is tested against a fixture (`solver.fixture.ts`, 90 boards across all sizes
incl. multiface) generated from that C.

---

## 4. Board generation (`boggle-build-board` edge function)

A board is built **on demand** at "Start game" — there is no pre-generated board
library and no import step. The edge function (running as the caller) rolls,
solves, and reject-samples until a board meets the setup's constraints, then
creates the game in one round-trip:

1. Verify the JWT; read `{ target_club, setup, player_user_ids, mode }`.
2. Get the **required trie** for `difficulty ≤ setup.band` (a view of the one
   trie built from the bundled word list — [§5](#5-dictionary-delivery) —
   memoized per band at module scope).
3. Loop up to a try budget (also wall-clock-bounded so impossible constraints
   fail fast instead of crashing the worker):
   - Roll the chosen dice set (random die order + a random face per die,
     multiface faces carried through).
   - Solve for required words (flat-trie DFS, gen-stamp dedup, with a `max`
     fail-fast so an over-rich board is abandoned early).
   - Accept iff it meets **every** constraint: word count in `[minWords,
     maxWords]`, score (per the chosen ladder) in `[minScore, maxScore]`,
     longest word in `[minLongest, maxLongest]`, all measured over the required
     set.
4. On accept → enumerate the **bonus** set: get the **legal trie** for
   `legal_band` (`legalTrie(legal_band)` — the *difficulty-only* set, so
   crude/slur/slang/non-american words count; distinct from the clean
   `requiredTrie` the board was solved against) and run `listWords` once on the
   accepted board, minus the required set (`listBonusWords` in
   `src/boggle/lib/generate.ts`). This is usually non-empty **even when
   `legal_band == band`** — the required set is clean-only, so the band's
   non-clean words are all bonus. Then call `boggle.create_game` with the
   board + the required-word list + the bonus-word list (both `[{word,
   points}]`). On exhaustion → return a friendly **"constraints too strict,
   relax them"** error, which the FE surfaces on the setup dialog.

`legal_band` shapes only the post-acceptance bonus enumeration, never board
*acceptance* (constraints are required-only), so the reject loop stays fast —
the bonus pass is one extra solve on the single accepted board. The
`scoring_ladder` is validated at the API boundary before generation.

**Measured cost** (one accepted board): ~60–110 ms for typical bands; ~286 ms
for the extreme corner (an easy band *and* a required 11-letter word). Cold
start (decode the asset + build the first band trie) is a one-time ~166 ms per
isolate. Both sit comfortably inside an on-demand "Start game" action.

### Custom board (player-typed tiles)

One OPTIONAL setup field lets a player hand the game its board instead of
rolling one: **`setup.custom_board`**, the tiles as text. Blank → the roll loop
above runs as normal; set → the edge function **skips rolling entirely**, parses
the tiles, solves that one board, and creates the game. Available in **either
mode**. The SetupForm surfaces a "Custom board (optional)" disclosure under the
dice set; the manifest's `validate` (`customBoardError`) gates Start on the same
parse the server runs. This is freebee's and MooseWheel's "custom letters"
feature, in the shape a grid needs — the three letter games now all have one.

The **written form** is the board read like English: rows top to bottom, a space
between them, e.g. `ABCD EFGH IJKL MNOP`. It is exactly what the
`Letters` setup row prints ([§8](#8-frontend-srcboggle)), which is the point —
you read a board off a game you liked (on screen or on paper) and paste it into
the next game's dialog to hand a friend the same puzzle.
`src/boggle/lib/customBoard.ts` owns **both** directions so they can't drift,
and `customBoard.test.ts` asserts `parse(format(board)) === board` over rolls of
every dice set.

- **Two-letter tiles are spelled as they print** — `Qu In Th Er He An` — and a
  blank is `?`. The parser recognizes a digraph only when written **capital then
  lowercase**: `Qu` is one tile, `QU` and `qu` are two. That rule is
  load-bearing, not tidiness: a bare `Q` face is real (4×4 Classic's `ABJMOQ`
  die), so `QU` is genuinely ambiguous, and all six digraphs are common letter
  pairs — a case-insensitive parse would silently swallow
  `an`/`in`/`th`/`er`/`he` out of an ordinary lowercase paste. Keying on case
  makes each spelling mean one thing and makes the printed form the one that
  round-trips.
- **The dice set fixes the size.** A custom board must have exactly `n²` tiles
  for the currently-picked set; a mismatch is a Start-blocking message ("A 4×4
  board needs 16 tiles — that's 25"), deliberately not a guess at which of the
  four 5×5 sets you meant. The set therefore still chose something real, which
  is why its `Board` setup row stays.
- **Constraints don't apply, and their setup rows vanish.** Nothing is being
  rejection-sampled, so the min/max word/score/longest targets had no effect on
  this board — and a setup row must not assert a choice that didn't apply
  (`lib/setupRows.ts`).
- **The floor is ≥1 required word.** A custom board is whatever the player's
  tiles yield, so there's no quality gate — but `setup.win_percent` is a *share
  of the required-words score*, so a board with none would put the threshold at
  0 and hand the win to the first bonus word. Both the edge function (422,
  `no-required-words|<band>|`) and `create_game` (P0001) reject that. Rolled
  boards keep no such floor: their constraints are the player's to set,
  including none.
- **One-off, not a new default.** `create_game` strips `custom_board` from the
  setup it saves as the club's `clubs_gametypes.default_setup`, so the next
  dialog opens with the field blank and rolls again — the same treatment
  freebee/MooseWheel give their custom letters.

---

## 5. Dictionary delivery

The required-word source is the shared `common.words` list (see [word-list.md →
The word list](../word-list.md#the-word-list-commonwords)), **not** wsboggle's
word list. It's shipped to the edge function as a **bundled asset** rather than
queried at cold start:

- **Build step:** `gmake g-boggle-trie` queries `common.words` for **all** words
  (`len ≥ 3`, every band), each tagged with a **clean flag** (= the
  required-eligible filter `american, crude=0, slur=0, slang=0`), and writes
  `boggle-build-board/wordlist.ts` as a gzip+base64 blob (~283k words, ~1.25
  MB). `dict.ts` serves it as two sets: **`requiredTrie`** (clean — board
  generation) and **`legalTrie`** (all, difficulty-only — bonus enumeration), so
  the legal net includes the crude/slur/slang/non-american words the clean
  filter drops. It reads the **table**, not `~/src/gamelist/output/words.tsv`
  (that file is only the `common.words` importer's input).
- **Generated, not committed.** The asset is git- and eslint-ignored, and
  **regenerated by `gmake deploy-funcs`** — which depends on it, always building
  from the LOCAL stack because the hosted `common.words` isn't seeded until
  several steps later. Run it manually (`gmake g-boggle-trie`) before
  `supabase functions serve` locally.
- **Cold start (once per isolate):** decode the blob and build ONE trie of every
  word, each terminal carrying its difficulty and clean flag. **Per band:** a
  view of it — the same `children`, its own `eow` marking the words that set
  admits — memoized by band. A full trie is ~110 MB against a worker's 256 MB,
  so a separate trie per set cannot fit: band 6 would need two full ones.
- **Why bundle vs query the DB:** ~2×+ faster cold start than bulk-reading
  88k–267k rows, network-independent, and no Postgres load on every isolate
  spin-up. The dictionary is stable, so "redeploy to update it" costs nothing
  today — and "I changed the word list" is answered by re-running `npm run
  deploy`. (The Supabase Storage middle-ground was considered and decided
  against: [§12](#12-wont-do).)

---

## 6. Schema (`boggle.*`)

Two tables, in `supabase/migrations/20260628000000_boggle.sql` (shape) and
`supabase/sql/boggle.sql` (behavior).

| | |
|---|---|
| `boggle.games` | one row per game, keyed `game_id`: the board as a row-major raw-face string (`board`: A–Z, a multiface digit `1`–`6`, or `0` for a blank) and its side (`board_side_size`, 4–6); both word lists as jsonb arrays of `{word, points}` — `required_words`, and `bonus_words`, the legal set less the required one — with the required list's count and score (`n_reqd_words`, `reqd_words_score`); and four setup values copied at create — `min_word_length`, `required_band`, `legal_band`, and `target_win_percent` (null for none). The mode and the club are `common.games`'; the rest of setup (`scoring_ladder`, `timer`, the constraint bounds) is `common.games.setup` |
| `boggle.found_words` | one row per `(game, player, word)`, with `points`, `is_bonus` and `found_at`. The game's only working state |

**Nothing is hidden from a client.** Both word lists are readable by club
members and the `game_data` blob carries them from the first read: the
frontend judges every word against them, and the missed words — bonus ones
included — are computed on the client once the game has ended. The trust model
does not withhold an answer key from friends (CLAUDE.md → Trust model).

**Both tables need only the membership gate.** Who may see a rival's finds
mid-race is the page's rule — `makeGameData`'s seat rule over `game_data`,
which withholds a rival's rows until the race ends — and nothing reads the
tables from the client, so the policies carry no mode arm.

**The page blobs** are written by `boggle._rebuild_data_cols` at create, at
Restart and at the end of every move and ending, each assigned whole
([plans/seat-view.md](../../plans/seat-view.md) → The page is written, not
assembled): `shell_data` through `common._make_json_shell_data`, and on top of
the common part of every `game_data` (`common._make_json_game_data`) this
game's own. The six counts — `nFoundWords`, `foundWordsScore` over every find,
and `nFoundReqdWords`, `foundReqdWordsScore`, `nFoundBonusWords`,
`foundBonusWordsScore` split by list — are one helper's,
`boggle._make_json_found_counts`, over one player's rows or everyone's.
`static_game_data`, what nothing after create changes, is written once by
`_write_static_game_data`, from `create_game` and the rebuild over every game,
never by a move ([common-schema.md → Title, statuses and the two
dates](../common-schema.md#title-statuses-and-the-two-dates)); the hook merges
it into `game_data`, each key in its place:

| blob | boggle's part |
|---|---|
| `static_game_data` | `puzzle: {tiles, boardSideSize, minWordLength, words, nReqdWords, reqdWordsScore, nBonusWords, bonusWordsScore}`, as `create_game` froze it — a tile being `{id, letters}` with its cell's index as its id and its letters lowercase (`qu` for a two-letter tile, null for a blank), and every legal word `{word, points, bonus}`, the required ones first |
| `game_data` | `team`, the team's facts sent once — the six counts over every row — null in compete; `foundWords`, every find `{userId, word, points, bonus, at}` in the order found; on each player the six counts over their own finds |
| `summary_data` | `team`, the six counts as `game_data` sends them; `targetWinPercent`; `topScore`, compete's best score among those who did not concede, null in coop and until the game ends |

The six counts are boggle's facts (`GFacts`), on every player twice: spread
on, the side's — the team's in coop, their own in compete; under `own`, their
own ([common-schema.md → A player's facts](../common-schema.md#a-players-facts--the-sides-and-their-own)). `gd` has no `team`;
`foundWords` stays at the game level beside it, a record of who found what.
The lists' totals are the puzzle's, the same for every side, and the state
line reads `gd.me` beside `gd.puzzle`.

**The client reads nothing from these tables.** The page is handed the blobs
off `common.games` and re-reads them as the shell delivers each rewrite, and
every move and ending rewrites them.

---

## 7. RPCs (all `security definer`)

- **`create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)`** — called
  by the edge function. Validates club membership, player count, timer, `band`
  (1–6), `legal_band` (band..6), `scoring_ladder`, `min_word_length` (3–9),
  `win_percent` (null or 50..100 in steps of 5), and the board structure;
  inserts the `common.games` header + the `boggle.games` row (`band` and
  `win_percent` copied to their columns) and writes the page blobs; titles the game `n×n <top row>` (e.g. `4×4 ABQuD` — the
  board's first `n` faces, with a multiface die expanded to the two letters a
  player sees on the tile). The board is public, so nothing is leaked. On a
  **custom board** (`setup.custom_board` present) it also demands ≥1 required
  word and strips the one-off board from the setup saved as the club's default —
  see [§4 → Custom board](#custom-board-player-typed-tiles).
- **`submit_word(p_game_id, p_word, p_points, p_is_bonus)`** — the **trusting
  commit**. The FE validated the word against the shipped legal list (required ∪
  bonus) and scored it, so the RPC trusts `word` + `points` + `is_bonus` and
  only:
  1. locks the game row and enforces the game is live (else `gameOver`);
  2. dedups against the caller's scope (coop = team, compete = self);
  3. inserts the row;
  4. **checks the win target** (if `target_win_percent` is set): the threshold
     is `ceil(target_win_percent% × reqd_words_score)`; when the score of
     the **required words found** (`not is_bonus`) by the team (coop) or the
     caller (compete) reaches it — bonus finds don't count — it calls
     `_finish(…, 'target', caller)` to end the game as a win. Compete is a race,
     and the lock plus the ended check make a near-simultaneous second crosser
     the game-over race;
  5. rebuilds the page blobs.

  No word-content or dictionary check, and no scoring, in plpgsql — it does not
  read `common.words` at all anymore. (Drives off the shared
  `useFoundWordSubmit` hook, same as spellingbee.)

  **What it answers** ([envelopes.md](../envelopes.md)). Two `ok`s, both
  carrying the points the row was written with:

  | | | |
  |---|---|---|
  | `{ result: 'accepted', points }` | `ok` | a required word |
  | `{ result: 'bonus', points }` | `ok` | legal, but not on the required list |
  | `PN359` `<WORD> — already found` | `race` | **not a verdict.** `useFoundWordSubmit` dedups locally first, so reaching this means that list was stale — a teammate found it between the render and the submit (coop), or the caller's own row had not landed (compete). Nothing is recorded, so it refuses. The server composes the whole `WORD — body` line here, because this is the one rejection reachable by BOTH routes and the two must not read differently |
  | `PN486` "Game over" | `race` | the shared race (`common._raise_game_over`). A refusal, not an `ok`: the word is not recorded on that path, so an `ok` would leave the optimistic `+N` pill standing over a word that never landed. `useFoundWordSubmit`'s contract has no way to say *"ok, but release the word"* ([envelopes.md → How SQL builds one](../envelopes.md#how-sql-builds-one)) |
  | `PN483` "Already conceded" | `race` | the shared race (`common._raise_already_conceded`); a refusal for the same reason: it is what releases the optimistically-accepted word |
  | `PN485` "That game was already deleted" | `race` | a friend deleted the game mid-call — the shared race (`common._raise_game_deleted`), asked before the membership gate |

  `create_game`'s eleven refusals (**PN136**–**PN146**) are all faults, and all
  `BUG:` — the setup dialog composes every field and the edge function builds
  the board, so any of them means a broken client or a builder that broke its
  own contract.
- **`_finish(p_game_id, p_reason_detail, p_ended_by_user_id)`** — the two
  endings boggle decides itself, through `common._end_game`. A Stop is
  `common._stop`'s and everyone conceding is `common._concede`'s. The rankings
  depend on whether a TARGET was set ([win-lose.md](../win-lose.md)):

  | | reached the target | timer ran out |
  |---|---|---|
  | **coop, target set** | `reached_goal`: the team ranked 1 — won | `timeout`: nobody ranked — lost |
  | **coop, no target** | — | `timeout`, no result — neutral |
  | **compete, target set** | `reached_goal`: the crosser alone ranked 1; the race ends when decided, so the rest are short of the goal and lost | `timeout`: nobody ranked, however high the scores got — lost |
  | **compete, no target** | — | `timeout`: every non-conceder who scored ranked by score, ties sharing; nobody scored → nobody ranked, lost |

  A game with something to reach can be won or lost against it; a coop game
  with nothing to reach is an exercise, and its ending has no result. A target
  reached is a solve, stamped on `common.game_players.solved_at`: every teammate
  in coop, the crosser alone in compete. The
  nobody-scored race ranks nobody because a score race's win test, "your
  score is the best score", is true of everyone when every score is 0.
- **`stop_game`** — any player's Stop, in either mode: locks the row, then
  `common._stop` — neutral, nobody ranked. **`submit_timeout`** — every
  connected client fires it when a countdown hits 0; the first ends the game
  through `_finish`, the rest get the game-over race. No reveal view: the FE
  renders the missed words from data it already holds.
- **`concede`** — the compete per-player drop-out. boggle is a timed hunt with
  no other way for a player to end, so after locking the row and a
  compete-only guard, `common._concede` decides it all. The FE places
  `act-concede`, which hides itself outside a race; a conceder reads "out" in
  the OpponentStrip, and their own board goes read-only under "You conceded".
  See
  [common-schema.md → Concede](../common-schema.md#concede--per-player-drop-out).
  pgTAP: `concede_test.sql`.
- **`replay_board`** — `act-restart`, placed as both the **"Restart"** menu row
  and a button once the game has ended (spellingbee's twin — [ui.md →
  Endings](../ui.md#endings--the-moment-vs-the-record)): restart the
  SAME board (same faces + word lists) for everyone. Clears `boggle.found_words`
  (the only working state), then `common._reset_game` clears the ending and
  zeroes the shared timer, and the page blobs are rebuilt. Confirmed mid-game;
  unconfirmed once the game has ended. pgTAP: `replay_test.sql`.
- **"New game"** (`act-new-game`, its `+` key, its menu row and its button
  once the game has ended, all one action; FE-only): a fresh game — new id, new board — with THIS
  game's setup + roster + mode via the same `boggle-build-board` edge function
  the manifest uses; a typed board is a one-off, so the follow-up rolls a fresh
  one. The creator jumps in via `goToFollowUpGame`. Mid-play it asks first
  (starting one SHELVES this game rather than ending it); once the game has
  ended it goes straight through. The action row is **one row, icon-only**
  (tooltips carry the labels), every action in the menu's order, each deciding
  whether it shows.

### Where validation lives

The work splits by **where the data is**, so nothing intricate is written twice:

| piece | needs | lives |
|---|---|---|
| board generation + required solve + bonus enumeration | the dictionary trie | **edge function** (`lib/solver` + `generate`) |
| guess validity + scoring (membership in required ∪ bonus) | the shipped lists (FE has them) | **FE** shared `useFoundWordSubmit` |
| reject-message nuance (not-on-board vs not-a-word) | the board (FE has it) | **FE** `lib/boardTrace` |
| dedup + live-game gate + the page blobs | the DB rows | **server** `submit_word` |

Both word lists are enumerated once at build time and shipped, so the FE is
authoritative for what counts + how much it scores; the server just records +
dedups. Exactly the scrabble/spellingbee trusting-commit model.

---

## 8. Frontend (`src/boggle/`)

The play surface is the shape [`docs/playarea.md`](../playarea.md) describes —
a loader that gates on the three ways a game can fail to load, then `PlayArea`
in the eight sections.

```
<PlayAreaLoader {...PlayAreaLoaderProps}>        useGame, and the three gates
  └── PlayArea                           the coordinator: draws no board, no control
        ├── BoardCol                     the board column's layout; the word is useTracedWord's
        │     ├── MobileStatusBar ←      phone only: the StateLine, mirrored above the board
        │     ├── Board                  the n×n square of <Tile>s; owns the rotation
        │     │     └── ShuffleButton ←  Rotate, floated over its top-right
        │     └── WordEntryArea ←        ⌫, the typed word (drawn through TypedWord), Submit, the
        │                                capture keyboard — or the local slot's pill in their place
        ├── InfoSheet ←                  off-canvas on a phone, a flex child on desktop
        │     └── InfoCol                the readouts and the action row
        │           ├── StateLine        four cells: required and bonus, words and score
        │           ├── OpponentStrip ←  compete only: each rival's score, or "out"
        │           ├── InfoActionsRow ← one row, every action, in the menu's order
        │           ├── SetupDisclosure ←
        │           └── WordList ←       the found words, and once the game has ended the missed ones
        └── CelebrationBlockingModal ←   a win, as it lands — the team's, or mine in a race

  ← belongs to common/ ; everything else is this folder's
```

`GamePage` mounts the loader and owns everything above it — members, the timer,
play_state, pause, chat — and unmounts this whole surface on pause. `Help` and
`SetupForm` are the shell's to mount, from the menu and the start-game dialog.
`useGame` builds `gd` from the `game_data` blob the page was handed, through
`makeGameData`: the players with their links resolved, the seat rule (a
rival's finds leave `foundWords` mid-race), the tiles by id, the board the
tracer walks (`puzzle.traceBoard`), the setup rows and the state line's data;
it reads nothing and subscribes to nothing.

### What a word says (`lib/answer.ts`)

Everything this game says about a word is one function, `answerMessage`, which
gives each answer its words and outcome together: `accepted` and its
`accepted_peer` twin (`won` — a teammate's 7+ letter find leads with `wow!`) ·
`already_found` and `too_short` (`warning`) · `not_on_board` and `not_a_word`
(`lost`). The shared `useFoundWordSubmit` reports what it decided, and
`answerOf` splits its one "not legal" by whether any path on the board spells
the word; the pill and the board's answer mark read that one call. No RPC
carries an outcome or a message: the frontend decides, once. The same readings
as spellingbee's, for the same reasons
([`src/spellingbee/doc.md`](../../src/spellingbee/doc.md); [outcomes.md → One
event, one outcome](../outcomes.md#one-event-one-outcome--and-who-decides-it)).

### What is boggle's own

- **The board is a square of tiles**, `n` a side, sized like waffle's: the
  largest square that fits the column (the shared HUG model, with `--cols` and
  `--rows` set inline since `n` is 4, 5 or 6), the letter scaling with each tile
  through `container-type: size`. A tile shows its letters as a player reads
  them — `Qu` for a two-letter tile, through CSS `capitalize` over the
  lowercase letters `gd` carries — and a blank a faint `?`.
- **Rotate turns the view**, a quarter at a time (`useBoardRotation`, its
  button and ⌥Z): the tiles change places and each letter stays upright. It is
  this player's alone, never persisted or shared, and stays live on a finished
  board. Every mark is held as tile ids, so a turn moves the marks with their
  tiles, a half-tapped path included.
- **The word is typed at the window, or tapped in** (`useTracedWord`). The
  shared entry row captures keys with no `<input>`; tapping tiles along a
  Boggle path builds the word too, the touch input ([mobile.md](../mobile.md)).
  A tap on a tile already in the path un-picks it and everything after; a tap
  elsewhere extends it only along a neighbor. Typing drops the path, except
  Backspace, which steps it back a tile — both letters of a `qu` at once.
- **The board traces a typed word as it is spelled** (`traceCells`). A letter
  with one candidate tile settles it, taking the selected border outright; a
  letter with several lights them all as a maybe, the border held back toward
  the tile, until a later letter settles one. On H-E-A-X-T over Z-Z-A-R-Z, `he`
  settles two tiles, `hea` holds both As as a maybe, and `hear` settles the R
  while the As stay open. The board only ever ADDS certainty, so no tile is lit
  and then taken back: a letter it CANNOT follow leaves the tiles where they
  were and dims itself in the entry box instead (`TypedWord`, from the trace's
  `reach`). A tapped path wins over all of it — it is the player's own choice,
  not a deduction.
- **The move is `hooks/useSubmitWord`.** The lookup over the puzzle's words,
  the `submit_word` call and what each answer shows live there. Every guess
  resolves at once with no round trip, because both word lists ship at load: a
  word in required ∪ bonus is `+N` (a bonus find dotted) and is committed in
  the background; a miss is not-a-word if it traces on the board, else
  not-on-board; too short and a repeat are an instant `warning`.
- **A refused word answers on the board.** The tiles the word used shake and
  wear the answer's color for a beat, the same outcome the pill reads
  (`common/board-marks`); refusing the same word again shakes them again.
  Once the game is over, or I conceded a race, the board is read-only: the
  entry closes and the tiles go inert, with no hover or press.
- **Words are lowercase** in state, in the blob and in every RPC; capitals are
  drawn, never stored — the tile's `capitalize`, the shared entry box's
  uppercase.
- **The state line** (`StateLine`) is four cells, each `found / total` over the
  found share as a percent: required words, required score, bonus words, bonus
  score. Coop shows the team's, compete my own, with the strip's scores for the
  rivals. `MobileStatusBar` mirrors it above the board on a phone, so the
  readout stays on the play surface when the info column is off-canvas.
- **The `Letters` row** leads the setup disclosure, under the roster, and the
  PDF prints the identical row (one `makeSetupRows()` feeds both —
  [setup-form/doc.md → Setup
  rows](../../src/common/setup-form/doc.md#setup-rows)). It names the board
  this game was played on — `Letters: ABCD-EFGH-IJKL-MNOP` — **rolled or typed
  alike**, written from the tiles in the form the setup dialog's custom-board
  field takes back ([§4 → Custom board](#custom-board-player-typed-tiles)).
  Printing it for a ROLLED board is the documented board-identity exception to
  "the setup rows are the dialog read back" (`common/setup-form/setupRows.ts`
  → `BOARD_KEY`): a row that appeared only on hand-picked boards would be
  exactly the half you never need to copy.
- **Two lists, one reveal.** The list is the shared `WordList` — finder color
  in coop, a bonus dot, a recently-found underline, click-to-define, and the
  KIND/WHO filter ([common/word-list/doc.md](../../src/common/word-list/doc.md)).
  Its rows are `lib/wordRows.ts`'s, the same call the screen and the printer
  make; once the game has ended the missed words fold in, bonus ones too.
- **The ending** is the pill and the row's line (`lib/endingMessage.ts`), the
  inert board, and the list with its missed words. Verdicts lead with the
  outcome word: coop's `Won: 12 words, 30 points` at its target, `Lost: …` when
  the timer beat it, `Ended: …` with no target or a Stop; a race's `Won: …`,
  `Lost: conceded`, `Lost: ran out of time`, `Lost: no words found`, and a loss
  to a named player carried as the message's `actor` — `● alice won`. A win
  celebrates once, as `gd.me.outcome` turns `won` — the team's in coop, and in a
  race only the winner's screen; nothing pops for any other ending, or for a
  game opened already won.
- **The setup form** offers the dice set, an optional **Custom board** (the
  tiles, typed — [§4 → Custom board](#custom-board-player-typed-tiles)), the
  two dictionary bands (the shared `DictBandField`), the scoring ladder, the
  minimum word length, the win target, the collapsible **Board constraints**
  (words / score / longest, min and max) and the timer, with mode-aware copy.
  Start is gated on the legal band containing the required one, then on the
  custom board parsing.
- **The club label** (`manifest.ts`) reads `summary_data`: coop's words and
  points, and once it ends how — the target reached, out of time, or ended;
  compete's
  target, and at the end who won and at what, or that nobody did.
- **The printer** (`pdf/printBogglePdf.ts`) is the letter grid at a fixed size
  (a 6×6 prints bigger than a 4×4) with the setup rows beside it, above the
  found words in columns, the missed ones folded in once the game has ended as
  they are on screen. The shared design language is
  [common/pdf/doc.md](../../src/common/pdf/doc.md)'s.
- **No event log and no history viewer.** A found list is alphabetical, not
  chronological, so there is no turn to replay.

---

## 9. Tests

pgTAP, in `supabase/tests/boggle/` — `setup.psql` gives every file a fixture
board whose required set is six words worth nine points:

| file | pins |
|---|---|
| `create_game_test` | both modes' rows and page blobs; the title formula, a multiface die expanded to the letters a player sees; the validation guards — mode, the compete player floor, band and `legal_band` (below the required band refused), ladder, dice set, an outsider |
| `custom_board_test` | the RPC's half of the custom board: accepted and stored, `custom_board` stripped from the club's saved default, a custom board with zero required words refused and a ROLLED one with none not (the floor is custom-only, on purpose) |
| `game_data_test` | the page blobs: a fresh game's puzzle — its tiles in row order, a two-letter tile's letters and a blank's null, both word lists flagged and totaled; the coop and compete mid-game counts, the found words carrying every racer's rows (the page withholds, not the builder); the endings — the crosser alone solved, the top score leaving a conceder's points out, a coop target stamping every teammate, a Stop neutral; a Restart; a rebuild of every game without re-dating it |
| `gameplay_test` | the trusting commit — the row stores the word, points and `is_bonus` it was sent, with no content check; the coop and compete duplicates; the game-over and already-conceded races; `stop_game` and `submit_timeout`, a second call the game-over race; a non-player refused |
| `win_test` | the win target: the team (coop) or the first to cross (compete) wins the moment the required score reaches it, the crosser alone ranked 1 |
| `concede_test` | refused in coop; a conceder is out while the others race; the last one out ends the race as a collective loss |
| `replay_test` | the found list cleared, the ending reset, the timer zeroed, the board kept; any player may, mid-game or after; a non-player may not |
| `rls_test` | a member sees every row of both tables in both modes; an outsider sees none |

Vitest, beside the code:

| file | pins |
|---|---|
| `lib/solver.test` | parity against the C oracle fixture (90 boards, every size, multiface and blanks) and the ladders |
| `lib/dice.test` · `lib/generate.test` · `lib/setup.test` | the eight dice sets, n² dice of valid faces; the multiface and blank display; the roll; the cross-field band rule |
| `lib/boardTrace.test` | traces agree with the solver; `tracePath`'s cells in order, never reusing a tile; `traceCells` settling a one-candidate letter, holding a maybe, keeping the prefix lit past a letter the board cannot follow, and every cell a maybe past the step budget |
| `lib/customBoard.test` | the round trip the feature rests on — the `Letters` setup row read back by `parseCustomBoard` is the board again, over 200 rolls of each dice set, with a check that the rolls reach every multiface and blank face; then the mixed-case rule by name (`Qu` is one tile, `QU` and `qu` two, a lowercase paste keeps its `an`/`in`/`th`), and the field's cleaning and tile-counted cap |
| `lib/answer.test` | every answer's words and outcome, and the split of a miss by whether the board spells it |
| `hooks/useGame.test` | `gd` from the blob — the links become players, the tiles by id, the setup rows, the state line's team or own counts; the seat rule mid-race and at its end; the memo on the blob |
| `components/PlayArea.test` | the surface mounts in every mode and ending; the celebration — a coop target and my race win pop as they land, somebody else's win and a game opened already won do not; the action row; a required, bonus and untraceable word; trace as you type — settled, held, the dimmed letter, the shake replayed, the inert finished board; the peer narration; concede and the strip's *out* / *Conceded at*; the keys — New game, Stop, Concede, Rotate (a half-tapped path kept through a turn), Restart |
| `components/SetupForm.test` | the form's settings and the refusals under the fields they name |

Playwright, in `e2e/`: `boggle` (a required word lands and an off-board word
is refused; tap-tracing a path, with adjacency and backtrack; a tapped tile
does not steal focus; a typed board played and read back off the `Letters`
row, the custom board end to end), `boggle-mobile` (the board fills with no
scroll and the info sheet works, at phone sizes), and `boggle-print` (a real
PDF downloads).

The edge function's solver is the same `lib/solver.ts` the parity test pins.

---

## 10. Deployment notes

boggle has **no data import** (it generates boards on demand), but its edge
function needs the bundled `wordlist.ts` asset, which is git-ignored.
`gmake deploy-funcs` regenerates it first, **from the local stack** (the hosted
`common.words` isn't seeded until a later step), before deploying functions;
`gmake project-config-api` includes `boggle` in the PostgREST exposed-schemas
allowlist.

---

## 11. Deferred

- **"Board constraints" is the one setup summary that doesn't say what's set.**
  Every `<SetupSection>` in the app carries its live value in the summary —
  `Timer: none`, `Dictionary: 3 (Familiar)`, `Turns: 9` — so a player reads the
  whole form without opening anything. boggle's constraints section is labeled
  with the bare name, so the only way to learn whether a min/max is set is to
  expand it.

  Left to boggle because it is the hardest one to phrase, not because it is
  unimportant: it holds a 3×2 grid (Words / Score / Longest, each min and max),
  any subset of which may be filled, and the other summaries all describe a
  single value. The nearest precedent is its sibling — wordwheel writes
  `Board constraints: unique letters only`, falling back to
  `Board constraints (optional)` when none is set — so the shape exists, and
  what's missing is a phrasing that survives six possible numbers.

  Raised 2026-08-25 in the CSS sprint's `forms` area, where the rule was set
  (Joel: everything in a `<SetupSection>`, and its summary carries the value).
  All 15 other games conform.

- **The "Board constraints" grid is the last hand-rolled field in any setup
  form.** Every field type a setup form has is a shared component —
  `SetupTimerSection`, `DictBandField`, `SelectField`, `RadioRow`,
  `SetupCoopStyleSection`, `ManualBoardField`, and now `NumberField`,
  `CheckboxField` and `DateField`. This grid is the one exception: six raw
  `<input type="number">`s laid out 3×2 (Words / Score / Longest, each min and
  max) with column heads and a local `Row` helper, wearing `.grid` / `.colHead`
  / `.rowLabel` / `.numInput` from boggle's own module.

  **Left here on purpose, not overlooked** (Joel, 2026-08-26). Six numbers in a
  labeled matrix is a GRID, not six independent fields — `<NumberField>` exists
  and would fit each cell, but wrapping each cell in it does not answer the
  question this thing actually poses, which is what a min/max matrix should look
  like when only boggle has one. Whoever takes it decides that first; the cells
  are the easy part.

  Raised 2026-08-26 in the CSS sprint's `forms` area, while writing the three
  components above.

- **Compete classic dupes-cancel** scoring as an opt-in — moved to
  [`src/boggle/todo.md`](../../src/boggle/todo.md) → Maybe: the open question is
  whether we want the rule at all, not how to build it.

## 12. Won't do

- **Word-list freshness via Supabase Storage** (2026-08-03). The bundled list is
  frozen at deploy, so editing the dictionary doesn't reach boggle until the
  function is redeployed. The proposed middle ground was a gzipped list in a
  Storage bucket `fetch`ed at cold start — refresh by re-uploading one file, no
  redeploy and no DB scan. **`gmake deploy-funcs` already regenerates the
  asset** (§5), so the answer to "I changed the word list" is to run it, and the
  bundle is also the *fastest* of the three (measured cold-start floors: bundled
  ~21 ms required / ~76 ms full; DB query at startup ~48 ms / ~128 ms local,
  more on hosted; Storage sits between). Buying staleness-immunity we don't need
  with cold-start time we'd rather keep is the wrong trade.
- **A "check board" helper** (2026-08-03). It was listed here as a sibling of
  MonkeyGrams' — that one shipped, and building it made clear the two aren't
  siblings at all. bananagrams' check answers an objective question about a
  board **you** built ("are these strings words, is the grid connected?"), so
  there's a right answer to paint. A boggle grid can't be wrong: the dice are
  what they are, and every legal word is already in a list the FE holds. A
  "check" here could only mean *"tell me a word I haven't found"* — that's a
  hint, i.e. the solver playing for you, and this game already reveals every
  missed word once it has ended. No helper.
