# Game titles + club-page status lines

What every game writes as its **title** and what it renders as its **status line** — the
two strings that make up a row in ClubPage's right-hand games list.

```
┌─────────────────────────────────────────┐
│  Sun 2026-07-04            ← title      │
│  Sun 2026-07-04 · solved   ← status     │
└─────────────────────────────────────────┘
```

**Where each comes from.** The title is `common.games.title`, seeded by the gametype's
`create_game`. It is **not** immutable, and five gametypes rewrite it as play goes on
(scrabble, stackdown, wordle, waffle, and — for the terminal reveal — waffle compete).
Three rules shape every formula:

1. **A title names the game after its content.** Whatever a player would recognize the game
   by — the board's words, the puzzle's date, the answer — beats an opaque id. Only
   bananagrams has no shareable content to name (private grids, private hands), so it alone
   takes a pure identifier: the head of its own uuid.
2. **A title may be a readout.** Games that have nothing to show at create time start on the
   placeholder `'New game'` and rewrite it from play. A mode that holds the placeholder for
   a whole race — wordle compete, waffle compete — says `'New compete'` instead, since
   that's the label a club list actually sits on. The rewrite is **derived, not
   assigned** — a `_sync_title` helper recomputes from state and every transition calls it,
   so a timeout, a concede, a manual end and a **replay** all land on the right string. That
   last one matters: a replayed game must stop advertising the answer.
3. **A title can only carry what every player already sees.** `common.games.title` is
   readable club-wide, so a title is a side channel around a game's hidden state. This is
   why wordle compete and stackdown compete stay on the placeholder while private guesses
   are in flight, why waffle compete waits for the terminal reveal, and why psychicnum names
   itself after board words rather than its secrets.

Multi-word titles join with a dash: `APPLE-BERRY-CHERRY`.

The status line is `manifest.labelFor(row)`, a **pure, synchronous** function of one
`common.games` row (see [common.md → labelFor](common.md)); ClubPage dispatches each row to
its gametype's implementation. Everything `labelFor` needs must therefore already be on the
row, which is why the terminal RPCs write a `status` jsonb blob for it to read.

The status table below is **generated** — `npm run report:labels` runs all 24 manifests'
`labelFor` over representative rows and rewrites it in place, so the strings are literal
output rather than transcription. A test fails if it's stale. The titles table is
hand-maintained: those expressions live in SQL, out of reach of the FE.

## Titles

| game | format | example |
|---|---|---|
| bananagrams | `#` + the first 6 hex digits of the game's uuid | `#3F9A2C` |
| wordle **coop** | `'New game'` → **the most recent guess** → **the answer** at terminal | `CRANE` → `SLATE` |
| wordle **compete** | `'New compete'` (guesses are private) → **the answer** at terminal | `SLATE` |
| scrabble | `'New game'`, then **the first 3 words played** | `CRANE-BOXY-JET` |
| stackdown **coop** | `'New game'`, then **the first 3 words found** (`…` past 3) | `CAT-DOGS-BIRD…` |
| stackdown **compete** | `'New game'` (found words are private) | `New game` |
| psychicnum | **the first 3 board words**, alphabetical | `APPLE-BERRY-CHERRY` |
| boggle | board size + **the top row** (multiface dice expanded) | `4×4 ABQuD` |
| waffle **coop** | `'New game'`, then **the correct words so far** (first 3, alphabetical) | `ARENA-EAGER-TOTEM` |
| waffle **compete** | `'New compete'` (the words are the solution) → **the puzzle's words** at terminal | `ARENA-EAGER-TOTEM` |
| wordiply | the base, uppercased | `ARM` |
| spellingbee | centre·outer letters | `A·BCDEFG` |
| wordwheel | centre·outer letters | `A·BCDEFGH` |
| crosswords | puzzle title (fallback `Crossword`) | `NYT Sat 8/1/26: Untitled` |
| connections | the puzzle's date + **the first two tiles** | `2026-07-04: APPLE-BANANA` |
| codenamesduet | **the first 3 board words**, alphabetical | `APPLE-BERRY-CHERRY` |

## Status lines

<!-- BEGIN GENERATED status-lines — edit via `npm run report:labels`, not by hand -->

| game | state | status message |
|---|---|---|
| **codenamesduet** | playing | `in progress` |
| | sudden_death — sudden death | `sudden death` |
| | won — won | `won` |
| | lost_assassin — assassin | `lost (assassin)` |
| | lost_clock — out of turns | `lost (ran out of turns)` |
| | lost_timeout — timeout | `lost (ran out of time)` |
| | ended — manual end | `ended` |
| **psychicnum_coop** | playing | `5 guesses left` |
| | ended — manual end | `ended` |
| | won — found it | `won — alice guessed it` |
| | lost — out of guesses / time | `lost` |
| **psychicnum_compete** | playing | `5 guesses left` |
| | ended — manual end | `ended` |
| | won_compete — won the race | `alice won the race` |
| | lost — out of guesses / time | `time/budget out — no winner` |
| **connections_coop** | playing | `2/4 categories · 1/4 mistakes` |
| | ended — manual end | `2/4 categories · ended` |
| | solved — solved | `solved · 1 mistakes` |
| | lost — four mistakes | `lost · 2/4 matched` |
| **connections_compete** | playing | `in progress` |
| | ended — manual end | `ended` |
| | solved_compete — won the race | `alice won the race` |
| | lost_compete — no winner | `time out — no winner` |
| **spellingbee_coop** | playing | `21/50 pts · 7/30 words` |
| | won — reached target | `won at Genius · 47/50 pts` |
| | lost — timeout | `lost · time up · 21/50 pts · 7/30 words` |
| | ended — manual end | `done · 21/50 pts · 7/30 words` |
| **spellingbee_compete** | playing | `race to Genius` |
| | won_compete — someone hit the target | `winner at Genius` |
| | ended — timeout | `time up · no winner at Genius` |
| | ended — manual end | `ended · no winner at Genius` |
| | ended — all conceded | `all conceded` |
| **wordwheel_coop** | playing | `21/50 pts · 7/30 words` |
| | won — reached target | `won at Genius · 47/50 pts` |
| | lost — timeout | `lost · time up · 21/50 pts · 7/30 words` |
| | ended — manual end | `done · 21/50 pts · 7/30 words` |
| **wordwheel_compete** | playing | `race to Genius` |
| | won_compete — someone hit the target | `winner at Genius` |
| | ended — timeout | `time up · no winner at Genius` |
| | ended — manual end | `ended · no winner at Genius` |
| | ended — all conceded | `all conceded` |
| **bananagrams** | playing | `in progress` |
| | won — someone went out | `won — alice finished first` |
| | lost — timeout | `time's up — nobody finished` |
| | lost — all conceded | `everyone conceded` |
| **waffle_coop** | playing | `solving…` |
| | ended — manual end | `ended` |
| | won — solved | `solved` |
| | lost — out of swaps | `out of swaps` |
| **waffle_compete** | playing | `racing…` |
| | ended — manual end | `ended` |
| | won_compete — someone won | `won by alice` |
| | lost_compete — no winner | `no winner` |
| **wordle_coop** | playing | `guessing…` |
| | ended — manual end | `ended` |
| | won — solved | `solved` |
| | lost — out of guesses | `not solved` |
| **wordle_compete** | playing | `racing…` |
| | ended — manual end | `ended` |
| | won_compete — someone won | `won by alice` |
| | lost_compete — no winner | `no winner` |
| **stackdown_coop** | playing | `stacking…` |
| | ended — manual end | `ended` |
| | won — cleared | `cleared` |
| | lost — not cleared | `not cleared` |
| **stackdown_compete** | playing | `racing…` |
| | ended — manual end | `ended` |
| | won_compete — someone won | `won by alice` |
| | lost_compete — no winner | `no winner` |
| **scrabble_coop** | playing | `152 pts · 7 tiles left` |
| | ended — manual end | `ended` |
| | won — bag empty | `152 pts` |
| **scrabble_compete** | playing | `7 tiles left` |
| | ended — manual end | `ended` |
| | won_compete — highest score | `won by alice` |
| | lost — all conceded | `all conceded` |
| **boggle_coop** | playing | `7 words · 21 pts` |
| | ended — reached target | `target reached · 30 words · 90 pts` |
| | ended — timeout | `time up · 7 words · 21 pts` |
| | ended — manual end | `done · 7 words · 21 pts` |
| **boggle_compete** | playing | `competing · 2 players` |
| | ended — reached target | `alice won` |
| | ended — timeout | `time up` |
| | ended — manual end | `ended` |
| **crosswords_coop** | playing | `Sun 2026-07-04` |
| | ended — manual end | `Sun 2026-07-04 · ended` |
| | won — solved | `Sun 2026-07-04 · solved` |
| **crosswords_compete** | playing | `Sun 2026-07-04 · racing` |
| | ended — manual end | `Sun 2026-07-04 · ended` |
| | won_compete — first to finish | `Sun 2026-07-04 · alice won` |
| **wordiply_coop** | playing | `2/5 guesses` |
| | ended — guesses used / manual end | `done · 60% · 14 letters` |
| | ended — timeout | `time up · 60% · 14 letters` |
| **wordiply_compete** | playing | `2/5 · 3/5` |
| | won_compete — one winner | `winner · 60%` |
| | won_compete — co-winners | `co-winners · 60%` |
| | ended — all conceded | `all conceded` |
| | ended — no winner | `ended · no winner` |

<!-- END GENERATED status-lines -->

## Known inconsistencies (2026-08-01)

Findings from the first review of these two strings together. **Delete each line as it's
fixed** — this section is a punch list, not documentation.

**Bugs**

- **connections coop: `solved · 1 mistakes`.** No pluralization, where psychicnum's
  `1 guess left` handles it. (Real: `connections.submit_guess` writes `mistake_count` on
  the solved row, so a one-mistake solve prints exactly this.)

**Status lines**

- **Mid-game is split.** Seven games give real progress (`5 guesses left`,
  `2/4 categories · 1/4 mistakes`, `152 pts · 7 tiles left`); six give none (`solving…`,
  `in progress`, or just the crossword's title). Progress is the more useful answer to
  "should I go back to this?".
- **The same event is phrased four ways.** A compete win is `won by alice`
  (waffle/wordle/stackdown/scrabble), `alice won the race` (psychicnum/connections),
  `alice won` (boggle), `winner at Genius` (spellingbee/wordwheel), or `winner · 60%`
  (wordiply). Coop wins vary as much: `solved`, `cleared`, `won`, `target reached`,
  `152 pts`.
- **Unknown states fail three different ways, one of them risky.** waffle, wordle,
  stackdown **and scrabble** fall through to their *in-progress* text, so an unrecognised
  state renders a finished game as `solving…` / `7 tiles left` — a live-looking lie.
  psychicnum coop calls anything unknown `lost`. codenamesduet and bananagrams echo the
  raw state — ugly, but visibly wrong rather than quietly wrong. The four are pinned in
  `UNKNOWN_READS_AS_LIVE` in [`gameStatusLabels.test.ts`](../src/gameStatusLabels.test.ts),
  which blocks new ones; **delete each from that set as its fallback is fixed.**
