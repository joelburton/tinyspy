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
| **matched** | what a category is once a correct guess names it; `matched_cat_rank` on the row, `board.matchedCats` on a player; `nMatchedCats` is how many |
| **nMistakes** | the number of wrong and one-away guesses; a count, since the list of them is the log. On a player, their side's — the team's in coop; their own is `own.nMistakes` |

### Coop

One board, one budget: each player's misses are their own, and the budget is
spent by their sum (every player's `nMistakes`); every guess is everyone's. The four tiles of a guess are picked together —
each pick is broadcast as it happens, and the board shows whose it was in
their color. The click rule is on the **union** of everyone's picks
(`lib/picks.ts`): a tile already in it comes out, whoever put it in; an
unpicked tile joins MY picks, up to four across the table. Submit is whoever presses it. Every
answered guess clears everyone's picks — correct, one away, wrong, or
already tried; a guess the server doesn't take keeps it.

The team wins at four bands, and loses on the fourth mistake or when a
countdown expires. Stop ends the game neutrally — nobody won, nobody lost. Turn
order is opt-in (`coop_style: 'turns'`): the server holds the pointer and
advances it on every recorded guess, correct or not, since both spend the
budget; a repeat that the server refuses records nothing and advances
nothing.

### Compete

**The same puzzle, raced separately.** Each racer has their own board, their
own mistakes and their own bands; picks stay local. What a racer learns about
a rival is two counts — mistakes, and categories matched (the Found strip)
— and never a guess or which categories, which the hook's seat rule withholds
until the game ends. At the end every row opens, which is what lets the event
log's player picker read a finished race back.

First to four bands wins, and the race ends for everyone at that moment: the
winner is ranked 1 and the rest, short of the goal, are unranked. Four
mistakes put a racer out; the others play on, and the game ends as a loss
when nobody is left — every racer out on mistakes or conceded. Concede is per
racer. Compete needs an opposing **player**, which is why its manifest takes
2–6 where coop takes 1–6.

### How a game ends

Whichever RPC ends the game passes `common._end_game` the reason pair and the
rankings ([common-schema.md → `common._end_game`](../../docs/common-schema.md#common_end_game--the-one-way-a-game-ends)),
and every surface that names the ending reads those columns through each
player's ending label (`lib/endingLabel.ts`): the club-list line, the
below-board pill, the info column's line and the strip. A racer out while the
others play on reads their own label until the game's ending replaces it. A
win, and a loss to someone who found all four first, are the word alone;
every other loss says what ran out ("Lost (out of mistakes)", "Lost (out of
time)").

| the ending | reason / detail | ranked |
|---|---|---|
| four bands | `reached_goal` / `solved` | coop: every teammate 1; compete: the finder alone |
| coop: the fourth mistake | `resource_exhausted` / `mistakes` | nobody |
| compete: the last racer out | that racer's act — `resource_exhausted` / `mistakes` or `conceded` / `conceded` | nobody |
| the countdown | `timeout` / `timeout` | nobody |
| somebody stopped it | `stopped` / `stopped` | nobody |

A Stop is neutral in every mode; every other ending with nobody ranked is a
loss.

## Schema

Four tables: shape in `supabase/migrations/`, behavior in
`supabase/sql/connections.sql`. The frontend reads none of them: it reads the
page blobs the builder writes onto `common.games`.

| | |
|---|---|
| `connections.puzzles` | the archive: `source_id` (the NYT number), `puzzle_date`, `categories` jsonb. Imported daily by `.github/workflows/connections-import.yml`; public, and pristine — a game copies from it |
| `connections.games` | one row per game, keyed `game_id` to `common.games`: the `board`, and the puzzle's date frozen as `puzzle_date`. `puzzle_id` is a soft, provenance-only FK (`on delete set null`): everything needed to play is on the row |
| `connections.players` | one row per player: `n_mistakes` and `n_matched_cats`, each their own in both modes |
| `connections.events` | the guess log, append-only: `kind` is `guess`, `took_turn` is true, `result` is the wire word (`correct` · `oneAway` · `wrong`), `matched_cat_rank` is set iff correct |

The `board`:

```
{
  categories: [ { rank: 0..3, name: text, tiles: text[4] }, … ],  // four
  tileOrder:  [ text, … ]                                        // sixteen, shuffled once at create
}
```

**There is no tiles table and no matched-categories table.** A matched
category IS a `result = 'correct'` row, joined by its rank to the board; a
tile is on the grid until its category has one. `submit_guess` holds the
rule, under the game row's lock: coop allows one correct row per rank per
game, compete one per rank per player. Deleting the log un-matches
everything, which is how Restart works.

**The page blobs** are written by `connections._rebuild_data_cols` at create,
at Restart and at the end of every move, each assigned whole
([plans/seat-view.md](../../plans/seat-view.md) → The page is written, not
assembled): `shell_data` through `common._make_json_shell_data`, and on top of
the common part of every `game_data` (`common._make_json_game_data`)
connections' own. `static_game_data`, what nothing after create changes, is
written once by `_write_static_game_data`, from `create_game` and the rebuild
over every game, never by a move ([docs/common-schema.md → Title, page blobs and
the two dates](../../docs/common-schema.md#title-page-blobs-and-the-two-dates));
the hook merges it into `game_data`, each key in its place:

| blob | connections' part |
|---|---|
| `static_game_data` | `puzzle: {date, cats, tiles}`, as `create_game` froze it, a tile being `{id, word}` with the word as its id, and a category's `tiles` four of them |
| `game_data` | `team`, the team's facts sent once, null in compete; `events`, every player's rows; on each player their own facts |
| `summary_data` | `team: {nMatchedCats, nMistakes}`, the team's counts, null in compete; `maxMistakes` |

connections' facts (`GFacts`) are `nMatchedCats`, `nMistakes`, `maxMistakes`
and `board: {matchedCats, tilesLeft}`, the grid. Each player's two counts are
their own, on `connections.players` and on their player in the blob, in both
modes; `team`'s are their sum, with the one coop board, which no coop player
carries. `useGame` puts the side's facts on every player — the team's in coop,
their own in compete — and their own under `own`
([common-schema.md → A player's facts](../../docs/common-schema.md#a-players-facts--the-sides-and-their-own)), so the state line reads
`gd.me`. Compete's summary carries no team, where a live count would leak
how close a racer is; the winner is the player the common `players` ranks first.
`connections._rebuild_data_cols_for_all()` rewrites every connections game's
blobs without re-dating them, for a shape change.

**What a racer may see of a rival is the hook's rule, not a policy's.** The
blob carries every player's rows and every seat's board, and `useGame`
withholds a rival's mid-race — a peer's one-away guess plus the public puzzle
would hand you the answer — and opens them at the game's end, which is what
lets the event log's player picker read a finished race back. The policies on
this game's tables are club-member reads in both modes; nothing on the client
reads them.

**What stays server-authoritative** is what has to be atomic: the mistake
count, the one-correct-per-rank rule (a second correct for a rank is a race,
not a second band), the turn pointer, and the ending. `submit_guess` locks
the game row, so two Submits at the same instant serialize.

**Realtime is two rooms**, both stable-named because broadcasts merge only
across matching names: `game:${gameId}` is `useCommonGame`'s (presence, the
manual pause, the timer, the `common.games` row) and `connections:${gameId}`
is `usePicks`'s, the board column's, joined in coop only, for the picks Broadcast (`pick` ·
`unpick` · `clear`, on the `pick` event). The tables have no subscription of
their own: every move rewrites the blobs on `common.games`, and the page
hands the new blob down. The picks are pause-transient by construction: they
live in the hook's state, and `PauseBoundary` unmounts the play surface on a
pause, so a reconnecting table sees a clean grid.

## RPCs

Everything the player does reaches the server through one of these, and every
one answers [the envelope](../../docs/envelopes.md). The examples below are
what `data` carries on an `ok`; `result` names the answer, and a call site
picks its branch by that word and nothing else.

### `connections.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)`

Starts a game on a puzzle. With no `puzzle_id` in the setup it asks
`next_puzzle_for_club` for the earliest date none of these players has
played; with one, it honors it, even for a puzzle everyone has finished (the
date field in the setup dialog is that override, and it is how the pgTAP and
e2e fixtures pin a board). It copies the puzzle's categories onto the game,
shuffles the sixteen tiles into this game's `tileOrder`, titles the game
`<date>: <TILE1>-<TILE2>` from the first two tiles alphabetically, writes the
`common.games` row and one `connections.players` row per player, and writes
the page blobs. A coop game with
`coop_style: 'turns'` also seats the turn order, starting at
`first_turn_user_id`. Compete needs two or more players; either mode takes
up to six.

**Passed:**

```json
{
  "p_club_handle": "moths",
  "p_setup": {
    "puzzle_id": "9c41…",
    "timer": { "kind": "countdown", "seconds": 300 },
    "coop_style": "turns",
    "first_turn_user_id": "7b1e…"
  },
  "p_player_user_ids": ["7b1e…", "c904…"],
  "p_mode": "coop"
}
```

`puzzle_id` and `first_turn_user_id` are optional; the second matters only
with `coop_style: 'turns'`.

**Returned** — one answer:

```json
{ "result": "created", "id": "3f2a…" }
```

### `connections.submit_guess(p_game_id, p_tiles, p_result, p_matched_cat_rank)`

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
puts the racer out while the others play on; the race ends when nobody is
left, and `_maybe_finish_compete` is the one place that rule is written (a
conceder counts as out). A racer out on mistakes has ended
(`common._set_player_ended`), which is how the shared presence-pause learns
to stop waiting on them (docs/common-schema.md → Not playing any more). In
turn-order coop every recorded guess that doesn't end the game hands the
turn on.

**Passed:**

```json
{ "p_game_id": "3f2a…", "p_tiles": ["BASS", "FLOUNDER", "SOLE", "PIKE"],
  "p_result": "correct", "p_matched_cat_rank": 2 }
```

**Returned — kind: `guess`.** Three shapes, one per verdict recorded; the
fact only, and what each is worth is the frontend's (`lib/answer.ts`):

- correct — `{ "result": "correct" }`
- one away — `{ "result": "oneAway" }`
- wrong — `{ "result": "wrong" }`

A guess that wrote nothing is not an `ok` at all: a category somebody else
matched first, or a set of four already tried, comes back as a race.

### `connections.next_puzzle_for_club(p_seen_by)`

The queue's one question: the earliest `puzzle_date` no player in `p_seen_by`
has a game on, in any club. The setup dialog previews it, `create_game`
derives it when no `puzzle_id` is sent, and New game on the play surface
asks it before creating so that running out can be a notice rather than a
failed click. It runs as the definer on purpose, since another player's
solo-club games are invisible to you under RLS and still have to count.

**Passed:** `{ "p_seen_by": ["7b1e…", "c904…"] }`

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

`concede`, `stop_game`, `submit_timeout` and `replay_board` — the common shape
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
in compete, which is exactly the log the seat rule leaves each client — is refused
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
describes — a loader that builds `gd` from the blob, then `PlayArea` in the
eight sections.

```
<PlayAreaLoader {...PlayAreaLoaderProps}>        useGame: the blob becomes gd
  └── PlayArea                           the coordinator: draws no board, no control
        ├── BoardCol                     the board column — the picks (usePicks) and submit_guess
        │     ├── Board                  one grid: the solved bands, then the tiles
        │     │     ├── Band             a category across the row: its name over its four words
        │     │     ├── Tile             one loose tile and the marks this screen adds
        │     │     └── ShuffleButton ←  floats on the board, not in the action row
        │     └── the commit row         Clear · Submit, and the mistakes beside them
        │           ├── StrikeMarks      "Mistakes (lose at 4)" ■■□□, in both modes
        │           ├── FeedbackPill ←   takes the row's place while the local slot holds a message
        │           └── HistoryBanner ←  overlays it while a past turn is open
        └── InfoSheet ←                  off-canvas on a phone, a flex child on desktop
              └── InfoCol                the readouts and the action row
                    ├── StateLine        "2/4 categories found · 1/4 mistakes"
                    ├── TurnStatusLine ← turn-order coop only
                    ├── OpponentStrip ←  compete only: each rival's Found, then how they came out ("2 (lost)")
                    ├── InfoActionsRow ← one row, every action, in the menu's order
                    ├── HintList         unfolds under the row: one Show hint per category
                    ├── SetupDisclosure ←
                    └── GameEventLog     two rows per guess

  ← belongs to common/ ; everything else is this folder's
```

`GamePage` mounts the loader and owns everything above it — members, the timer,
the ending, pause, chat — and unmounts this whole surface on pause. `StateLine`
draws "2/4 categories found · 1/4 mistakes" from `gd.me` inside the
info column's state paragraph.

**`gd`, the game data.** `useGame` hands the surface one object, `gd`: the
`game_data` blob the page was handed (`GGameDataRaw`), with its links turned
into players (`turns.holder`, `ending.by`, each log row's `by`),
`ending.winners` read off each player's `finalRanking`, each row's wire word
read once (`outcome`, `matched`), the setup rows
built, and the seat rule applied — in compete, mid-race, a rival's rows leave
the log and their `board` is null. It is a pure function of the blob and who I
am; no reads, no subscription. Every fact about a seat is on the player
(`gd.me.onTurn`, `p.nMatchedCats`, `gd.me.board.tilesLeft`), and a component
asks a player, never the table. The `picks`, the one live state this game
keeps (the Broadcast room above), are the board column's, from `usePicks`;
nothing above it reads them. **Every type
this game exports is in `types.ts`**, wearing the `G` that says it is the
game's and not the shell's (docs/code-conventions.md → A game's types).

What is connections' own:

- **The board is one grid.** A solved category is a full-width row wearing
  the shared tile face in its rank's color; the tiles are the rest, in the
  puzzle's order, or in the player's own local shuffle (`lib/localOrder.ts`,
  never broadcast). The picked border is the shared one; a peer's pick
  wears their color as an inset mark (`.peerPick`) on a shared board only; a
  verdict fills the four tiles in its pill's outcome, and a band that landed
  under a teammate's hands flashes for everyone but the guesser.
- **The keyboard picks too.** Arrows move a selection cursor over the loose
  tiles (`useBoardSelectionCursor`, the shape `lib/boardShape.ts`), and Space
  is a click on the tile under it — the same union rule, broadcast the same
  way; the cursor itself is never sent. Enter is Submit. A band taking a row
  away moves the cursor to the nearest tile left.
- **Two checks are local** — four tiles picked, and not a set already tried
  (see FE submissions). The verdict is `lib/evaluate.ts`'s, and the pill
  reads `lib/answer.ts`.
- **The mistakes are drawn twice**, and the marks are the board's: the
  commit row below the board carries "Mistakes (lose at 4)" as `<StrikeMarks>`
  in both modes, and the info column's state line restates the count as text.
- **The info column** shows the state line, Found for compete (the shared
  `OpponentStrip`), then the one action row: Hints | Reveal · Restart · New
  game · Concede · Stop, each shown or hidden by its action's own rule, and
  Back to club at the end. Hints unfolds `<HintList>` inline — one row per
  category, each with its own Show hint for the category's first word; per
  player, never broadcast, and it closes with the board.
- **The event log** is two rows per guess (the verdict and who, then the four
  tiles), and a correct row names its category from the board, so an
  opponent's rows name theirs too. The picker's compete options mean
  something only because the seat rule opens once the game ends; an
  opponent's log during play says *Hidden until game ends*. A `#N` replays that turn on the board
  (`lib/history.ts`): the bands matched strictly before it, this turn's four
  tiles lit by what it was, addressed by the row's id so a filter cannot move
  it, and folding the rows of whoever wrote it.
- **The ending** is the pill and the info column's line, from my ending label
  (`lib/endingLabel.ts`, through `useGetEndingMessage`), and the frozen board; a win also
  celebrates — the coop team's, or the racer's own. New game asks
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
| `create_game_test` | both modes' gates (players, the timer, a bad or missing puzzle), the board shape, the title, the summary's team seeded at create |
| `gameplay_test` | `submit_guess` in coop: the payload faults, the two verdicts that cost a mistake, the band, the two races (a matched rank, a repeated set), the two endings, every `ok` carrying no outcome, and a guess into a deleted game answered as the shared race |
| `compete_test` | the compete delta: per-player mistakes and bands, first to four ends it with the finder alone ranked, a racer out on mistakes and the collective loss with the last one out as who ended it, an out racer's guess is a race, timeout, and every club member reading every row — the seat rule is the hook's |
| `concede_test` | a conceder counts as out; the last one out ends the race, everyone conceding as `conceded`; the builder runs after an ending concession |
| `turn_order_test` | the pointer seats, an out-of-turn guess is refused, a fresh guess advances, a race does not |
| `stop_game_test` · `replay_test` · `rls_test` | the neutral Stop, the stopper recorded as who ended it; Restart un-matches by deleting the log; an outsider sees nothing and can change nothing |
| `game_data_test` | the whole `game_data` of a fresh game; the log, each player's own counts, the team's facts with the one board, and each racer's board mid-game; the winner, the summary and `shell_data` at the end; a Restart empties it all; `_rebuild_data_cols_for_all` rewrites every game without re-dating it |
| `rebuild_data_cols_test` | only a call that says so moves `status_changed_at`; a rebuild assigns the whole column and drops a stale key; the statuses keep their column defaults |
| `next_puzzle_test` | the queue is per player and across clubs; a spent archive and an empty date are not-oks naming `puzzle_id`; the override filters nothing |

Vitest, beside the code:

| file | pins |
|---|---|
| `lib/evaluate.test` | the evaluator's boundaries — 1-, 2-, 3- and 4-overlap, ties, order |
| `lib/answer.test` · `lib/endingLabel.test` | every `answerType`'s words and outcome; every ending's label per mode, reason and player outcome, a racer's own included |
| `lib/history.test` · `lib/localOrder.test` | the strictly-before boundary and the lit tiles; a shuffle keeps every tile |
| `lib/picks.test` | the click rule on the union of everyone's picks, and a reducer whose no-op returns the same map |
| `lib/setup.test` · `lib/setupRows.test` | the two keys the default leaves out; the setup rows' order, and a puzzle date that names the same day in every timezone |
| `hooks/useGame.test` | `gd` from the blob — the links turned into players, each row read once, the setup rows, the counts and the board; the seat rule: a rival's rows and board withheld mid-race, opened at the end, nothing withheld in coop; a null blob throws |
| `hooks/usePicks.test` | the picks room: coop joins the game's room once and rebuilds it for a new game, a click applies locally and goes on the wire, compete joins nothing; a clear; the guess complete at four and a fifth pick refused |
| `hooks/useActionsAndMenu.test` | the menu's rows in the action row's order; the reveal's faces before and after the end, and a solver's shown unasked; the hint list's toggle, gone once I can no longer submit |
| `hooks/useHistoryView.test` | live until a turn opens; the board rebuilt at that turn from its author's rows; the actor named only for an opponent's board |
| `hooks/useSubmitGuess.test` | nothing short of four; a set already tried refused locally; the verdict worked out and sent up with its rank; the in-flight dim; a not-ok leaves the picks |
| `hooks/useVerdictMark.test` · `hooks/useMarkForeignGuesses.test` | a mark with a message leaves with its pill, one without stays, a new one replaces the last; a teammate's wrong guess marks their four with no message, their correct one clears, my own row does nothing |
| `hooks/useTileShuffle.test` | the board's order until the first shuffle; the same tiles rearranged, and kept in place when a band takes four away; hidden where the board cannot be shuffled |
| `components/PlayArea.test` | the surface, built from the blob a test's facts would produce (`lib/gameData.fixture.ts`): Concede vs Stop per mode; the ended board, and Reveal / Hide; the celebration, mine only; the board-scope marks; whose pick is ringed; the in-flight dim, the verdict fill and the three ways a mark ends; attention on a band; every key, and the action row per asker |
| `components/SetupForm.test` · `manifest.test` | the puzzle line and the date override; the setup passes through with `puzzle_id` absent unless typed |
| `pdf/model.test` | A–D, whose bands print on whose track, and the log line |

What has no test is the Broadcast wire itself — two tabs actually exchanging
picks — which is manual browser smoke. What those events MEAN when they land is
`lib/picks.test`'s. The pause on a disconnect is the shared rule,
`useCommonGame`'s, and `e2e/presence-pause.e2e.ts` drives it end to end.
