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

*The rest of the intro is owed — pass 2 of this area's audit.*

## Game rules

*Owed — pass 2. Absorbs what
[`docs/games/connections.md`](../../docs/games/connections.md) says that the
code does not.*

## Schema

*Owed — pass 2.*

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
(a conceder counts as not alive). In turn-order coop every recorded guess
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
Everyone having played everything is a refusal, not an empty answer.

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

*Owed — pass 2.*

## Tests

*Owed — pass 2.*
