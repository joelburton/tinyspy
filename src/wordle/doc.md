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

*The rest of the intro is owed — pass 2 of this area's audit.*

## Game rules

*Owed — pass 2. Absorbs what
[`docs/games/wordle.md`](../../docs/games/wordle.md) says that the code does
not.*

## Schema

*Owed — pass 2.*

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

**Returned — kind: `guess`.** Two shapes for an accepted guess, and today each
carries its outcome in the envelope beside the fact (`won` · `neutral`):

- solved — `{ "result": "correct", "colors": "ggggg", "guesses_used": 3, "solved": true, "terminal": true }`
- not solved — `{ "result": "incorrect", "colors": "xgyxx", "guesses_used": 3, "solved": false, "terminal": false }`

`colors` is five characters, one per letter: `g` in the right place, `y` in
the word but elsewhere, `x` not in the word. A guess that wrote nothing has no
colors, and today the server writes its words as well as its outcome:

- already on the board — `{ "result": "duplicate", "guesses_used": 2, "solved": false, "terminal": false }` — `warning`, *Already guessed*
- not in the word list — `{ "result": "notAWord", "guesses_used": 2, "solved": false, "terminal": false }` — `lost`, *Not in word list*

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

**Where the words are today.** `lib/answer.ts` holds the two wire words an
accepted guess can be and what each is worth — `correct` is `won`, `incorrect`
is `neutral` — and the log bar and the two peer lines read that table. The two
refusals are deliberately not in it: they write no row, so the pill and the
board's reject mark are their only surfaces, and both read the envelope's
`outcome` straight through. The words a player reads are written in four
places:

| answer | said to | text | outcome | written in |
|---|---|---|---|---|
| solved / not solved | me | *(none — the colored row is the feedback)* | `won` / `neutral` | `lib/answer.ts` |
| already on the board | me | `Already guessed` | `warning` | the SQL |
| not in the word list | me | `Not in word list` | `lost` | the SQL |
| too short | me | `Not enough letters` | `warning` | `BoardCol` |
| a teammate's guess | about a coop teammate | `guessed CRANE` | `neutral` / `won` | `PlayArea` |
| an opponent's solve | about a compete opponent | `solved it` | `won` | `PlayArea` |

The two peer lines are the two modes' one visible peer event each. Coop
narrates every teammate's accepted guess, in the row's own outcome; compete
cannot see an opponent's rows and narrates the one thing it can, the
`players.solved` flag flipping — green, because the outcome follows the event
and not the viewer's stake. The terminal verdict and the out-of-race lines are
standing conditions of the local slot, not answers to a move; they are built
in `PlayArea` and are Step 6's to move.

**New game is a plain `create_game`.** The play surface calls it directly with
this game's setup, roster and mode, and the creator jumps to the new game
while the others arrive by the invitation toast. Mid-game the shell asks
first, since starting another shelves this one; at terminal there is nothing
to interrupt.

## Frontend

*Owed — pass 2.*

## Tests

*Owed — pass 2.*
