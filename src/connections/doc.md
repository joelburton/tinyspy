# connections

Sixteen tiles hide four categories of four, and the club finds them one
guess at a time with four mistakes to spend. Coop shares one board and one
mistake budget; compete races everyone on their own copy of the same puzzle.
The boards are the NYT Connections archive, played as a queue.

## Intro to area

**The frontend knows the answer.** The board — the four categories and this
game's shuffle of their tiles — is a public column that every club member can
read, in both modes. So the frontend adjudicates a guess itself
(`lib/evaluate.ts`: correct, one away, or wrong) and sends the verdict up, and
`connections.submit_guess` records what it is told. What the server keeps for
itself is everything that has to be atomic: the mistake count, the
one-correct-per-category rule, the turn pointer, and the moment the game ends.
That trade is the friends-only audience buying a fifteen-line evaluator in
place of column grants and PL/pgSQL; psychicnum is the game that shows the
other choice.

**A guess is four tiles, and in coop the four are picked together.** Every
tile someone touches is broadcast to the table before anything is submitted,
so the board shows whose pick each tile is while the guess is still being
built; the guess itself is whoever presses Submit. Compete keeps the picks
local — each racer has their own board, and the only things they learn about
each other are counts.

**The puzzle is chosen for you, and once.** The archive is a queue: starting a
game takes the earliest date that none of the players seated has ever played,
in any club, and New game after a finish moves on to the next one. The setup
dialog carries a date field for the times that is not what you want.

**The end of a game is on the board.** No modal carries the verdict: the
below-board pill says it, and the board stays as the players left it — their
bands, and the tiles they never cracked, frozen. Reveal is a button that
swaps the unsolved categories in, and Hide swaps them back; in compete it
waits until the whole table is done, so a racer who is out still has
something to think about. A win celebrates once, at the moment it is yours:
the coop team's fourth band, or your own fourth in a race.

## Game rules

Sixteen tiles hide four **categories** of four. A category has a **rank**
0–3 — NYT's yellow, green, blue and purple, in that order of difficulty — and
the rank is the color of the band a solved category becomes. A guess is four
tiles, and it is one of three things:

- **correct** — all four in one category: the tiles leave the grid and the
  category becomes a full-width band naming itself, in its rank's color;
- **one away** — exactly three of the four share a category. NYT's nudge, and
  it costs a mistake like a wrong guess does;
- **wrong** — costs a mistake.

Four mistakes is the budget. A set of four already tried costs nothing and
reaches no server: the board refuses it with "You already tried that". The
puzzles are the NYT Connections archive, one a day, played as a queue: a new
game takes the earliest date none of the seated players has ever played, in
any club, and the setup dialog's date field is the override for playing a
chosen one, finished or not.

### Vocabulary

| term | what it means |
|---|---|
| **category** | one of the four hidden groupings of four tiles — NYT's "group", renamed because "group" already means people here |
| **rank** | a category's difficulty index 0..3, and its color. "Rank" rather than "level", which means too many other things; nothing to do with spellingbee's `rank` |
| **tile** | one of the sixteen words. Not "member", which is a person in a club |
| **matched** | what a category is once a correct guess names it; `matched_category_rank` on the row, `matchedCategories` in the hook |
| **mistake_count** | the number of wrong and one-away guesses; a count, since the list of them is the log |

### Coop

One board, one budget: every player's `mistake_count` moves in lock-step, and
every guess is everyone's. The four tiles of a guess are picked together —
each pick is broadcast as it happens, and the board shows whose it was in
their color. The click rule is on the **union** of everyone's picks
(`lib/selection.ts`): a tile already in it comes out, whoever put it in; an
unselected tile joins MY picks, up to four across the table. Submit is whoever presses it. A correct guess
clears everyone's selection; a wrong or one-away guess keeps it, so the
player can swap a tile and try again.

The team wins at four bands, and loses on the fourth mistake or when a
countdown expires. End is the neutral stop — nobody won, nobody lost. Turn
order is opt-in (`coop_style: 'turns'`): the server holds the pointer and
advances it on every recorded guess, correct or not, since both spend the
budget; a repeat that the server refuses records nothing and advances
nothing.

### Compete

**The same puzzle, raced separately.** Each racer has their own board, their
own mistakes and their own bands; picks stay local. What a racer learns about
a rival is two counts — mistakes, and categories **found** (the Found strip)
— and never a guess or which categories, which RLS withholds until the game
ends. At the end every row opens, which is what lets the event log's player
picker read a finished race back.

First to four bands wins, and the race ends for everyone at that moment. Four
mistakes eliminates a racer; the others play on, and the game ends as a loss
when nobody is left alive — alive is not conceded and under four mistakes.
Concede is per racer and counts as not alive. Compete needs an opposing
**player**, which is why its manifest takes 2–6 where coop takes 1–6.

### The play states

Each mode writes its own pair, so a reader of `common.games.play_state` can
tell which was played without joining anything:

| | coop | compete |
|---|---|---|
| four bands | `won` | `won_compete` |
| the budget, or the clock, or everyone out | `lost` | `lost_compete` |

Plus `playing`, and `ended` when somebody stopped it — neutral in every mode.
WHY it ended is the server's word: the RPC that ends the game writes the
reason into `common.games.status.reason` — `solved`, `mistakes`, `timeout`,
`conceded` (every racer walked away), or `manual` — and both surfaces that
name a reason read it: the club-list label and the below-board pill
(`lib/terminal.ts`). A compete win also freezes the winner's name onto
`status`.

## Schema

Four tables, in `supabase/migrations/20260615000003_connections.sql` (shape;
the events rename is `20260917000005_connections_events.sql`) and
`supabase/sql/connections.sql` (behavior).

| | |
|---|---|
| `connections.puzzles` | the archive: `source_id` (the NYT number), `puzzle_date`, `categories` jsonb. Imported daily by `.github/workflows/connections-import.yml`; public, and pristine — a game copies from it |
| `connections.games` | one row per game: the `board`, the `mode`, and the puzzle's date frozen as `puzzle_date`. `puzzle_id` is a soft, provenance-only FK (`on delete set null`): everything needed to play is on the row |
| `connections.players` | one row per player: `mistake_count` and `matched_count`. **Club-wide readable in both modes** — compete's Found strip is built on it |
| `connections.events` | the guess log, append-only: `kind` is `guess`, `took_turn` is true, `result` is the wire word (`correct` · `oneAway` · `wrong`), `matched_category_rank` is set iff correct. `mode` is copied from the game so the indexes and the policy need no join |

The `board`:

```
{
  categories: [ { rank: 0..3, name: text, tiles: text[4] }, … ],  // four
  tileOrder:  [ text, … ]                                        // sixteen, shuffled once at create
}
```

**There is no tiles table and no matched-categories table.** A matched
category IS a `result = 'correct'` row, joined by its rank to the board; a
tile is on the grid until its category has one. Two partial unique indexes
on `events` hold the rule: coop allows one correct row per rank per game,
compete one per rank per player. Deleting the log un-matches everything,
which is how Restart works.

**What stays server-authoritative** is what has to be atomic: the mistake
count, the one-correct-per-rank rule (a second correct for a rank is a race,
not a second band), the turn pointer, and the ending. `submit_guess` locks
the game row, so two Submits at the same instant serialize.

**Realtime is two rooms**, both stable-named because broadcasts merge only
across matching names: `game:${gameId}` is `useCommonGame`'s (presence, the
manual pause, the timer, the `common.games` row) and `connections:${gameId}`
is `useGame`'s — postgres-changes on the three tables, and in coop the
selection Broadcast (`select` · `deselect` · `clear`). The selection is
pause-transient by construction: it lives in the hook's state, and
`PauseBoundary` unmounts the play surface on a pause, so a reconnecting
table sees a clean grid.

## RPCs

Everything the player does reaches the server through one of these, and every
one answers [the envelope](../../docs/envelopes.md). The examples below are
what `data` carries on an `ok`; `result` names the answer, and a call site
picks its branch by that word and nothing else.

### `connections.create_game(target_club, setup, player_user_ids, mode)`

Starts a game on a puzzle. With no `puzzle_id` in the setup it asks
`next_puzzle_for_club` for the earliest date none of these players has
played; with one, it honors it, even for a puzzle everyone has finished (the
date field in the setup dialog is that override, and it is how the pgTAP and
e2e fixtures pin a board). It copies the puzzle's categories onto the game,
shuffles the sixteen tiles into this game's `tileOrder`, titles the game
`<date>: <TILE1>-<TILE2>` from the first two tiles alphabetically, writes the
`common.games` row and one `connections.players` row per player, and seeds
the club-list readout — `{ matched_count: 0, mistake_count: 0 }` in coop,
`{}` in compete, where each racer's counts are their own. A coop game with
`coop_style: 'turns'` also seats the turn order, starting at
`first_turn_user_id`. Compete needs two or more players; either mode takes
up to six.

**Passed:**

```json
{
  "target_club": "moths",
  "setup": {
    "puzzle_id": "9c41…",
    "timer": { "kind": "countdown", "seconds": 300 },
    "coop_style": "turns",
    "first_turn_user_id": "7b1e…"
  },
  "player_user_ids": ["7b1e…", "c904…"],
  "mode": "coop"
}
```

`puzzle_id` and `first_turn_user_id` are optional; the second matters only
with `coop_style: 'turns'`.

**Returned** — one answer:

```json
{ "result": "created", "id": "3f2a…" }
```

### `connections.submit_guess(target_game, tiles, result, matched_category_rank)`

The only mid-game move, and the only one that writes a `kind = 'guess'` row.
`tiles` is the four picked, `result` is the frontend's own verdict in the wire
word the column stores (`correct` · `oneAway` · `wrong`), and
`matched_category_rank` names the category only for a correct guess. **The
answer is about the caller's guess and never about the game's fate**: the
guess that finds the fourth category, or spends the fourth mistake, is
answered like any other, and the ending reaches every client over realtime.

What it does with the verdict: a correct guess writes the row and, in coop,
the fourth one wins for the team; in compete, the caller's fourth wins the
race for them and ends it for everyone. A wrong or one-away guess writes the
row and charges a mistake — the team's one shared count in coop, the
caller's own in compete — and the fourth mistake loses the coop game, or
eliminates the racer while the others play on; the race ends when nobody is
left alive, and `_maybe_finish_compete` is the one place that rule is written
(a conceder counts as not alive). An elimination also sets
`common.game_players.locally_terminal`, which is how the shared presence-pause
learns to stop waiting on that racer (docs/common.md → Done, but not out). In turn-order coop every recorded guess
hands the turn on.

**Passed:**

```json
{ "target_game": "3f2a…", "tiles": ["BASS", "FLOUNDER", "SOLE", "PIKE"],
  "result": "correct", "matched_category_rank": 2 }
```

**Returned — kind: `guess`.** Three shapes, one per verdict recorded; the
fact only, and what each is worth is the frontend's (`lib/answer.ts`):

- correct — `{ "result": "correct" }`
- one away — `{ "result": "oneAway" }`
- wrong — `{ "result": "wrong" }`

A guess that wrote nothing is not an `ok` at all: a category somebody else
matched first, or a set of four already tried, comes back as a race.

### `connections.next_puzzle_for_club(seen_by)`

The queue's one question: the earliest `puzzle_date` no player in `seen_by`
has a game on, in any club. The setup dialog previews it, `create_game`
derives it when no `puzzle_id` is sent, and New game on the play surface
asks it before creating so that running out can be a notice rather than a
failed click. It runs as the definer on purpose, since another player's
solo-club games are invisible to you under RLS and still have to count.

**Passed:** `{ "seen_by": ["7b1e…", "c904…"] }`

**Returned:** `{ "result": "found", "puzzle": { "id": "9c41…",
"puzzle_date": "2026-06-15", "label": "2026-06-15: BASS, FLOUNDER" } }`.
Everyone having played everything is a not-ok, not an empty answer.

### `connections.puzzle_for_date(target_date)`

The override's lookup, and the opposite of its sibling in every respect: it
filters nothing, so a puzzle every player has finished comes back like any
other, and starting it makes a second game rather than reopening the first.

**Passed:** `{ "target_date": "2026-06-15" }`

**Returned:** `{ "result": "found", "puzzle": { "id": "9c41…",
"puzzle_date": "2026-06-15", "label": "2026-06-15: BASS, FLOUNDER" } }` —
the same shape as its sibling, so the setup dialog's one section can take
either.

### The rest

`concede`, `end_game`, `submit_timeout` and `replay_board` — the common shape
every game has, doing here what they do everywhere. Two things are this
game's: `concede` re-runs `_maybe_finish_compete`, because a conceder leaving
can be the last one alive; and `replay_board` clears the guess log, which is
also what un-matches the categories, since a matched category is a
`result = 'correct'` row and nothing else.

## FE submissions

What the frontend decides before a guess reaches the server, and what it says
about the answers that come back.

**Two checks never reach the server.** Submit is offered only with exactly
four tiles picked, and a set of four already tried — by anyone in coop, by me
in compete, which is exactly what RLS lets each client see — is refused
locally with "You already tried that" (`warning`) and writes nothing. The
server keeps the same check, which is what makes *its* answer to a repeat
mean something sharper: a race that slipped past this one.

**The verdict is the frontend's.** `evaluateGuess` answers in the wire word
and `BoardCol` sends it up; the reply names the verdict it recorded and the
call site branches on that, never on the value it just sent.

**Every answer this game gives is named, and `lib/answer.ts` says what it
reads as.** A call site never picks a color, and only the log, the history
banner and the printer write words of their own. Holding a recorded verdict
or its own refusal, a surface names an `answerType` and calls
`answerMessage()`; holding a logged row, it calls `eventToOutcome(row)` for
the log's colored bar, or `peerAnswerMessage(row)` for a teammate's header
line. One function underneath all of them, so the below-board pill, the log
and the header cannot disagree about one move.

| answerType | said to | text | outcome |
|---|---|---|---|
| `correct` / `correct_peer` | me / about a coop teammate | `Correct` | `won` |
| `one_away` / `one_away_peer` | me / about a coop teammate | `One away!` | `near` |
| `wrong` / `wrong_peer` | me / about a coop teammate | `Wrong` | `lost` |
| `already_tried` | me | `You already tried that` | `warning` |

**A pair shares its words.** A teammate's line is their name and then the
same text, so my move and theirs read alike; neither names the category — a
NYT category can run past what the header fits on a phone, and the solved
band lands on the reader's own board at the same moment. The log's row does
name it, and the history banner says `Matched FISH`; those two write their own
words and take only the color. Compete has no peer lines — the guess log is
scoped to the caller, so no foreign rows arrive.

**New game asks first.** Before creating, the play surface asks
`next_puzzle_for_club` so that a spent archive is an acknowledged notice
("No more puzzles", with the two ways forward) rather than a failed create.
The answer is advisory: `create_game` derives the puzzle again, so a peer
taking that puzzle in the gap costs nothing.

## Frontend

The play surface is the shape [`docs/playarea.md`](../../docs/playarea.md)
describes — a loader that gates on the three ways a game can fail to load,
then `PlayArea` in the eight sections.

```
<PlayAreaLoader {...GamePageCtx}>        useGame, and the three gates
  └── PlayArea                           the coordinator: draws no board, no control
        ├── BoardCol                     the board column — and submit_guess
        │     ├── Board                  one grid: the solved bands, then the tiles
        │     │     └── ShuffleButton ←  floats on the board, not in the action row
        │     └── the commit row         Clear · Submit, and the mistakes beside them
        │           ├── StrikeMarks      "Mistakes (lose at 4)" ■■□□, in both modes
        │           ├── FeedbackPill ←   takes the row's place while the local slot holds a message
        │           └── HistoryBanner ←  overlays it while a past turn is open
        └── InfoSheet ←                  off-canvas on a phone, a flex child on desktop
              └── InfoCol                the readouts and the action row
                    ├── TurnStatusLine ← turn-order coop only
                    ├── OpponentStrip ←  compete only: each rival's Found, or "out"
                    ├── InfoActionsRow ← one row, every action, in the menu's order
                    ├── HintList         unfolds under the row: one Reveal per category
                    ├── SetupDisclosure ←
                    └── GameEventLog     two rows per guess

  ← belongs to common/ ; everything else is this folder's
```

`GamePage` mounts the loader and owns everything above it — members, the timer,
play_state, pause, chat — and unmounts this whole surface on pause. The state
line at the top of the info column ("2/4 categories found · 1/4 mistakes") is a
paragraph of `InfoCol`'s own, not a component.

What is connections' own:

- **The board is one grid.** A solved category is a full-width row wearing
  the shared tile face in its rank's color; the tiles are the rest, in this
  game's `tileOrder`, or in the player's own local shuffle (`lib/localOrder.ts`,
  never broadcast). The selection border is the shared one; a peer's pick
  wears their color as an inset mark (`.peerPick`) on a shared board only; a
  verdict fills the four tiles in its pill's outcome, and a band that landed
  under a teammate's hands flashes for everyone but the guesser.
- **Two checks are local** — four tiles picked, and not a set already tried
  (see FE submissions). The verdict is `lib/evaluate.ts`'s, and the pill
  reads `lib/answer.ts`.
- **The mistakes are drawn twice**, and the marks are the board's: the
  commit row below the board carries "Mistakes (lose at 4)" as `<StrikeMarks>`
  in both modes, and the info column's state line restates the count as text.
- **The info column** shows the state line, Found for compete (the shared
  `OpponentStrip`), then the one action row: Hints | Reveal · Restart · New
  game · Concede · End, each shown or hidden by its action's own rule, and
  Back to club at the end. Hints unfolds `<HintList>` inline — one row per
  category, each with its own Reveal for the category's first word; per
  player, never broadcast, and it closes with the board.
- **The event log** is two rows per guess (the verdict and who, then the four
  tiles), and a correct row names its category from the board, so an
  opponent's rows name theirs too. The picker's compete options mean
  something only because RLS opens at terminal; an opponent's log during
  play says *Hidden until game ends*. A `#N` replays that turn on the board
  (`lib/history.ts`): the bands matched strictly before it, this turn's four
  tiles lit by what it was, addressed by the row's id so a filter cannot move
  it, and folding the rows of whoever wrote it.
- **The terminal** is the pill (`lib/terminal.ts`) and the frozen board; a
  win also celebrates — the coop team's, or the racer's own. New game asks
  `next_puzzle_for_club` first, so a spent archive is a notice with two ways
  forward rather than a failed create.
- **No mobile status bar.** Both numbers are already on the play surface —
  the bands are the found count, and the mistakes sit under the board — so a
  bar would restate them and shorten the board for nothing.
- **The printer** (`pdf/`) draws a band as a thick colored border with its
  letter A–D top-left, since a fill is too much ink and a mono printer
  flattens the four colors; the letter is the rank. Coop is the shared board
  and the guess log beneath; compete is one track per player, the full
  answer printed once on the viewer's and a rival's showing only what they
  earned. The log line leads with the verdict, because a long category can
  ellipsize its last tile.

## Tests

pgTAP, in `supabase/tests/connections/` — `setup.psql` gives every file a
fixture puzzle whose date and source id are alien to the real archive:

| file | pins |
|---|---|
| `create_game_test` | both modes' gates (players, the timer, a bad or missing puzzle), the board shape, the title, the seeded status |
| `gameplay_test` | `submit_guess` in coop: the payload faults, the two verdicts that cost a mistake, the band, the two races (a matched rank, a repeated set), the two endings, and every `ok` carrying no outcome |
| `compete_test` | the compete delta: per-player mistakes and bands, first to four ends it, elimination and the collective loss, an eliminated racer's guess is a race, timeout, and the RLS that scopes rows to the caller |
| `concede_test` | a conceder counts as not alive; the last one out ends the race as `conceded` |
| `turn_order_test` | the pointer seats, an out-of-turn guess is refused, a fresh guess advances, a race does not |
| `end_game_test` · `replay_test` · `rls_test` | the neutral stop and its realtime touch; Restart un-matches by deleting the log; an outsider sees nothing and can change nothing |
| `next_puzzle_test` | the queue is per player and across clubs; a spent archive and an empty date are not-oks naming `puzzle_id`; the override filters nothing |

Vitest, beside the code:

| file | pins |
|---|---|
| `lib/evaluate.test` | the evaluator's boundaries — 1-, 2-, 3- and 4-overlap, ties, order |
| `lib/answer.test` · `lib/terminal.test` | every `answerType`'s words and outcome; every terminal sentence per mode and reason |
| `lib/history.test` · `lib/localOrder.test` | the strictly-before boundary and the lit tiles; a shuffle keeps every tile |
| `lib/selection.test` | the click rule on the union of everyone's picks, and a reducer whose no-op returns the same map |
| `lib/setup.test` · `lib/setupSummary.test` | the two keys the default leaves out; the recap's order, and a puzzle date that names the same day in every timezone |
| `hooks/useGame.test` | one stable room per game, rebuilt on `gameId` and never on a session refresh |
| `components/PlayArea.test` | a failed load is not a missing game; Concede vs End per mode; the ended board, and Reveal / Hide; the celebration, mine only; the board-scope marks; whose pick is ringed; the in-flight dim, the verdict fill and the three ways a mark ends; attention on a band; every key, and the action row per asker |
| `components/SetupForm.test` · `manifest.test` | the puzzle line and the date override; the setup passes through with `puzzle_id` absent unless typed |
| `pdf/model.test` | A–D, whose bands print on whose track, and the log line |

What has no test is the Broadcast wire itself — two tabs actually exchanging
picks — which is manual browser smoke. What those events MEAN when they land is
`lib/selection.test`'s. The pause on a disconnect is the shared rule,
`useCommonGame`'s, and `e2e/presence-pause.e2e.ts` drives it end to end.
