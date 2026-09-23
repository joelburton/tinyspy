# spellingbee

A honeycomb of seven letters, one of them the center, and every word you can
spell from them that uses the center; the longer the word the more it scores,
and a word using all seven is a pangram. Coop pools one found list and climbs a
rank ladder together; compete races everyone on the same hive, each with a
private list, to a rank chosen at setup. Brand **FreeBee**.

## Intro to area

The frontend knows the answer key. Both word lists — the required words that
make up the goal and the bonus words beyond them — ship to every client the
moment the game loads, so a typed word is judged where it is typed: too short,
a letter off the hive, the center letter missing, not a word, already found.
None of those reaches the server. Only an accepted word does, and it arrives
already scored; `submit_word` trusts the word and its points, checks that the
game is still on and the word is not a duplicate, records the row, re-sums
the score and decides whether that word ended the game. That is the same trade
connections and boggle make, and the opposite of wordle and psychicnum, whose
frontends never hold the answer.

The board is built outside the database. Starting a game does not call
`create_game` directly: the frontend calls the `spellingbee-build-board` edge
function, which chooses the seven letters in Deno — from a pool of pangram
seeds, or from letters the player typed — asks the database for every word
those letters admit, scores and partitions the list, and only then calls
`create_game` with the finished board. The RPC checks the board's shape and
records it; it never chooses a letter. What the frontend gets back is
`create_game`'s own envelope, relayed untouched, so New game and the setup
dialog read one answer whichever way a game was started.

What separates the two modes is whose list a word lands on. Coop is one found
list: whoever finds a word first claims it in their color, the score is the
team's, and the game runs until the clock or the End button stops it — or,
when the team set a target rank, until they reach it together. Compete is a
race to a target rank on private lists: the policy on `found_words` hides an
opponent's finds until the game is over, so all a racer learns about a rival
mid-game is the rank they have reached, and the first to the target ends the
race for everyone. A conceder is out while the others race on.

*The rest of the intro is owed — pass 2 of this area's audit.*

## Game rules

*Owed — pass 2. Absorbs what
[`docs/games/spellingbee.md`](../../docs/games/spellingbee.md) says that the
code does not.*

## Schema

*Owed — pass 2.*

## RPCs

Everything the player does reaches the server through one of these, and every
one answers [the envelope](../../docs/envelopes.md). The examples below are
what `data` carries on an `ok`; `result` names the answer, and a call site
picks its branch by that word and nothing else. One of them is not an RPC at
all — the edge function that stands in front of `create_game` — and it is
listed first because it is what starting a game actually calls.

### `spellingbee-build-board` — the edge function in front of `create_game`

Builds a board and creates the game in one round trip. The manifest's
`startGameInClub` and the play surface's New game both call it; nothing in the
frontend calls `create_game` itself. It runs as the caller, so every read it
makes is under the caller's own row-level policies.

With no custom letters, it samples. It reads the club's most recent board so
the new one can share at most four of its seven letters, draws a seed from
`spellingbee.pangrams` — the letter sets of common seven-distinct-letter words,
weighted three to one toward sets holding a rare letter, and a set holding all
of I, N and G kept only a third of the time — then tries that seed's seven
letters as the center in random order until one yields at least thirty
required words, re-sampling the seed if none does. With custom letters — a
center and six others, seven distinct, none of them S — it skips all of that
and builds from exactly those letters, and any number of required words above
zero will do.

Either way the words come from `spellingbee.candidate_words`, a plain SQL
function that returns every dictionary word of four letters or more, at or
below the game's legal band, whose letters are a subset of the seven and
include the center, flagging each as required (at or below the required band,
American, not slang, clean) or not. The function scores each — one point for
four letters, otherwise the length, plus ten for a pangram, a word whose
letter set equals the board's — partitions them into `required_words` and
`bonus_words`, totals the required set, and hands the board to `create_game`.

**Passed:**

```json
{
  "target_club": "moths",
  "setup": {
    "target_rank": 5,
    "required": 3,
    "legal": 5,
    "timer": { "kind": "countdown", "seconds": 600 },
    "custom_center": "a",
    "custom_letters": "chirot"
  },
  "player_user_ids": ["7b1e…", "c904…"],
  "mode": "compete"
}
```

`custom_center` and `custom_letters` are optional and go together; `required`
and `legal` default to 3 and 5. `mode` is a field of the body, not of the
setup.

**Returned:** exactly what `create_game` returns, below. Two refusals are this
function's own and are part of the story: letters that admit no required word
at that band come back as a validation under the letters field of the setup
dialog, and a required band at which no sampled seed clears thirty words comes
back under the band's field, asking for a wider one.

### `spellingbee.create_game(target_club, setup, player_user_ids, mode, board)`

Records a board the edge function built. It checks the setup — a target rank
of 0 to 6, required in compete and optional in coop; a required band of 1 to 6
and a legal band from there to 6; the timer — and the board's shape: six
distinct outer letters and a center that is not among them, none of them S,
both word lists present, and at least thirty required words, or at least one
when the letters were the player's own. It titles the game after its letters,
the center first — `A·CHIORT` — writes the `common.games` row and the
`spellingbee.games` row holding the letters and both lists, and seeds the
club-list readout: in coop the score, count and rank at zero with the required
totals and the target beside them; in compete the target, the totals and an
empty leaderboard. The setup is saved as the club's next default with the
custom letters stripped, so the next game's dialog opens on a random board.
Either mode takes up to six players and a race needs two; the server checks
both.

**Passed:** the edge function's body plus `board`:

```json
{
  "board": {
    "outer_letters": "chirot",
    "center_letter": "a",
    "required_words_score": 385,
    "required_words_count": 81,
    "required_words": [ { "word": "chariot", "points": 17, "is_pangram": true }, … ],
    "bonus_words":    [ { "word": "trochaic", "points": 18, "is_pangram": true }, … ]
  }
}
```

**Returned** — one answer:

```json
{ "result": "created", "id": "3f2a…" }
```

### `spellingbee.submit_word(target_game, word, points, is_pangram, is_bonus)`

The only mid-game move, and a trusting commit: the word arrives already judged
and scored by the frontend, and the server does not re-check its letters, its
length or the dictionary. What it does check, under a lock on the game row, is
that the game is still playing and the caller has not conceded — a word in
flight when either changed is a race — and that the word is not already found
under this mode's rule: anyone's in coop, the caller's own in compete. A
duplicate is also a race, since the frontend dedups first and reaching the
server means its list was stale; the server writes the whole line for that one
so the two routes to it read alike.

An accepted word is written to `found_words` with its points and flags. In
coop the team's score and count are re-summed and published to the club-list
readout, and when the team set a target rank and this word carried them to
it, the game ends as `won`. In compete the caller's own totals are re-summed
and the leaderboard the readout carries — each racer's score, count and rank —
is rebuilt; when the caller's rank reaches the target the race ends as
`won_compete`, the caller frozen onto the status as the winner with the
leaderboard as it stood. **The answer is about the caller's word and never
about anyone else's**: the terminal reaches every client over realtime, and
the reply only names this word's kind.

**Passed:** `{ "target_game": "3f2a…", "word": "chariot", "points": 17,
"is_pangram": true, "is_bonus": false }`

**Returned.** Four shapes, all meaning the row landed; `points` echoes what
was sent. The first three are the caller's own flags read back, the fourth
takes precedence over them:

- an ordinary required word — `{ "result": "accepted", "points": 5 }`
- a bonus word — `{ "result": "bonus", "points": 5 }`
- a pangram, required or bonus — `{ "result": "pangram", "points": 17 }`
- the word that reached the target rank and ended the game — `{ "result": "won", "points": 17 }`

None carries an outcome or a message, and the frontend reads none of the four
for their own sake: the pill was shown before the call went out, and any `ok`
leaves it standing.

### The rest

`concede`, `end_game`, `submit_timeout` and `replay_board` — the common shape
every game has, doing here what they do everywhere. What is this game's:
`end_game` is neutral in both modes, `ended` with the reason `manual`, since
friends agreeing to stop is not losing; `submit_timeout` is a loss wherever
there was a rank to reach — `lost` in a coop game that set a target, always
`lost_compete` in a race — and the neutral `ended` only in the open-ended
coop hunt; `concede` is refused outside compete, and a conceder's words are
refused from then on, so they cannot reach the target; and `replay_board`
clears every found word and reseeds the readout exactly as `create_game` did,
the target rank carried over, so the same letters are played again from
nothing. Every ending this game writes itself publishes the final score, count
and rank — coop's team figures, compete's leaderboard — beside the reason,
which is what the club-list label and the opponent strip read after the game.
The one ending it does not write, every racer conceding, is `common.concede`'s
and carries only its reason.

Three of them end by touching `found_words` in place. A compete client cannot
see an opponent's finds until the game is over, and `common.end_game` writes
only `common.games`, so without that no-op write nothing would wake the found
list and every opponent word would show as missed. `replay_board` touches
`games` instead: it only deletes, and a filtered subscription does not
reliably see a delete.

## FE submissions

What the frontend decides before a word reaches the server, and what it says
about the answers that come back.

**Everything about legality is decided here, and never reaches the server.**
The game's legal list is `required_words ∪ bonus_words`, indexed by word, and
the shared `useFoundWordSubmit` engine walks a typed word through it in the
order that gives the friendliest answer: shorter than four letters, already
found — by anyone in coop, by me in compete, plus the words accepted but not
yet landed — then not in the list, which this game splits into a letter off
the hive, the center letter missing, and simply not a word.
Each is refused locally, writes nothing, and answers on the board as well as
in the pill: the hive shakes, and the hexes the word used take the answer's
color for a beat.

**An accepted word is shown before it is sent.** The pill says `WORD — +N` the
moment the lookup succeeds, the points and flags read off the shipped entry,
and `submit_word` is called in the background with the word already scored.
The reply is read only for whether the row landed: any of its four `ok`s
leaves the pill as it is, and a not-ok — the game ended, the caller conceded,
or a duplicate that slipped past the local check — replaces it with the
server's own sentence and frees the word to be tried again. The end of the
game, when this word was the one that ended it, arrives by realtime like every
other terminal.

**Everything this game says about a word is [`lib/answer.ts`](lib/answer.ts)**
— the words and the outcome together, one answer each. The engine names no
word of its own: it reports what it decided, `answerOf` turns that into one of
this game's answers (the hive says why a word missed), and `answerMessage`
says it. The pill and the refused word's hexes read the same call, and the two
peer lines read the same file:

| answer | said to | text | outcome |
|---|---|---|---|
| `accepted` | me | `CHAT — +1` · `AIRT • — +1` (a bonus word) · `CHARIOT — pangram +17` | `won` |
| `accepted_peer` | about a coop teammate | `found CHAT +1` · `pangram 🐝 CHARIOT +17` | `won` |
| `already_found` | me | `CHAT — already found` | `warning` |
| `too_short` | me | `CAT — too short` | `warning` |
| `bad_letters` | me | `CAXT — bad letters` | `lost` |
| `missing_center` | me | `CHIT — missing "A"` | `lost` |
| `not_a_word` | me | `CHAIT — not a word` | `lost` |
| `reached_peer` | about a compete opponent | `reached Amazing` | `noted` |

The already-found line is written twice on purpose: the server composes the
same `WORD — already found` for the duplicate that slips past the local check,
so the two routes to it read alike.

Coop narrates every teammate's accepted word in the header, in the same
outcome the finder saw; a refused word never becomes a row, so there is
nothing to narrate. Compete cannot see an opponent's words and narrates the
one thing it can: a rank reached, read off the status leaderboard as it
changes. The terminal verdict and the out-of-race line are standing conditions
of the local slot, not answers to a move; they are built in `PlayArea`.

**New game goes through the edge function again**, with this game's setup,
roster and mode, minus any custom letters: a hand-picked board is a one-off,
and the follow-up game gets a random one. The creator jumps to the new game
and the others arrive by the invitation toast. Mid-game the shell asks first,
since starting another shelves this one; at terminal there is nothing to
interrupt.

## Frontend

*Owed — pass 2.*

## Tests

*Owed — pass 2.*
