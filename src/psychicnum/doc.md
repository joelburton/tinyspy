# psychicnum

The computer hides three secret words among a board of ordinary ones, and the
club spends a shared or per-player guess budget hunting them. It is the
deliberately minimal game — the one whose job is to exercise the multi-game
architecture with the smallest possible amount of game logic.

## Intro to area

**The frontend never decides anything about a guess.** It holds no secrets
while the game runs — they are column-gated server-side, which is what makes
this game the repo's worked example of a real server-side secret — so it cannot
tell a hit from a miss on its own, and it does not count progress, advance the
turn, or end the game. It is told all of it.

**And it is told twice, on two channels that arrive at different moments.** The
`submit_guess` reply carries the caller's own verdict, and the below-board pill
reads it immediately. The board's permanent green or red does not come from
that reply at all: it comes from the `psychicnum.events` row over the
subscription, which is what every player sees and what a reload rebuilds from.
Everything else a move sets off — the terminal state, a teammate's progress,
the turn moving on — travels the same way, as rows, which is why the reply can
be about one player and nothing else.

That split is why a guessed tile holds its in-flight dim until the ROW lands
rather than until the reply does: the two are separate events, and releasing at
the first would flash an undecided tile back to normal.

*The rest of the intro is owed — pass 2 of this area's audit.*

## Game rules

*Owed — pass 2. Absorbs what [`docs/games/psychicnum.md`](../../docs/games/psychicnum.md) says that the code does not.*

## Schema

*Owed — pass 2.*

## RPCs

Everything the player does reaches the server through one of these, and every
one answers [the envelope](../../docs/envelopes.md). The examples below show
the fields that carry the answer — `data`, `outcome`, `message` — and leave out
the envelope keys that are null in every one of them.

### `psychicnum.create_game(target_club, setup, player_user_ids, mode)`

Deals a game. It samples `word_count` distinct words from `common.words` under
a clean + American + difficulty-band filter, picks three of them as the
secrets, writes the `common.games` row and a per-player budget row, and seeds
the club-list readout. `mode` decides both the gametype string
(`psychicnum_coop` / `psychicnum_compete`) and how the budget behaves — shared
in coop, per-racer in compete. Compete needs two or more players; coop takes
one to six.

**Passed:**

```json
{
  "target_club": "moths",
  "setup": {
    "guesses": 7,
    "word_count": 12,
    "difficulty": 3,
    "timer": { "kind": "countdown", "seconds": 300 }
  },
  "player_user_ids": ["7b1e…", "c904…"],
  "mode": "coop"
}
```

**Returned** — one answer, and `result` names it:

```json
{ "data": { "result": "created", "id": "3f2a…" }, "outcome": null, "message": null }
```

### `psychicnum.submit_guess(target_game, guess)`

The only mid-game move, and the only one that writes a `kind = 'guess'` row.
The guess must be a board word, compared case-folded. **The answer is about the
CALLER's guess and never about the game's fate** — a correct guess that empties
the last of the budget still says `won`, and that the game just ended reaches
every client over realtime instead. `found_all` is true only on the guess that
completes the set.

**Passed:** `{ "target_game": "3f2a…", "guess": "lantern" }`

**Returned — kind: `guess`.** Three shapes, and `message` is null in all of
them: "Correct" and "Incorrect" are the frontend's words, and the outcome is
what it colors them with.

- hit a secret —
  `{ "data": { "verdict": "hit", "found_all": false }, "outcome": "won", "message": null }`
- **completed the set** (the win) —
  `{ "data": { "verdict": "hit", "found_all": true }, "outcome": "won", "message": null }`
- missed —
  `{ "data": { "verdict": "miss", "found_all": false }, "outcome": "lost", "message": null }`

The guess that spends the last of the budget without completing the set is not
a fourth shape: it is whichever of the first and third it was, unchanged. The
loss is not in the answer at all — it arrives by realtime, like every other way
this game ends.

### `psychicnum.request_hint(target_game)`

Picks one of the caller's (compete) or team's (coop) unfound secrets and logs
its dictionary CLUE — never the word. Costs no budget. Many words have no clue,
which is an answer rather than a failure, so `result` says which. Both log a
`kind = 'hint'` row that reaches the event log over realtime, and in coop gives
teammates an "asked for a hint" line.

**Passed:** `{ "target_game": "3f2a…" }`

**Returned — kind: `hint`.** `warning` either way: a hint is neither good nor
bad play.

- the secret has a clue —
  `{ "data": { "result": "hint", "hint": "a light you carry" }, "outcome": "warning", "message": null }`
- it has none —
  `{ "data": { "result": "no-hint", "hint": "No hint available" }, "outcome": "warning", "message": null }`

### `psychicnum.request_spoiler(target_game)`

The same pick, but it hands over the secret WORD itself. Costs no budget and
does not find the secret — you still have to guess it, or not bother. Logs a
`kind = 'spoiler'` row; in coop teammates see that a word was revealed, never
which one.

**Passed:** `{ "target_game": "3f2a…" }`

**Returned — kind: `spoiler`.** One answer, and its outcome is `lost`: a
spoiler ends the hunt for that secret, which is why it wears red where a hint
wears amber.

- `{ "data": { "result": "spoiler", "word": "lantern" }, "outcome": "lost", "message": null }`

### The rest

`concede`, `end_game`, `submit_timeout` and `replay_board` — the common
shape every game has, doing here what they do everywhere.

## FE submissions

Two refusals never reach the server: the board is face-up and its results are
already here, so the frontend answers them itself and writes nothing down. Both
show in the local feedback slot, and both read their outcome from
[`lib/answer.ts`](lib/answer.ts), where every one of this game's answers is
given its word once.

| the frontend refuses | message | outcome |
|---|---|---|
| a word the board does not hold | `Not on the board` | `lost` — the move went wrong, though it cost no budget |
| a word already decided | `Already guessed` | `warning` — nothing happened; you are looking at the answer |

The server keeps both checks, and that is what makes its own answers to them
mean something sharper: a word not on the board is a `fault` (the frontend let
it through), and a duplicate is a `race` — the frontend's results map was stale
because a teammate took the word between the render and the submit. The server
says the same words for the duplicate, so which side caught it never shows.

The third thing the frontend supplies is the WORDS for a verdict it did not
make: `submit_guess` sends no message, and "Correct" / "Incorrect" are written
here, colored by the outcome the server sent.

## Frontend

*Owed — pass 2.*

## Tests

*Owed — pass 2.*
