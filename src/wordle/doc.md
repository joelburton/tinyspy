# wordle

A hidden five-letter word, and a handful of guesses to find it; every guess
comes back colored letter by letter, and the colors are the whole game. Coop
shares one board and one budget; compete sets everyone the same word on a
board of their own and the fewest guesses wins.

## Intro to area

The frontend never learns the word while the game runs. The target is a column
no client can read — the grant on `wordle.games` leaves it out — and the view
the frontend does read hands it over only once the game is over. So the server
is what colors a guess: `submit_guess` compares the word to the target, writes
the row with its five colors, and the frontend paints what it is given and
never works a color out for itself. That is the same shape psychicnum has, and
the opposite of connections, whose board is public and whose frontend grades
its own guesses.

A guess can also come back without costing anything. A word that is not in
the legal slice of the dictionary, or one already on the board, is refused by
the rules rather than by a fault: the reply is an `ok` with the server's own
sentence, nothing is written, and the typed row stays put for another try.
An accepted guess is the other kind of answer. It writes one row and spends one
guess, and that row — not the reply — is what every player's board is built
from, which is why the typed word waits on the board uncolored until its row
arrives and flips in place.

What separates the two modes is what each player can see. Coop is one board,
and every accepted guess lands on it for everyone. Compete is the same word on
private boards: the row-level policy on `wordle.events` hides an opponent's
guesses until the race is over, so all a racer learns about a rival mid-game
is how many guesses they have spent and whether they have finished. The race
ends when nobody is still guessing, and a racer can be done — solved, out of
guesses, or conceded — while the game goes on for the rest.

The end of a game is on the board. No modal carries the verdict: the
below-board pill says it, the finished board keeps its colors, and the keyboard
stays under it, disabled, since its caps hold what every letter earned. The
word stays hidden until this viewer asks for it — unless they typed it, in
which case they are already looking at it — and Restart replays the same word
from a blank board, the word hiding itself again on the way. A coop solve
celebrates once, at the moment the winning row lands.

## Game rules

A hidden **target** of five letters. A guess is a five-letter word, and it
comes back colored letter by letter:

- **green** — right letter, right spot;
- **yellow** — in the word, but elsewhere;
- **gray** — not in the word.

A letter earns a yellow only while the target still has an unclaimed copy of
it after the greens are taken (`common.wordle_colors`, which waffle shares).
Win by guessing the word within the **budget** — five to eight guesses, chosen
at setup, six being the classic.

A guess must be a real word: five letters, in the dictionary at or below the
game's **legal band**. Nothing else is asked of it — a guess may be crude or
British, since only the band gates. A word not in that slice, or one already
on the board, is a **soft reject**: refused, no guess spent, no row written,
the typed row still there to edit. And the answer itself is always accepted,
whatever band the dictionary files it under today: the target is compared
before the dictionary is consulted, so a word edit can never make a game
unwinnable.

Where the target comes from is the **answer source**: `0` draws from the
curated Wordle answer list, `1`–`6` from any clean five-letter word of that
difficulty band or easier. The legal band must reach the answer's hardest band
— band 2 for the list — so that every possible answer is itself a legal guess;
the setup dialog floors the control there and `create_game` checks it again.

### Vocabulary

| term | what it means |
|---|---|
| **target** | the hidden answer. A column on `wordle.games` no client can read; `games_state` shows it once the game is terminal |
| **guess** | a submitted word. An accepted one is a row in `wordle.events` with its `colors`; a soft reject is not |
| **colors** | five characters, one per letter — `g`, `y`, `x` — computed by the server when the row is written. The frontend paints them and never recomputes them |
| **soft reject** | `duplicate` or `notAWord`: the rules applied, nothing spent, nothing written. Answered as an `ok` naming the case |
| **budget** | `max_guesses`, 5–8. The team's in coop, each racer's own in compete |
| **answer source** · **legal band** | `answer_source` picks where the target is drawn from; `legal_guess` is the band a guess must be in. Only the second is stored on the game — the first is spent at creation |

### Coop

One board, one budget: every player's `guesses_used` moves in lock-step, and
every accepted guess is everyone's. The team wins on the guess that solves it
and loses on the last guess that does not, or when a countdown expires. End is
the neutral stop — nobody won, nobody lost.

Turn order is opt-in (`coop_style: 'turns'`): the server holds the pointer and
hands it on after an accepted guess that did not end the game. A soft reject
advances nothing, and neither does the guess that wins or loses.

### Compete

The same word, raced on private boards. Each racer has their own budget and
their own rows, and what a racer learns about a rival is the count on the
Guesses strip, whether they have solved it, and whether they have dropped out
— never a letter, which RLS withholds until the game ends. At the end every
row opens, which is what lets the event log's player picker read a finished
race back, board by board.

A racer is **done** when they solve it, spend their budget, or concede, and
the game marks them so on the common roster, which is what stops the
presence-pause waiting on them (docs/common.md → Done, but not out). The race
ends when nobody is still racing. The winner is whoever solved in the fewest
guesses, the earliest solve breaking a tie; a conceder forfeits any win, and
a race nobody solved is a loss for everyone. A countdown running out resolves
the race by the same rule among those who had solved it.

Compete needs an opposing **player**, which is why its manifest takes 2–6
where coop takes 1–6. That minimum is the manifest's rule: the server checks
the maximum and the mode's spelling, nothing lower.

### The play states

Each mode writes its own pair, so a reader of `common.games.play_state` can
tell which was played without joining anything:

| | coop | compete |
|---|---|---|
| the word found | `won` | `won_compete` |
| the budget, or the clock, or everyone out | `lost` | `lost_compete` |

Plus `playing`, and `ended` when somebody stopped it — neutral in every mode.
WHY it ended is written into `common.games.status.reason` by the RPC that ends
the game — `solved`, `exhausted`, `timeout`, `conceded` (every racer walked
away), or `manual` — and the club-list label reads it. A compete win also
freezes the winner's name and guess count onto `status`, since the winning
number is a secret until then. The below-board verdict reads the same word, so
the two surfaces cannot name the ending differently; what `lib/terminal.ts`
works out for itself is a clock win from a count win, by comparing the players'
rows, which `status` does not say.

## Schema

Three tables and a view, in `supabase/migrations/20260625000000_wordle.sql`
(shape; the events rename is `20260917000001_wordle_events.sql`) and
`supabase/sql/wordle.sql` (behavior).

| | |
|---|---|
| `wordle.games` | one row per game: the `mode`, the `target`, the budget as `max_guesses`, and `legal_guess` — stored so `submit_guess` reads the band off the row it locks. `answer_source` is not kept; it is spent picking the target |
| `wordle.players` | one row per player: `guesses_used`, `solved`, `solved_at`. **Club-wide readable in both modes** — compete's Guesses strip and its winner are built on it. Coop keeps every row identical |
| `wordle.events` | the guess log, append-only: `guess`, `colors`, `is_correct`; `kind` is `guess` and `took_turn` is true, since the table holds accepted guesses only and an accepted guess spends a go. Read `order by id` — that is the order of play |
| `wordle.games_state` | the view the frontend reads: every readable column of `games`, plus `target` through `_target_for()`, which is null until the game is terminal |

**The target is hidden by a column GRANT, not by a policy.** A client asking
`wordle.games` for `target` gets SQLSTATE 42501 whatever any policy says, and
the view hands it over only once `is_terminal` is set. So the frontend never
holds the answer during play — not in a prop, not in a store, not there at all
— and a Restart, which clears `is_terminal`, hides it again without anybody
asking. `_target_for` is where the mechanism is commented.

**`events` carries the mode-aware policy**, and its third arm carries three
rules at once: coop shows everyone every row, compete shows a racer only their
own, and terminal opens everybody's. `players` needs none — a count and a
solved flag are exactly what a rival is allowed to see.

**The club-list title is a readout of the latest guess**, recomputed by
`_sync_title` after every write: coop's all game, compete's only once the race
is over, since a racer's guesses are private until then. It spells the answer
only when the last guess was the winning one, never of its own accord, so a
lost game that the players may still replay blind is titled with its last
guess. `status` carries the guess counters in coop and none in compete, where
a live count would leak how close a racer is; the winner's count is written
at terminal instead.

**Realtime is one room per game**, `wordle:<id>`, postgres-changes on the
three tables, and every change refetches all three reads. `common.end_game`
writes only `common.games`, so the two RPCs that end a game from outside a
guess — the timeout and the manual end — touch `wordle.games` on the way out,
which is what wakes the room to refetch the now-revealed target.

## RPCs

Everything the player does reaches the server through one of these, and every
one answers [the envelope](../../docs/envelopes.md). The examples below are
what `data` carries on an `ok`; `result` names the answer, and a call site
picks its branch by that word and nothing else.

### `wordle.create_game(target_club, setup, player_user_ids, mode)`

Starts a game on a fresh random word. It checks the setup — a guess budget of
five to eight, an answer source, and a legal-guess band that must reach the
hardest band an answer can come from — then picks the target: from the curated
Wordle answer list when `answer_source` is `0`, otherwise any five-letter
dictionary word of that difficulty band or easier. Either way the word is
clean, and the frontend is never told it. It writes the `common.games` row
titled `New game` (coop) or `New compete`, a `wordle.games` row holding the
target and the legal band, one `wordle.players` row per player, and seeds the
club-list readout — `{ mode, solved: false }` plus the guess counters in coop,
where the count is the team's; compete's counters are each racer's own and
never published. A coop game with `coop_style: 'turns'` also seats the turn
order, starting at `first_turn_user_id`. Either mode takes up to six players,
which the server checks; that compete needs two is the manifest's rule.

**Passed:**

```json
{
  "target_club": "moths",
  "setup": {
    "max_guesses": 6,
    "answer_source": 0,
    "legal_guess": 4,
    "timer": { "kind": "countdown", "seconds": 300 },
    "coop_style": "turns",
    "first_turn_user_id": "7b1e…"
  },
  "player_user_ids": ["7b1e…", "c904…"],
  "mode": "coop"
}
```

`first_turn_user_id` matters only with `coop_style: 'turns'`. The legal band
has a floor the answer source sets — `2` for the curated list, else the
source's own band — and the setup dialog will not offer Start below it.

**Returned** — one answer:

```json
{ "result": "created", "id": "3f2a…" }
```

### `wordle.submit_guess(target_game, guess)`

The only mid-game move, and the only thing that writes a `kind = 'guess'`
row. The guess is folded to lowercase; five letters. Two refusals are an
`ok` that writes nothing and spends nothing: a word already on the board —
anyone's in coop, the caller's own in compete — and a word outside the legal
slice of the dictionary. The target is compared before the dictionary is
consulted, so the answer itself is always accepted whatever band it sits in
today.

An accepted guess is colored against the target, written as a row with its
colors, and charged to the budget. In coop every player's row moves in
lock-step, and the guess that solves it wins for the team while the last one
that does not loses. In compete only the caller's row moves; a racer who has
solved it or spent their budget is marked done for the shared roster, so the
presence-pause stops waiting on them (docs/common.md → Done, but not out), and
the race ends when nobody is still racing — `_maybe_finish_compete` is the one
place that rule is written, and it picks the winner by fewest guesses, then
earliest solve, conceders excluded. **The answer is about the caller's guess
and never about the game's fate**: the win or the loss reaches every client
over realtime, and the reply's `terminal` flag only says whether this guess
was the move that ended it. In turn-order coop an accepted guess that did not
end the game hands the turn on.

**Passed:** `{ "target_game": "3f2a…", "guess": "crane" }`

**Returned — kind: `guess`.** Four shapes; the fact only, and what each is
worth — the words the two refusals show included — is the frontend's
(`lib/answer.ts`). Two for an accepted guess:

- solved — `{ "result": "correct", "colors": "ggggg", "guesses_used": 3, "solved": true, "terminal": true }`
- not solved — `{ "result": "incorrect", "colors": "xgyxx", "guesses_used": 3, "solved": false, "terminal": false }`

`colors` is five characters, one per letter: `g` in the right place, `y` in
the word but elsewhere, `x` not in the word. And two for a guess that wrote
nothing, which has no colors:

- already on the board — `{ "result": "duplicate", "guesses_used": 2, "solved": false, "terminal": false }`
- not in the word list — `{ "result": "notAWord", "guesses_used": 2, "solved": false, "terminal": false }`

A guess that arrives after the game has ended, out of turn, or from a racer
who has already solved it or spent their budget is not an `ok` at all.

### The rest

`concede`, `end_game`, `submit_timeout` and `replay_board` — the common shape
every game has, doing here what they do everywhere. What is this game's:
`concede` re-runs `_maybe_finish_compete`, since a drop-out can be the last
racer, and a conceder forfeits any win; `submit_timeout` resolves a race by
the same fewest-guesses rule among those who had solved it; and
`replay_board` zeroes every player and clears the guess log, and the word
re-hides on its own, because the view that reveals it reads the game's
terminal flag and the reset clears that. Every one of them, and `submit_guess`
too, ends by recomputing the club-list title, which is a readout of the most
recent guess: coop's all game, compete's only once the race is over, since a
racer's guesses are private until then. It spells the answer only when the
last guess was the winning one, never of its own accord — a replayed game goes
back to its placeholder.

## FE submissions

What the frontend decides before a guess reaches the server, and what it says
about the answers that come back.

**One check never reaches the server.** A row shorter than five letters is
refused locally with "Not enough letters" (`warning`), and an EMPTY row is not
even submittable — Enter and its on-screen cap go gray. A short word arriving
at the server is a fault, since the frontend already refused it. Everything
else about a guess is the server's to decide: the frontend holds no word list
and no target, so the dictionary is out of its reach, and the duplicate — which
it could see, the board being in front of it — is left to the server too.

**The colors are the server's, and so is the moment they show.** `BoardCol`
sends the word and keeps it on the board uncolored while the call is out; the
reply's `colors`, `solved` and `terminal` are not read there. The colored row
arrives over the subscription, as it does for everyone, and the pending word
flips in place when its row lands. A solve shows nothing extra at the call
site either — the verdict follows from the play state, which arrives the same
way.

**Every answer this game gives is named, and `lib/answer.ts` says what it
reads as.** A call site never picks a color or writes a sentence; the log
draws the guess as five colored squares and takes the color alone. Holding a
reply or its own refusal, `BoardCol` names an `answerType` and calls
`answerMessage()`; holding a logged row, the log calls `eventToOutcome(row)`
for its bar and `PlayArea` calls `peerAnswerMessage(row)` for a teammate's
header line. One function underneath all of them, so the below-board pill,
the board's reject mark, the log and the header cannot disagree about one
move.

| answerType | said to | text | outcome |
|---|---|---|---|
| `correct` / `correct_peer` | me / about a coop teammate | *(none — the colored row is the feedback)* / `guessed CRANE` | `won` |
| `incorrect` / `incorrect_peer` | me / about a coop teammate | *(none)* / `guessed CRANE` | `neutral` |
| `solved_peer` | about a compete opponent | `solved it` | `won` |
| `duplicate` | me | `Already guessed` | `warning` |
| `not_a_word` | me | `Not in word list` | `lost` |
| `too_short` | me | `Not enough letters` | `warning` |

The two peer lines are the two modes' one visible peer event each. Coop
narrates every teammate's accepted guess, in the row's own outcome; compete
cannot see an opponent's rows and narrates the one thing it can, the
`players.solved` flag flipping — green, because the outcome follows the event
and not the viewer's stake. The terminal verdict and the out-of-race lines are
standing conditions of the local slot, not answers to a move; they are built
in `PlayArea`.

**New game is a plain `create_game`.** The play surface calls it directly with
this game's setup, roster and mode, and the creator jumps to the new game
while the others arrive by the invitation toast. Mid-game the shell asks
first, since starting another shelves this one; at terminal there is nothing
to interrupt.

## Frontend

The play surface is the shape [`docs/playarea.md`](../../docs/playarea.md)
describes — a loader that gates on the three ways a game can fail to load,
then `PlayArea` in the eight sections.

```
<PlayAreaLoader {...GamePageCtx}>        useGame, and the three gates
  └── PlayArea                           the coordinator: draws no board, no control
        ├── BoardCol                     the board column — and submit_guess
        │     ├── Board                  max_guesses rows of five tiles
        │     └── the below-board region
        │           ├── HistoryBanner ←   overlays the region while a past turn is open
        │           ├── FeedbackPill ←    the local slot, its height reserved
        │           └── GuessKeyboard ⇐  the caps, each tinted with what its letter earned
        ├── InfoSheet ←                  off-canvas on a phone, a flex child on desktop
        │     └── InfoCol                the readouts and the action row
        │           ├── TurnStatusLine ← turn-order coop only
        │           ├── OpponentStrip ←  compete only: each rival's guess count, or "out"
        │           ├── InfoActionsRow ← one row, every action, in the menu's order
        │           ├── the answer line  terminal, and only once this viewer asks
        │           ├── SetupDisclosure ←
        │           └── GameEventLog     one row per guess: five colored squares
        └── CelebrationBlockingModal ←   the coop win, at the moment it lands

  ← belongs to common/ ; ⇐ to shared/ ; everything else is this folder's
```

`GamePage` mounts the loader and owns everything above it — members, the timer,
play_state, pause, chat — and unmounts this whole surface on pause. The state
line at the top of the info column ("3/6 guesses") is a paragraph of
`InfoCol`'s own. `Help` and `SetupForm` are the shell's to mount, from the menu
and the start-game dialog.

What is wordle's own:

- **The board hugs its height.** Square tiles are the look, and a keyboard
  shares the column below the board, so the grid takes its width from the
  column and its height from the width, and is capped by the height the
  keyboard leaves — at every viewport width, since a short desktop window is
  a phone-height window (`Board.module.css`).
- **A row that lands flips.** Each tile turns over in turn and paints its
  color at the midpoint; rows already on the board when it mounted — a
  mid-game refresh, an opponent's finished board — draw settled, and a
  Restart moves the line so the replayed game's first row flips too. The
  submitted word stays on the board through the round trip, dimmed, and flips
  in place when its row arrives.
- **The keyboard is the alphabet's record.** Each cap wears the strongest
  color its letter has earned across the live rows; Enter and ⌫ are the same
  bound actions the physical keys answer to, so a cap and its key cannot
  disagree, and both go gray on an empty row. At terminal the keyboard stays,
  disabled, because its caps are the record of the game.
- **Two checks are local** — five letters typed, and a row that is not empty
  (see FE submissions). Everything else is the server's, and the pill reads
  `lib/answer.ts`.
- **The event log** is one row per guess — the guess as five colored squares,
  definable as a word, since every accepted guess is in the dictionary — and
  its picker's compete options mean something only because RLS opens at
  terminal; an opponent's log during play says *Hidden until game ends*. A
  `#N` replays that turn on the board (`lib/history.ts`): the rows up to and
  including it, that row ringed, addressed by the row's id so a filter cannot
  move it, and folding the rows of whoever wrote it — so an opponent's `#N` at
  a compete terminal replays their board.
- **The terminal** is the pill and the row's line (`lib/terminal.ts`), the
  frozen board banded in its outcome, and the disabled keyboard. The answer
  line under the action row appears when this viewer presses Reveal and goes
  away when they press Hide; a solver sees it unasked, being the one who typed
  it. A coop solve celebrates, once, on the flip to `won`.
- **No mobile status bar.** The board is the count — every used guess is a
  colored row — so a bar would restate it and shorten the board for nothing.
- **The printer** (`pdf/`) is one track per board: the grid, the keyboard in
  its on-screen QWERTY shape, and that board's guesses as plain words. The
  four tile states print as border and fill weight rather than color, since a
  mono printer flattens green, yellow and gray to one gray. Coop is the one
  shared track; compete is one per player at terminal and just yours during
  play. The answer prints only when it is on screen — a win or a Reveal, not
  merely terminal — so a printout cannot undo the hide.

## Tests

pgTAP, in `supabase/tests/wordle/` — `setup.psql` gives every file
`pg_temp.wordle_setup(max_guesses)`, and because the target is random, a test
that needs one reads it back as the superuser, past the grant, to craft a
winning guess or five that miss:

| file | pins |
|---|---|
| `create_game_test` | both modes; every setup fault by the field it names; the target picked from the list or the band; `target` denied by the grant and null in the view mid-game; an empty word pool is a fault |
| `gameplay_test` | `submit_guess` in coop: a short word is a fault; the two soft rejects spend nothing and write nothing; every accepted row carries colors and spent a go; every `ok` carries no outcome; the title reads the latest guess, then the answer on a win |
| `compete_test` | independent rows; an opponent's guesses hidden mid-race and open at terminal; the title and the status leak nothing mid-race; fewest guesses wins once everyone is done |
| `loss_test` | coop's last wrong guess is the loss and reveals the target; a racer spending their own budget ends nothing, and their next guess is a fault |
| `concede_test` | a conceder counts as done and forfeits; the last one out ends the race; everyone out is `conceded`, not `exhausted`; coop is refused |
| `turn_order_test` | the pointer seats, an out-of-turn guess is refused, an accepted guess advances, a soft reject does not, free-for-all leaves the pointer null |
| `end_game_test` · `replay_test` | the timeout and the manual end, each idempotent and each revealing the target; Restart undoes everything a loss wrote — rows, counts, the clock, the title, and the target's shield — and keeps the word |
| `reveal_test` | the target unshields at terminal whatever the outcome; `_sync_title` never spells the answer of a game the players may still replay blind |
| `legal_guess_test` · `banded_answer_test` | the same word is `notAWord` under a strict band and legal under a loose one; an answer banded out from under a live game still solves it |

`colors_test` sits in the folder too, but pins `common.wordle_colors` and
belongs to `shared/wordle-style`.

Vitest, beside the code:

| file | pins |
|---|---|
| `lib/answer.test` · `lib/terminal.test` | every `answerType`'s words and outcome; every terminal sentence per mode, play state and reason |
| `lib/history.test` · `lib/colors.test` | the inclusive boundary and the ringed row, by id; the keyboard's strength order |
| `lib/setup.test` · `components/SetupForm.test` | the Start gate names `legal_guess`, and the floor the answer source sets; the form's three controls and where a refusal lands |
| `pdf/model.test` | the target never prints before it shows on screen; the keyboard is derived per player, never pooled |
| `components/PlayArea.test` | the surface mounts in every mode and state; the judged codes reach their classes on the board and the keyboard; Reveal and Hide, the solver's unasked answer, and the loss that hides it; Restart with and without a question; the celebration, mine only; peer narration in both modes; the picker's labels; Concede vs End per mode; the board-scope marks; the flip keyed to its cause; the physical keys and the two caps |

Playwright, in `e2e/`: `wordle-history` (the viewer's overlay and the exits),
`wordle-keyboard` (the caps' computed colors, resting and hovered),
`wordle-mobile` (the board and keyboard fit a short phone, and the sheet),
`wordle-print` (a real PDF downloads), and the shared specs that seed a wordle
game as their fixture.
