# codenamesduet

Two players, a 5×5 board of words, and a key card each: the same twenty-five
words, but each player sees which of them are THEIR agents, bystanders and
assassins. Taking turns, one gives a one-word clue and a number and the other
guesses from it; the pair wins together by contacting all fifteen agents
before the turn budget runs out, and loses together on any assassin. Coop only.
Brand **TinySpy**.

## Intro to area

The server decides every guess. Both key cards are columns on the game row, so
the frontend could read the partner's, but it never draws it during play and
never judges a guess: a tile click sends a position, and `submit_guess` reads
the clue-giver's key, turns the word over, and says what it was. That is the
opposite of spellingbee and connections, which judge a move in the browser and
send it already decided. The one piece of the answer the frontend does hold on
purpose is the partner's card after the game, kept covered until the player
chooses to look.

A turn is a clue and then the guesses it earns. The seat that holds the clue
is on the game row, and passes when the guesser turns over a bystander or
chooses to stop. It does not always alternate: once a player's own agents are
all found, their partner gives every clue from then on, so the turn flow is
lopsided on purpose and both players are told so. When the budget is spent the
game drops into sudden death — no more clues, either player may guess, and
any word that is not an agent loses the game.

Because "your turn" is the clue arriving, not a shared pointer moving, the
shell's turn machinery does not reach this game: it never writes
`current_turn_user_id`. The header says what the partner is doing instead,
and the board and clue strip are drawn from the seat on the game row and the
turn's clue.

Everything a player does — a clue, a guess, a pass, asking the AI — is one row
of `codenamesduet.events`, the log every game keeps. Only the log's drawing is
this game's own: it shows those rows as a table of turns, each a clue with the
guesses under it.

A stuck clue-giver can ask Claude. The `codenamesduet-suggest-clue` edge
function reads the board through an RPC that checks the caller is the
clue-giver, asks the model for a clue, and fills the clue form with it; the
player still presses Submit. That a hint was asked is logged — the log marks
the turn, and the partner is told.

*The rest of the intro is owed — pass 2 of this area's audit.*

## Game rules

*Owed — pass 2. Absorbs what
[`docs/games/codenamesduet.md`](../../docs/games/codenamesduet.md) says that
the code does not.*

## Schema

*Owed — pass 2.*

## RPCs

Everything the player does reaches the server through one of these, and every
one answers [the envelope](../../docs/envelopes.md). The examples below are
what `data` carries on an `ok`; `result` names the answer, and a call site
picks its branch by that word and nothing else. The examples are one real
game on the local stack, `PAGE-CHAIN-EGG`, seat A giving the first clue.

### `codenamesduet.create_game(target_club, setup, player_user_ids)`

Starts a game. It checks the setup — a turn budget of 9, 10 or 11, a
first clue-giver who is one of the players, the timer — and that there are
exactly two players. It draws twenty-five words at random from
`codenamesduet.word_pool`, titles the game after the first three in board
order (`PAGE-CHAIN-EGG`: the top-left three cells, which never move), seats the
first clue-giver as A and the other player as B, and deals the two key cards
from the rulebook's fixed joint distribution, shuffled: each card has nine
agents, three assassins and thirteen bystanders, and three words are agents on
both. The club-list readout is seeded at turn 1 with the whole budget and no
agents found. The setup is saved as the club's next default without the first
clue-giver, which is a choice about this round rather than about the club.

The play surface's New game calls it too, with this game's setup and roster.

**Passed:**

```json
{
  "target_club": "joel-moth",
  "setup": {
    "turns": 9,
    "first_clue_giver_user_id": "deadbeef-…-000000000001",
    "timer": { "kind": "none" }
  },
  "player_user_ids": ["deadbeef-…-000000000001", "deadbeef-…-000000000002"]
}
```

**Returned** — one answer:

```json
{ "result": "created", "id": "88ae6f5a…" }
```

### `codenamesduet.submit_clue(target_game, clue_word, clue_count)`

The clue-giver's move. Under a lock on the game row it checks that the game is
still in ordinary play, that the caller holds the clue seat, and that this
turn has no clue yet — each of which the partner's move or the caller's own
can change while the form is on screen, so a refusal here is a race. It
logs the clue as an event of the turn and the seat. It does not judge the clue:
the word is whatever was typed and the count any whole number from zero up.

**Passed:** `{ "target_game": "88ae6f5a…", "clue_word": "WORD", "clue_count": 2 }`

**Returned** — one answer, the clue as it was stored:

```json
{ "result": "clued", "word": "WORD", "count": 2, "turn_number": 1, "by_seat": "A" }
```

### `codenamesduet.submit_guess(target_game, target_position)`

The guesser's move, and the one that decides the game. The label a word turns
over as is read from the CLUE-GIVER's key in ordinary play — the guess answers
their clue — and in sudden death, when nobody clues, from the partner's key,
since the clues being remembered were theirs. It refuses a guess from the
clue-giver, a guess before this turn's clue, a word already turned over, and a
word this seat already hit as a bystander; all four are races. A bystander
marks only the guesser's side of the word, so the partner can still guess it
— the same word may be their agent.

Every guess is logged as an event, and it takes a turn from the budget exactly
when it ends one. An agent is turned over for both players and the turn
goes on; a bystander in ordinary play ends the turn, and the seat that clues
next is the partner's unless the partner's agents are all found. Three guesses
end the game: the fifteenth agent (`won`), any assassin (`lost_assassin`), and
anything but an agent in sudden death (`lost_clock`). Each ending records its
reason, the turns used and the agents found, and both players get the same
result.

**Passed:** `{ "target_game": "88ae6f5a…", "target_position": 5 }`

**Returned.** Five answers. The two that leave the game running are named for
what was turned over and carry the turn state after it — B's first two guesses
in this game:

- an agent — `{ "result": "agent", "revealed": "G", "greens_found": 1,
  "turn_number": 1, "turns_remaining": 9, "clue_giver": "A", "play_state": "playing" }`
  (SMOKE, position 5; the turn goes on)
- a bystander — `{ "result": "bystander", "revealed": "N", "greens_found": 1,
  "turn_number": 2, "turns_remaining": 8, "clue_giver": "B", "play_state": "playing" }`
  (PAGE, position 0; the turn ended). `play_state` is `sudden_death` when that
  spent the last turn.

The three that end the game are named for the play state they set, and carry
the label turned over, the agents found and the turns used:

- `{ "result": "won", "revealed": "G", "greens_found": …, "turns_used": … }`
- `{ "result": "lost_assassin", "revealed": "A", "greens_found": …, "turns_used": … }`
- `{ "result": "lost_clock", "revealed": "N", "greens_found": …, "turns_used": … }`

The frontend says nothing about any of the five: each is a reveal, and the
board shows it when the words row arrives.

### `codenamesduet.pass_turn(target_game)`

The guesser stops guessing and spends the turn — legal before the first guess
too, for a clue that makes no sense. It refuses a pass from the clue-giver and
a pass before this turn's clue, both races, and otherwise logs the pass and
ends the turn exactly as a bystander does.

**Passed:** `{ "target_game": "88ae6f5a…" }`

**Returned** — one answer, the turn state the pass produced, in the same four
keys the bystander answer carries:

```json
{ "result": "passed", "turn_number": …, "turns_remaining": …, "clue_giver": "A" | "B", "play_state": "playing" | "sudden_death" }
```

### `codenamesduet-suggest-clue` — the edge function behind the AI button

Asks Claude for a clue for the caller's board. It reads the board through
`codenamesduet.get_clue_context` as the caller — the RPC refuses anyone but the
current clue-giver of a running game, and those refusals are relayed as they
came — and gets back the caller's still-hidden agents, bystanders and
assassins by word, and every clue given so far. It sends those to the model
with a JSON schema for the answer (a clue, a count, the agents it targets, a
sentence of reasoning), appends the targeted agents to the reasoning as their
own line, logs the hint with `codenamesduet.log_hint`, and returns the
suggestion. Logging comes last, so a model that declines or is cut off — which
comes back as a sentence for the dialog to show — leaves no hint behind.
`log_hint` asks the same gate `get_clue_context` did, and a refusal from it is
relayed the same way.

**Passed:** `{ "gameId": "88ae6f5a…" }`

**Returned** — one answer:

```json
{ "result": "suggested", "suggestion": { "clue": "…", "count": 2, "agents": ["…", "…"], "reasoning": "…\n\nAgents: …" } }
```

`get_clue_context`'s own `ok` is `{ "result": "context", "greens": […],
"neutrals": […], "assassins": […], "previous_clues": […] }`, and `log_hint`'s is
`{ "result": "logged" }`; both are read only by the edge function.

### The rest

`end_game`, `submit_timeout` and `replay_board` — the common shape every game
has, doing here what they do everywhere. What is this game's: `end_game` is
the neutral `ended` with the reason `manual`; `submit_timeout` is
`lost_timeout`, a loss distinct from `lost_clock`, which is the budget running
out; both reach sudden death as well as ordinary play. `replay_board` is a
mulligan: the same twenty-five words and the same two key cards, every reveal
and every event wiped, seat A clueing turn 1 again. There is no `concede` — the
game is coop, and the shared Concede hides itself.

## FE submissions

What the frontend sends, and what it says about the answers. **It judges
nothing**: the clue form checks only that there is a word and a count, and a
tile click sends a position. Every sentence a player reads about their own move
is the server's.

**A clue** is typed into the strip under the board — a count, then a word,
uppercased as it is typed — and sent with Submit or Enter. `clued` clears the form; the
strip swaps to the guess view when the clue row arrives by realtime. **A
guess** is a tile click; the tile shows it is committing, and all five `ok`s
leave the frontend silent, because the tile's color arriving IS the answer.
**A pass** is the guesser's Pass & End Turn button; `passed` says nothing
either, since the new turn arrives on the game row. A terminal is not answered
at the call site: the verdict is a standing condition of the local slot, built
in `PlayArea` from the play state.

**A refusal is the only thing any of the three shows**, in the local slot
under the board, in the server's words; the clue form keeps what was typed,
since the clue was never recorded:

| move | said to | text | outcome | written in |
|---|---|---|---|---|
| a clue, the game ended under it | me | `Game over` | `warning` | `submit_clue` |
| a clue, the seat moved | me | `Your partner is giving the clue now` | `warning` | `submit_clue` |
| a clue, one already in | me | `A clue is already in for this turn` | `warning` | `submit_clue` |
| a guess, the game ended under it | me | `Game over` | `warning` | `submit_guess` |
| a guess, I became the giver | me | `Your partner is guessing this turn` | `warning` | `submit_guess` |
| a guess or a pass, the turn rolled over | me | `No clue yet this turn` | `warning` | `submit_guess`, `pass_turn` |
| a guess, the word is turned over | me | `That word is already revealed` | `warning` | `submit_guess` |
| a guess, my own bystander | me | `You already tried that word` | `warning` | `submit_guess` |
| a pass, the game ended under it | me | `Game over` | `warning` | `pass_turn` |
| a pass, I became the giver | me | `You're giving the clue this turn` | `warning` | `pass_turn` |

**The partner is narrated in the header**: what they are doing right now,
held for as long as it is true — `writing clue`, `guessing`, `waiting for
clue`, `waiting for you` — and, once as it lands, their asking the AI — `got
hint`. The words and outcomes are [`lib/answer.ts`](lib/answer.ts)'s; sudden
death narrates nothing there, and the clue strip carries it.

**The AI suggestion** opens a floating dialog the moment the button is
pressed, in its loading state. A suggestion fills the clue form's two fields
and shows the reasoning in the dialog; a relayed refusal or the model
declining shows its sentence in the dialog, which stays; a fault closes it,
since the fault's own modal has already said why. A clue that lands closes the
dialog with it. A delivered suggestion marks its turn's clue row in the log
with the AI glyph, in the hint's outcome.

**New game** calls `create_game` directly, with this game's setup and roster.
The creator jumps to the new game and the partner arrives by the invitation
toast; mid-game the shell asks first, since starting another shelves this one.

## Frontend

*Owed — pass 2.*

## Tests

*Owed — pass 2.*
