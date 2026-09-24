# wordwheel

Nine letters on a wheel, one of them the center, and every word of four letters
or more you can spell from them that uses the center — each tile once per word,
so a letter can be used only as many times as there are tiles carrying it. A
word using all nine tiles is a pangram. Coop pools one found list and climbs a
rank ladder together; compete races everyone on the same wheel, each with a
private list, to a rank chosen at setup. Brand **MooseWheel**.

## Intro to area

The wheel is a multiset. Where spellingbee's hive is seven distinct letters, any
of them reusable, the wheel's nine tiles may repeat a letter — two E tiles, two
N tiles — and a word spends one tile per letter it uses. That one rule is most
of what separates this game from the one it was forked from: the board builder
drops every word that would need more of a letter than the wheel has, the
frontend refuses to submit a word it cannot spell from the tiles, and the tiles
a word spends are marked as it is typed. With spending in place an S is
ordinary, so this game has no S rule, and a pangram is simply a nine-letter word
that fits.

The frontend knows the answer key. Both word lists — the required words that
make up the goal and the bonus words beyond them — ship to every client the
moment the game loads, so a typed word is judged where it is typed: too short,
already found, the center letter missing, not a word. None of those reaches the
server. Only an accepted word does, and it arrives already scored; `submit_word`
trusts the word and its points, checks that the game is still on and the word
is not a duplicate, records the row, re-sums the score and decides whether that
word ended the game.

The board is built outside the database. Starting a game does not call
`create_game` directly: the frontend calls the `wordwheel-build-board` edge
function, which chooses the nine letters in Deno — from a pool of nine-letter
seeds, or from letters the player typed — asks the database for every word
those letters admit, keeps the ones the tiles can spell, scores and partitions
them, and only then calls `create_game` with the finished board. What the
frontend gets back is `create_game`'s own envelope, relayed untouched.

What separates the two modes is whose list a word lands on, exactly as in
spellingbee. Coop is one found list, the team's score, and a game that runs
until the clock or the End button stops it — or, when the team set a target
rank, until they reach it together. Compete is a race to a target rank on
private lists: an opponent's finds stay hidden until the game is over, so all a
racer learns about a rival mid-game is the rank they have reached, and the
first to the target ends the race for everyone.

*The rest of the intro is owed — pass 2 of this area's audit.*

## Game rules

*Owed — pass 2. Absorbs what
[`docs/games/wordwheel.md`](../../docs/games/wordwheel.md) says that the code
does not.*

## Schema

*Owed — pass 2.*

## RPCs

Everything the player does reaches the server through one of these, and every
one answers [the envelope](../../docs/envelopes.md). The examples below are
what `data` carries on an `ok`; `result` names the answer, and a call site
picks its branch by that word and nothing else. One of them is not an RPC at
all — the edge function that stands in front of `create_game` — and it is
listed first because it is what starting a game actually calls.

### `wordwheel-build-board` — the edge function in front of `create_game`

Builds a board and creates the game in one round trip. The manifest's
`startGameInClub` and the play surface's New game both call it; nothing in the
frontend calls `create_game` itself. It runs as the caller, so every read it
makes is under the caller's own row-level policies.

With no custom letters, it samples. It reads the seeds in
`wordwheel.pangrams` — the letter multisets of nine-letter words — keeping only
those whose word is gettable at the game's required band, so a harder game
draws from a bigger pool; with *unique letters only* set, it keeps only seeds
whose nine letters all differ. It drops any seed sharing more than five
distinct letters with the club's most recent board, weights the rest three to
one toward seeds holding a rare letter, draws one, and tries its distinct
letters as the center in random order until one yields at least fifteen
required words, drawing another seed if none does. With custom letters — a
center and eight others, any lowercase letters, repeats allowed — it skips all
of that and builds from exactly those letters, and any number of required
words above zero will do.

Either way the words come from `wordwheel.candidate_words`, a plain SQL
function that returns every dictionary word of four letters or more, at or
below the game's legal band, whose letters are among the wheel's and include
the center, flagging each as required (at or below the required band,
American, not slang, clean) or not. That is a letter SET test, so it still
returns words that need more of a letter than the wheel has tiles; the edge
function drops those. It scores the rest — one point for four letters,
otherwise the length, plus fifteen for a pangram — partitions them into
`required_words` and `bonus_words`, totals the required set, and hands the
board to `create_game`.

**Passed:**

```json
{
  "target_club": "moths",
  "setup": {
    "target_rank": 5,
    "required": 3,
    "legal": 5,
    "timer": { "kind": "countdown", "seconds": 600 },
    "custom_center": "d",
    "custom_letters": "aeeginnr"
  },
  "player_user_ids": ["7b1e…", "c904…"],
  "mode": "compete"
}
```

`custom_center` and `custom_letters` are optional and go together;
`unique_letters` is optional and applies only to a sampled board; `required`
and `legal` default to 3 and 5. `mode` is a field of the body, not of the
setup.

**Returned:** exactly what `create_game` returns, below. Five refusals are
this function's own and are part of the story, because whether a board EXISTS
at those settings is something the setup dialog cannot know from the values
alone: letters that admit no required word come back under the letters field;
a required band with no seeds at all, or none that clears fifteen words, comes
back under the band; *unique letters only* emptying the pool comes back under
that option; and the club's last board ruling out every seed the settings left
comes back on the form's own line, asking for the settings to be relaxed.

### `wordwheel.create_game(target_club, setup, player_user_ids, mode, board)`

Records a board the edge function built. It checks the setup — a target rank
of 0 to 6, required in compete and optional in coop; a required band of 1 to 6
and a legal band from there to 6; the timer — and the board's shape: eight
lowercase outer letters and a lowercase center, repeats allowed and the center
free to repeat an outer, both word lists present, and at least fifteen
required words, or at least one when the letters were the player's own. It
titles the game after its letters, the center first and the outer eight
alphabetized — `D·AEEGINNR` — writes the `common.games` row and the
`wordwheel.games` row holding the letters and both lists, and seeds the
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
    "outer_letters": "aeeginnr",
    "center_letter": "d",
    "required_words_score": 401,
    "required_words_count": 83,
    "required_words": [ { "word": "endearing", "points": 24, "is_pangram": true }, … ],
    "bonus_words":    [ { "word": "dene", "points": 1, "is_pangram": false }, … ]
  }
}
```

**Returned** — one answer:

```json
{ "result": "created", "id": "3f2a…" }
```

### `wordwheel.submit_word(target_game, word, points, is_pangram, is_bonus)`

The only mid-game move, and a trusting commit: the word arrives already judged
and scored by the frontend, and the server does not re-check its letters, its
tiles, its length or the dictionary. What it does check, under a lock on the
game row, is that the game still exists, is still playing and the caller has
not conceded — a word in flight when any of those changed is a race, a deleted
game answering with the shared *"That game was already deleted"* — and that
the word is not already found under this mode's rule: anyone's in coop, the
caller's own in compete. A duplicate is also a race, since the frontend dedups
first and reaching the server means its list was stale; the server writes the
whole line for that one so the two routes to it read alike.

An accepted word is written to `found_words` with its points and flags. In
coop the team's score and count are re-summed and published to the club-list
readout, and when the team set a target rank and this word carried them to it,
the game ends as `won`. In compete the caller's own totals are re-summed and
the leaderboard the readout carries — each racer's score, count and rank — is
rebuilt; when the caller's rank reaches the target the race ends as
`won_compete`, the caller frozen onto the status as the winner with the
leaderboard as it stood. **The answer is about the caller's word and never
about anyone else's**: the terminal reaches every client over realtime, and the
reply only names this word's kind.

**Passed:** `{ "target_game": "3f2a…", "word": "endearing", "points": 24,
"is_pangram": true, "is_bonus": false }`

**Returned.** Four shapes, all meaning the row landed; `points` echoes what was
sent. The first three are the caller's own flags read back, the fourth takes
precedence over them:

- an ordinary required word — `{ "result": "accepted", "points": 6 }`
- a bonus word — `{ "result": "bonus", "points": 1 }`
- a pangram, required or bonus — `{ "result": "pangram", "points": 24 }`
- the word that reached the target rank and ended the game — `{ "result": "won", "points": 24 }`

None carries an outcome or a message, and the frontend reads none of the four
for their own sake: the pill was shown before the call went out, and any `ok`
leaves it standing.

### The rest

`concede`, `end_game`, `submit_timeout` and `replay_board` — the common shape
every game has, doing here what they do everywhere. What is this game's:
`end_game` is neutral in both modes, `ended` with the reason `manual`, since
friends agreeing to stop is not losing; `submit_timeout` is a loss wherever
there was a rank to reach — `lost` in a coop game that set a target, always
`lost_compete` in a race — and the neutral `ended` only in the open-ended coop
hunt; `concede` is refused outside compete, and a conceder's words are refused
from then on, so they cannot reach the target; and `replay_board` clears every
found word and reseeds the readout exactly as `create_game` did, the target
rank carried over, so the same letters are played again from nothing. Every
ending this game writes itself publishes the final score, count and rank —
coop's team figures, compete's leaderboard — beside the reason, which is what
the club-list label and the opponent strip read after the game. The one ending
it does not write, every racer conceding, is `common.concede`'s, which adds
only its reason over the race's last readout.

Three of them end by touching `found_words` in place. A compete client cannot
see an opponent's finds until the game is over, and `common.end_game` writes
only `common.games`, so without that no-op write nothing would wake the found
list and every opponent word would show as missed. `replay_board` touches
`games` instead: it only deletes, and a filtered subscription does not reliably
see a delete.

## FE submissions

What the frontend decides before a word reaches the server, and what it says
about the answers that come back.

**A word the tiles cannot spell is never submitted.** A letter that is on no
tile, or used more times than the wheel has tiles for it, is dimmed in the
typed word, and Submit and Enter do nothing until it is gone — `DINNER` spends
both N tiles and can go, `DARED` wants two D tiles from a wheel with one and
cannot. It gets no answer, because the typed word already shows what is wrong.

**Everything else about legality is decided here too, and never reaches the
server.** The game's legal list is `required_words ∪ bonus_words`, indexed by
word, and the shared `useFoundWordSubmit` engine walks a typed word through it
in the order that gives the friendliest answer: shorter than four letters,
already found — by anyone in coop, by me in compete, plus the words accepted
but not yet landed — then not in the list, which this game splits into the
center letter missing and simply not a word. Each is refused locally, writes
nothing, and answers on the board as well as in the pill: the tiles the word
used shake and take the answer's color for a beat — as many of each letter as
the word used, so a word using one E marks one of two E tiles, never both.

**An accepted word is shown before it is sent.** The pill says `WORD — +N` the
moment the lookup succeeds, the points and flags read off the shipped entry,
and `submit_word` is called in the background with the word already scored.
The reply is read only for whether the row landed: any of its four `ok`s leaves
the pill as it is, and a not-ok — the game ended or was deleted, the caller
conceded, or a duplicate that slipped past the local check — replaces it with
the server's own sentence and frees the word to be tried again. The end of the
game, when this word was the one that ended it, arrives by realtime like every
other terminal.

**Everything this game says about a word is [`lib/answer.ts`](lib/answer.ts)**
— the words and the outcome together, one answer each. The engine names no word
of its own: it reports what it decided, `answerOf` turns that into one of this
game's answers (the center says why a word missed), and `answerMessage` says
it. The pill and the refused word's tiles read the same call, and the two peer
lines read the same file. The examples are the `D·AEEGINNR` board above:

| answer | said to | text | outcome |
|---|---|---|---|
| `accepted` | me | `DEAN — +1` · `DENE • — +1` (a bonus word) · `ENDEARING — pangram +24` | `won` |
| `accepted_peer` | about a coop teammate | `found DEAN +1` · `pangram 🦌 ENDEARING +24` | `won` |
| `already_found` | me | `DEAN — already found` | `warning` |
| `too_short` | me | `DEN — too short` | `warning` |
| `missing_center` | me | `REIN — missing "D"` | `lost` |
| `not_a_word` | me | `DREAN — not a word` | `lost` |
| `reached_peer` | about a compete opponent | `reached Amazing` | `noted` |

The already-found line is written twice on purpose: the server composes the
same `WORD — already found` for the duplicate that slips past the local check,
so the two routes to it read alike.

Coop narrates every teammate's accepted word in the header, in the same outcome
the finder saw; a refused word never becomes a row, so there is nothing to
narrate. Compete cannot see an opponent's words and narrates the one thing it
can: a rank reached, read off the status leaderboard as it changes. The
terminal verdict and the out-of-race line are standing conditions of the local
slot, not answers to a move; they are built in `PlayArea`.

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
