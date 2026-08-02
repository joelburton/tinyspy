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
| **codenamesduet** | playing | `Playing · 5 turns left · 12/15 agents` |
| | sudden_death — sudden death | `Sudden death · 12/15 agents` |
| | won — won | `Won · 15/15 agents` |
| | lost_assassin — assassin | `Lost (assassin) · 12/15 agents` |
| | lost_clock — out of turns | `Lost (out of turns) · 12/15 agents` |
| | lost_timeout — timeout | `Lost (out of time) · 12/15 agents` |
| | ended — manual end | `Ended · 12/15 agents` |
| **psychicnum_coop** | playing | `Playing · 2/3 found · 5 guesses left` |
| | ended — manual end | `Ended · 2/3 found` |
| | won — found it | `Won · alice guessed it` |
| | lost — out of guesses | `Lost (out of guesses) · 2/3 found` |
| | lost — timeout | `Lost (out of time) · 2/3 found` |
| **psychicnum_compete** | playing | `Playing` |
| | ended — manual end | `Ended` |
| | won_compete — won the race | `Won by alice` |
| | lost_compete — budgets exhausted | `Lost (out of guesses) · no winner` |
| | lost_compete — timeout | `Lost (out of time) · no winner` |
| | lost_compete — all conceded | `Lost (all conceded)` |
| **connections_coop** | playing | `Playing · 2/4 groups · 1/4 mistakes` |
| | ended — manual end | `Ended · 2/4 groups` |
| | won — solved | `Won · 1 mistake` |
| | lost — four mistakes | `Lost (4 mistakes) · 2/4 groups` |
| | lost — timeout | `Lost (out of time) · 2/4 groups` |
| **connections_compete** | playing | `Playing` |
| | ended — manual end | `Ended` |
| | won_compete — won the race | `Won by alice` |
| | lost_compete — everyone hit four mistakes | `Lost (4 mistakes) · no winner` |
| | lost_compete — timeout | `Lost (out of time) · no winner` |
| | lost_compete — all conceded | `Lost (all conceded)` |
| **spellingbee_coop** | playing | `Playing · 21/50 pts · 7/30 words` |
| | won — reached target | `Won at "Genius" · 47/50 pts` |
| | lost — timeout, target set | `Lost (out of time) · 21/50 pts · 7/30 words` |
| | ended — timeout, no target | `Ended (out of time) · 21/50 pts · 7/30 words` |
| | ended — manual end | `Ended · 21/50 pts · 7/30 words` |
| **spellingbee_compete** | playing | `Playing · race to "Genius"` |
| | won_compete — someone hit the target | `Won by alice at "Genius"` |
| | lost_compete — timeout | `Lost (out of time) · nobody reached "Genius"` |
| | ended — manual end | `Ended · nobody reached "Genius"` |
| | lost_compete — all conceded | `Lost (all conceded)` |
| **wordwheel_coop** | playing | `Playing · 21/50 pts · 7/30 words` |
| | won — reached target | `Won at "Genius" · 47/50 pts` |
| | lost — timeout, target set | `Lost (out of time) · 21/50 pts · 7/30 words` |
| | ended — timeout, no target | `Ended (out of time) · 21/50 pts · 7/30 words` |
| | ended — manual end | `Ended · 21/50 pts · 7/30 words` |
| **wordwheel_compete** | playing | `Playing · race to "Genius"` |
| | won_compete — someone hit the target | `Won by alice at "Genius"` |
| | lost_compete — timeout | `Lost (out of time) · nobody reached "Genius"` |
| | ended — manual end | `Ended · nobody reached "Genius"` |
| | lost_compete — all conceded | `Lost (all conceded)` |
| **bananagrams** | playing | `Playing · 12 tiles in the bunch` |
| | won — someone went out | `Won by alice` |
| | lost — timeout | `Lost (out of time) · nobody finished` |
| | lost — all conceded | `Lost (all conceded)` |
| | ended — manual end | `Ended` |
| **waffle_coop** | playing | `Playing · 8 swaps left · dict "Familiar"` |
| | ended — manual end | `Ended · dict "Familiar"` |
| | ended — answer revealed | `Ended (answer revealed) · dict "Familiar"` |
| | won — solved | `Won · 3 swaps left · dict "Familiar"` |
| | lost — out of swaps | `Lost (out of swaps) · dict "Familiar"` |
| | lost — timeout | `Lost (out of time) · dict "Familiar"` |
| **waffle_compete** | playing | `Playing · dict "Familiar"` |
| | ended — manual end | `Ended · dict "Familiar"` |
| | ended — answer revealed | `Ended (answer revealed) · dict "Familiar"` |
| | won_compete — someone won | `Won by alice · 8 swaps · dict "Familiar"` |
| | lost_compete — everyone out of swaps | `Lost (out of swaps) · no winner` |
| | lost_compete — timeout | `Lost (out of time) · no winner` |
| | lost_compete — all conceded | `Lost (all conceded)` |
| **wordle_coop** | playing | `Playing · 3/6 guesses · dict "Wordle"` |
| | ended — manual end | `Ended · dict "Wordle"` |
| | ended — answer revealed | `Ended (answer revealed) · dict "Wordle"` |
| | won — solved | `Won · 4/6 guesses · dict "Wordle"` |
| | lost — out of guesses | `Lost (out of guesses) · dict "Wordle"` |
| | lost — timeout | `Lost (out of time) · 3/6 guesses · dict "Wordle"` |
| **wordle_compete** | playing | `Playing · dict "Wordle"` |
| | ended — manual end | `Ended · dict "Wordle"` |
| | ended — answer revealed | `Ended (answer revealed) · dict "Wordle"` |
| | won_compete — someone won | `Won by alice · 4 guesses · dict "Wordle"` |
| | lost_compete — everyone out of guesses | `Lost (out of guesses) · no winner` |
| | lost_compete — timeout | `Lost (out of time) · no winner` |
| | lost_compete — all conceded | `Lost (all conceded)` |
| **stackdown_coop** | playing | `Playing · 3/6 words · dict "Familiar"` |
| | ended — manual end | `Ended · 3/6 words · dict "Familiar"` |
| | won — cleared | `Won · dict "Familiar"` |
| | lost — timeout | `Lost (out of time) · 3/6 words · dict "Familiar"` |
| **stackdown_compete** | playing | `Playing · dict "Familiar"` |
| | ended — manual end | `Ended · dict "Familiar"` |
| | won_compete — someone won | `Won by alice · dict "Familiar"` |
| | lost_compete — timeout | `Lost (out of time) · no winner` |
| | lost_compete — all conceded | `Lost (all conceded)` |
| **scrabble_coop** | playing | `Playing · 152 pts · 7 tiles left` |
| | ended — manual end | `Ended · 152 pts` |
| | ended — bag empty | `Ended · 152 pts` |
| | ended — six scoreless turns | `Ended (no moves left) · 152 pts` |
| | lost — timeout | `Lost (out of time) · 152 pts` |
| **scrabble_compete** | playing | `Playing · 7 tiles left` |
| | ended — manual end | `Ended` |
| | won_compete — highest score | `Won by alice · 312 pts` |
| | lost_compete — all conceded | `Lost (all conceded)` |
| **boggle_coop** | playing | `Playing · 7 words · 21 pts` |
| | won — reached target | `Won (reached 65%) · 30 words · 90 pts` |
| | lost — timeout, target set | `Lost (out of time) · 7 words · 21 pts` |
| | ended — timeout, no target | `Ended (out of time) · 7 words · 21 pts` |
| | ended — manual end | `Ended · 7 words · 21 pts` |
| **boggle_compete** | playing | `Playing · race to 65%` |
| | won_compete — reached target | `Won by alice at 65%` |
| | won_compete — top score at the buzzer (no target) | `Won by alice · 90 pts` |
| | won_compete — tied top score (no target) | `Won (co-winners) · 90 pts` |
| | lost_compete — timeout, target set | `Lost (out of time) · no winner` |
| | lost_compete — timeout, nobody scored | `Lost (out of time) · no winner` |
| | ended — manual end | `Ended · no winner` |
| | lost_compete — all conceded | `Lost (all conceded)` |
| **crosswords_coop** | playing | `Playing` |
| | ended — manual end | `Ended` |
| | won — solved | `Won` |
| | lost — timeout | `Lost (out of time)` |
| **crosswords_compete** | playing | `Playing` |
| | ended — manual end | `Ended` |
| | won_compete — first to finish | `Won by alice` |
| | lost_compete — timeout | `Lost (out of time) · no winner` |
| | lost_compete — all conceded | `Lost (all conceded)` |
| **wordiply_coop** | playing | `Playing · 2/5 guesses` |
| | ended — guesses used | `Ended (out of guesses) · 60% · 14 letters` |
| | lost — timeout | `Lost (out of time) · 60% · 14 letters` |
| | ended — manual end | `Ended · 60% · 14 letters` |
| **wordiply_compete** | playing | `Playing` |
| | won_compete — one winner | `Won by alice · 60%` |
| | won_compete — co-winners | `Won (co-winners) · 60%` |
| | lost_compete — all conceded | `Lost (all conceded)` |
| | lost_compete — timeout, nobody scored | `Lost (out of time) · nobody scored` |
| | lost_compete — out of guesses, nobody scored | `Lost (out of guesses) · nobody scored` |
| | ended — manual end | `Ended · no winner` |

<!-- END GENERATED status-lines -->

## The status-line grammar

Every line above is built from the same four leading words and two devices, via the
helpers in [`common/lib/game/statusLabel.ts`](../src/common/lib/game/statusLabel.ts):

```
OUTCOME (why) · other · facts
```

- **The lead is one of `Playing` / `Won` / `Lost` / `Ended`.** It's what survives
  truncation on a narrow card, so it carries the thing you scan for. Per-game flavour
  words (`solving…`, `stacking…`, `racing…`) were retired for it.
- **Parentheses carry a reason**, phrased in the game's own noun — `out of guesses`,
  `out of swaps`, `4 mistakes`, `all conceded`. A reason goes on a loss or an end, never
  on a win: how a win arrived rarely matters.
- **A winner is `Won by alice`** — no parentheses, because "by alice" reads as English.
- **`·` separates facts**, and nothing else does. There is no second separator.
- **A line may only say what every player already sees.** It renders from
  `common.games.status`, which the whole club can read, so a compete game's private
  per-player progress must never appear — which is why several compete labels are a bare
  `Playing`.
- **`dict "Familiar"`** rides on waffle, wordle and stackdown only: those three feel like
  different games at different bands. It comes from `setup` (carried on the listing row),
  not `status`, because `common.reset_game` assigns the status wholesale and a create-time
  key wouldn't survive a restart. wordle's band is its *answer source*, where `0` is the
  curated Wordle answer list — rendered `dict "Wordle"`.

Every label is an exhaustive `switch` whose `default` returns the raw play_state, so an
unrecognised state renders visibly wrong rather than quietly claiming the game is live.
`UNKNOWN_READS_AS_LIVE` in [`gameStatusLabels.test.ts`](../src/gameStatusLabels.test.ts)
is now empty and guards against a regression.
