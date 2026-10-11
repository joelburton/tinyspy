# wordsy

Gil Hova's Wordsy, branded FlipWord: eight consonant cards in four columns
worth 5, 4, 3 and 2, and everyone writes one word a round at once. The first
word in starts a 30-second clock; seven rounds, the best five plus the
bonuses, highest total wins — or a short game, three rounds and the best
two.

## Intro to area

There are no turns. Everyone types at once, and nothing reaches the server
until ↵: a submitted word stands for the round and a later one replaces it,
except the round's first, which starts the clock and is frozen — its player is
the Fastest Wordsmith. The server holds every standing word until the clock
runs out, then reveals them all at once into the event log, scored, with the
bonuses marked — each round's rows the Fastest's first, then in the order the
words came in, no word last; the round's scoresheet keeps that order. The
round's scoresheet then takes the board's place, and the next round is dealt
once everyone still playing has pressed "Start round N" (`start_round`; the
button reads "Waiting for others" after mine), arriving with the yellow
attention frame and the bell. When the game ends, the whole game's scoresheet
takes the board's place for good. The `no-timer` style, a setup
choice, has no clock: a First Wordsmith is named at the deal, every submit is
final, and the round ends when everyone still playing has submitted. **One
word a round**, a setup choice for the timer style, borrows those last two
rules: every submit is final and the last one in ends the round, unless the
clock ends it first (`_is_one_word`). The page reads finality off the
server's `isWordFrozen`, so it never asks which rule made a word final.

The clock is the page header's, the shared game clock in `common.timers`, and
this is the one game that changes it mid-game: the round's first submit arms
it as a 30-second countdown and the round's end puts it away
(docs/common-schema.md → The game clock). Every page fires `submit_timeout` at
zero, as for any countdown, and here that ends the round, not the game.

Two moments are marked on the board, each a frame for a beat and a sound
(`useRoundMarks`), never on opening a game. A new round's table gives
everyone the yellow attention frame and the bell. A rival's first word, starting the
clock, gives everyone but its player the caution frame and the timer sound;
that player's board dims instead, since their word is in and there is
nothing left for them to enter until the next table. Any frozen word dims the
board the same way, no-timer's included.

A word must be in the dictionary at the game's band (the may-enter tier,
docs/word-list.md), and new: nothing scored in an earlier round may share its
root, `common.words.root_word`, so fishes and fishing are fish. Both refusals
are answers only the server can give, and come back in the pill. A non-word
empties the entry, since nothing in it is worth fixing; an already-played
word stays, to be changed.

Compete only, as `wordsy_compete` on the family `wordsy`, so a coop sibling
can land beside it.

## Game rules

### Vocabulary

| word | meaning |
|---|---|
| **card** (`tile` in code) | one of the deck's 60, by number: 1–44 the common letters B C D G L M N P R S T four each, 45–56 the red F H K V W Y two each (+1), 57–60 the blue J Q X Z (+2) |
| **table** | the round's eight faceup cards, in slots 1–8: 1–2 under the 5, 3–4 under the 4, 5–6 under the 3, 7–8 under the 2 |
| **standing word** | a player's submitted word for the round in play, which a later submit replaces |
| **Fastest Wordsmith** | the timer style's first submit of a round; their word is frozen |
| **First Wordsmith** | no-timer's stand-in for the Fastest, named at the deal |
| **No Flip** | held by last round's Fastest: they may not submit first while more than two still play |

### Scoring

A word scores each faceup card it uses at its column's value plus the card's
bonus, each card once: for each distinct letter, as many of that letter's
cards as the word has of it, the highest-valued first. Two Bs against one B
card score one B; a C against two C cards scores the better. Letters with no
card score nothing.

### Bonuses

Marked at the round's end. In rounds 1–3 / 4–6 / 7, beating the Fastest
(strictly above) is +1 / +2 / +3, and the Fastest tying or beating enough
opponents is +2 / +3 / +4, where enough is `min(3, opponents)` and an opponent
is another player still playing — the 2025 rulebook's counts. A Fastest who has
conceded gives nobody a bonus.

### How a game ends

| the ending | reason / detail | ranked |
|---|---|---|
| the last round played | `resource_exhausted` / `rounds_played` | by total — the best word scores (five of seven, two of three; `_n_best_rounds`) plus every bonus — with `rank()`, among non-conceders who scored above zero; a tie shares the place |
| everyone conceded | `conceded` / `conceded` | nobody |
| somebody stopped it | `stopped` / `stopped` | nobody |

The last round is ended by nobody when the clock ends it, by the last player
to submit when everyone is in (no-timer, one word). There is no whole-game timer.

## The deal

The deck is one frozen shuffle of the 60 numbers (`games.deck`, withheld by
the column grant), and `drawn` is the numbers dealt, in order. A deal takes
the first undrawn number whose card keeps the rules of two against the cards
that will share the table with it — at most two of a letter, at most two rare
cards, red and blue together. A card they refuse is skipped, not discarded:
it waits in its place and is dealt when it fits, so the deck never runs out (a
discard pile could exhaust 60 before round 7). Round 1 deals slots 8 down to
1; a later round slides slots 1–4 into 5–8 and deals 4 down to 1.
Deterministic, so Restart replays the same tables.

## Schema

Shape in `supabase/migrations/20261010000001_wordsy.sql`; behavior in
`supabase/sql/wordsy.sql`. The frontend reads none of these tables: it reads
the page blobs.

| table | holds |
|---|---|
| `wordsy.games` | `deck` (withheld), `drawn`, `legal_band`, `round_style`, `n_rounds` (7 or 3), `one_word` — the last two from `20261011000000_wordsy_setup_options.sql` |
| `wordsy.players` | one row per player; the totals are summed off the log. `ready_for_num`, the round they last pressed Start for (`20261011000001_wordsy_round_ready.sql`) |
| `wordsy.rounds` | one row per round dealt: `tiles` in slot order, `fastest_user_id` (the Fastest, or no-timer's First Wordsmith), `no_flip_user_id`, `timer_started_at`, `ended_at` |
| `wordsy.round_words` | each player's standing word for the round in play. No grant |
| `wordsy.events` | the reveal: a row per player still playing per finished round, `num`, `word` (`''` for none), `score`, `bonus` |

**The page blobs**, written by `wordsy._rebuild_data_cols`:

| blob | wordsy's part |
|---|---|
| `static_game_data` | the common part alone: a round's table changes every round |
| `game_data` | `team` (null), `nRounds`, `nBestRounds`, `nTilesInDeck`, `rounds` (each with its `tiles`, `fastest`, `noFlipHolder`, `isTimerRunning`, `ended`), `events`, and each player's `total`, `nBonuses`, `roundScores`, `hasSubmitted`, `word`, `isWordFrozen`, `isBlockedByNoFlip` (the No Flip gate `submit_word` refuses on, written for the page), `isReadyForNextRound` |
| `summary_data` | `team` (null), `nRoundsPlayed`, `winnerTotal`, `nRounds`, `legalBand`, `roundStyle`, `oneWord` |

`shell_data`'s `timer` is read off `common.timers`, so the header follows the
round's clock.

## RPCs

### `wordsy.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)`

Compete only (PN545), two or more (PN546); `legal_band` 1–6 (PN543),
`round_style` (PN544), `n_rounds` 7 or 3 (PN554) and `one_word` (PN555)
required; the setup's `timer` fixed at none (PN547).
Shuffles the deck inline and deals round 1, naming a random First Wordsmith in
no-timer.

### `wordsy.submit_word(p_game_id, p_word)`

Answers `{result, earlier, timer_started, round_ended, game_ended}`, `result`
one of `submitted`, `notAWord`, `alreadyPlayed` (with the earlier word); the
two refusals record nothing and leave the earlier standing word. A word the
caller may no longer change (PN549) and No Flip (PN550) are races the page
gates first, as is a submit between rounds (PN557); a malformed word is a
fault (PN548). The round's first standing
word in the timer style names the Fastest and arms the clock; in no-timer and
with one word, the last player's submit ends the round.

### `wordsy.start_round(p_game_id)`

Between rounds: the caller is ready for the next, and the press that leaves
everyone still playing ready deals it (`_deal_next_round`). Answers
`{result}`, `ready` or `started`; a second press is harmless, and a press once
the round is in play is a race (PN556).

### `wordsy.submit_timeout(p_game_id)`

Ends the round, once the server's count has reached the round's 30 (PN552
otherwise, a race); a round with no clock running is PN551, the race every
page but the first meets.

### The rest

`concede` (in no-timer and with one word, a concede by the last player yet
to submit ends the round; between rounds, one by the last player yet to press
Start deals the next), `stop_game` and `replay_board` (Restart: the same deck from round 1)
each put the clock away. `_end_round` is the one end every round reaches: it
scores, marks the bonuses, writes the reveal, and finishes the game after the
last round.

## FE submissions

| answerType | said to | text | outcome | the typed word |
|---|---|---|---|---|
| `submitted` | me | `Your word is in` | `neutral` | clears |
| `not_a_word` | me | `Not a word at this dictionary` | `lost` | clears |
| `already_played` | me | `Already played: FISH` | `warning` | stays |
| `first_in_peer` | everyone but the Fastest | `submitted — 30 seconds` | `warning` | |
| `no_word` | the log | `no word` | `warning` | |

A log row that earned a bonus wears the won bar; any other word, neutral.

Every answer a submit puts in the pill is about its round, so a new table —
the next round dealt, or a Restart — takes it down (`useSubmitWord`).

## Frontend

The play surface is setgame's shape (docs/playarea.md): `useGame` builds `gd`
from the blobs and drops a rival's standing word, `PlayArea` coordinates,
`BoardCol` holds the table, the entry and the move, `InfoCol` the readouts and
the log.

- **The board is four columns**, a value plaque over two cards each. A common
  card is the default tile; the +1 and the +2 wear the app's two flex colors,
  their bonus printed.
- **The entry is `<WordEntryArea>`**; under it the typed word's score, worked
  out live by `lib/score.ts` — the table is public and the sum is the
  rulebook's own, so the page does it as the player would on paper (the
  server's `_score_word` decides; a test pins them to the same examples) —
  and the standing word, "Your word" or "Your word is in" once frozen, each
  word drawn as it scores (`ScoredWord`), in the wide tracking. While No Flip
  bars me (`isBlockedByNoFlip`) that line says so, and ↵ does nothing.
- **The board column shows one of four surfaces** (`useBoardColView`): the
  table, a finished round's sheet, the last round's sheet, or the game's. The
  button under a sheet is its command (`useBoardColActions`): "Start round N",
  or "Show final scores"; both are button-only, since each is the one thing
  the surface offers at that moment, drawn where the board was.
- **A phone types on `GuessKeyboard`**, wearing the entry's own ↵ and ⌫; a
  desktop hides it.
- **The strip** reads each total, "in" after it while that player's word
  stands, and how they came out once they are out.
- **`#N` is the row's round**, and opens that round's table on the board.
- **A logged word is plain, in bold.** Only the lines under the entry draw a
  word by how it scored (`ScoredWord`).
- **The scoresheets** (`RoundScoresheet`, `GameScoresheet` and the cells they
  share in `SheetCells`, over `lib/scoresheet.ts`) take the board's place,
  framed. A round's: who, the word, its score, the Fastest's bonus under ⏳,
  the bonus for beating them under >⏳ ("+2"; a dash for none), the round's
  total (score and bonus) under =, and a gold ★ for the best total; "Start
  round N" under it. A past round opened from the log shows its board over
  it. When the game ends in front of me the last round's sheet comes first,
  with "Show final scores"; a game opened already over goes straight to the
  game's: a table per player, the winner's first, a row per round, each
  player's dropped words and their scores struck in red (a tie strikes the
  later round), the server's total under them; it scrolls inside its frame,
  and stays.
- **The printout** is the totals, each finished round's table, and the log.
- **Setup** defaults to band 4, a step above the roster's usual: Wordsy
  rewards long, rare words (the rulebook's examples are QUIBBLES,
  BACCALAUREATES and LIQUEFACTION), and a band-5 word refused in a band-4 game
  costs only the retype.

## Tests

pgTAP, in `supabase/tests/wordsy/`, on a planted deck (`setup.psql`): round 1
is F B C D L C Q R, worth 6 5 4 4 3 3 4 2, and `ws_word(score)` is a word worth
exactly that against it.

| file | pins |
|---|---|
| `tiles_test` | all 60 numbers against the rulebook's deck |
| `deal_test` | right to left, the rules of two, the skip, the slide, sixteen blocked cards walked past, Restart's seven tables |
| `score_test` | the rulebook's examples |
| `create_game_test` | the gates and faults, the deck withheld, round 1, the First Wordsmith |
| `gameplay_test` | the answers, the Fastest and the armed clock, the frozen word, replacing submits, the races, the reveal, the wait for Start, No Flip, already played |
| `bonus_test` | every band of the bonus table, the threshold at 2–6 players, a conceder, No Flip at two still playing |
| `no_timer_test` · `finish_test` | the no-timer round; the ending, totals, ties, conceders |
| `options_test` | a short game's three rounds and best two; one word with the timer: final submits, the last in ends it, the clock still can, a concede |
| `concede_test` · `stop_game_test` · `replay_test` | the standard three |
| `game_data_test` · `rebuild_data_cols_test` | the blobs whole; the rebuild |

Vitest, beside the code: `lib/score.test`, `lib/scoresheet.test`, `lib/answer.test`,
`lib/endingLabel.test`, `lib/history.test`, `lib/setup.test`,
`hooks/useGame.test` (the seat rule), `pdf/model.test`, `manifest.test` (the
club card's words), `components/SetupForm.test`, and
`components/PlayArea.test` (the entry, the standing word, No Flip, the round's
marks and sounds and the dim, the header's line, the on-screen keyboard, the
strip, the log, the scoresheets and Start round, Concede and Stop).

Playwright, in `e2e/`: `wordsy-round` (two clients: the clock on both, the
caution frame on the other and the dim on the submitter, a replaced word, the
reveal's scoresheet on both, Start round), `wordsy-history`,
`wordsy-print`, `wordsy-mobile` (the board and keyboard fit, a word typed on
it), the gallery entry, and the wordsy cases in `events-realtime` and
`restart-resets`.
