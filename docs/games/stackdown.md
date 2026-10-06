# stackdown

A mahjong-style word game. Thirty letter tiles are stacked so only "exposed"
tiles can be picked; the player clears the board by finding six 5-letter
words in sequence, each found word permanently removing its tiles and exposing
the ones beneath.

> **Brand ≈ codename here.** User-facing brand is **StackDown**; the identifier
> everywhere in code / DB / schema is the codename `stackdown`. (Unlike
> waffle/SyrupSwap, wordle/WordNerd, or scrabble/RackAttack — where brand and
> codename are genuinely different words — here the two are the same word, only
> the casing differs.)

stackdown is a **coop / compete sibling pair** like the other multiplayer
games (`stackdown_coop`, `stackdown_compete`), and inherits the shared chrome
— timer (or none), chat, presence-pause, manual "Stop game" — through
`<GamePage>` + `useCommonGame`.

---

## 1. Rules

- The board holds **30 tiles** on a fixed geometry with a covering (stacking)
  relationship. A tile is **exposed** (pickable) iff no remaining tile covers
  it. Every tile's letter is visible from the start — there is no hidden board;
  the puzzle is figuring out the words, not uncovering letters.
- You build a word by clicking exposed tiles **one at a time, in order**. Each
  clicked tile is **removed at the moment it is picked** (it leaves the board
  and joins the five slots below), which may **expose** tiles it was
  covering — those become available for the *same* word, later in the sequence.
- **The word is the pick order.** Letters are read off in click order.
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
  the five slots returns it *and every tile picked after it* to
  the board (in their places). Only a **completed, accepted** word is
  irreversible.
- The board is solved when all 30 tiles are cleared as **six** accepted words.

### Coop vs compete

- **Coop** — one **shared** board, but each player builds words
  **independently**: the word being built is *private*, never sent, so
  teammates try words in parallel instead of taking turns on one shared word.
  What's shared is the result — a word accepted by anyone removes its tiles from
  the board for everyone, and every submission (found / bad word, hint / word
  request) shows up in the event log for the whole team. The team
  wins when all six words are found; the countdown expiring (if a timer is set)
  is a shared loss. (Two players can build from the same tile at once; whoever
  submits a valid word first claims it, and the other's in-progress word — now
  missing a tile — resets.)
- **Compete** — every player gets the **same starting board** but plays it
  **independently**. You see nothing of opponents except their running tally —
  `Found: Joel 2 · Moth 1`. It's a **race**: the **first** player to clear
  all six words wins immediately; if the timer expires, or every racer
  concedes, everyone loses.

---

## 2. Board model

### 2.1 Geometry (fixed)

An integer 9×9 grid: each tile occupies a cell `(x, y, z)` (`z = 0` base, higher
= raised). Neighboring tiles are two cells apart; a raised tile sits one
diagonal step from each base tile it rests on. **Positions and the covering DAG
are a constant** — the same physical shape every puzzle (like the reference
board). Only the *letters* vary between boards. This shrinks generation to a
letter-assignment problem on a fixed DAG.

### 2.2 Covering rule

Tile **A covers B** iff `A.z > B.z` **and** `|A.x − B.x| ≤ 1 && |A.y − B.y| ≤ 1`
(the `≤ 1`, not `< 1`, is because the integer layout places overlapping tiles
exactly one cell apart diagonally). A tile is **exposed** iff no *remaining*
tile covers it. The covering relation is a DAG; exposed tiles are its sources
among the remaining tiles.

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
> is populated for every band-1 (len-5) word and all but two band-2 ones
> (`src/stackdown/todo.md`). Those two are a data gap, not a shape the game handles:
> a missing hint is a **fault**, and the RPC says so rather than answering
> "no hint for this word".

**Runtime does not consult a lexicon at all.** Because the strict invariant
(§2.4) guarantees the only completable word at each round is the solution word
`Wi`, `submit_word` simply checks the submission against the next solution word
(`solution[cleared + 1]`, the same cleared-count math as `reveal_next_word`).
Even if a stray board ever slipped a non-solution legal word past the generator,
we'd never want to accept it — so there's nothing to gain from a dictionary
lookup, and adding one would only couple runtime validation to the generator's
exact word list ("pin runtime to the same list or get phantom forks") for no
benefit.

**Word case.** Words are stored **lowercase** everywhere — `boards.words`,
`games.solution`, and the logged `events.word` — matching `common.words`
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

Built as the standard sibling-manifest pair (`stackdown_coop`,
`stackdown_compete`) on a per-gametype `stackdown` schema. Migration:
`supabase/migrations/20260626000000_stackdown.sql`.

### 5.1 Tables

| table | what it holds | visibility |
|---|---|---|
| `stackdown.boards` | the pre-generated library: `tiles` jsonb, `words text[]` (the six, in clearing order), `band int` (word-difficulty 1..6; the pool `create_game` filters on) | **definer-only** — `words` is the full spoiler; no grant to `authenticated` |
| `stackdown.games` | one row per game, keyed `game_id` to `common.games`: `tiles` jsonb, `solution text[]`, `board_id` (provenance). The band is `setup.band`; the mode is `common.games.mode` | `tiles` granted; `solution` **column-excluded** |
| `stackdown.players` | `(game_id, user_id)` → `n_found_words`, each player's own count in both modes. A solve is `common.game_players.solved_at` | club members |
| `stackdown.events` | the durable game log, keyed by a `bigint identity` and read `order by id`. `kind`: `'word'` (a played word → `word` / `tile_ids` / `valid`) or `'hint'` / `'spoiler'` (a logged cheat request → `for_word_index`, plus the revealed text in `word`: the hint's clue or the word itself). `took_turn` is true on a `word` — accepted or refused — and on a `spoiler`, false on a `hint`: stackdown has no rotation, and the column is the record of turns taken regardless | club members |

**The page reads none of these tables.** The column grant keeps `solution` off
every client read, and the page blobs below carry it only once the game has
ended. The policies are the club-member gate alone; what a racer may not see
of a rival mid-race is `useGame`'s rule, applied to the blob.

`board_id` is `on delete set null` — **retiring a board does not delete games
built from it**. A game copies the board's `tiles` / `words` at creation, so
it's self-contained; `board_id` is provenance only.

### The page blobs

`stackdown._rebuild_data_cols` writes them at create, at Restart and at the end
of every move, each assigned whole: `shell_data` through
`common._make_json_shell_data`, and on top of the common part of `game_data`
and `summary_data` this game's own. `stackdown._rebuild_data_cols_for_all()`
rebuilds every stackdown game without re-dating it.

| blob | stackdown's part |
|---|---|
| `game_data` | `puzzle: {tiles, nReqdWords, solution}` — the stack as 30 `{id, letter, x, y, z}` tiles by tile number (the id is the number as text); the six words to clear; the six words themselves, null until the game ends. `team: {nFoundWords, nHintsUsed, nSpoilersUsed}`, the players' own counts summed, null in compete. `events`, every row `{id, userId, kind, word, clue, tileIds, valid, tookTurn, at}` — a hint's text is its `clue`, a played word's tiles are ids in pick order. On each player their own `nFoundWords`, `nHintsUsed` and `nSpoilersUsed`, and `board: {tiles}` — the tiles still on their stack, the one shared stack on every seat in coop |
| `summary_data` | `team`, as above; `nReqdWords`; `band` |

**The builder writes every stack and every row.** What a racer may not see yet
— a rival's stack and log rows mid-race — `useGame`'s seat rule withholds;
their count of words cleared stays, the one number a race publishes:

    coop                 →  shared, like the stack
    compete during play  →  your own rows only, and a rival's stack null
    compete once ended   →  everyone's, stacks included

### How a game ends

The ending is `common.games`' reason, detail and outcome
([docs/win-lose.md](../win-lose.md)):

| mode | when | reason / detail | ranked |
|---|---|---|---|
| coop | the sixth word cleared | `reached_goal` / `cleared` | everyone 1, won; every teammate stamped solved |
| coop | the timer | `timeout` | nobody — a loss |
| compete | the first to clear all six | `reached_goal` / `cleared` | the clearer alone; the race ends when decided |
| compete | the timer | `timeout` | nobody — a loss |
| compete | every racer conceded | `conceded` | nobody — a loss |
| either | somebody pressed Stop | `stopped` | nobody — neutral |

### 5.2 RPCs (all `security definer`)

| RPC | job |
|---|---|
| `create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)` | Club-member, player-count (≤ 6), timer and band (1..6) checks, then claims a random board **of the chosen band** (raising if none exists), copies its tiles and words onto a new `stackdown.games`, and seeds one `players` row each. |
| `submit_word(p_game_id, p_tile_ids int[])` | The core move. Locks the game row (`for update`, which is what keeps two coop players from clearing the same word); validates the five tiles are distinct, uncleared, and **reachable in the given order** (replaying `_is_exposed` tile by tile — the server is the authority on legality); logs the submission, valid or not; on a valid word bumps the caller's `n_found_words` and, on the sixth, ends the game. Answers `{result: 'accepted' \| 'invalid'}` alone — a refused word is an **`ok`**, because the rules were applied and nothing was cleared. A valid **coop** word also rewrites the title (see below). |
| `reveal_next_word(p_game_id)` | The **spoiler**: the next solution word the caller still has to clear (`solution[cleared + 1]` — strict validity forces clearing in order, so the count cleared is its index), defeating the hidden solution on purpose. Answers `{result: 'spoiler', word}`. Logs a `kind = 'spoiler'` row holding the word, deduped per `(player, for_word_index)`. |
| `reveal_next_hint(p_game_id)` | The **hint**: the next word's clue (`common.words.hint`, which points at the word without naming it); the word never reaches the client. Answers `{result: 'hint', clue}`. Every word a stackdown board can hold carries a clue, so a missing one is a fault. Logs a `kind = 'hint'` row holding the clue, deduped the same way. |
| `submit_timeout(p_game_id)` | Countdown expiry: reason `timeout`, nobody ranked. |
| `stop_game(p_game_id)` | The neutral Stop, **both modes**, through `common._stop`. Coop's row and menu show Stop; compete's show Concede, whose question offers stopping for everyone as its second answer. |
| `concede(p_game_id)` | The compete drop-out. stackdown is a race with no elimination, so `common._concede` decides it all: the caller is out, and the game ends as a collective loss when the last racer drops. |
| `replay_board(p_game_id)` | Restart, from a finished game or mid-game, both modes: zeroes the counts, deletes every `events` row (words and cheats — a replay is a genuine second try), puts the title back to "New game" (else a replayed coop game would advertise the cleared words, spoiling the board it just reset), and hands the common half to `common._reset_game`. The stack and the solution stay; the solution leaves the blob again with the ending. |

**Every RPC that changes the game ends by rebuilding the page blobs** — a word,
a hint, a spoiler, and every ending.

**What the three player RPCs answer** ([envelopes.md](../envelopes.md)):

| | | |
|---|---|---|
| `submit_word` → `accepted` · `invalid` | `ok`, no outcome | how it reads is `lib/answer.ts`'s |
| `reveal_next_word` → `spoiler` · `reveal_next_hint` → `hint` | `ok`, no outcome | likewise |
| `PN291` "Someone cleared those tiles" | `race` | coop's stack is one shared object, so a teammate's word takes your tiles between your pick and your submit; they leave with the next blob, so no local gate can see it coming |
| `PN486` "Game over" · `PN483` "Already conceded" | `race` | from `common._raise_game_over` and `common._raise_already_conceded` |
| `PN289` `BUG: submit after solving` · `PN290` `BUG: word that was not five distinct tiles` · `PN292` `BUG: word using a covered tile` | `fault` | the board only ever offers exposed, uncleared tiles, five at a time |
| `PN298` · `PN299` `BUG: reveal/hint after the stack was cleared` · `PN297` `BUG: no hint for a band-N word` | `fault` | both buttons go once you can't play |
| `PN485` "That game was already deleted" | `race` | from `common._raise_game_deleted`, asked before the membership gate: a friend may delete the game from the club list mid-move |
| `PN051` (`create_game`) | `fault` | |

### Title formula

A stackdown game is created titled **"New game"** (the gametype logo, not the
title, identifies the game in the club list — so a static "stackdown" title
would just be noise).

**Coop** then rewrites the title to the words cleared so far, on every valid
word: the first three, uppercased and `-`-joined, with a trailing `…` once a
fourth is cleared — `EAGLE`, `EAGLE-TABLE`, `EAGLE-TABLE-PLANS`,
`EAGLE-TABLE-PLANS…`. The club list reads a coop game's progress at a glance,
and the final value persists into history (`_end_game` doesn't touch the title).
This reveals nothing new — coop's cleared words are shared and already in the
event log. The formula is `stackdown._found_title(solution, n)`.

**Compete** keeps the create-time "New game". Its found words are hidden from
the rival (same board, same hidden solution, raced independently — only each
racer's count is public), so putting them in the *shared* club-list title would
hand a trailing racer the upcoming words.

### The answers (`lib/answer.ts`)

Every answer stackdown gives is one of eight, mine and a teammate's:
`accepted` / `accepted_peer`, `invalid` / `invalid_peer`, `hint` / `hint_peer`,
`spoiler` / `spoiler_peer` (`GAnswer`). `answerMessage(answer)` says how each
reads — its outcome and its words — and is the only place that does:

| answer | outcome | words |
|---|---|---|
| `accepted` | won | none: the slots flash the word and the tiles leave |
| `accepted_peer` | won | "found EAGLE" |
| `invalid` | lost | "Not a word: EBATL" — it names the word because the tiles have just gone back and taken it off the screen |
| `invalid_peer` | lost | "tried EBATL" |
| `hint` | warning | "Hint: <clue>" |
| `hint_peer` | warning | "revealed a hint" |
| `spoiler` | lost | "Next word: EAGLE" |
| `spoiler_peer` | lost | "took a spoiler" |

A refused word is the WRONG word, not a near miss: the board only ever exposes
the six solution words. A hint is a nudge you paid for, amber as in every game;
a spoiler ends the hunt for its word, so it is red. A teammate's hint and
spoiler name the act and never the content, so their spoiler never spoils the
word for me.

Everything holding a log ROW asks the same file: `peerAnswerOf(row)` reads a
row's answer, taking `kind` before `valid` because a request row leaves `valid`
null, and `eventToOutcome(row)` colors the log's bar. The RPC envelopes carry no
outcome and no sentence for any of these — the frontend's words are the only
words — and both halves are tested: `lib/answer.test.ts` pins every answer, the
pgTAP pins the nulls ([outcomes.md → How a game does
it](../outcomes.md#how-a-game-does-it)).

The two keystroke refusals — no exposed tile bears the letter, or more than one
does — write no row, so they are not answers: the pill is their only surface.

### 5.3 Frontend (`src/stackdown/`)

Folder [`src/stackdown/`](../../src/stackdown/), the shape
[`docs/playarea.md`](../playarea.md) describes, on the page blobs: `useGame` is
`makeGameData(game_data, me)` — no read, no subscription — and every type the
folder exports is in [`types.ts`](../../src/stackdown/types.ts), the `gd`
sketch at its top.

```
<PlayAreaLoader {...PlayAreaLoaderProps}>   useGame: gd from the game_data blob
  └── PlayArea                      the coordinator: picks the stack to show
        ├── BoardCol                the stack and the entry row; owns the move
        │     ├── Board             the stack; decides each tile's marks
        │     │     └── Tile        one tile — ringed, lit, flashing, wearing an answer
        │     ├── HistoryBanner ←   over the entry row while a past turn is open
        │     ├── WordEntryRow ←    ⌫ | WordEntry (the five slots) | Submit
        │     └── FeedbackPill ←    the local slot, in its own reserved row
        ├── InfoSheet ←             off-canvas on a phone, a flex child on desktop
        │     └── InfoCol           the readouts and the action row
        │           ├── StateLine   "2 / 6 words cleared · 1 hint · 0 spoilers used"
        │           ├── OpponentStrip ←    compete only: each racer's count, or "out"
        │           ├── InfoActionsRow ←   one row, every action, in the menu's order
        │           ├── the revealed words "The words were …", once Reveal is pressed
        │           ├── SetupDisclosure ←
        │           └── GameEventLog       every row I may see
        └── CelebrationBlockingModal ←     my win, when it happens
```

`PlayArea`'s hooks: the two ending messages (`useGetGameEndingMessage`,
`useGetPlayerEndingMessage`, from `lib/gameEndingMessage.ts` and
`lib/playerEndingMessage.ts`), `useShowTeammateMoves` (a teammate's move in the
header, and marked on their tiles), `useHistoryView` and `useActionsAndMenu`
(the hint ladder through `lib/askForHintOrSpoiler.ts`). `BoardCol`'s:
`useWordMove` — the word being built (`useCurrentWord`) and its trip to the
server, with the marks my own answer wears — and `useBoardColActions`: the
three commands (Submit, ⌫, a typed letter), with the gate `canPick` and the
red ambiguous-letter flash. No `MobileStatusBar`: the stack on
screen is the progress.

**The word being built is private in both modes**: picks are never sent, so
teammates try words in parallel; what's shared is the result. It is read off my
stack as the blob has it — a word a teammate's clear took a tile from is empty,
and an accepted word's tiles stay off the board until the blob that has them
gone arrives.

**The word-entry row** is the shared `<WordEntryRow>` around stackdown's own
five-slot `WordEntry` — `⌫ | the five slots | Submit`, the same control every
typing game wears ([playarea.md → Text
entry](../playarea.md#text-entry--capture-not-input)). What stackdown cannot use
is `<WordEntryArea>`: its "entry" is picked-up **tiles**, not a text buffer, so
`WordEntryArea`'s capture keyboard, arrow-history and string `value` have
nothing to bind to.

- **Filling the fifth slot does not submit.** You commit deliberately — the
  Submit button or `Enter` — so a wrong fifth tile is recoverable. Submit is
  enabled at exactly five tiles, and the Submit action's own `pending` is the
  one guard against a second send.
- **Three ways to take a tile back**: `⌫` or the ⌫ button removes the most
  recent, and clicking a filled slot returns that tile *and every tile after
  it* (the word is an order). The button is the touch twin of the key, since
  stackdown has a supported phone layout and no keyboard there.
- **Non-swap**: the pill has its own reserved row below, so the buttons stay
  visible while it shows, and both stay mounted and merely disabled when they
  can't act, so the region never reflows.
- **Keys** (three actions — `act-pick-tile`, `act-delete-last`, `act-submit`):
  a letter plays the matching tile, but only when exactly one exposed tile bears
  it. No match shows a `lost` pill ("No 'X' tile is on top"); more than one
  shows a `warning` pill ("N 'X' tiles are on top — click one") and rings the
  candidates red.

**My own answer** shows where I am looking: an accepted word flashes in the
slots for a beat while its tiles leave; a refused word stays in the slots
wearing the refusal, its tiles off the board until the beat ends, then they land
back wearing the attention flash. **A teammate's word** is marked on their
tiles: the attention flash, then the answer's color — and an accepted word's
tiles are HELD on the board, inert, until the answer has been read.

**Which tiles are drawn** follows one rule, `lib/board.ts`'s `offBoardIds`,
which the screen, the printout and each print track share: while playing, the
cleared tiles are gone; once the game has ended **the stack comes back only if
it came down** — a cleared board would otherwise be blank, and an uncleared one
stays as the players left it, since that is the whole record of how it went.

**The ending**: no modal carries the verdict ([ui.md → Terminal
results](../ui.md#terminal-results--the-moment-vs-the-record)); the pill and the
action row's line say it, from the server's reason and my outcome — coop "Won:
stack cleared" / "Lost: out of time"; compete "Won: cleared it first" vs a loss
naming the winner as the message's `actor` ("● moth cleared it first"), while
the no-winner endings ("Out of time — no winner" / "Nobody cleared it") drop
the `Lost:` prefix. My win pops the shared `<CelebrationBlockingModal>` once,
when it happens. The six words wait for Reveal — never automatic, unless I
cleared all six myself (`impliedBy`), since Restart re-runs this very stack.

**The turn-history viewer**: a log row's `#N` replays that turn's stack
(`lib/history.ts`): the full stack less every valid word strictly before it, so
the turn's own word is still on the board, ringed green. In compete the stack
replayed is the row's author's — mid-race always mine, at the end anyone's.

**One case, the data's.** The words are stored lowercase and the tiles'
letters uppercase, as the library writes them; the capitals a word wears are
drawn — CSS on the revealed words, by hand in a pill's sentence, the log and
the PDF.

### 5.4 Board generation — a two-step split (gen is slow, import is cheap)

Generation is a few seconds per board (the strict validation), too slow to
re-run across hundreds of boards on every `db-reset`. So it's split, mirroring
`all-words`'s vendored-file pattern:

- **`gmake g-stackdown-genpuzzles COUNT=n [SEED=s] [BAND=b]`**
  (`generate-stackdown-boards.ts`) — the SLOW half, run rarely. `COUNT` is
  required — running with no count just prints usage and generates nothing.
  Loads the 5-letter lexicon at the chosen `band` (`difficulty = band` exactly,
  default 1) from `common.words` (read-only), generates N strictly-valid boards
  on the fixed geometry, and **appends** them to
  `supabase/data/stackdown-boards.jsonl` (one JSON board per line — a committed,
  human-readable library that grows across runs; duplicate six-word sets are
  skipped, so band-1 and band-2 boards coexist in the one file, each line tagged
  with its `band`). A band-N board is made entirely of band-N words.
  Reproducible: board *i* uses `SEED + i`. Does NOT touch the `stackdown`
  tables. Each board is bounded by a wall-clock budget (default 30s,
  `STACKDOWN_BOARD_TIMEOUT_MS`): a pathological word-set whose strict-validation
  search blows up is skipped rather than hanging the run. (Validation is also
  kept fast by pruning the `reachableWords` DFS to letter-prefixes of real words
  and precomputing the covering relation once.)
- **`gmake g-stackdown-puzzles ENV=local`** (`import-stackdown-boards.ts`) — the
  CHEAP half. Reads the JSONL file and replaces `stackdown.boards` with it
  (delete-all + insert, one transaction). A reset wipes the table (plain table,
  not seeded by migrations), and `create_game` raises if the library is empty —
  `gmake db-reset` re-runs this via `db-data`.

(Heads-up: a reset also wipes `common.words`, which board generation reads — the
gmake graph orders that for you (`g-stackdown-genpuzzles` depends on the local
words import; `db-data` runs `all-words` before `g-stackdown-puzzles`). You only
re-run `g-stackdown-genpuzzles` when you actually want NEW boards.)

### 5.5 Tests

**pgTAP** (`supabase/tests/stackdown/`, on the fixture board in `setup.psql` —
EAGLE, TABLE, PLANS, APPLE, JUICE, LEMON, spelled by `sd_seq(1..6)` — which
**deletes any library boards first** so `create_game`'s `order by random()` can
only pick the fixture):

- `game_data_test` — the page blobs: a fresh game whole, mid-game coop and
  compete, the endings, a Restart, a rebuild of every game without re-dating it.
- `create_game_test` — the board claim, the band, the hidden solution, a board
  deleted under a game.
- `gameplay_test` — a full coop solve; each move answering its `result` alone
  with no outcome; a refused word spending a turn.
- `compete_test` — the race: the clearer alone ranked, the rival unranked.
- `reveal_test` — the spoiler and the hint: solution order, the dedup, the
  nulls, the gates.
- `stop_game_test` · `concede_test` · `replay_test` — the Stop and the timeout;
  the compete-only drop-out; Restart's resets, the title back to "New game".
- `rls_test` — the member gate alone: a racer reads every row, an outsider none.

**Vitest**, beside the code:

| file | pins |
|---|---|
| `hooks/useGame.test` | `gd` from the blob — the links become players and tiles, the counts and the team, each seat's stack, the seat rule mid-race and at its end, the memo on the blob |
| `lib/answer.test` | every answer's outcome and words; a row read kind first |
| `lib/gameEndingMessage.test` · `lib/playerEndingMessage.test` | every ending's words and my outcome |
| `lib/history.test` | the fold and the strictly-before boundary |
| `lib/board.test` | covering, exposure, depth, the letter's corner |
| `components/PlayArea.test` | the surface on the fixture: concede and Stop; the one action row; the hint; the history viewer; the menu as the icon legend; the reveal; the keys, a send in flight, an accepted and a refused word, a word a teammate's clear took a tile from; `+` and `⌥⌫`; a teammate's word on the board |
| `components/SetupForm.test` | the form's settings |
| `pdf/model.test` | the print model from `gd`: the hidden solution, the log's three kinds in text, one track per board |

**e2e** (`e2e/stackdown-*.e2e.ts`): history (the turn viewer), mobile, print,
and **entry** — the word-entry row's affordance, e2e rather than unit because
what it pins is spread across three places that only exist together in a
document: the fifth tile not submitting, the buttons' enabled-ness, and `Enter`.
It submits a deliberately INVALID word, which exercises the whole commit path
without depending on which letters are on top. stackdown also has cases in
`terminal-reveal` and `tap-targets`.

## 6. Printing the board (PDF)

`src/stackdown/pdf/` — a **"Print board (PDF)"** GamePage menu item, the tenth
game to print (common/pdf/doc.md). Track family: the stack at the top of its
column, the word log beneath.

**The stack prints almost for free**, because `common/pdf/doc.md`'s "every
surface is white" rule is exactly what a mahjong board needs. Occlusion is what
makes the stack legible — a raised tile hides what's under it — and a
white-filled tile painted over a lower one occludes it the same way the screen
does. So the renderer just paints in `z` order and the stacking falls out; no
shading, no rule bent. It shares
[`letterCorner`](../../src/stackdown/lib/board.ts) with the board component, so
a partly covered tile tucks its letter into the same visible quadrant on paper
as on screen — sharing that function is what stops the two drifting. The
screen's warm depth ramp is deliberately NOT carried over: the overlap already
says what's on top, so a shade would be decoration.

**One column per board** ([common/pdf/doc.md →
Tracks](../../src/common/pdf/doc.md#the-body-families)): coop prints the single
shared stack as "Team" with a log that names who played each word; **compete
prints a board per player**, each with its own words and its own "n/6 cleared"
line, three across a page — one board under a merged log would read as though
one person had played alone. The per-player boards are only available once the
game has ended, when every racer's stack and rows open; during play I hold
nobody else's, so only my own column prints (a column built from rows I can't
see would draw a full untouched stack, which reads as "they've cleared nothing"
rather than "not visible yet").

Which tiles print follows the screen exactly, and by construction rather than by
hand: `lib/board.ts` exports `offBoardIds`, and the screen, the printout and
each per-player track all call it, so the surfaces cannot drift apart — the same
reason the [setup rows](../../src/common/setup-form/doc.md#setup-rows) are
shared. While playing, tiles spent on accepted words are hidden; **once the game
has ended the board comes back only if it was cleared** (§5.3 → Which tiles are
drawn). The word being built is not printed: its tiles were picked up, never
spent.

The six words print only once the game has ended, three times over: the blob
carries `solution` only then, the FE holds it back further until I press Reveal
— never automatically, unless I played all six words myself (`impliedBy`;
`replay_board` re-runs this very stack, so an answer left in front of a player
who did NOT clear it would make Restart theater), and the print model refuses to
emit it before then regardless — so neither a lost-game printout nor a future
change can quietly put the answer on paper. The log prints all three turn
kinds, with the valid/invalid/cheat distinction carried in **text**
rather than color, since a mono printer flattens the outcome bar's green and red
to one gray.
