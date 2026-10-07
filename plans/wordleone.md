# wordleone — Wordle in 1

**NOT SCHEDULED. A plan only** (Joel, 2026-10-06): the design is settled far
enough to build from, and nothing here is queued behind or ahead of any other
plan. Brand **WordNerdier**, codename `wordleone`.

One pre-colored row, and the one word it points at. Where wordle hands you a
hidden word and six guesses, this hands you a **starter** word already scored
against the hidden word — green, yellow, gray — and the answer is the only word
in the game's dictionary that fits those colors. Find it. A wrong guess tells
you nothing but that it was wrong.

## The rules

- A **puzzle** is a starter word, its five colors, and the hidden **answer**.
  The answer is the only word at or below the game's **legal band** that
  produces those colors against the starter. "At or below the band" is the
  same slice wordle calls its legal band, and it is both things here: the words
  you may guess, and the pool the answer is unique in. So the sentence the
  Help page says is one sentence: *the answer is the only legal word that
  fits.*
- A guess is a five-letter word. Three answers to one:
  - **outside the band** or **already guessed** — a soft reject exactly as
    wordle has them: nothing spent, nothing written, the typed row stays and
    shakes **orange**.
  - **in the band and not the answer** — a **miss**. The row shakes **red**,
    the miss is written to the event log and counted, and that is all the
    player learns from it: no colors, since colors would turn the game back
    into wordle with a free first row. In the log and on the board a missed
    word wears no color at all — the look of a wordle row before it is
    scored.
  - **the answer** — the solve. The row lands all green.
- **Guesses are unlimited.** There is no budget, so nothing is exhausted; a
  game ends by the solve, the countdown, Stop, or (compete) the last racer
  conceding.
- **One puzzle per game.** New game is the next puzzle.
- **No hints.**

### Coop and compete

Both modes, the roster wordle has: coop 1–6, compete 2–6. Coop is one board,
one shared miss count, and the team wins on the solve; turn order stays an
opt-in (`coop_style: 'turns'`) as in wordle, a miss handing the turn on and a
soft reject advancing nothing. Compete is the same puzzle raced on private
boards: what a racer sees of a rival is their miss count and whether they have
solved it or dropped out. The race ends when nobody is still racing, and every
solver is ranked by **fewest misses, then the earlier solve**, the clock tie
marked `tieBrokenByClock` and said in the ending's words, as wordle does it. A
conceder forfeits any win; a race nobody solved is a loss for everyone.

| the ending | reason / detail | ranked |
|---|---|---|
| coop: the word found | `reached_goal` / `solved` | every teammate 1 |
| compete: the last racer ends | `reached_goal` / `solved` or `conceded` / `conceded` | every solver, by fewest misses then earliest solve |
| the countdown | `timeout` / `timeout` | coop nobody; compete every solver |
| somebody stopped it | `stopped` / `stopped` | nobody |

No `resource_exhausted` row: nothing runs out.

### The features every game has

- **Restart** replays the same puzzle from a clean board, the answer hiding
  itself again on the way (the builder carries it only while `ended_at` is
  set, as in wordle).
- **History** is the event log: one row per miss and the solve, and `#N`
  replays the board as it stood — the starter row plus, at the solve, the
  green row. A rival's rows are hidden until the race ends.
- **The printout** is wordle's track with two rows: the starter in its tile
  weights, the solve row or a blank one, the keyboard tinted by the starter,
  and the misses as plain words. Coop one track; compete one per player once
  the game has ended, just yours during play. The answer prints only when it
  shows on screen.

## Decided — Joel's answers, 2026-10-06

1. **The uniqueness pool is the legal band**, chosen at setup, not the whole
   dictionary. Evidence below: unique-in-everything puzzles are thin and
   nearly all trivial, and the NYT's own pool is its answer list.
2. **"Not in word list" costs nothing; a wrong legal word is a miss.**
3. **The board is two rows** — the starter and the typing row — and misses go
   to the event log, so wordle's board components serve as they are.
4. **Unlimited guesses.**
5. **One puzzle per game.**
6. **Band and difficulty are independent knobs, both offered.** They are: the
   band sets the pool the answer is unique in, the difficulty sets the shape
   of the colors. Every band × difficulty cell has hundreds to thousands of
   puzzles (the yield table), so no cell needs disallowing today; the setup
   form gets the matrix from a generated table and hides a cell that is
   empty, so a thinner filter later costs no code.
7. **No hints.**
8. **A freestanding game folder in wordle's shape first; lift what comes out
   byte-identical into `shared/` afterward.** Extracting first would mean
   guessing what is shared, and edits blessed wordle files mid-audit.
9. **Brand WordNerdier, codename `wordleone`.**
10. **No schedule.**
11. **A miss shakes red, a soft reject shakes orange, and both leave the word
    uncolored** — the look of a wordle row before it is scored — on the board
    and in the log. So `events.colors` is null for a miss.
12. **The first step is a printable sheet of generated puzzles**, to try by
    hand before any game code (the section below).

## The puzzle — what the evidence says

The downloaded design note (`wordle-in-1-generator.md`) gives the method —
bucket every pool word by the pattern it makes against a starter; a bucket of
one is a puzzle — and proposes quality filters to be calibrated with testers.
We have no testers, so two things stood in for them: a full sweep over our
own `common.words`, and the NYT's published puzzles, which turned out to be
readable without a subscription.

### The NYT's own puzzles

Bonus Puzzles launched 2026-08-26; a drop is five Wordle in 1 rounds every
Wednesday. Two unauthenticated JSON endpoints give the lot:

```
https://www.nytimes.com/svc/games/bonus/week/v1/<YYYY-MM-DD>.json   the week's cards, with each puzzle's slug
https://www.nytimes.com/svc/wordle-in-one/v1/bonus/<slug>.json     { rounds: [ { start, solution } × 5 ] }
```

Slugs run `2026-08-26-2` … `2026-10-07-8` (the id climbs by one a week). The
35 rounds so far, scored with the note's metrics against our list:

| what | the NYT's 35 rounds |
|---|---|
| positive space (words in the NYT answer list consistent with the greens and yellows alone) | 1 in 25 rounds; 2 in 7; 3 and 4 once each; never more |
| greens | 0 in 12 · 1 in 6 · 2 in 9 · 3 in 8 · **4 never** |
| all-yellow anagram rounds (CAPER → RECAP, EARTH → HEART, TEACH → CHEAT) | 3 |
| load-bearing tiles (the note's metric 2) | 0–2 in 8 rounds, 3 in 13, 4–5 in 14 |
| unique among ALL our 12,890 five-letter words | 20 of 35 |
| another word fits, at band 4–6 only | 11 |
| another word fits at band 1 (CURLS for CORAL → CURLY, HANDS for HOUND → HANDY, EVILS for VITAL → OLIVE) | 3 |
| starters not on the NYT answer list (CORGI, YODEL; both our band 2) | 2 |
| a round repeated across drops (WHOSE → WORSE, 09-09 and 09-30) | 1 |

Three conclusions, each overturning a line of the note:

- **The note's "positive space 2–30, below 2 is too easy" rejects 25 of the
  35 rounds.** The NYT's puzzles are nearly all positive-space 1: the greens
  and yellows alone pin the word, and the work is *placing the yellows*, not
  filtering by grays. Difficulty lives in the green count, not the gray's
  reach.
- **The NYT's uniqueness pool is its answer list**, not its allowed-guess
  list: CURLS, HANDS and EVILS are allowed guesses that fit. That is decision
  1 — a band-limited pool — and the NYT's band is roughly our band 1.
- **Load-bearing is not a filter the NYT applies.** DUSTY → STUDY has every
  tile redundant and is a perfectly good round. Keep the number as a score,
  not a gate.

### Our list

`common.words` has 12,890 five-letter words; 2,315 carry the `wordle` flag,
and that flag IS the NYT answer list (1,715 at band 1, 600 at band 2 — none
above). The remaining 10,575 are the allowed-guess list and more, banded 1–6.
The sweep (a Node script over the TSV; ~90 ns per color computation, the
whole 2,253 × 12,890 sweep in 2.6 s) says:

**With the note's filters** (positive space 2–30, four tiles load-bearing),
answers and starters from the clean NYT list:

| the answer is unique among | puzzles | easy / medium / hard by the note's tiers | answers that have one |
|---|---|---|---|
| all 12,890 words | 1,297 | 1,252 / 42 / 3 | 757 of 2,289 |
| band 4 or easier (7,276) | 3,309 | 3,092 / 203 / 14 | 1,362 |
| band 3 or easier (5,002) | 5,897 | 5,350 / 496 / 51 | 1,761 |
| band 2 or easier (4,163) | 7,369 | 6,595 / 710 / 64 | 1,918 |

Thin, and one passing puzzle in three is "four greens and a gray". That table
is why decision 1 is what it is, and why the note's filters are dropped.

**NYT-shaped** — positive space ≤ 4, never four greens, answer on the clean
NYT list, starter any clean non-plural word at band ≤ 2 (the NYT's CORGI and
YODEL are such words):

| pool | puzzles | 0 greens | 1 green | 2 greens | 3 greens | answers with a 0-green puzzle |
|---|---|---|---|---|---|---|
| band ≤ 1 (2,496) | 43,199 | 4,032 | 16,211 | 15,154 | 5,788 | 1,062 of 2,289 |
| band ≤ 2 (4,163) | 38,992 | 2,940 | 13,683 | 14,352 | 5,939 | 1,045 |
| band ≤ 3 (5,002) | 33,943 | 2,381 | 11,662 | 12,752 | 5,221 | 953 |
| band ≤ 4 (7,276) | 22,359 | 1,302 | 6,914 | 8,652 | 3,859 | 670 |
| band ≤ 6 (12,890) | 11,945 | 588 | 3,324 | 4,651 | 2,337 | 389 |

Ample at every band, and every answer has a one- and two-green puzzle at every
band but the widest. Reading down a column: a wider pool means fewer puzzles,
because more words have to be ruled out — so the band knob makes the game
*fairer* (fewer obscure near-fits a player might type) rather than harder, and
difficulty is the other knob.

### The filters, as the plan proposes them

Hard filters, applied by the generator:

1. the answer is the only word at or below the band producing the pattern;
2. the answer is on the clean NYT list; the starter is clean, not a plural,
   band ≤ 2, and not the answer;
3. not all green, and **not four greens** (the NYT never does; it is
   fill-in-the-blank);
4. positive space over the NYT list ≤ 4 (the NYT's ceiling).

Difficulty, by what the player has to do — anchor on greens, then place
yellows:

| tier | greens | the work |
|---|---|---|
| easy | 3 | one or two letters to place |
| medium | 1–2 | a skeleton and several yellows to place |
| hard | 0 | every letter placed by yellow alone, or ruled in by nothing — the anagram rounds live here |

"Any" is the fourth choice and applies no green filter. Load-bearing count,
duplicate-letter tells and near-miss counts are computed and kept as scores
for a later ranking pass if the tiers ever feel wrong; none gates a puzzle
today. **These thresholds are the best reading of 35 NYT rounds, not a
calibration**; the plan's open question 4 is how to learn from play.

### Where the generator runs — an edge function

`wordleone-build-board`, in the shape of `waffle-build-board`,
`spellingbee-build-board` and the rest (`_shared/startGame.ts`): the frontend
calls it with the club, setup, roster and mode; it reads the band's words as
the caller, builds the puzzle, calls `wordleone.create_game` with it, and
relays the envelope. The answer never reaches the creating client.

Why not SQL: one starter try is a color computation per pool word, and a
plpgsql call per row makes a try tens of milliseconds and a puzzle many
seconds. Why not a stackdown-style library: the yield is huge, every filter is
a setup knob (waffle's own argument against a library), and a library would
need a data file, an import target and a table for no gain.

The algorithm, on demand:

```
pick the answer: a random clean NYT-list word at or below the band
shuffle the starters: clean, non-plural, band ≤ 2
for each starter:
  pattern = colors(starter, answer); skip all-green and four-green; skip a tier mismatch
  count the pool words that make this pattern against the starter; stop at the second — skip
  positive space over the NYT list ≤ 4, else skip
  accept
```

Expected cost: a band-2 pool is 4,163 color computations a try (~0.4 ms in
V8); singletons are about one starter in a hundred and a tier narrows that by
a few times, so a puzzle lands in well under a second. The function fails as
a validation under `difficulty` if no starter fits, which the yield table
says will not happen.

`create_game` re-checks what it is handed before it stores it — the colors
match `common._wordle_colors(starter, answer)`, the answer is legal at the
band, and no other legal word makes the pattern — the way waffle's validates
its board. The uniqueness check is one set-based query over the band's words,
run once per game, so its cost is fine where the generator's loop would not
be.

## Schema

Shape in a new timestamped migration under `supabase/migrations/`, behavior
in a `wordleone.sql` beside wordle's in `supabase/sql/`; the frontend reads
only the page blobs.

| | |
|---|---|
| `wordleone.games` | one row per game: `starter`, `starter_colors` (five of `g`/`y`/`x`), `target` (the column grant leaves out, as wordle's), `legal_band`, `difficulty` (the tier chosen, kept for the summary). No `max_guesses` |
| `wordleone.players` | one row per player: `n_misses`, their own in both modes. A solve is `common.game_players.solved_at` |
| `wordleone.events` | the guess log, append-only: `word`, `colors`, `is_correct`; `kind = 'guess'`, `took_turn` true. `colors` is `ggggg` for the solve and null for a miss, which the log draws uncolored |

**The page blobs**, written by `wordleone._rebuild_data_cols` at create, Restart
and the end of every move:

| blob | wordleone's part |
|---|---|
| `static_game_data` | `puzzle: {starter, colors}` — the half of the puzzle every player sees from the first paint; the one game so far whose static blob carries more than the common part |
| `game_data` | `puzzle: {target}` (null until the game ends); `team`, the team's facts sent once, null in compete; `events`; on each player their own facts and `tieBrokenByClock` |
| `summary_data` | `team: {nMisses}`, null in compete; `legalBand`, `difficulty`, `nWinnerMisses` |

`GFacts` is `nMisses` and `board: {rows}`, where the rows are the starter and,
once solved, the green row — the two rows decision 3 names — so wordle's
`Board` draws it with no new prop. Carried the team-facts way: the side's
spread on every player, their own under `own`.

RPCs: `create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_puzzle)`,
`submit_guess(p_game_id, p_guess)` answering `correct` / `miss` / `duplicate` /
`notAWord`, and the common four — `concede`, `stop_game`, `submit_timeout`,
`replay_board`. `_sync_title` reads the latest guess as wordle's does, coop
all game, compete once the race is over; a miss titles the game with the
missed word, and the answer is spelled only by the solve.

## Frontend

A folder `wordleone/` under `src/`, in wordle's shape — the loader, `PlayArea` as hook
calls and the render, `BoardCol` and `InfoCol` taking `gd` whole, `types.ts`
with every exported type under `G`. Built as wordwheel was built from
spellingbee: copy, then change what the rules change.

What is wordle's, expected to come out identical or nearly:

- `Board`, `BoardRow`, `Tile` and their stylesheets — `maxGuesses` is 2, the
  first live row is the starter;
- `useTypedGuess`, `useFlipBaseline`, the keyboard tinting (`lib/colors.ts`;
  the caps read the starter row, and a miss adds nothing);
- `lib/history.ts`; the printer's model and tile drawing;
- the seat rule in `useGame`, the compete ranking and `tieBrokenByClock`, the
  ending builders less their `resource_exhausted` lines.

What is new: the setup form (band, difficulty, timer, coop style; no budget),
`lib/answer.ts` with `miss` in place of `incorrect`, the Help page, the logo
and `theme.css`, and the state line — "3 misses" rather than "3/6 guesses".

**The lift.** When wordleone is green, diff it against wordle and move what is
byte-identical — the board trio, the two hooks, the key tinting, the history
replay, the printer's tiles — into `src/shared/wordle-style/`, which already
holds the color codes, or a sibling folder if its doc says the two don't
belong together; both games import it, and both PlayAreas stay two copies
(the bee-games rule). wordle's `doc.md` and the shared folder's follow. This
is the one step that touches blessed files, and it is last.

## Setup

| control | values | note |
|---|---|---|
| legal band | 1–6 | the pool and the guess gate in one |
| difficulty | easy · medium · hard · any | the green-count tiers above |
| timer | wordle's | |
| coop style | free-for-all · turns | coop only |

The summary line shows the band in the `dict "…"` slot every band-sensitive
game uses, and the difficulty beside it.

## Open questions

1. **The words of a miss and a reject**: the pill's text for each (the
   outcomes are settled — red is `lost`, orange is `warning`), and the peer
   line in coop ("guessed CRANE" says nothing about being wrong). Copy is
   Joel's.
2. **Does the answer source become a knob**, as wordle's `answer_band` is?
   The plan fixes answers to the clean NYT list, since that is what every
   NYT round draws from and it keeps the generator's "positive space" measured
   over one list. A band-wide answer pool is a one-line change in the
   generator if wanted.
3. **Learning from play.** The tiers are read off 35 NYT rounds, and the
   sheet below is the first check by hand. Once games are played, the cheap
   instrument is `summary_data`'s `difficulty` beside `nWinnerMisses` and the
   solve time already on `common.game_players`: after a few dozen games a
   query says whether "hard" costs more misses than "easy". No new column
   needed.
4. **The starter pool**: band ≤ 2 clean non-plurals, following the NYT's two
   off-list starters. Band ≤ 1 would be purer and costs yield; the table above
   is at ≤ 2.

## First step — a sheet of puzzles to try by hand

Before any game code, the generator itself, and a page to print its output:

- **The generator is written once**: `supabase/scripts/wordleone/gen.ts`, a
  pure module taking word rows in and a puzzle out, with no Deno or Node
  import in it, so the sheet script today and the edge function later run the
  same code. It will live in the edge function's folder as waffle's `gen.ts`
  does; it waits beside the sheet script because a folder under
  `supabase/functions/` with no `index.ts` breaks `functions deploy`, which
  deploys every folder. Its test is vitest for now and becomes a `deno test`
  when it moves.
- **The sheet script**, `supabase/scripts/wordleone/sheet.ts` — the public
  entry is `gmake g-wordleone-sheet`, with `PER_CELL`, `SEED` and `SHEET`
  (the output path, default `~/Downloads/wordleone-sheet.html`) — reads the
  five-letter words from the local database as stackdown's generator does,
  draws a batch per band × tier cell, and writes one HTML page to stdout.
  The cards are blind — a number, the band, the starter's five colored tiles,
  an empty row to write in and a rating to tick — and the tier sits on the
  key, the last page, beside the answer and the generator's scores, so a
  rating by hand is compared with the tier rather than led by it. The page is
  for a color printer and is not committed; the script is, since it is the
  calibration instrument open question 3 wants.
- **Joel prints it and plays it.** What comes back decides whether the tiers
  move, whether four greens stays banned, and whether positive space ≤ 4 is
  the right ceiling — before the thresholds are pinned by a test.

## Steps

Unordered beyond their dependencies; none is scheduled.

1. The first step above; then settle the open questions.
2. **SQL**: the migration, the `wordleone.sql` behavior file from wordle's
   with the budget removed and the puzzle columns added, pgTAP in the game's
   own folder under `supabase/tests/` — create (the re-check of a handed puzzle, the
   grant on `target`), gameplay (the three answers to a guess, the title),
   compete ranking and the tie, timeout and Stop, Restart, reveal, the blobs
   whole.
3. **The edge function** `wordleone-build-board` and its Deno tests: the
   filters each pinned by a planted puzzle; the fault for an unseeded list;
   the validation when a tier is empty.
4. **The frontend**: the folder, the two manifests, registration in
   `src/gametypes.ts`, the logo, `theme.css`; vitest beside the code as
   wordle has it, with a fixture built from facts.
5. **The lift** into `shared/wordle-style`, both docs updated.
6. **The rest of a new game**: a gallery entry beside
   `e2e/gallery/games/wordle.ts` and the e2e specs (history, print, mobile),
   `docs/features.md`'s roster, the Makefile's `BACKUP_SCHEMAS`, the guards'
   game lists (`gameTypes.test.ts` and whichever else enumerate games), the
   folder's `doc.md` and `todo.md`, and this plan's knowledge moved into that
   doc before the plan is deleted.

## Reference

The sweep scripts were scratch work, not repo code; the method is the note's
and the numbers above are reproducible from `common.words` in a minute. The
NYT endpoints above are the calibration source: a `rounds` fetch per weekly
slug, scored with the same metrics, is how to re-read the tiers against more
than 35 rounds when the time comes.
