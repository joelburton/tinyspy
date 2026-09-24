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
the board and clue strip are drawn from the seat on the game row and the
turn's clue, and the game rings its own bell when a clue is yours to give or
to guess from.

Everything a player does — a clue, a guess, a pass, asking the AI — is one row
of `codenamesduet.events`, the log every game keeps. Only the log's drawing is
this game's own: it shows those rows as a table of turns, each a clue with the
guesses under it — and, in sudden death, where every guess is a turn of its
own, one row per guess.

A stuck clue-giver can ask Claude. The `codenamesduet-suggest-clue` edge
function reads the board through an RPC that checks the caller is the
clue-giver, asks the model for a clue, and fills the clue form with it; the
player still presses Submit. That a hint was asked is logged and the partner is
told; a clue submitted exactly as the AI suggested it is marked as the AI's in
the log, and one the giver edited is not.

The end of a game is on the board. No modal carries the verdict: the pill
under the board says it, the action row's line repeats it, and a win alone
celebrates, once, as it lands. The partner's key card stays covered until
each player chooses to look, since the talk after an assassin — *"I was about
to pick that one"* — happens only while it is. Restart is a mulligan: the
same words and the same key cards, played again from nothing, for the
first-guess assassin that ended a game nobody got to play. A player who wants
a board they have not seen yet uses New game.

## Game rules

The rules are the [Codenames Duet
rulebook](https://filemanager.czechgames.com/storage/files/codenames-duet/rules/codenames-duet-rules-en.pdf)'s,
without its mission and campaign modes.

Twenty-five words on a 5×5 board, and one **key card** with two sides, A and
B. Each side labels every word an **agent**, a **bystander** or an
**assassin**, and the two sides are dealt from one fixed joint table:

| A \ B | agent | bystander | assassin |
|---|:-:|:-:|:-:|
| **agent** | 3 | 5 | 1 |
| **bystander** | 5 | 7 | 1 |
| **assassin** | 1 | 1 | 1 |

So each player sees nine agents, thirteen bystanders and three assassins, and
the pair has fifteen agents to find between them.

**A turn** is a clue and the guesses it earns. The **clue-giver** gives one
word and a number, about words that are agents on their own side. The
**guesser** turns words over one at a time, and each is read off the
**clue-giver's** side, since the guess answers their clue. An agent is
contacted and the guesser may go on, with no cap at the clue's number plus one
as in ordinary Codenames. A bystander ends the turn. An assassin loses the
game. The guesser may also stop at any point, a first guess included, and that
ends the turn too.

**The turn budget** is the setup's 9, 10 or 11 turns. A turn is spent each
time one ends, on a bystander or a stop, and never on an agent. Seat A gives
the first clue. After that the seats alternate, except that **a player whose
agents are all found gives no more clues**: the partner takes every clue from
then on (the rulebook's own words). Both players are told this happened, so
neither reads the lopsided turns as a bug.

**A bystander marks one direction only.** It is a bystander on the clue-giver's
side, and the same word may be the partner's agent, so it locks the word for
the guesser alone and the partner may still guess it. Only a word both players
have hit as a bystander is dead for both. An agent contacted and an assassin
hit are the same for both players.

**Sudden death** starts when the budget is spent with agents left. There are
no more clues: either player guesses from memory, a guess is read off the
PARTNER's side, and every agent is a turn of its own. Anything but an agent
loses.

### Vocabulary

| term | what it means |
|---|---|
| **key card** · **side** · **seat** | the two sides are `key_card_a` and `key_card_b`; a player's seat, A or B, says which side is theirs. The first clue-giver is seated as A |
| **agent** · **bystander** · **assassin** | the three labels, stored as `G`, `N` and `A`. The code's `neutral` is a bystander, and the rulebook's "green" is an agent |
| **contacted** | an agent turned over; the same for both players |
| **clue-giver** · **guesser** | who holds the clue this turn, `current_clue_giver` — nobody, in sudden death — and the other seat |
| **turn budget** | `setup.turns`, counted down in `turns_remaining`. Distinct from the wall-clock timer, which is an optional setup of its own |
| **sudden death** | the budget spent with agents left |
| **finished player** | a player whose own agents are all contacted; they stop giving clues |

### The play states

`playing` and `sudden_death` run; the rest are terminal. WHY a game ended is
`common.games.status.reason`:

| play state | when | reason |
|---|---|---|
| `won` | the fifteenth agent is contacted | `solved` |
| `lost_assassin` | an assassin is hit | `assassin` |
| `lost_clock` | a bystander in sudden death (an assassin there is still `lost_assassin`) | `exhausted` |
| `lost_timeout` | the wall-clock countdown ran out | `timeout` |
| `ended` | somebody pressed End — neutral, not a loss | `manual` |

Every ending is the same for both players, and only `won` is a win.

## Schema

Four tables, in `supabase/migrations/20260615000001_codenamesduet.sql` and
`20260923000001_codenamesduet_events.sql` (shape) and
`supabase/sql/codenamesduet.sql` (behavior).

| | |
|---|---|
| `codenamesduet.games` | one row per game: the two seats (`user_a_id`, `user_b_id`), both key cards (`key_card_a`, `key_card_b`, each 25 labels indexed by board position), the turn state (`turn_number`, `turns_remaining`, `current_clue_giver`). The play state is on `common.games` |
| `codenamesduet.word_pool` | the word list a board is drawn from, seeded by the migration. No policy and no grant: only `create_game` reads it |
| `codenamesduet.words` | the board, 25 rows per game: the word, and what has happened to it — `revealed_as` (`G` or `A`, the same for both players) and `neutral_a` / `neutral_b` (a bystander hit by that seat) |
| `codenamesduet.events` | the log ([supabase.md → Every game's log](../../docs/supabase.md#every-games-log-is-gameevents)): one row per `clue`, `guess`, `pass` and `hint`, `order by id`. Beside the skeleton, `turn_number`, `seat`, and payload columns named for the kind that owns them — `clue_word` / `clue_count` / `clue_from_ai`, `guess_position` / `guess_result` — with a CHECK tying each kind to its own. A partial unique index allows one clue per turn. `took_turn` is true where the turn number moves on: a bystander in ordinary play, a pass, and an agent in sudden death |

**The seats are columns, not a table.** `common.game_players` says who played;
which seat each holds, and what that seat's key card says, is game state and
lives on the game row, so one read returns the whole game.

**Both key cards are readable by either player.** Every table's select policy
is club membership, and the grant covers both columns. The frontend reads its
own card for play and the partner's only once the game is over and the player
asks; nothing stronger is owed between friends (CLAUDE.md → Trust model).
There are no insert, update or delete policies: every write is an RPC.

**The board is `words`, and the log is `events`.** A word can be guessed twice,
once from each side, so the log cannot be the board. The board's three columns
are what the tiles draw; the history viewer rebuilds a past board by folding
the logged guesses onto the words.

**The club-list readout is `common.games.status`**: `turn_number`,
`turns_remaining` and `greens_found` during play, and at the end the
`reason` and `turns_used`. The three endings a guess causes state
`greens_found` themselves, because the status merges and the winning guess ends
the game before the ordinary update would have counted it.

**The club-list title** is the board's first three words in board order,
`PAGE-CHAIN-EGG`. A duet board never moves, so the top-left three cells always
match the title, and the words are on every player's screen, so the title
gives nothing away.

**Realtime** is two rooms per client: the game row, and the board and the log
together. `end_game` touches the game row on the way out, so a client wakes
into the finished game.

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

### `codenamesduet.submit_clue(target_game, clue_word, clue_count, clue_from_ai)`

The clue-giver's move. Under a lock on the game row it checks that the game is
still in ordinary play, that the caller holds the clue seat, and that this
turn has no clue yet — each of which the partner's move or the caller's own
can change while the form is on screen, so a refusal here is a race. It
logs the clue as an event of the turn and the seat, with whether it is exactly
the AI's suggestion — the client says so, being the only side that saw the
suggestion. It does not judge the clue: the word is whatever was typed — a
board word included — and the count any whole number from zero up. The players
police their own clues, as they would at a table.

**Passed:** `{ "target_game": "88ae6f5a…", "clue_word": "WORD", "clue_count": 2, "clue_from_ai": false }` — `clue_from_ai` defaults to `false`.

**Returned** — one answer, the clue as it was stored:

```json
{ "result": "clued", "word": "WORD", "count": 2, "from_ai": false, "turn_number": 1, "by_seat": "A" }
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

Every guess is logged as an event, and it takes a turn exactly when the turn
number moves on after it. An agent is turned over for both players and the turn
goes on; a bystander in ordinary play ends the turn, and the seat that clues
next is the partner's unless the partner's agents are all found. In sudden
death every guess is a turn of its own: an agent moves the turn number on, so
the next guess — by either player — is the next turn. Three guesses
end the game: the fifteenth agent (`won`), any assassin (`lost_assassin`),
sudden death included, and a bystander in sudden death (`lost_clock`). Each ending records its
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
  (PAGE, position 0; the turn ended). When that spent the last turn,
  `play_state` is `sudden_death` and `clue_giver` is null — sudden death has no
  clues, so nobody holds the seat.

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
{ "result": "passed", "turn_number": …, "turns_remaining": …, "clue_giver": "A" | "B" | null, "play_state": "playing" | "sudden_death" }
```

### `codenamesduet-suggest-clue` — the edge function behind the AI button

Asks Claude for a clue for the caller's board. It reads the board through
`codenamesduet.get_clue_context` as the caller — the RPC refuses anyone but the
current clue-giver of a game in ordinary play, and those refusals are relayed as they
came — and gets back the caller's still-hidden agents, bystanders and
assassins by word, all 25 board words (the clue may be none of them, turned
over or not), and every clue given so far. It sends those to the model
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

`get_clue_context`'s own `ok` is `{ "result": "context", "board": […], "greens": […],
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
nothing**: the clue form checks only that there is a word and a one-digit count, and a
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
| a clue or an AI ask, the last turn spent under it | me | `Sudden death — no more clues` | `warning` | `submit_clue`, `get_clue_context` |
| a clue, the seat moved | me | `Your partner is giving the clue now` | `warning` | `submit_clue` |
| a clue, one already in | me | `A clue is already in for this turn` | `warning` | `submit_clue` |
| a guess, the game ended under it | me | `Game over` | `warning` | `submit_guess` |
| a guess, I became the giver | me | `Your partner is guessing this turn` | `warning` | `submit_guess` |
| a guess or a pass, the turn rolled over | me | `No clue yet this turn` | `warning` | `submit_guess`, `pass_turn` |
| a guess, the word is turned over | me | `That word is already revealed` | `warning` | `submit_guess` |
| a guess, my own bystander | me | `You already tried that word` | `warning` | `submit_guess` |
| a pass, the game ended under it | me | `Game over` | `warning` | `pass_turn` |
| a pass, the last turn spent under it | me | `Sudden death — no turn to pass` | `warning` | `pass_turn` |
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
dialog with it. The form remembers the suggestion it filled in, and sends
`clue_from_ai` true only if the word and count are submitted unchanged; the log
then marks that clue with the AI glyph, in the outcome `lib/answer.ts` gives
`clue_ai`. An edited clue, or one the giver thought of alone, wears nothing.

**New game** calls `create_game` directly, with this game's setup and roster.
The creator jumps to the new game and the partner arrives by the invitation
toast; mid-game the shell asks first, since starting another shelves this one.

## Frontend

The play surface is the shape [`docs/playarea.md`](../../docs/playarea.md)
describes: a loader that gates on the three ways a game can fail to load, then
`PlayArea` in the eight sections.

```
<PlayAreaLoader {...GamePageCtx}>        useGame, useBoard, the events; the three gates
  └── PlayArea                           the coordinator: draws no board, no control
        ├── BoardCol                     the board column, and submit_guess
        │     ├── MobileStatusBar ←      phone only: StateLine, above the board
        │     ├── Board                  the 5×5 tiles and their marks
        │     └── below the board        one of: HistoryBanner ←, the local slot's
        │                                FeedbackPill ←, or ClueStrip — the clue form,
        │                                the clue and Pass, or who we're waiting for
        ├── InfoSheet ←                  off-canvas on a phone, a flex child on desktop
        │     └── InfoCol                the readouts and the action row
        │           ├── StateLine        agents found, turns spent or sudden death
        │           ├── the finished-player banner
        │           ├── InfoActionsRow ← one row, every action, in the menu's order
        │           ├── InfoDisclosure ← "Key card", holding KeyCard
        │           ├── SetupDisclosure ←
        │           └── GameEventLog     the log, a table of turns
        ├── CodenamesduetAISuggestCompanion   the AI's suggestion, a floating panel
        └── CelebrationBlockingModal ←   a win, as it lands

  ← belongs to common/ ; everything else is this folder's
```

`GamePage` mounts the loader and owns everything above it — members, the timer,
the play state, pause, chat — and unmounts this surface on pause. `Help` and
`SetupForm` are the shell's to mount, from the menu and the start-game dialog.
`useGame` reads the game row; the loader seats its two players from the
profiles `GamePage` already holds (`lib/seats.ts`). `useBoard` reads the
words, the events and the key cards, and hands back the partner's card only
when the player has asked to see it.

What is codenamesduet's own:

- **The board draws what happened, and the marks draw what the cards say.** A
  tile's fill is what happened to it: untouched, a bystander hit by either
  player, an agent contacted, the assassin. The untouched tile is lighter than
  every other game's, because the shared resting shade is too close to the
  bystander tan. In the corners are the key-card squares: mine bottom-left,
  shown except while I am guessing, since my own card says nothing about my
  partner's clue; my partner's top-right, once the game is over and I have
  asked. A bystander hit from one side is a triangle pointing at the player who
  hit it: my partner's above the word, mine below. The phase decides which
  tiles take a click (`lib/phase.ts`), and a word I hit as a bystander stays
  locked to me alone.
- **The board marks are the shared ones** (`plans/tile-feedback.md`, tf2): a
  guessed tile dims until the reply; a tile a guess turns over flashes, mine
  included, and a bystander or the assassin then shakes; the board dims while
  my partner holds the move and its frame flashes as the move becomes mine, on
  the value the bell reads (never in sudden death); a finished board wears the
  game-over frame in its outcome; a viewed past turn rings its tiles outside
  the tile, in the shared ring geometry.
- **The clue strip under the board** is one line in every state, so the board
  above never moves: the clue form for the giver, the clue and Pass & End Turn
  for the guesser, who we are waiting for otherwise, and the sudden-death
  notice. The clue form keeps Tab on its two inputs.
- **The AI button** is on the clue form. It opens the suggestion in a floating
  panel and fills the form with it; the player still presses Submit.
- **The partner in the header.** The shell's turn line does not reach this game
  (see the intro), so `useTurnStatus` says what the partner is doing, in
  `lib/answer.ts`'s words.
- **The bell rings from here.** `GamePage`'s rings off the shared turn
  pointer, which this game never moves, so `PlayArea` calls `useTurnBell`
  itself: it is my turn when there is a clue for me to give or one to guess
  from, and nobody's in sudden death or once the game is over.
- **The finished-player banner** tells each player, in the info column, when
  one of them has found all their agents: in green to the one who finished,
  in tan to their partner, who now gives every clue.
- **The key card** is a disclosure in the info column: my side as a 5×5 grid of
  colors, with no words, for a player who wants to see the whole card at once.
- **The event log is a table of turns**: the clue, who gave it and whether it
  was the AI's, then the guesses under it in their key-card colors — or, in
  sudden death, one row per guess. Its bar is the turn's outcome
  (`lib/turnOutcome.ts`), and its number opens that turn on the board
  (`lib/history.ts`). The picker filters by who gave the clue.
- **The terminal** is the pill and the row's line (`lib/terminal.ts`). Reveal
  uncovers the partner's card for this player alone, and Hide covers it again.
- **The club label** (`manifest.ts`) is the play state, the agents found and,
  mid-game, the turns left.
- **The printer** (`pdf/`) is the board with both players' marks drawn — mine
  always, my partner's only at terminal — above the clue log, with a legend,
  since a printout has nothing else to explain the marks.

## Tests

pgTAP, in `supabase/tests/codenamesduet/`. `setup.psql` gives every file
`pg_temp.find_position` and `find_position_set` (the key card is random, so a
test finds a position by its label), `pg_temp.codenamesduet_setup()` and
`pg_temp.codenamesduet_players()`:

| file | pins |
|---|---|
| `create_game_test` | the refusals — no sign-in, an outsider, a roster that is not two, a bad turn budget, a bad timer — the rows written, the club-list status seeded at turn 1, and the key card's joint table exactly |
| `game_loop_test` | who may clue, guess and pass in which phase; an agent goes on and the club-list agent count with it, a bystander ends the turn and hands the clue over, a pass spends a turn; the assassin ends the game; no answer carries an outcome; a clue, a guess and a pass into a deleted game are the shared race |
| `clue_giver_handoff_test` | a finished player gives no more clues, from either seat, and two live seats still alternate |
| `cross_direction_test` | a bystander locks the guesser's side only; the partner can still contact the word; the two locks answer in different words |
| `win_test` | the fourteenth agent plays on and the fifteenth wins, both players winning, with the turns spent recorded |
| `sudden_death_test` | a real last pass enters it, with nobody holding the clue seat; a clue, a pass and the AI refused in its own words; an agent goes on, a bystander is `lost_clock` and an assassin `lost_assassin` |
| `submit_timeout_test` | `lost_timeout` from both running states, the reason, both players losing, the turns spent, and a second call refused |
| `end_game_test` | `ended` with the reason `manual`, nobody winning, the game row written for the realtime wake, and a second call refused |
| `replay_test` | the words and key cards kept; every reveal and event gone; seat A clues turn 1 again |
| `events_test` | what each move writes to the log, `took_turn` included, a hint under the seat that asked; the one-clue index and the payload CHECK |
| `clue_context_test` | `get_clue_context`'s gate, every agent, bystander and assassin in its answer, the whole board and the clues given so far; a deleted game is the shared race through it and `log_hint` |
| `rls_test` | an outsider sees no row of any table and cannot move; a direct insert is refused |

The edge function has no tests; `deno check` is its only net.

Vitest, beside the code:

| file | pins |
|---|---|
| `lib/phase.test` · `lib/agents.test` | every branch of the phase; when a seat's agents are all found |
| `lib/turnOutcome.test` · `lib/terminal.test` · `lib/answer.test` | a turn's outcome, sudden death's included; every ending's words; the header's words about the partner |
| `lib/events.test` · `lib/history.test` | the log's rows typed by kind; a past turn's board, its bystanders per side and its own tiles ringed |
| `hooks/useGame.test` · `hooks/useBoard.test` | the game row, a vanished row dropped rather than drawn on, a failed read kept and later cleared; the board's reads, the partner's card only when asked for, a gone game clearing my key (the no-such-game page), and a failed read kept as a failure rather than an empty board |
| `components/PlayArea.test` | a second guess while one is in flight sends nothing; a refused guess's sentence in the local slot; tile gating; the reveal; the action row and the menu; the partner's line and hint in the header; Pass and the AI button; the finished-player banners; what the bell is told; the board's turn dim and flash, and a guess's flash through the log; the keys, New game's players and setup included |
| `components/Board.test` · `components/StateLine.test` | the per-seat bystander lock, my key card hidden while I guess, the partner's only at the end and when asked, and the two triangles, above and below the word; the board marks — the in-flight dim, the turn dim and flash, the game-over frame, attention on the move log and the shake; the readout's turns spent and sudden death |
| `components/GameEventLog.test` · `components/ClueStrip.test` · `components/KeyCard.test` · `components/SetupForm.test` | the log's turns, picker, sudden-death rows and history link; the clue inputs' tag, the one-digit count, when a clue counts as the AI's, the form clearing when the clue lands, and the sudden-death notice; the key card's grid; the setup form's fields |
| `pdf/model.test` | the partner's card never printed mid-game; each cell's mark and triangles; the clue log |

Playwright, in `e2e/`: `codenamesduet` (the board holds its height through
every below-board state, the AI panel lands on screen, New game),
`codenamesduet-clueform` (Tab stays in the clue form), `codenamesduet-history`
(a past turn opens on the board without moving it), `codenamesduet-events` (the
log a real game writes), `codenamesduet-mobile` (the phone layout) and
`codenamesduet-print` (a real PDF downloads).
