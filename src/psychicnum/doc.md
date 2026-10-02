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
`submit_guess` reply carries the caller's own result, and the below-board pill
reads it immediately. The board's permanent green or red does not come from
that reply at all: it comes from `game_data` the move's builder writes
onto `common.games`, which every client reads again when the page's
subscription hears the row change — what every player sees and what a reload
rebuilds from. Everything else a move sets off — the ending, a teammate's
progress, the turn moving on — travels the same way, in the blob, which is why
the reply can be about one player and nothing else.

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
counts up only the guesser's own row, so the team's spent budget is the sum of
the rows. The team wins by finding all three together, and loses on the guess that spends
the last of the budget first — or when a countdown timer expires.

**Turn order is opt-in.** The setup dialog offers free-for-all (the default) or
turn-by-turn, and in the second the server holds `current_turn_user_id` and
advances it after each accepted guess. A player waiting their turn keeps the
board but it is inert.

### Compete

**The same board of words, raced separately.** Each player has their own budget
and their own guesses; what differs is not the words but who can see what. A
player sees their own guesses and assists, every rival's **remaining budget**,
and a count of how many secrets each rival has found — never which words, and
never a rival's rows, which RLS withholds until the game ends.

First to all three wins and the game ends for everyone. If every budget is
spent with nobody finished, everyone loses; a countdown expiring does the same.
Any player may stop the game for the whole table: Concede's question offers
it, and Stop shows once the player has ended (`isPlayerEnded`).

Compete needs an opposing **player**, which is why its manifest takes 2–6 where
coop takes 1–6: a solo club is offered coop only. A countdown timer does not
make a game compete.

### How a game ends

Whichever RPC ends the game passes `common._end_game` the reason pair and the
rankings ([common-schema.md → `common._end_game`](../../docs/common-schema.md#common_end_game--the-one-way-a-game-ends)),
so no reader works the ending out from the clock or the players:

| the ending | reason / detail | ranked | outcome |
|---|---|---|---|
| all three found | `reached_goal` / `solved` | coop: every teammate 1; compete: the finder alone | `won` |
| every budget spent | `resource_exhausted` / `exhausted` | nobody | `lost` |
| the countdown | `timeout` / `timeout` | nobody | `lost` |
| every player conceded | `conceded` / `conceded` | nobody | `lost` |
| somebody stopped it | `stopped` / `stopped` | nobody | `neutral` |

A compete race ends when decided, so only the finder reaches the goal; the
others are short of it and unranked, and its timeout ranks nobody
([win-lose.md → What a timeout does](../../docs/win-lose.md)). **A Stop is
neutral in every mode**: nobody won and nobody lost, which is not the same as
everyone losing. The solve is recorded on the players as `solved_at`, every
teammate's in coop.

## Schema

Three tables, in `supabase/migrations/20260615000002_psychicnum.sql` (shape)
and `supabase/sql/psychicnum.sql` (behavior). The frontend reads none of them:
it reads the page blobs the builder writes onto `common.games`.

| | |
|---|---|
| `psychicnum.games` | one row per game, keyed `game_id` to `common.games` — the board `words`, the three `secrets`, and `max_guesses`, each budget's size, copied from setup |
| `psychicnum.players` | one row per player: `guesses_used` (counting up against `max_guesses`) and `found_secrets_count` |
| `psychicnum.events` | the turn log, append-only. `kind` is `guess`, `hint` or `spoiler`; `word` holds the guessed word, the clue, or the spoiled word depending on which |

**The page blobs** are written by `psychicnum._rebuild_data_cols` at create, at
Restart and at the end of every move, each assigned whole
([plans/seat-view.md](../../plans/seat-view.md) → The page is written, not
assembled): `shell_data` through `common._make_json_shell_data`, and on top of the common
part of every `game_data` (`common._make_json_game_data`) psychicnum's own:

| blob | psychicnum's part |
|---|---|
| `game_data` | `puzzle: {words, secrets}` (the secrets null until the game ends); `events`, every player's rows; on each player `requiredSecretsCount`, `maxGuesses`, `foundSecretsCount`, `guessesUsed` and `board: {tileResults, decidedBy}`, this seat's tiles |
| `summary_data` | `foundSecretsCount`, `requiredSecretsCount`, `guessesUsed`, `maxGuesses`, `winner` |

Every player's counts are their own on `psychicnum.players`; the blob carries
the team's on every player in coop, and each racer's own in compete. Compete's
summary carries no progress, so its two counts are null, and `winner` names
the finder once the race is won. `psychicnum._rebuild_data_cols_for_all()`
rewrites every psychicnum game's blobs without re-dating them, for a shape
change.

`clubpage_info` is written beside the blobs, in the same keys as before, until
the club page reads `summary_data`. `game_status` and `player_status` are not:
nothing reads psychicnum's any more. The columns stay until a migration retires
them for every game.

### Two things worth knowing before reading the SQL

**The secrets are hidden by a column GRANT, not by a policy** — a client
asking `psychicnum.games` for `secrets` gets SQLSTATE 42501 whatever any policy
says, and `game_data` carries them only once the game has ended
(`_make_json_puzzle`). So the frontend never holds the answer key during play:
not in a prop, not in a store, not there at all. `docs/code-conventions.md`
points here as the repo's worked example.

**What a racer may see of a rival is the hook's rule, not a policy's.** The
blob carries every player's rows and every seat's board, and `useGame`
withholds a rival's mid-race — their guesses are their strategy — and opens
them at the game's end, which is what lets the event log's player picker read
a finished race back. The policies on this game's tables are club-member reads
in both modes; nothing on the client reads them.

## RPCs

Everything the player does reaches the server through one of these, and every
one answers [the envelope](../../docs/envelopes.md).

**An `ok` from this game carries a FACT and nothing else** — `data` only, with
`outcome` and `message` both null. What a fact reads as is the frontend's, in
one place: [`lib/answer.ts`](lib/answer.ts). So the examples below are all
`data`; the rest of the envelope is null. (A `not-ok` is unaffected — a race, a
bug and a service outage are not game logic, and they keep their severity and
their sentence.)

### `psychicnum.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)`

Deals a game. It samples `word_count` distinct words from `common.words` under
a clean + American + difficulty-band filter (five-letter words plus one
nine-letter word — see Game rules), picks three of them as the
secrets, writes the `common.games` row and a per-player budget row, and writes
the statuses. `p_mode` decides both the gametype string
(`psychicnum_coop` / `psychicnum_compete`) and how the budget behaves — shared
in coop, per-player in compete. Compete needs two or more players; coop takes
one to six.

**Passed:**

```json
{
  "p_club_handle": "moths",
  "p_setup": {
    "max_guesses": 7,
    "word_count": 12,
    "band": 3,
    "timer": { "kind": "countdown", "seconds": 300 }
  },
  "p_player_user_ids": ["7b1e…", "c904…"],
  "p_mode": "coop"
}
```

**Returned** — one answer, and `result` names it:

```json
{ "result": "created", "id": "3f2a…" }
```

### `psychicnum.submit_guess(p_game_id, p_guess)`

The only mid-game move, and the only one that writes a `kind = 'guess'` row.
The guess must be a board word, compared case-folded. **The answer is about the
CALLER's guess and never about the game's fate** — a correct guess that empties
the last of the budget still says `hit`, and that the game just ended reaches
every client over realtime instead. `found_all` is true only on the guess that
completes the set.

**Passed:** `{ "p_game_id": "3f2a…", "p_guess": "lantern" }`

**Returned — kind: `guess`.** Three shapes. `result` is the fact; the words
and the color come from `answerMessage({ answerType: 'hit' | 'miss', word })`.

- hit a secret — `{ "result": "hit", "found_all": false }`
- **completed the set** (the win) — `{ "result": "hit", "found_all": true }`
- missed — `{ "result": "miss", "found_all": false }`

The guess that spends the last of the budget without completing the set is not
a fourth shape: it is whichever of the first and third it was, unchanged. The
loss is not in the answer at all — it arrives by realtime, like every other way
this game ends.

### `psychicnum.request_hint(p_game_id)`

Picks one of the caller's (compete) or team's (coop) unfound secrets and logs
its dictionary CLUE — never the word. Costs no budget. Many words have no clue,
which is an answer rather than a failure, so `result` says which. Both log a
`kind = 'hint'` row that reaches the event log over realtime, and in coop gives
teammates a "got hint" line.

**Passed:** `{ "p_game_id": "3f2a…" }`

**Returned — kind: `hint`.** Two shapes; `result` is what tells them apart, so
no call site has to recognize the fallback by its prose.

- the secret has a clue — `{ "result": "hint", "hint": "a light you carry" }`
- it has none — `{ "result": "no-hint", "hint": "No hint available" }`

### `psychicnum.request_spoiler(p_game_id)`

The same pick, but it hands over the secret WORD itself. Costs no budget and
does not find the secret — you still have to guess it, or not bother. Logs a
`kind = 'spoiler'` row; in coop teammates see that a spoiler was taken, never
which word.

**Passed:** `{ "p_game_id": "3f2a…" }`

**Returned — kind: `spoiler`.** One shape.

- `{ "result": "spoiler", "word": "lantern" }`

### The rest

`concede`, `stop_game`, `submit_timeout` and `replay_board` — the common
shape every game has, doing here what they do everywhere. `concede` checks,
after `common._concede`, whether everyone left is out of guesses
(`_maybe_finish_compete`).

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
compete player may learn *that* an opponent found a secret and never *which*, so
`found_peer` has no `word` field — the leak is unrepresentable rather than
merely avoided. `spoiler_peer` is the same shape: the row holds the secret, the
answer does not.

## Frontend

```
<PlayAreaLoader {...PlayAreaLoaderProps}>        useGame: the blob becomes gd
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
pause, chat — and unmounts this whole surface on pause.

**`gd`, the game data.** `useGame` hands the surface one object, `gd`: the
`game_data` blob the page was handed (`GGameDataRaw`), with its
links turned into players (`turns.holder`, `ending.by`, `ending.winner`, each
board's `decidedBy`), the setup rows built, and the seat rule applied — in
compete, mid-race, a rival's rows leave the log and their `board` is null. It
is a pure function of the blob and who I am; no reads, no subscription. Every
fact about a seat is on the player (`gd.me.onTurn`, `p.foundSecretsCount`,
`gd.me.board`), and a component asks a player, never the table. The two
columns, `BoardCol` and `InfoCol`, take `gd` whole; everything below them takes
its own props. A player in `gd` (`GPlayer`) is a `Member` plus
psychicnum's facts, so `gd.players` goes straight to the shared pieces that take
`Member[]`, and `gd.playersById` holds the same players by id. `Board` takes
its props in groups — `tiles` (what is on them) and `marks` (what the board
wears on and around them) — and `historyView` whole.

**Every type this game exports is in `types.ts`**, wearing the `G` that says
it is the game's and not the shell's (docs/code-conventions.md → A game's
types): the two shapes of the game (`GGameDataRaw` as written, `GGameData` as
read), the players and log rows at both levels, the setup, the actions, the
history view, the tiles' types and the answers. A component's props stay
with the component; a type one file uses stays there; the printer's model stays
in `pdf/`.

`BoardCol` builds and sends the guess: the picked word and `submit_guess`.
`Board` owns the board itself: its display order and Shuffle, and the keyboard
cursor over it, which reports a pick up through `onPick`.

The keyboard's selection cursor is [board-cursor](../common/board-cursor/doc.md)'s;
what is psychicnum's is its shape (`lib/boardShape.ts`: `⌈√N⌉` across, so the
last row may be short, and a missing cell is a wall) and that the cursor sits
on a CELL — a shuffle moves the words under it, and the pick, being a word,
moves with its tile.

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
