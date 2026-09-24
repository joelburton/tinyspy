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

**And it is the control.** psychicnum is the deliberately minimal game — the
smallest amount of game logic that still exercises the whole multi-game shell —
which is why the app audit opened here. What this folder settles is the SHAPE a
game area has, not anything about guessing words.

## Game rules

**The board is one board.** N words (5–20, chosen at setup) sampled from
`common.words` under a clean + American + non-slang + difficulty-band filter,
the same N for everyone in the game: five-letter words, plus exactly one
nine-letter word for texture. **Three of them are secret**, the same
three for everyone, and hidden server-side — a client cannot tell which, even
with devtools open (see Schema). Win by finding all three.

A guess is a board word. Click a tile and Submit, or from the keyboard: arrows
move a cursor over the tiles, Space picks the word under it, and Enter guesses.
A hit turns the tile green and a miss red, **permanently**, so the board is the record of what has
been ruled out. Every guess costs one from a budget of 3, 5, 7 or 9.

**Two assists, and the difference between them is the thing this game is
easiest to get wrong.** Both are free, neither finds the secret, and both write
a row that lands in the event log rather than a pill:

- a **hint** logs the *clue* for an unfound secret (`common.words.hint`, or the
  literal "No hint available" for a word that has none). The clue is what is
  logged, so a hint never leaks the answer into the row.
- a **spoiler** logs the *word* itself — one unfound secret, handed over. You
  still have to guess it.

Neither is **Reveal solution**, which is a third thing: the whole answer key at
game over, local to one player, reversible, and no RPC at all. It turns each
secret's tile green — the same green a found one wears, and a found tile keeps 
its guesser's dot where a revealed one has none.

### Coop

One board, one budget, every guess and assist visible to everyone. A guess
decrements every player's row in lock-step, so the budgets are always equal.
The team wins by finding all three together, and loses on the guess that takes
the budget to zero first — or when a countdown timer expires.

**Turn order is opt-in.** The setup dialog offers free-for-all (the default) or
turn-by-turn, and in the second the server holds `current_turn_user_id` and
advances it after each accepted guess. A player waiting their turn keeps the
board but it is inert.

### Compete

**The same board of words, raced separately.** Each player has their own budget
and their own guesses; what differs is not the words but who can see what. A
racer sees their own guesses and assists, every rival's **remaining budget**,
and a count of how many secrets each rival has found — never which words, and
never a rival's rows, which RLS withholds until the game ends.

First to all three wins and the game ends for everyone. If every budget reaches
zero with nobody finished, everyone loses; a countdown expiring does the same.
There is no way to stop a race for the whole table — see
`common/game-page/todo.md`.

Compete needs an opposing **player**, which is why its manifest takes 2–6 where
coop takes 1–6: a solo club is offered coop only. A countdown timer does not
make a game compete.

### The play states

Each mode writes its own pair, so a reader of `common.games.play_state` can
tell which was played without joining anything:

| | coop | compete |
|---|---|---|
| all three found | `won` | `won_compete` |
| budget gone, or the clock | `lost` | `lost_compete` |

Plus `playing`, and `ended` when somebody stopped it. **`ended` is neutral in
every mode**: nobody won and nobody lost, which is not the same as everyone
losing.

**WHY it ended is the server's word too**: whichever RPC ends the game writes
the reason into `common.games.status.reason` — `solved`, `exhausted` (the
last budget spent), `timeout`, `conceded` (every racer dropped out), or
`manual`. The club-list label and the terminal pill both read that column, so
neither works the reason out from the clock or the roster.

## Schema

Three tables and a view, in `supabase/migrations/20260615000002_psychicnum.sql`
(shape) and `supabase/sql/psychicnum.sql` (behavior).

| | |
|---|---|
| `psychicnum.games` | one row per game — the board `words`, the three `secrets`, the `mode`. Keyed to `common.games` |
| `psychicnum.players` | one row per player: `guesses_remaining` and `found_secrets_count`. **Club-wide readable in both modes** — the budget strip and compete's opponent tension are built on it |
| `psychicnum.events` | the turn log, append-only. `kind` is `guess`, `hint` or `spoiler`; `word` holds the guessed word, the clue, or the spoiled word depending on which |
| `psychicnum.games_state` | the view the frontend reads. Every readable column of `games`, plus `secrets` through `_secrets_for()` |

**The club page's "guesses left" is a SUM in compete.** `common.games.status`
carries one number for the listing, and a race has no single budget to report —
so coop writes the shared value and compete writes every player's added
together. A number larger than any setup offers is that, not a bug.

### Two things worth knowing before reading the SQL

**The secrets are hidden by a column GRANT, not by a policy** — a client
asking `psychicnum.games` for `secrets` gets SQLSTATE 42501 whatever any policy
says, and the view hands them over only once the game is terminal. So the
frontend never holds the answer key during play: not in a prop, not in a store,
not there at all. `docs/code-conventions.md` points here as the repo's worked
example; the mechanism is commented at `_secrets_for` and the `games_select`
policy.

**`events` is the only mode-aware RLS in this game**, and its third arm carries
three rules at once: coop shows everyone every row, compete shows a racer only
their own — and **terminal opens everybody's**, which is what lets the event
log's player picker read a finished race back. Commented at `events_select`.

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
a clean + American + difficulty-band filter (five-letter words plus one
nine-letter word — see Game rules), picks three of them as the
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
teammates a "got hint" line.

**Passed:** `{ "target_game": "3f2a…" }`

**Returned — kind: `hint`.** Two shapes; `result` is what tells them apart, so
no call site has to recognize the fallback by its prose.

- the secret has a clue — `{ "result": "hint", "hint": "a light you carry" }`
- it has none — `{ "result": "no-hint", "hint": "No hint available" }`

### `psychicnum.request_spoiler(target_game)`

The same pick, but it hands over the secret WORD itself. Costs no budget and
does not find the secret — you still have to guess it, or not bother. Logs a
`kind = 'spoiler'` row; in coop teammates see that a spoiler was taken, never
which word.

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
| `spoiler_peer` | about a coop teammate | `got spoiler` | `lost` |
| `found_peer` | about a compete opponent | `guessed a word` | `won` |
| `already_guessed` | me | `Already guessed` | `warning` |

**An answer is mine or somebody else's, and the `_peer` suffix is which.** The
pair always agrees about the outcome — one event is one color whoever is
looking — and differs only in the words, so a game reading this list can see at
a glance who is told what. Two things it makes visible: asking for a hint or a
spoiler shows ME nothing (the clue and the word are rows, and the event log is
where they belong), and `found_peer` carries no word at all.

**`already_guessed` never reaches the server**: the board is face-up and its
results are already here, so it is answered locally and writes nothing down.
A word not on the board cannot be named at all — a guess is a board tile. The
server keeps both checks, which is what makes *its* answers to them mean
something sharper — a word not on the board is a `fault` (the frontend let it
through), and a duplicate is a `race`.

**Where the secrecy rule lives is in the type, not in anybody's memory.** A
racer may learn *that* an opponent found a secret and never *which*, so
`found_peer` has no `word` field — the leak is unrepresentable rather than
merely avoided. `spoiler_peer` is the same shape: the row holds the secret, the
answer does not.

## Frontend

```
<PlayAreaLoader {...GamePageCtx}>        useGame, and the three gates
  └── PlayArea                           the coordinator: draws no board, no control
        ├── BoardCol                     the board column — and submit_guess
        │     ├── MobileStatusBar ←      phone only; holds the StateLine below
        │     │     └── StateLine        "1/3 found · 4/7 guesses used"
        │     ├── Board                  the grid of word tiles
        │     │     ├── Dot ←            who decided a tile (coop, >1 player)
        │     │     └── ShuffleButton ←  floats on the board, not in the action row
        │     └── Clear · Submit         the move row; the pill takes its place
        │           └── HistoryBanner ←  overlays it while a past turn is open
        └── InfoSheet ←                  off-canvas on a phone, a flex child on desktop
              └── InfoCol                the readouts and the action row
                    ├── StateLine        the same one, desktop's copy
                    ├── TurnStatusLine ← turn-order coop only
                    ├── OpponentStrip ←  compete only: each rival's budget and finds
                    ├── InfoActionsRow ← one row, every action, in the menu's order
                    ├── SetupDisclosure ←
                    └── GameEventLog     the turn log's psychicnum rows

  ← belongs to common/ ; everything else is this folder's
```

`GamePage` mounts the loader and owns everything above it — members, the timer,
play_state, pause, chat — and unmounts this whole surface on pause.

Off the tree: `pdf/` builds the printable board from the live state at click
time, so it works mid-game as well as at the end; the shared printable design
language is [common/pdf/doc.md](../common/pdf/doc.md).

## Tests

pgTAP in `supabase/tests/psychicnum/`, vitest beside each `lib/` module and
beside the data hook, the Playwright specs named `psychicnum-*`. Each file's own header says what it
covers; [docs/testing.md](../../docs/testing.md) has the conventions.

**The one thing worth knowing before writing one:** the board words and the
secrets are sampled at creation, so a test that needs a known answer overwrites
**both** with a postgres-role `UPDATE`. A guess must be a board word, so the
two have to move together.
