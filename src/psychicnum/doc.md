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
one answers [the envelope](../../docs/envelopes.md).

**An `ok` from this game carries a FACT and nothing else** — `data` only, with
`outcome` and `message` both null. What a fact reads as is the frontend's, in
one place: [`lib/answer.ts`](lib/answer.ts). So the examples below are all
`data`; the rest of the envelope is null. (A `not-ok` is unaffected — a race, a
bug and a service outage are not game logic, and they keep their severity and
their sentence.)

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
{ "result": "created", "id": "3f2a…" }
```

### `psychicnum.submit_guess(target_game, guess)`

The only mid-game move, and the only one that writes a `kind = 'guess'` row.
The guess must be a board word, compared case-folded. **The answer is about the
CALLER's guess and never about the game's fate** — a correct guess that empties
the last of the budget still says `won`, and that the game just ended reaches
every client over realtime instead. `found_all` is true only on the guess that
completes the set.

**Passed:** `{ "target_game": "3f2a…", "guess": "lantern" }`

**Returned — kind: `guess`.** Three shapes. `verdict` is the fact; the words
and the color come from `answerMessage({ answerType: 'hit' | 'miss', word })`.

- hit a secret — `{ "verdict": "hit", "found_all": false }`
- **completed the set** (the win) — `{ "verdict": "hit", "found_all": true }`
- missed — `{ "verdict": "miss", "found_all": false }`

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

**Returned — kind: `hint`.** Two shapes; `result` is what tells them apart, so
no call site has to recognize the fallback by its prose.

- the secret has a clue — `{ "result": "hint", "hint": "a light you carry" }`
- it has none — `{ "result": "no-hint", "hint": "No hint available" }`

### `psychicnum.request_spoiler(target_game)`

The same pick, but it hands over the secret WORD itself. Costs no budget and
does not find the secret — you still have to guess it, or not bother. Logs a
`kind = 'spoiler'` row; in coop teammates see that a word was revealed, never
which one.

**Passed:** `{ "target_game": "3f2a…" }`

**Returned — kind: `spoiler`.** One shape.

- `{ "result": "spoiler", "word": "lantern" }`

### The rest

`concede`, `end_game`, `submit_timeout` and `replay_board` — the common
shape every game has, doing here what they do everywhere.

## FE submissions

**Every answer this game gives is named, and `lib/answer.ts` says what it
reads as.** A call site never picks a color, and only the event log writes words
of its own. Holding a server fact or its own adjudication, a surface names an
`answerType` and calls `answerMessage()`; holding a logged row, it calls
`eventToOutcome(row)` for the log's colored bar, or `peerAnswerMessage(row)`
for a teammate's header line. One function underneath all of them, so the below-board
pill, the log and the header cannot disagree about one move.

| answerType | said to | text | outcome |
|---|---|---|---|
| `hit` / `hit_peer` | me / about a coop teammate | `Correct: APPLE` | `won` |
| `miss` / `miss_peer` | me / about a coop teammate | `Wrong: BERRY` | `lost` |
| `hint` | me | *(nothing)* | `warning` |
| `hint_peer` | about a coop teammate | `got hint` | `warning` |
| `spoiler` | me | *(nothing)* | `lost` |
| `spoiler_peer` | about a coop teammate | `revealed word` | `lost` |
| `found_peer` | about a compete opponent | `guessed a word` | `won` |
| `not_on_board` | me | `Not on the board` | `lost` |
| `already_guessed` | me | `Already guessed` | `warning` |

**An answer is mine or somebody else's, and the `_peer` suffix is which.** The
pair always agrees about the outcome — one event is one color whoever is
looking — and differs only in the words, so a game reading this list can see at
a glance who is told what. Two things it makes visible: asking for a hint or a
spoiler shows ME nothing (the clue and the word are rows, and the event log is
where they belong), and `found_peer` carries no word at all.

**Two of them never reach the server**: the board is face-up and its results
are already here, so `not_on_board` and `already_guessed` are answered locally
and write nothing down. The server keeps both checks, which is what makes *its*
answers to them mean something sharper — a word not on the board is a `fault`
(the frontend let it through), and a duplicate is a `race`.

**Where the secrecy rule lives is in the type, not in anybody's memory.** A
racer may learn *that* an opponent found a secret and never *which*, so
`found_peer` has no `word` field — the leak is unrepresentable rather than
merely avoided. `spoiler_peer` is the same shape: the row holds the secret, the
answer does not.

## Frontend

*Owed — pass 2.*

## Tests

*Owed — pass 2.*
