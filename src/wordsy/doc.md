# wordsy

Gil Hova's Wordsy, branded FlipWord: eight consonant cards in four columns
worth 5, 4, 3 and 2, and everyone writes one word a round at once. The first
word in starts the clock, 30 seconds unless the creator typed another; seven
rounds, the best five plus the bonuses, highest total wins — or a short game,
three rounds and the best two. In coop, one player or a team plays the
rulebook's solo card instead: one word a round against the clock, for a title.

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
it as a countdown of the setup's `timer_seconds` and the round's end puts it away
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

Two manifests on the family `wordsy`. `wordsy_compete` is the game above.
`wordsy_coop`, for one to six, is the back of the rulebook's No Flip card
([The solo card](#the-solo-card-coop)): the clock runs from the deal, the
team writes one word a round — anyone's, or the turn holder's when the setup
says turns — and that word ends the round; a word in before the clock worth
15 or more earns a bonus, and the timer walks a three-band card; after seven
rounds the total earns a title or the team loses. No Fastest, no No Flip, no
concede: a coop game stops. The clock running out ends nothing there — the
card says take as long as you need — so a late word simply earns no bonus.

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
| **the solo card** | coop's card (the back of No Flip): three bands the timer sits on — green 1, amber 2, red 3 — and the penalties taken |
| **writer** | in coop, whoever enters the round's word: anyone, or the turn holder under turns |
| **title** | what a coop total earns after seven rounds: 90 Wordprentice, 100 Wordsmith, 110 Wordspert, 120 Wordmaster |

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

### The solo card (coop)

The back of the 2025 No Flip card, which no source online reproduces; Joel
transcribed it on 2026-10-10, and this is the one copy:

> **Setup.** Use the solo side of the No Flip card (three bands: a green 1 at
> the top, an amber 2, a red 3). Place the sand timer on 1.
> **Play.** Flip the timer at the start of each round. Take as long as you
> need to write. Check whether you finished writing before the timer ends.
> **Scoring.** Score your word normally. You get a bonus if you beat the timer
> *and* score 15+. Mark the higher bonus column if the timer is on 1, the lower
> if it is on 2 or 3. After scoring, move the timer: 0–19 points, move it
> down — if it is on 3, instead mark a penalty and move it to 2; 20+ and no
> bonus, don't move it; 20+ and a bonus, move it up — it can't go above 1.
> **Game end.** After 7 rounds, add up your score: 90 Wordprentice, 100
> Wordsmith, 110 Wordspert, 120 Wordmaster.

What the app makes of it. The clock runs from the deal, for the setup's
seconds, and a word **beat the clock** when its submit came within them, by
the server's time. The bonus columns are compete's: the higher is the
Fastest's, 2 / 3 / 4 by rounds 1–3 / 4–6 / 7; the lower the beat-the-Fastest
column's, 1 / 2 / 3. The card does not say what a penalty is worth nor whether
the two lowest rounds are dropped. Joel ruled (2026-10-10) that the best five
count, bonuses kept and penalties taken — the card expects 20 a word from a
good player, and all seven would be 140, past its highest title — that a
penalty is −2, the 2016 preview's value for the card this one was built from,
that under 90 is a loss, and that the first word is final. Seven rounds, the
timer and one word a round are the card's and fixed; the setup chooses the
dictionary, the clock's seconds and, for a team, free-for-all or turns ("both
free-for-all and turn-by-turn").

### How a game ends

| the ending | reason / detail | ranked |
|---|---|---|
| the last round played, compete | `resource_exhausted` / `rounds_played` | by total — the best word scores (five of seven, two of three; `_n_best_rounds`) plus every bonus — with `rank()`, among non-conceders who scored above zero; a tie shares the place |
| the last round played, coop | `resource_exhausted` / `rounds_played` | the whole team first at 90 or more; nobody under, a loss. The title is the blob's `team.title`, not the ending's detail: a title is a result, not the act that ended the game |
| everyone conceded | `conceded` / `conceded` | nobody; compete only |
| somebody stopped it | `stopped` / `stopped` | nobody |

The last round is ended by nobody when the clock ends it, by the last player
to submit when everyone is in (no-timer, one word), by the writer in coop.
There is no whole-game timer.

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
| `wordsy.games` | `deck` (withheld), `drawn`, `legal_band`, `round_style`, `n_rounds` (7 or 3), `one_word` — the last two from `20261011000000_wordsy_setup_options.sql` — `timer_seconds` (1–120, the round clock's length; `20261011000002_wordsy_timer_seconds.sql`), and the coop's card, `band` (1–3) and `n_penalties`, null in compete (`20261011000003_wordsy_coop.sql`) |
| `wordsy.players` | one row per player; the totals are summed off the log. `ready_for_num`, the round they last pressed Start for (`20261011000001_wordsy_round_ready.sql`) |
| `wordsy.rounds` | one row per round dealt: `tiles` in slot order, `fastest_user_id` (the Fastest, or no-timer's First Wordsmith), `no_flip_user_id`, `timer_started_at`, `ended_at` |
| `wordsy.round_words` | each player's standing word for the round in play. No grant |
| `wordsy.events` | the reveal: a row per player still playing per finished round, `num`, `word` (`''` for none), `score`, `bonus`; in coop, the team's one word a round with `beat_clock` and the `band` it was scored on, both null in compete |

**The page blobs**, written by `wordsy._rebuild_data_cols`:

| blob | wordsy's part |
|---|---|
| `static_game_data` | the common part alone: a round's table changes every round |
| `game_data` | `team` (coop: the team's `total`, `nBonuses`, `roundScores`, and the card's `band`, `nPenalties`, `title`; null in compete), `nRounds`, `nBestRounds`, `nTilesInDeck`, `rounds` (each with its `tiles`, `fastest`, `noFlipHolder`, `isTimerRunning`, `ended`), `events` (each with `beatClock` and `band`, the coop word's against the card, null in compete), and each player's `total`, `nBonuses`, `roundScores` (the team's in coop), `hasSubmitted`, `word`, `isWordFrozen`, `isBlockedByNoFlip` (the No Flip gate `submit_word` refuses on, written for the page), `isReadyForNextRound` |
| `summary_data` | `team` (coop: `total`, `band`, `nPenalties`, `title`; null in compete), `nRoundsPlayed`, `winnerTotal`, `nRounds`, `legalBand`, `roundStyle`, `oneWord` |

`shell_data`'s `timer` is read off `common.timers`, so the header follows the
round's clock.

## RPCs

### `wordsy.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)`

Compete needs two or more (PN546); coop takes one to six. `legal_band` 1–6
(PN543), `round_style` (PN544), `timer_seconds` 1–120 (PN558), `n_rounds` 7
or 3 (PN554) and `one_word` (PN555) required; the setup's `timer` fixed at
none (PN547). Coop fixes `round_style` at timer, `n_rounds` at 7 and
`one_word` at true (PN559), and under `coop_style = 'turns'` seats the common
rotation from `first_turn_user_id`, which must be a player (PN560) and is
dropped from the saved default. Shuffles the deck inline and deals round 1,
naming a random First Wordsmith in no-timer and arming the clock in coop.

### `wordsy.submit_word(p_game_id, p_word)`

Answers `{result, earlier, timer_started, round_ended, game_ended}`, `result`
one of `submitted`, `notAWord`, `alreadyPlayed` (with the earlier word); the
two refusals record nothing and leave the earlier standing word. A word the
caller may no longer change (PN549) and No Flip (PN550) are races the page
gates first, as is a submit between rounds (PN557); a malformed word is a
fault (PN548). The round's first standing
word in the timer style names the Fastest and arms the clock; in no-timer and
with one word, the last player's submit ends the round. In coop the word is
the team's and final, and its submit ends the round; under turns only the
turn holder may send it (`common._require_turn`, PN243).

### `wordsy.start_round(p_game_id)`

Between rounds: the caller is ready for the next, and the press that leaves
everyone still playing ready deals it (`_deal_next_round`). Answers
`{result}`, `ready` or `started`; a second press is harmless, and a press once
the round is in play is a race (PN556).

### `wordsy.submit_timeout(p_game_id)`

Ends the round, once the server's count has reached the round's seconds
(PN552 otherwise, a race); a round with no clock running is PN551, the race
every page but the first meets. In coop it ends nothing: the clock is put
away and the answer is `expired`; the word, whenever it comes, earns no bonus.

### The rest

`concede` (compete only, as every concede is; in no-timer and with one word,
a concede by the last player yet to submit ends the round; between rounds,
one by the last player yet to press Start deals the next), `stop_game` and
`replay_board` (Restart: the same deck from round 1; in coop the card back to
band 1 with no penalties) each put the clock away. `_end_round` is the one
end every round reaches: it scores, marks the bonuses, writes the reveal, and
finishes the game after the last round. In coop its reveal is
`_reveal_coop_round`, the team's word against the card: a word that beat the
clock and scored 15 or more earns the higher bonus on band 1 and the lower on
2 or 3; then under 20 moves the band down, or at 3 takes a penalty and goes
to 2, while 20 or more with a bonus moves it up. `_finish` in coop wins the
team at 90 or more (`_title_for`) and loses it under.

## FE submissions

| answerType | said to | text | outcome | the typed word |
|---|---|---|---|---|
| `submitted` | me | `Your word is in` | `neutral` | clears |
| `not_a_word` | me | `Not a word at this dictionary` | `lost` | clears |
| `already_played` | me | `Already played: FISH` | `warning` | stays |
| `first_in_peer` | everyone but the Fastest | `submitted — 30 seconds` (the setup's seconds) | `warning` | |
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
  their bonus printed. A card a letter of the typed word scores on wears the
  picked edge, khaki as in every word-finding game, by `lib/score.ts`'s rule:
  one C against two C cards picks the better.
- **The scratchpad** is the shared one (`scratchpad: 'perPlayerInCompete'`):
  a coop team writes on one pad, and a compete player has a private one.
- **The entry is `<WordEntryArea>`**, taking up to 18 letters (`MAX_WORD_LENGTH`
  in `useTypedWord`; the shared capture's own cap is 16, short of the
  rulebook's BACCALAUREATES); under it the typed word's score, worked
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
- **The on-screen keyboard** (`GuessKeyboard`) shows at every width, as the
  other word games show it, wearing the entry's own ↵ and ⌫.
- **The strip**, compete's, reads each total, "in" after it while that
  player's word stands, and how they came out once they are out. Coop shows
  none: every player carries the team's total. Under turns the common
  `TurnStatusLine` says whose word it is.
- **The solo card** (`SoloCard`, three `BandSquare`s in the game's own
  `--wordsy-band-*` colors — copies of the outcome bases, not aliases, since
  a band is where the timer sits and not a verdict) sits beside the word
  lines under the entry in coop: the dark border on the band the timer is on,
  a −2 mark a penalty. The state line counts the penalties. Under turns the
  entry is the writer's alone: the others' boards dim and the second word
  line says whose turn it is; the new table's bell and frame ring for the
  writer alone, since the table arriving IS their turn arriving
  (`useRoundMarks`), and the clock-start mark is compete's, the coop clock
  running from the deal.
- **The button under a sheet takes focus** as the sheet appears, so ↵ presses
  it; the box under the sheet is the surface's Tab ring (PlayArea).
- **`#N` is the row's round**, and opens that round's table on the board.
- **A logged word is plain, in bold.** Only the lines under the entry draw a
  word by how it scored (`ScoredWord`).
- **The scoresheets** (`RoundScoresheet`, `GameScoresheet` and the cells they
  share in `SheetCells`, over `lib/scoresheet.ts`) take the board's place,
  framed. A round's: who, the word, its score, the bonus for beating the
  Fastest, then the Fastest's own ("+2"; a dash for none) — each column headed
  by its rule in the registry's glyphs, player > hourglass and hourglass ≥
  players — the round's total (score and bonus) under =, and a gold ★ for the
  best total; "Start
  round N" under it. A past round opened from the log shows its board over
  it. When the game ends in front of me the last round's sheet comes first,
  with "Show final scores"; a game opened already over goes straight to the
  game's: a table per player, the winner's first, a row per round, each
  player's dropped words and their scores struck in red (a tie strikes the
  later round), the server's total under them; only as tall as its tables,
  it scrolls inside its frame when they are taller than the column,
  and stays. In coop the sheets take the team's shape: one row a round with
  its writer, the word, its score, a check for beating the clock (headed by
  the hourglass and a check), the band it was scored on, its bonus, and the
  total; the game's one table is headed by the title, or "The team", with the
  penalties' cost under the rows. The ending reads "Won (Wordsmith)" or
  "Lost (82 pts · 90 for Wordprentice)" (`lib/endingLabel.ts`).
- **The printout** is the totals — the team's one line in coop, named by its
  title — each finished round's table, and the log.
- **Setup** defaults to band 4, a step above the roster's usual: Wordsy
  rewards long, rare words (the rulebook's examples are QUIBBLES,
  BACCALAUREATES and LIQUEFACTION), and a band-5 word refused in a band-4 game
  costs only the retype. The round clock's seconds are typed, 1–120, 30 to
  start — a number box, not a list ("this shouldn't be a drop-down; they can
  enter any number 1-120"; Joel, 2026-10-10) — and compete alone may choose
  no timer; the Round row and the form's summary name them (`describeRound`).

## Rulings

The choices the code cannot explain by itself, in Joel's words where they
were his (2026-10-08 and 2026-10-10):

- **A non-word is refused, not scored 0**: "otherwise, it feels to
  penalizing if they enter a band-5 word when playing a band-4 game." The
  rulebook scores it 0; a setup option for that is in `todo.md`.
- **Only a submitted word counts, and the last submit stands**: "we should
  make them press submit; just typing and not submitting isn't like our
  other games." No draft reaches the server; a player who never pressed ↵
  has no word that round, and the log says "no word".
- **The round follows the rulebook**: "follow rulebook" — only the first
  submit is bound, every later one may be replaced until zero, and a timer
  round never ends early.
- **Four players: the 2025 book**, all three opponents, since it is the
  edition in print; the 2017 rules asked two of three. The one formula
  `min(3, opponents)` gives the 2025 book at every count, and the two-player
  case — tie or beat your one opponent — comes from the 2017 rules via BGG,
  the 2025 book being silent.
- **The bell rings for everyone but the first submitter**: "everyone but
  the person who submitted the first word."
- **No Flip leaves the game when two are still playing**, not when the
  roster is two: the rulebook's reason — two players would only hand the
  flip back and forth — applies to the two left.
- **The round clock is the common clock, re-armed each round**: "we can use
  our time mechanism for that instead of whole-game timer" — the first game
  to use the header's clock for anything but a whole game.
- **The typed word's score shows live**: "live".
- **The title is the round**, "Round 3 of 7", rewritten as each round is
  dealt.
- **The default band is 4**, a step above the roster's usual (Setup, above).
- **The solo card's open questions** are ruled in its section above; the
  coop win reads "Won (Wordsmith)" — "should just be Won (Wordsmith)".

## Sources

- [Allplay rulebook PDF](https://assets.allplay.com/board-games-wordsy-rulebook-link.pdf)
  (2025 edition; the player board on page 2 carries the bonus table) and
  [RulesPal's transcription](https://rulespal.com/wordsy/rulebook).
- [BGG Rules forum: "Bonuses at 2 players"](https://boardgamegeek.com/thread/3556885),
  [same word in the same round](https://boardgamegeek.com/thread/2912845),
  [spelling](https://boardgamegeek.com/thread/1989520),
  [solo timer](https://boardgamegeek.com/thread/2449422) (the designer: the
  solo timer gets its full time each round).
- [What's Eric Playing preview, 2016](https://whatsericplaying.com/2016/10/30/wordsy/)
  (the 2017 edition's solo rules and per-player-count thresholds; the
  penalty's −2).
- The 2025 No Flip card's solo side, Joel's transcription of 2026-10-10,
  under [The solo card](#the-solo-card-coop).
- [BoardGameGeek](https://boardgamegeek.com/boardgame/208480/wordsy).

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
| `coop_test` | the coop game around the card: create for one and six, the faults, free-for-all, turns and the writer's gate, the clock's expiry ending nothing, no Fastest or concede, Restart |
| `solo_card_test` | the card walked: each bonus column, the moves down, the penalty at 3, up with a bonus, never above 1, a late word; the total and title |
| `coop_finish_test` | the titles at their thresholds, a solo loss under 90, a team's win |
| `game_data_test` · `rebuild_data_cols_test` | the blobs whole, a coop game's team group among them; the rebuild |

Vitest, beside the code: `lib/score.test`, `lib/scoresheet.test` (the coop
sheets among them), `lib/answer.test`, `lib/endingLabel.test` (the title and
the loss), `lib/history.test`, `lib/setup.test` (the rows by mode),
`hooks/useGame.test` (the seat rule; the team's numbers on every coop player),
`pdf/model.test`, `manifest.test` (the club card's words in both modes),
`components/SetupForm.test` (the form by mode), and
`components/PlayArea.test` (the entry, the standing word, No Flip, the round's
marks and sounds and the dim, the header's line, the on-screen keyboard, the
strip, the log, the scoresheets and Start round with its focus, Concede and
Stop; in coop the solo card, the penalties, the writer's entry under turns,
the ending and the sheet). `src/guards/gameSummaries.test.ts` runs both
summaries over their states.

Playwright, in `e2e/`: `wordsy-round` (two clients: the clock on both, the
caution frame on the other and the dim on the submitter, a replaced word, the
reveal's scoresheet on both, Start round), `wordsy-coop` (solo: the clock
from the deal, the card's border moving with a word before the clock, ↵ on the
focused Start, seven rounds to a title), `wordsy-history`, `wordsy-print`,
`wordsy-mobile` (the board and keyboard fit, a word typed on it), the gallery
entry in both modes, and the wordsy cases in `events-realtime` and
`restart-resets`.
