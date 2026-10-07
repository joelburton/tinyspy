# wordleone

One row already played, and the one word it points at. A starter word is
shown colored against a hidden five-letter answer, and the answer is the only
legal word that fits those colors; find it. A wrong guess is a miss and tells
you nothing else.

## Intro to area

The puzzle is built before the game exists. The `wordleone-build-board` edge
function (`supabase/functions/wordleone-build-board/`, its generator in
`gen.ts`) picks an answer and searches starters until one isolates it among
every word at or below the game's legal band, then calls
`wordleone.create_game`, which checks the puzzle is one — the colors are the
starter scored against the answer, the answer is legal, no other legal word
fits — and stores it with the answer hidden by a column grant. The starter and
its colors are public from the first paint, in `static_game_data`; the answer
reaches the client in `game_data` only once the game has ended. How hard a
puzzle is lives in the generator alone, so the printable sheet
(`gmake g-wordleone-sheet`) and the game run one set of filters.

A guess comes back one of four ways. The starter or a word already guessed is
a duplicate, and a word outside the legal band is not a word: both cost
nothing and shake the typed row as wordle's do — a duplicate orange, a
non-word red. A duplicate writes nothing; a non-word is logged, so the players
can see what was tried, but counts no miss and keeps the turn. A legal wrong
word is a miss: logged with no colors, counted, and shaken red. Every one of
the three clears the typed row once its shake ends. The answer solves, and its
all-green row lands under the starter. Guesses are unlimited, so the board is
two rows — the starter and the row the guess is typed into — and every miss
and non-word lives in the event log, drawn uncolored.

Once a game has ended, a short survey takes the keyboard's place — how hard
it felt, what band the answer should be in beside the band it has, how long
it took, a comment — and saving it adds a row to `wordleone.ratings` beside
the puzzle, the answer's band, the generator's scores and the player's play.
It names the answer only while the board shows it. It is temporary, there to tune the generator
(plans/wordleone.md → The ratings).

Coop is one board and one miss count, ending on the solve; turn order is an
opt-in, a miss handing the turn on. Compete is the same puzzle on private
boards, and the race ends when nobody is still racing, every solver ranked by
fewest misses, then the earlier solve.

The frontend is wordle's, copied, and changed where the rules change: the
miss, the starter, the two-row board, the setup, and the printout.

## Game rules

### Vocabulary

| word | meaning |
|---|---|
| **starter** | the word already on the board, colored against the answer. Public from the first paint |
| **answer** (`target` in code) | the hidden word: the only word at or below the legal band that makes the starter's colors |
| **legal band** | `legal_band`, 1–6: the words you may guess, and the pool the answer is unique in — one band, both jobs |
| **difficulty** | the tier the puzzle was built to, by the starter's greens: easy three, medium one or two, hard none, any whatever comes |
| **miss** | a legal word that is not the answer. Logged with no colors and counted; tells you nothing else |
| **soft reject** | a duplicate (the starter, or a word already guessed — anyone's in coop, your own in compete), which writes nothing, or a word outside the legal band, which is logged. Both cost nothing |

### Coop

One board, one miss count, anyone guesses — or, with `coop_style: 'turns'`, in
turn, a miss handing the turn on and a soft reject keeping it. The solve wins
for everyone; the countdown loses. Nothing runs out.

### Compete

The same puzzle on private boards. A racer sees a rival's miss count and
whether they have solved or conceded, never their words, until the race ends.
A solve ends the solver while the others race on; the race ends when nobody is
still racing. Every solver is ranked by fewest misses, then the earlier solve,
and `tieBrokenByClock` marks a place the clock decided. A conceder forfeits;
a race nobody solved is a loss for everyone.

### How a game ends

| the ending | reason / detail | ranked |
|---|---|---|
| coop: the word found | `reached_goal` / `solved` | every teammate 1 |
| compete: the last racer ends | `reached_goal` / `solved` or `conceded` / `conceded` | every solver, by fewest misses then the earlier solve |
| the countdown | `timeout` / `timeout` | coop nobody; compete every solver |
| somebody stopped it | `stopped` / `stopped` | nobody |

## The puzzle

`buildPuzzle` (`gen.ts`) picks an answer at random — a clean word on the NYT
answer list at or below the band — then tries starters, clean non-plural words
at band 2 or below, in random order, keeping the first that:

1. scores against the answer with the tier's green count, never four (the NYT
   never publishes one; it is fill-in-the-blank);
2. leaves the answer the only word at or below the band with those colors;
3. leaves at most four NYT-list words consistent with its greens and yellows
   alone — the "positive space", the NYT's ceiling over its published rounds.

Twenty-five answers are tried before it gives up, which the edge function turns
into a validation under `difficulty`. A band-2 puzzle lands in well under a
second; the uniqueness re-check in `create_game` is one pass over the band's
words, 114 ms at band 6.

These thresholds are a reading of the NYT's 35 published Wordle in 1 rounds,
not a calibration; the printable sheet is how they get tried by hand, and
`summary_data`'s `difficulty` beside `nWinnerMisses` is how they get checked
against play.

## Schema

Shape in `supabase/migrations/20261007000005_wordleone.sql`; behavior in
`supabase/sql/wordleone.sql`. The frontend reads none of these tables: it
reads the page blobs.

| table | holds |
|---|---|
| `wordleone.games` | one row per game, keyed `game_id` to `common.games`: `starter`, `starter_colors`, `target` (the column grant leaves it out), `legal_band`, `difficulty`, and the generator's `positive_space` and `load_bearing` (for the survey) |
| `wordleone.players` | one row per player: `n_misses`, their own in both modes. A solve is `common.game_players.solved_at` |
| `wordleone.events` | the guess log: `word`, `colors`, `verdict` (`correct` · `miss` · `not_a_word`) and `is_correct` worked out from it; `kind` `guess`; `took_turn` true but for a non-word. `colors` is `ggggg` for the solve and null otherwise, a check holding the two together |
| `wordleone.ratings` | the temporary survey's rows: the puzzle, the answer's band then (`answer_band`) and the generator's view copied, what the player said (`suggested_band` among it), and their play — `solved_at`, the seconds from start to solve (an un-restarted game), misses, guesses logged. No grant: psql reads it. A printout's row has no game or user |

**The page blobs**, written by `wordleone._rebuild_data_cols` at create,
Restart and every move:

| blob | wordleone's part |
|---|---|
| `static_game_data` | `puzzle: {starter, colors}` |
| `game_data` | `puzzle: {target, targetBand}`, null until the game ends (the band is the answer's in the word list, for the survey); `team: {nMisses, board}`, null in compete; `events`; each player's `nMisses`, `board` (compete) and `tieBrokenByClock` |
| `summary_data` | `team: {nMisses}`, null in compete; `legalBand`, `difficulty`, `nWinnerMisses`, `nMissesById` |

A board is the starter, then the answer all green once that side has solved.
`useGame` joins the two blobs' halves of `puzzle` rather than letting one
replace the other.

## RPCs

### `wordleone.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)`

Called by the edge function, as the player, with `p_board` `{starter, colors,
answer}` (the name every build-board game passes its puzzle under). Validates
the setup — `legal_band` and `difficulty` required, no defaults — and the
puzzle, each refusal a fault: malformed (PN521), the starter is the answer
(PN522), wrong colors (PN523), the answer not legal (PN524), another legal
word fits (PN525). Answers `{result: 'created', id}`.

### `wordleone.submit_guess(p_game_id, p_guess)`

Answers `{result, n_misses, solved, game_ended}`, `result` one of `correct`,
`miss`, `duplicate`, `notAWord`, with no outcome or message — the words are
the frontend's. The answer is compared before the dictionary, so a word banded
out from under a live game still solves it. A malformed guess (PN527) and a
guess after your own solve (PN528) are faults.

### The rest

`concede`, `stop_game`, `submit_timeout` and `replay_board` (Restart, the same
puzzle) are wordle's, with misses where wordle counts guesses. `_sync_title`
titles a coop game with its latest guess, a non-word included, a compete game
with a placeholder until the race ends; only a solve spells the answer.

`rate_puzzle(p_game_id, p_rated_difficulty?, p_seconds_reported?, p_comment?,
p_suggested_band?)` is the temporary survey's: a player of an ended game adds
a ratings row, the server copying everything but those four. Faults before
the end (PN533), for a rating outside 1–7 (PN534) and a band outside 1–6
(PN537); a negative seconds or an over-long comment is a validation under its
field (PN535, PN536).

## FE submissions

A row shorter than five letters is refused locally and stays to be finished;
an empty row cannot be submitted. Everything else is the server's.

| answerType | said to | text | outcome | the typed word |
|---|---|---|---|---|
| `correct` / `correct_peer` | me / a coop teammate | *(none — the green row is the feedback)* / `guessed CRANE` | `won` | clears |
| `miss` / `miss_peer` | me / a coop teammate | `Not it` / `guessed CRANE — not it` | `lost` | shakes, then clears |
| `solved_peer` | about a compete opponent | `solved it` | `won` | |
| `duplicate` | me | `Already guessed` | `warning` | shakes, then clears |
| `not_a_word` / `not_a_word_peer` | me / a coop teammate | `Not in word list` / `tried ZZZZZ — not a word` | `lost` / `warning` | shakes, then clears |
| `too_short` | me | `Not enough letters` | `warning` | stays |

The log draws a non-word with the warning bar: it is there to be seen, not
counted.

A refusal the server never judged the word for — not your turn, a race with
the game's end — rings in the envelope's outcome and keeps the word. Start and
New game go through the edge function, so a puzzle that cannot be built at
that difficulty is a validation the setup form shows under the control.

## Frontend

The play surface is wordle's shape (docs/playarea.md): `useGame` builds `gd`
from the blobs, `PlayArea` coordinates, `BoardCol` holds the board, the typed
word and the keyboard, `InfoCol` the readouts and the log.

What is wordleone's own:

- **The board is two rows** (`BOARD_ROWS`): the starter, and the row a guess
  is typed into and the solve lands in. Each row's height is its square tiles'
  — not a cols/rows `aspect-ratio`, which leaves the gap out and at two rows
  lets the tiles spill past the grid.
- **A miss lands no row.** `useSubmitGuess` takes the word back at once and
  hands `clearTypedWord` to the red mark's `onEnd`, so the row keeps the word
  through its shake and empties after.
- **The keyboard is tinted by the board** — the starter's colors, and the
  solve's — so a miss earns its letters nothing.
- **Reveal puts the answer on the board**, as an all-green second row on a
  board nobody solved, drawn without the flip a solve gets; the keyboard keeps
  only what was earned.
- **`#N` replays a turn as the starter and that word**: a miss as it looked
  before it was sent, uncolored and unringed; the solve ringed.
- **The log draws a miss uncolored** (`.unjudged`), the look of a typed tile.
- **The setup** is the legal band and the difficulty, beside coop pacing and
  the timer.
- **The printout** is two rows per track, the keyboard from the board, every
  guess listed, the result in misses.

## Tests

pgTAP, in `supabase/tests/wordleone/`, on one fixed puzzle — starter SIEVE,
colors `yxyyg`, answer VERSE, unique in the whole word list — so no test reads
the hidden column:

| file | pins |
|---|---|
| `create_game_test` | the stored row; the column grant; the setup's faults; each puzzle refusal; a caller not among the players |
| `gameplay_test` | the four answers, a miss logged uncolored and counted, the solve's ending and title, the game-over race, a banded-out answer still solving, the band gate, a deleted game |
| `compete_test` | private boards, the starter a duplicate on every board, the ranking and its tie-break |
| `rate_puzzle_test` | the survey: refused before the end and to a non-player; the puzzle, the answer's band, the generator's scores and the caller's play copied; a blank rating; a second save; the checks; the table unreadable to clients; the ratings outliving a deleted game |
| `concede_test` · `stop_game_test` · `turn_order_test` | wordle's, with a miss handing the turn on |
| `replay_test` | Restart keeps the puzzle and its static blob; a stopped game is titled by its last guess |
| `game_data_test` · `rebuild_data_cols_test` | the blobs whole, the green row on a solved board, `tieBrokenByClock`; the rebuild's date and assignment |

Deno, in the edge function's folder: `gen_test.ts` pins each filter on a
planted word list.

Vitest, beside the code: `lib/answer.test`, `lib/endingLabel.test`,
`lib/history.test`, `lib/colors.test`, `hooks/useGame.test` (the seat rule, the
joined `puzzle`), `hooks/useSubmitGuess.test` (each answer's ring and clear),
`hooks/useHistoryView.test`, `hooks/useActionsAndMenu.test`,
`components/SetupForm.test`, `pdf/model.test`, and `components/PlayArea.test`
(the surface in every mode and state; the rings and the clears; Reveal on the
board without a flip; the solve's flip).

Playwright, in `e2e/`: `wordleone-history` (the viewer, a miss below the
starter, the exits), `wordleone-mobile` (board and keyboard fit a short phone),
`wordleone-print` (a real PDF), the gallery entry, and the shared specs that
list it (`events-realtime`, `restart-resets`, `build-board-random`, which
drives the edge function from the club page).
