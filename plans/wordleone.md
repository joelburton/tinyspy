# wordleone — Wordle in 1

**Scheduled, being built** (Joel, 2026-10-07), on the `wordleone` branch; the
order is the Steps section. Brand **WordNerdier**, codename `wordleone`.

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
    wordle has them: nothing spent, nothing written, the typed row shakes in
    wordle's colors — **orange** for already guessed, **red** for not a word —
    and clears when the shake ends.
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
10. **Scheduled** (2026-10-07).
11. **A miss shakes red; a soft reject shakes amber** (amended 2026-10-07 —
    "keep this in sync with wordle": a duplicate orange, a non-word red; and
    again 2026-10-08: the non-word is the warning too, pill and log row
    alike, so only the miss is red). **A miss leaves the word
    uncolored** — the look of a wordle row before it is scored — on the board
    and in the log. So `events.colors` is null for a miss.
12. **The first step is a printable sheet of generated puzzles**, to try by
    hand (the section below). Playing it does not gate the build (2026-10-07):
    the sheet keeps running the game's own generator, so its filters are
    refined whenever the sheet is played, before or after the game ships.

Added 2026-10-07:

13. **The tier's setup key is `difficulty`.** With every band renamed to
    `*_band` and `common.words.band`, `difficulty` no longer names a band
    anywhere, so it is free to name what makes a puzzle hard.
14. **After a judged word, the typed word clears** once its shake ends — a
    miss, a duplicate and a non-word alike (the soft rejects added the same
    day). A refusal the server never judged the word for keeps it.
15. **`#N` on a miss shows the missed word in the second row as it looked
    before it was sent**: typed, uncolored, no ring.
16. **`docs/features.md`'s code is `W1`.**
17. **Reveal puts the answer on the board**, in the second row, every tile
    green, without the flip — that is for a word guessed. The keyboard keeps
    only what was earned.

Added 2026-10-07, evening, after Joel played band 6 on prod and saw only
everyday answers. These reverse 1 and 6 and close open question 2; the
evidence is [doc.md → What the word list
allows](../src/wordleone/doc.md#what-the-word-list-allows):

18. **The answer band is the knob, in wordle's meaning**: 0 is the NYT answer
    list, 1–6 any clean non-plural word at or below the band. The NYT list has
    no word above band 2, so the legal band never made an answer obscure, and
    a player with the vocabulary may want one.
19. **The pool and the guess gate are the answer band plus two**, capped at
    6, band 0 counting as 2 — fixed, not a second knob. A smaller pool keeps
    puzzles open (two colored tiles rarely pin a word among thousands), and
    plus two keeps "not a word" rare for a word the player knows; that
    rejection costs nothing here anyway.
20. **A tier is a set of color shapes**, greens · yellows · grays, not a green
    count: easy 3g0y2x · 3g1y1x; medium 2g2y1x · 1g2y2x · 2g1y2x · 1g3y1x ·
    2g0y3x; hard 0g3y2x · 0g4y1x; any is their union. These are the NYT's
    shapes less the anagrams (all yellow, or greens and the rest yellow —
    nothing to rule out) and four greens. 0g4y1x is near an anagram and
    stays for now, loose on purpose, until players say.
21. **Live generation, a hundred answers tried.** The search is milliseconds
    per answer; pregeneration would serve only curation by hand.

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
4. **at least one gray** (Joel, 2026-10-07): every tile colored is an anagram,
   not a deduction, though the NYT publishes those;
5. positive space over the NYT list ≤ 4 (the NYT's ceiling).

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
| `game_data` | `puzzle: {target, targetBand}` (null until the game ends); `team`, the team's facts sent once, null in compete; `events`; on each player their own facts and `tieBrokenByClock` |
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
| answer band | 0–6 | 0 the NYT answer list, N any clean non-plural word at or below; the pool and the guess gate are this plus two, capped at 6 (decisions 18–19) |
| difficulty | easy · medium · hard · any | the shape tiers (decision 20) |
| timer | wordle's | |
| coop style | free-for-all · turns | coop only |

The summary line shows the answer band in the `dict "…"` slot every
band-sensitive game uses, and the difficulty beside it.

## Open questions

1. **The words of a miss and a reject** — settled (Joel, 2026-10-07): a miss
   reads "Not it", a teammate's "guessed CRANE — not it"; the rejects keep
   wordle's words.
2. **Does the answer source become a knob**, as wordle's `answer_band` is?
   Settled (Joel, 2026-10-07): yes, and it is the only band knob — decisions
   18 and 19.
3. **Learning from play.** The tiers are read off 35 NYT rounds, and the
   sheet below is the first check by hand. Once games are played, the cheap
   instrument is `summary_data`'s `difficulty` beside `nWinnerMisses` and the
   solve time already on `common.game_players`: after a few dozen games a
   query says whether "hard" costs more misses than "easy". No new column
   needed.
4. **The starter pool**: band ≤ 2 clean non-plurals, following the NYT's two
   off-list starters. Band ≤ 1 would be purer and costs yield; the table above
   is at ≤ 2.

## The ratings

A **temporary** survey (Joel, 2026-10-07), to tune the generator from real
play: once a game has ended, the keyboard's place holds a short form, and a
save adds a row to `wordleone.ratings`. Rows typed in from the printable sheet
go in by hand, with no game or user. When it goes, the table, the two score
columns on `wordleone.games`, `rate_puzzle` and the form go; `events.verdict`
and the logged non-words stay.

- **The form** (every field optional): how hard it felt, 1 very easy to 7 very
  hard — a scale of its own, so the setup's tier names don't steer it; the
  band the answer should be in, beside the band it has ("BETEL is band 2
  (Common)."), so an obscure answer can be told from a hard puzzle and the
  banding learns from it too; the seconds it took, as the player reckons; a
  one-line comment. Two rows of fields under that line, at the keyboard's
  width and at least its height. The answer is named only while the board
  shows it (a solve or a reveal); on a loss it is "The answer". A save leaves
  "Saved — thanks!" in the form's place; the server would take a second row,
  but the page offers none.
- **The row**, besides those four: the puzzle (starter, colors, answer, legal
  band, and the answer's own band in the word list then — copied, since a band
  can move);
  the generator's view (the tier asked and the tier built — kept apart since
  2026-10-08, as "any" asks for nothing and the shapes move; the green count,
  positive space and
  load-bearing tiles, kept on `wordleone.games` since migration
  20261007000007); and the caller's play from the server — when they solved
  (solved means never revealed, since Reveal opens only at the end), the
  seconds from the game's start to that solve (an un-restarted game only),
  their misses, and every guess the server logged for them.
- **Words outside the band are logged** (`events.verdict = 'not_a_word'`), so
  the players can see what they tried and the count includes them; they keep
  the turn, count no miss, and wear the warning bar in the log. A duplicate
  is still not logged.

## First step — a sheet of puzzles to try by hand

Before any game code, the generator itself, and a page to print its output:

- **The generator is written once**:
  `supabase/functions/wordleone-build-board/gen.ts`, a pure module taking
  word rows in and a puzzle out, with no Deno or Node import in it, so the
  sheet script and the edge function run the same code. Its test is a
  `deno test` beside it.
- **The sheet script**, `supabase/scripts/wordleone/sheet.ts` — the public
  entry is `gmake g-wordleone-sheet`, with `PER_CELL`, `SEED` and `SHEET`
  (the output path, default `~/Downloads/wordleone-sheet.html`) — reads the
  five-letter words from the local database as stackdown's generator does,
  draws a batch per band × tier cell, and writes one HTML page to stdout. A
  cell's answers sit AT its band (the generator's `answerAtBand`), drawn from
  every clean non-plural word there, since the NYT list stops at band 2: a
  band-6 card is a band-6 word, not a band-1 word unique among band 6.
  The cards are blind — a number, the band, the starter's five colored tiles,
  an empty row to write in and a rating to tick (live inputs in a browser,
  encoded by a box at the foot of the page as one line per card to paste
  back) — and the tier sits on the
  key, the last page, beside the answer and the generator's scores, so a
  rating by hand is compared with the tier rather than led by it. The page is
  for a color printer and is not committed; the script is, since it is the
  calibration instrument open question 3 wants.
- **Joel prints it and plays it**, whenever suits (decision 12). What comes
  back decides whether the tiers move, whether four greens stays banned, and
  whether positive space ≤ 4 is the right ceiling. The thresholds live only in
  `gen.ts` (step 2 keeps them out of `create_game`), so a refinement is an
  edit there and to its tests, and reaches the next game built.

## Steps

**Done:** the first step's code — the generator and its test, `sheet.ts`, `gmake g-wordleone-sheet`, the `_wordleone:sheet` npm
script and its cheatsheet lines.

Each step below ends at a stop: the work sits in the working tree for Joel to
read, and the next step waits for his go. The order is the dependency order —
shape, behavior, the generator, the page, the lists, the docs, prod — with the
lift last (decision 8). Line numbers are from 2026-10-07 and will drift.

### Step 0 — what is still open

Nothing gates step 1. Open question 1 (the copy) is read by step 5;
questions 2–4 change a constant in `gen.ts` at most, whenever they are
answered.

### Step 1 — the shape: one migration

`supabase/migrations/<ts>_wordleone.sql`, written fresh, **not** a copy of
`20260625000000_wordle.sql`: that file inserts the long-dropped
`hides_solution`, omits the now-required `brand`, publishes its tables to
Realtime (undone for every game by `20261006000002`), and predates the
clubs backfill.

- `create schema wordleone`.
- `wordleone.games`: `game_id uuid pk → common.games(id) on delete cascade`,
  `starter char(5) not null`, `starter_colors char(5) not null check
  (starter_colors ~ '^[gyx]{5}$' and starter_colors <> 'ggggg')`,
  `target char(5) not null`, `legal_band int not null check (legal_band
  between 1 and 6)`, `difficulty text not null check (… in
  ('easy','medium','hard','any'))` (decision 13).
- `wordleone.players`: `(game_id, user_id)` pk, fks as wordle's,
  `n_misses int not null default 0`, the `game_id` index.
- `wordleone.events` on the events skeleton ([docs/supabase.md → Every
  game's log is `<game>.events`](../docs/supabase.md#every-games-log-is-gameevents)): `id bigint identity pk`, `game_id`, `user_id`, `kind text not null
  check (kind in ('guess'))`, `took_turn bool not null default false`,
  `created_at`, plus `word char(5) not null`, `colors char(5)` **nullable**
  (null for a miss, decision 11), `is_correct bool not null`, and a check that
  ties them: `(is_correct and colors = 'ggggg') or (not is_correct and colors
  is null)`. Index `(game_id, id)`.
- RLS enabled on all three; no Realtime publication.
- The gametype rows, in the shape `20260615000000_common.sql:253-266`
  describes: `insert into common.gametypes (gametype, min_players, brand)
  values ('wordleone_coop', 1, 'WordNerdier'), ('wordleone_compete', 2,
  'WordNerdier') on conflict do nothing`.
- **The clubs backfill**, for every existing club, since
  `20261007000002_paw_protection.sql` makes a missing `clubs_gametypes` row a
  disabled game: `common._enroll_club_gametypes`'s rule
  (`supabase/sql/common.sql:307-318`) inlined, because a migration cannot
  call `supabase/sql/` — enabled except compete in a solo club. Not setgame's
  backfill, which skips solo clubs' compete row entirely.

**Done when:** the migration applies locally and `select * from common.clubs_gametypes where gametype
like 'wordleone%'` has a row for every club. `gmake db-schema ENV=local`
resets the local database, so ask before using it.

### Step 2 — the behavior: `wordleone.sql` in `supabase/sql/`

Copied from `supabase/sql/wordle.sql`, then changed by the rules. Every
`max_guesses`, `resource_exhausted` and `answer_band` site goes (the list:
wordle.sql grants :50; blobs :184-411; create_game :539-693; submit_guess
:826-1059).

- **Grants and policies:** `grant select (game_id, starter, starter_colors,
  legal_band, difficulty)` on games — `target` left out, the column grant
  that hides it. The three club-gated select policies as wordle's.
- **`create_game(p_club_handle, p_setup, p_player_user_ids, p_mode,
  p_board)`.** Named `p_board`, not the plan's `p_puzzle`: the shared
  `invokeCreateGame` (`supabase/functions/_shared/startGame.ts:137-152`)
  types its argument with `p_board`, as every build-board game passes it.
  Checks, in order:
  - the common gates (`_require_club_member`, player count ≤ 6,
    `_require_valid_mode`, compete ≥ 2, `_require_valid_timer`);
  - `legal_band` 1..6 and `difficulty` one of the four, both required (no
    defaults in SQL: the form always sends them); codes PN518–PN528, from
    the next free number `src/guards/raiseCodes.test.ts` prints;
  - the handed puzzle, each a `hint = 'fault'` BUG raise as waffle's
    (`supabase/sql/waffle.sql:714-859`): five lowercase letters each;
    `starter <> answer`; `colors = common._wordle_colors(starter, answer)`;
    the answer legal at the band; and **unique** — `select count(*) from
    common.words where len = 5 and band <= legal_band and
    common._wordle_colors(starter, word) = colors` is exactly 1. One
    set-based pass per game: the whole `create_game` took 114 ms locally at
    band 6 (12,890 plpgsql calls). These are the invariants that make it a
    puzzle at all; the tier's green counts, the four-green ban and the
    positive-space ceiling are the generator's taste and stay in `gen.ts`
    only, so refining them never touches SQL (decision 12).
  - `common._create_game(…, 'wordleone_' || mode, …)`, turns as wordle's
    (`coop_style = 'turns'`, `first_turn_user_id`, `_assign_turn_order`), the
    rows, `_write_static_game_data`, `_rebuild_data_cols(…, true)`,
    `{result: 'created', id}`.
- **`submit_guess(p_game_id, p_guess)`** — wordle's order (lock, deleted,
  player, game over, `_require_turn`, conceded, malformed, already solved),
  with no budget guard. Then:
  - duplicate: coop any player's word, compete the caller's own — **and the
    starter is a duplicate too** (a word already on the board);
  - `notAWord`: not the target and not at or below `legal_band`;
  - the answer: event `('ggggg', true)`, `solved_at`, coop ends
    `reached_goal`/`solved` with every teammate ranked 1; compete
    `_set_player_ended(… 'reached_goal','solved','neutral')` and
    `_maybe_finish_compete`;
  - otherwise a **miss**: event `(null, false)`, `n_misses + 1`, coop with
    turns `_advance_turn`; nothing ends.
  - `_sync_title`, `_rebuild_data_cols`. Answers `correct | miss | duplicate
    | notAWord`, with `n_misses`, `solved`, `game_ended`; no `colors`.
- **`_finish_compete`**: `rank() over (order by wp.n_misses, gp.solved_at)`
  over the solvers. `_maybe_finish_compete`, `concede`, `submit_timeout`,
  `stop_game` as wordle's with the names changed.
- **`replay_board`** (Restart): `n_misses = 0`, delete the events,
  `common._reset_game`, title, rebuild. The static blob is untouched — same
  puzzle.
- **The blobs** (the Schema section above): `_make_json_static_game_data`
  adds `puzzle: {starter, colors}`, so `_write_static_game_data` writes the
  game's own builder as waffle's does (`waffle.sql:551-564`), not the common
  one alone. `_make_json_board` is the starter row, then `{word, 'ggggg'}`
  once solved. `_make_json_team` is `{nMisses, board}` in coop;
  `_make_json_players` carries `nMisses`, `board` (compete),
  `tieBrokenByClock` (wordle's rule with `n_misses`). `_make_json_events`
  passes `colors` through, null for a miss. `summary_data`: `team: {nMisses}`,
  `legalBand`, the tier, `nWinnerMisses`, `nMissesById` (compete; keep only if
  the club line reads it — wordle's `nGuessesUsedById` is the model).
- **`_sync_title`**: wordle's, unchanged in logic (latest word, coop always,
  compete once ended).
- **`_rebuild_data_cols_for_all`** over the `wordleone_%` gametypes.

**Done when:** the SQL applies cleanly (`gmake db-sql ENV=local`) and step 3's tests pass.

### Step 3 — pgTAP: a `wordleone/` folder under `supabase/tests/`

From `supabase/tests/wordle/`, with a `setup.psql` whose
`pg_temp.wordleone_puzzle()` is one fixed puzzle — starter SIEVE, colors
`yxyyg`, answer VERSE, unique in the whole word list — so no test reads the
hidden column. Planting a bug (no starter duplicate; ranking by most misses)
failed fourteen assertions across three files.

| file | pins |
|---|---|
| `create_game_test.sql` | the envelope and the stored row; `select target` throws (the column grant); `game_data` target null; the setup's faults (band, difficulty, mode, a solo race); each puzzle refusal PN521–PN525; PN510 for a caller not among the players |
| `gameplay_test.sql` | the four answers: duplicate (the starter included) and `notAWord` write nothing; a miss writes `colors` null and counts; the solve ends coop and titles the game; the game-over race; a banded-out answer still solves; the band gate; a deleted game |
| `compete_test.sql` | private boards; the starter a duplicate on every board; ranking by fewest misses then the earlier solve |
| `concede_test.sql` · `stop_game_test.sql` · `turn_order_test.sql` | wordle's, renamed; a miss hands the turn on, a reject does not |
| `replay_test.sql` | Restart clears misses and re-hides the target, the static blob untouched; a stopped game is titled by its last guess, never the answer (wordle's reveal_test, folded in) |
| `game_data_test.sql` · `rebuild_data_cols_test.sql` | the blobs whole, the static `puzzle` included; the green row on a solved board; `tieBrokenByClock` |

The common tests that list every game (`clubs_gametypes_test.sql` and
`fk_delete_rules_test.sql` went with step 1, which turned them red):
`events_skeleton_test.sql`, `realtime_publication_test.sql` (scope only),
`function_grants_test.sql`, `function_overloads_test.sql` and
`supabase/scripts/rehearse-migration.sh` now name it. The two function tests
already leave out strands, letterboxed and setgame; that is untouched.

**Done when:** `gmake test-db` (the whole pgTAP suite; it runs whole-suite
only) is green.

### Step 4 — the edge function: `wordleone-build-board/` under `supabase/functions/`

- `gen.ts` moved here from beside the sheet script, which now imports it from
  here; its vitest became `gen_test.ts`, `Deno.test`s with local `eq` and
  `ok` (as `waffle-build-board`'s, no std import), pinning each filter on a
  planted word list.
- `index.ts`, in waffle's shape: `preflight` → `parseBuildBoardRequest` →
  `legal_band` and `difficulty` from setup, no defaults (bad → fault PN529,
  PN530) → fetch the words as the caller (none → fault PN531) →
  `buildPuzzle` with `Math.random` → null is a `formValidation` under
  `difficulty`, PN532 ("No puzzle could be built at that difficulty. Try
  another.") → `invokeCreateGame(supabase, 'wordleone', {…, p_board:
  {starter, colors, answer}})` → `crash` in the catch.
- The fetch differs from waffle's: **every** five-letter word at or below
  `max(band, STARTER_MAX_BAND)` (a band-1 game still draws starters from band
  2), not clean-filtered (a guess isn't), selecting `word, band, wordle, slur,
  crude, american, slang, root_word`, paged at 10,000 as waffle's.
- The schema is exposed now, not in step 6: a local call cannot reach
  `wordleone.create_game` without it. `supabase/config.toml`,
  `supabase/deploy/env.sh` and the Makefile's `BACKUP_SCHEMAS` name it
  (`deployLists.test.ts` keeps the three in step); the local stack reads
  config.toml only on a restart.

**Done when:** `npm run test:edge` and `deno check` on the folder are green,
and a local call creates a game. Met 2026-10-07: a hard band-2 and an easy
band-6 game each created in under a second, each puzzle with the tier's
green count and exactly one fitting word.

### Step 5 — the frontend: a `wordleone/` folder under `src/`

Copy `src/wordle/` whole, rename (`wordle` → `wordleone`, `WordNerd` →
`WordNerdier`, `db.ts` → `supabase.schema('wordleone')`), restamp every file
`cs-unmet` (none is blessed in the copy). Then, by file:

- **Unchanged but for names:** `Board`, `BoardRow`, `Tile` and their CSS;
  `BoardCol.module.css`, `PlayArea.module.css`, `InfoCol.module.css`;
  `useTypedGuess`, `useFlipBaseline`, `useGetEndingMessage`,
  `useHistoryView`, `useShowOppsSolvedMessages`; `lib/colors.ts`;
  `pdf/printPdf.ts`. Keep the turn bell and flash in `PlayArea.tsx`
  (`useTurnStartFlash`) — the game has turns.
- **`types.ts`:** `GFacts = {nMisses, board}`; `GEventRaw.colors: string |
  null`; `GSetupValues` = coop style, `legal_band`, the tier, timer, players;
  a static `puzzle: {starter, colors}`; `GAnswer` with `miss` / `miss_peer`
  for `incorrect` / `incorrect_peer`; `GSummaryData` per step 2.
- **`useGame.ts`:** `own: {nMisses, board}`; `mergeStaticGameData` keeps the
  static `puzzle` (its comment stops saying the static blob is the common
  part alone); the compete "ahead" helper reads misses.
- **`useSubmitGuess.ts`:** the union's accepted half is `correct | miss`, no
  `colors`. A miss and the two soft rejects shake the row in their outcome
  and say so in the slot, then clear the typed word once the shake ends
  (decision 14). No row lands for them, so `inFlight` is cleared at once, or
  it sticks.
- **`lib/answer.ts`:** `miss` → `lost`; the soft rejects as wordle's
  (`duplicate` `warning`, `not_a_word` `lost`); the copy from open question 1.
- **`GameEventLog.tsx` + CSS:** a null `colors` draws five uncolored squares
  (an outline, no gray fill) instead of calling `getTileColor`, which throws
  on null.
- **`lib/history.ts`:** `#N` replays the starter row, plus the green row at
  the solve; at a miss, the missed word in the second row as it looked
  before it was sent — typed, uncolored, no ring (decision 15). `BoardRow`
  already draws a null-colored row that way.
- **`lib/endingLabel.ts`:** drop the `resource_exhausted` branch; "fewer
  misses" where wordle says "more guesses".
- **`StateLine.tsx`:** "3 misses" (and "No misses yet" or similar — copy).
- **`InfoCol.tsx`:** the strip's metric is `Misses`.
- **`BoardCol.tsx`:** `maxGuesses: 2` to `Board` (the starter and the typing
  row); the key tint reads the board rows, which is the starter and the solve.
- **`SetupForm.tsx`, `lib/setup.ts`, `lib/setupRows.ts`:** legal band
  (`DictBandField`), the tier (a `SelectField`: easy · medium · hard · any),
  timer, coop style; no budget, no answer source. The setupRows guard needs a
  row for each key.
- **`manifest.ts`:** `startGameInClub` and the in-game New game
  (`useActionsAndMenu.ts`) call `runEdgeFn('wordleone-build-board', …)` as
  waffle's do (`src/waffle/manifest.ts:51-63`,
  `src/waffle/hooks/useActionsAndMenu.ts:100-121`); the summary line reads
  `legalBand` in the `dict "…"` slot and the tier beside it; no "out of
  guesses".
- **`Help.tsx`**, **`logo.svg`**, **`theme.css`**: new.
- **`pdf/model.ts`:** two rows per track, the result line in misses, the
  misses as plain words.
- **Tests** beside each, from wordle's, with the fixture
  (`lib/gameData.fixture.ts`) rebuilt from facts: `used` → `misses`, no
  `ZTest_SPENT`, events with null colors. `PlayArea.test.tsx` drops the
  out-of-guesses cases and gains a miss (red ring, row cleared, logged
  uncolored) and the soft rejects (a duplicate's orange ring, a non-word's
  red one, each row cleared when its shake ends).

**Done when:** `npx tsc -b`, and eslint and vitest over the new folder, are
green. Met 2026-10-07, with these as built:

- The theme tokens are `--wordleone-tile-border*`: wordle's are global, and
  the same two defined twice would be two homes.
- The two blobs both carry `puzzle`, so `useGame`'s merge joins its halves
  rather than letting the static one replace the target.
- A miss reaches `useSubmitGuess` with a `clearTypedWord` from
  `useTypedGuess`, run by the red mark's `onEnd`.
- The board's two rows are `BOARD_ROWS` in `lib/setup.ts`; `Board`'s prop
  keeps wordle's name, `maxGuesses`, for the lift.
- The defaults are band 2 and medium. The copy is a proposal for open
  question 1: a miss reads "Not it", a teammate's "guessed CRANE — not it".
- `db.ts`'s comment drops the `games_state` view, which no game has any more
  (wordle's still names it).
- `doc.md` is a short accurate version; step 8 writes the full one.

### Step 6 — the lists: registration and guards

Done with step 5, which could not lint or type-check without them:
`src/gametypes.ts`, `src/types/db.ts` regenerated (its `// cs-na` stamp put
back), `gameTypes.test.ts`'s `CONVERTED_GAMES`, `gameSummaries.test.ts`'s
`wordleone` family, and `shared/wordle-style/tileColor.test.ts`'s two lists
of event-log painters. The schema lists went with step 4; `concedeLock` and
`gameDeletedFirst` with step 2.

### Step 7 — e2e

Ask before running any of it (and the gallery needs `gmake db-reset
ENV=local` while the local DB is a prod copy — ask first).

- `e2e/helpers/fixtures.ts`: `createWordleoneGame` (through the edge
  function, or through `create_game` with a fixed puzzle as the pgTAP setup
  does) and `seedWordleoneGuesses` beside wordle's (:783-845).
- A `wordleone.ts` beside `e2e/gallery/games/wordle.ts` (fresh, mid with misses, won, ended, both
  modes; no "lost" cell — nothing runs out) and its two registrations,
  `e2e/gallery/run.ts:72,89` and `e2e/gallery/moveBytes.ts:47,131`.
- The rosters: `e2e/events-realtime.e2e.ts:78-82`,
  `e2e/build-board-random.e2e.ts:25-30`, `e2e/restart-resets.e2e.ts:90-97`.
- New specs from wordle's: `wordleone-history`, `wordleone-print`,
  `wordleone-mobile`.

**Done when:** those specs and the gallery cells pass, run one by one on
Joel's go. Met 2026-10-07 for the specs (7 passed) as built: the fixtures are
`createWordleoneGame` (straight to `create_game` on the pgTAP puzzle, SIEVE →
VERSE, so no test reads the hidden column), `seedWordleoneMisses` and
`solveWordleone`; the gallery has a `lost` cell after all — the clock's.
The gallery cells could not run: its clubs fail PN012 on the local data until
`gmake db-reset ENV=local`, which was not run. Screenshots taken by a
throwaway spec found the board's tiles spilling 8px past the grid at two rows
(the grid's cols/rows `aspect-ratio` leaves the gap out); the rows now take
their tiles' height.

### Step 8 — the docs

- The folder's `doc.md` in wordle's headings (Intro to area · Game rules ·
  Schema · RPCs · FE submissions · Frontend · Tests), taking this plan's rules,
  puzzle evidence and filters; its `todo.md` with the five sections.
- The card in `plans/game-cards.md`, in psychicnum's model.
- `CLAUDE.md` (a game-doc row; "Sixteen" → "Seventeen" and the roster),
  `README.md` (:5, :21, :57, :174), `docs/features.md` (code `W1`, decision 16;
  the player counts, the tag lines), `docs/naming.md` (the
  codename and brand tables), `src/common/reveal/doc.md:71`,
  `src/common/pdf/doc.md:243`, `docs/supabase.md:304`, and the count words
  (`docs/code-conventions.md:254`, `docs/states.md:83`, `docs/testing.md`'s
  gallery totals, `Makefile:830`).

**Done when:** the guards are green (links, prose paths, spelling). Met
2026-10-07. `docs/states.md` and `docs/testing.md` had no count to change; the
gallery's own comments still say "fifteen", as they did before this game.

### Step 9 — prod

On Joel's go: `gmake db-schema-sql ENV=prod` first, so the schema exists,
then `gmake project-config-api ENV=prod` to expose it, then `gmake deploy
ENV=prod` (the migration and `supabase/sql/` again, harmlessly, every
function including the new one, the FE). Done 2026-10-07, after a backup
(`backups/prod-20261007-135008.dump`): the one migration landed, the schema is
exposed, `wordleone-build-board` is live and answers, and all ten clubs have
both rows (compete off in the six solo ones). No game has been played on prod
yet. Nothing to rebuild —
no existing game reads the new blobs. Then one coop and one compete game on
prod.

### Step 10 — the lift

When wordleone is green: diff the new folder against `src/wordle/` and move
what is byte-identical — the board trio, `useTypedGuess`, `useFlipBaseline`,
the key tint, the printer's tiles — into `src/shared/wordle-style/` (or a
sibling whose `doc.md` says why), both games importing it; both PlayAreas
stay two copies. `shared/wordle-style/doc.md`, `docs/common-folders.md:344-346`
and wordle's `doc.md` follow. This touches blessed wordle files and is last.

### Step 11 — close the plan

What this plan knows that the game's `doc.md` doesn't moves there; the
plan and its `CLAUDE.md` row go.

## Reference

The sweep scripts were scratch work, not repo code; the method is the note's
and the numbers above are reproducible from `common.words` in a minute. The
NYT endpoints above are the calibration source: a `rounds` fetch per weekly
slug, scored with the same metrics, is how to re-read the tiers against more
than 35 rounds when the time comes.
