# strands (PaulPath) — build plan

**Working document.** Delete once the game ships and `docs/games/strands.md` carries
the durable decisions (the "docs describe current state, not plans" rule).

The 14th game: a NYT-Strands-style word search on a fixed 8×6 board where the
hidden words tile the whole grid. Codename `strands` everywhere in identifiers;
user-facing brand **PaulPath** (the manifest `BRAND` const only).

---

## 1. The rules, as ratified

**The board.** 8 rows × 6 columns of letter tiles. "Tile" is the settled word for
"any selectable thing on a board" (naming.md, via connections) — strands keeps the
vocabulary and drops the border; see §9.

**The words.** A set of **theme words** plus one **spangram** (the puzzle's theme,
spanning edge to edge). Verified across the archive: theme words + spangram
**exactly tile all 48 cells** — every cell used once, none twice. This is
load-bearing (§2).

**Tracing.** Click tiles in order; consecutive tiles must be **8-way adjacent**
(orthogonal *or* diagonal — verified on every sampled puzzle, e.g. `AMBITION`'s
`B[1,2]→I[0,1]`). Clicking the most recent tile again submits. Clicking any
already-selected non-last tile clears the whole selection. No keyboard entry and
no drag: repeated letters mean a typed string doesn't determine a path, and it
isn't a speed game.

**Submission outcomes.** Classified server-side, in this order:

1. the path matches an unfound theme word's path → **theme word** (purple, persists)
2. …or the spangram's path → **spangram** (gold, persists)
3. shorter than `min_word_length` → **too short**
4. a word already credited this game → **already counted**
5. in the dictionary at the setup band → **valid word** (+1 hint point, capped)
6. otherwise → **invalid word**

The theme check comes **first, unconditionally**. Not because NYT ships short
theme words (it doesn't — the archive minimum is exactly 4), but because 33 of 148
sampled theme words *are* 4 letters, so raising `min_word_length` to 5 would
reject real theme words in most puzzles under a length-first check.

**Persistence.** Only theme words and the spangram keep their discs and lines, and
their cells lock out of further tracing. Every other submission clears the trace,
earning a point or not.

**Hints.** Distinct valid non-theme words fill a **bar**; at `hint_cost` (default
3) the Hint button activates. Spending picks a **random** unfound theme word and
rings its cells — no connecting line, so the player still has to work out the
order. The counter **caps** at `hint_cost`: points found while a hint is unspent
are lost, and the player reads that off the full bar rather than a warning pill.
Spending resets to 0. In coop the bar is **shared**.

**Winning.** All theme words + the spangram found. There is no lose-by-mistakes
condition; a countdown expiring is a **loss** under the ratified clock rule
(states.md) — strands has a reachable end and you didn't reach it.

**Restart.** `reset_game` wipes the guess log, clears the board back to blind, and
resets hint points — the same puzzle replays clean.

**Selections are private until submitted.** In coop a peer sees your word only
when you submit it; nobody watches anybody else's tiles light up mid-trace.

> **This is deliberately NOT connections' pattern.** connections broadcasts
> mid-submission tile selection over Realtime Broadcast so coop players build a
> guess together. strands doesn't, which means **no Broadcast channel at all** —
> `postgres_changes` on the guess log carries everything. Recorded here so a
> future reader doesn't file the absence as an oversight and "fix" it.

---

## 2. The tiling invariant

Verified on 5 puzzles: 48/48 cells covered, 0 duplicates. Consequences the design
should lean on rather than re-derive:

- **Win = board consumed.** No separate "found all words" bookkeeping.
- **Hint words get scarcer as you progress**, because found cells lock. A real
  difficulty curve, free.
- **It's an import guard.** A puzzle whose coords don't tile exactly 48 cells is
  malformed — assert at import time, and plant a break to prove the assert fires.

---

## 3. Architecture: server-authoritative, solution shielded

**Decision: the server validates; the FE never sees the solution.** This differs
from connections' FE-knows call, and the reason is specific rather than taste.

connections went FE-knows because its evaluator is ~15 lines of pure function and
server-side evaluation would have meant building column-grant + PL/pgSQL
infrastructure *for that alone*. strands has no such choice: the dictionary check
must hit `common.words` regardless, so a round-trip per submission is already
paid. Once there, theme-matching in the same RPC is free, and the puzzle's entire
content — where the words are — stays hidden.

The usual objection (latency under rapid input) is why boggle and spellingbee ship
word lists and self-score. strands inverts it: submissions are deliberate and
infrequent, so ~100ms is imperceptible.

**Match by path, not by string.** In one sampled puzzle all 8 theme words also
appear in NYT's own `solutions` list, so string-matching would misclassify.

**Shielding pattern: waffle's.** Column grant on the solution + a
`SECURITY DEFINER` helper surfaced through a `security_invoker` view, exposed once
`common.games.solution_revealed`. Register with `gametypes.hides_solution = true`,
which gets the shared `reveal_solution` RPC and the terminal reveal for free.

### Designed so the decision can be reversed cheaply

This is being built server-accepted **provisionally** — if the verdict feels laggy
in the hand, the fallback is boggle/spellingbee's trusting-commit: ship the
solution + the board's legal word list to the FE, self-score, and let the RPC
record the verdict. Two things keep that flip contained rather than a rewrite:

- **The RPC's shape survives it.** `submit_path` already owns the row lock, the
  counters, the terminal check, and the turn advance — none of which move. Going
  FE-knows means adding a `result` parameter and trusting it instead of computing
  it, which is exactly what `connections.submit_guess` does today. Everything
  downstream of classification is unchanged.
- **Classification is written as one function with explicit inputs** — path,
  board, solution, legal-lookup — rather than smeared through the RPC body. It
  can't literally be shared across PL/pgSQL and TS, but keeping the seam named
  means the TS port is a transcription, not a redesign.

What *doesn't* survive the flip is the shielding: FE-knows means the solution
ships to the client, so `hides_solution` and the column grants come out. That's
the real cost of reversing, and it's a schema edit, not a refactor.

**A middle path exists but isn't worth it.** Shipping the legal word list *without*
the solution would decide "invalid" / "too short" / "already counted" locally —
the common case for wrong guesses — but a theme word is often also a dictionary
word, so the FE would flash "Valid word" before the server corrected it to "Theme
word". A wrong verdict that self-corrects is worse than a brief wait.

**Expected latency.** The server work is a small array comparison plus one indexed
`common.words` lookup; the round trip dominates it. If it does feel slow, measure
before flipping — a slow *local* stack is usually the two stale caches
(Kong / PostgREST), not the design.

---

## 4. Schema

Two files per the schema-vs-code split: `supabase/migrations/<ts>_strands.sql`
(shape, applied once) and `supabase/sql/strands.sql` (functions/views/policies/
grants, re-applied every deploy).

### `strands.puzzles` — the imported archive

`id`, `source_id` (NYT puzzle number, unique), `puzzle_date` (unique), `board`
(text[8]), `clue`, `solution` jsonb. Publicly readable **except** `solution`
(revoked; only `SECURITY DEFINER` functions read it).

`solution` shape:

```
{ spangram:   { word: text, coords: [[r,c], …] },
  themeWords: [ { word: text, coords: [[r,c], …] }, … ] }
```

### `strands.games`

Follows the **library-puzzle provenance rule** (stackdown is the template,
connections the cautionary case): everything needed to play *and* identify the
game is copied onto the row; `puzzle_id` is a **soft FK** — nullable,
`on delete set null` — so puzzles can be re-imported or retired without breaking
in-flight games.

| column | notes |
|---|---|
| `id` | FK `common.games(id)` |
| `club_handle`, `mode` | `mode` denormalized for RLS branching (connections' pattern) |
| `puzzle_id` | soft FK, provenance only |
| `puzzle_date` | frozen copy — the bit a player reads to know *which* puzzle |
| `board`, `clue` | public |
| `solution` | **shielded** (column grant) |
| `hint_points`, `hints_spent` | the shared coop bar + a spend counter |
| `active_hint_coords` | public, nullable — the *only* piece of solution ever exposed pre-terminal |
| `min_word_length`, `hint_cost`, `band` | denormalized from `setup` (immutable; same reasoning as `mode`) |

`active_hint_coords` deliberately carries **coords, not the word** — the hint rings
cells; naming the word would spoil it.

### `strands.guesses` — the single append-only log

`(game_id, user_id, word, path jsonb, result, created_at)`, `result ∈ theme |
spangram | hint_word | duplicate | too_short | invalid`.

One table, not two. Found theme words are `result in ('theme','spangram')` — the
board renders from that projection, and credited hint words are the distinct
`hint_word` set. The counters that can't be derived (the capped bar, spends) stay
as columns.

**Realtime: publish BOTH `strands.guesses` and `strands.games`.** An unpublished
table in a subscription silently kills the *whole* subscription — the invariant
that has bitten this repo before.

---

## 5. RPCs

| RPC | job |
|---|---|
| `strands.create_game(target_club, setup, player_user_ids, mode)` | Picks the puzzle by `setup.puzzle_date`, copies board/clue/solution/knobs onto the row, seeds counters, calls `common.create_game`, primes `status`. Follows the canonical create_game pattern (common.md). Seats turn-order when `setup.coop_style = 'turns'` via `common._assign_turn_order`. |
| `strands.submit_path(target_game, path)` | The one move RPC. Returns the classified result. |
| `strands.spend_hint(target_game)` | Gated on `hint_points >= hint_cost`; picks a random unfound theme word, writes `active_hint_coords`, resets the bar, bumps `hints_spent`. |
| `strands.end_game(target_game)` | The manual neutral end. |

`submit_path` order of operations:

1. `common.require_game_player` → `SELECT … FOR UPDATE` on the game row →
   `common._require_turn` (no-op for free-for-all, so turn-order costs nothing)
2. structural validation: in-range, 8-way adjacent, no repeats, no cells already
   consumed by a found theme word
3. classify per §1
4. insert the guess row; update counters; clear `active_hint_coords` if the found
   word was the hinted one
5. `common.update_state` (mid-game) or `common.end_game` (all words found) —
   remembering `status` **merges**, so every terminal write states its own
   `outcome` explicitly
6. advance the turn via `common._advance_turn` only on an **accepted,
   non-terminal** move

**Dictionary filter — the may-enter tier** (common.md, ratified 2026-08-03):
`difficulty <= band` and nothing else. No slur/crude/slang/american filters, as
specified. Note the setup copy must not get the direction backwards: **a higher
band makes strands easier** (more words qualify, hints come faster) — the same
direction as spellingbee's `legal`, the opposite of waffle's tier.

---

## 6. Puzzle import

`gmake g-strands-puzzles` → `supabase/scripts/import-strands-puzzles.ts`, modeled
on `import-connections-puzzles.ts`, added to the `db-data` chain.

Source: `https://www.nytimes.com/svc/strands/v2/YYYY-MM-DD.json` — **public, no
auth** (unlike crosswords' NYT path, which needs `NYT_COOKIE_JAR`). Archive runs
**2024-03-04** (id 7) → today (id 1062); out-of-range dates 404 cleanly.
Idempotent upsert on `source_id`, incremental on re-run.

The feed also ships `solutions` — NYT's own ~600–1300 valid non-theme words per
board. **Not used at runtime** (our band is the difficulty lever, and NYT's list is
Collins-flavored: `ADAW`, `AESC`, `ALAP`). Keep a couple as **test fixtures**: they
are a free parity oracle for the tracer, the way `boggle-c-solver/` is for boggle.
All 1168 solutions in one puzzle traced under 8-way/no-reuse, which is how the
adjacency rule was confirmed.

---

## 7. Conformance with the common patterns

The part worth checking hardest, since the ask was explicitly "don't drift."

**Play states.** Coop: `playing` → `won` (all found) / `lost` (timer expired) /
`ended` (manual, neutral). Compete later adds `won_compete` / `lost_compete` per
the `_compete` suffix convention — which is load-bearing, not cosmetic:
`common.concede` reads the suffix off the gametype to decide how an all-conceded
table ends.

**Terminal copy.** A `buildOver()` returning the shared `TerminalCopy`
`{verdict, message, tone}`; the manual-end branch delegates to the shared
`endedCopy(mode)` rather than writing its own neutral strings.

**Below-board pills.** `terminalPill` / `stickyPill` / `outOfRacePill` from
`common/lib/game/localPills` — never hand-rolled. Terminal verdict is fill+sticky;
own-move results are outline+sticky.

**Status line.** `labelFor` built from the `statusLine` / `outcome` / `wonBy`
helpers, leading with one of `Playing` / `Won` / `Lost` / `Ended`. Coop shares
everything, so progress facts are safe to show (the "only say what every player
already sees" rule bites compete, later).

**Action row.** `useStandardGameActions` for End / Concede / Restart; New Game
stays a per-game handler (as everywhere). Terminal renders `TerminalActionRow`;
a locally-done compete player renders `LocalTerminalRow`.

**Info column, canonical order** (playarea.md): state → OpponentStrip (compete) →
action row → help → setup disclosure → turn log. The **theme clue** goes in the
state region.

**Turn log.** A per-game `GameTurnLog` rendering its own `<tr>`s inside the shared
`<TurnLog>`, carrying the shared **`useTurnLogPlayerPicker`** — *every* turn-log
game does, and it brings the filter, the honest RLS-hidden empty line, and the
`#N` gate with it. Outcome bars map onto the shared vocabulary: theme/spangram →
`good`, valid word → `partial`, everything else → `bad`. No turn-history viewer in
v1 (so no `TurnLogNumber`).

**Also inherited, no wiring:** pause-on-disconnect, chat, timers, suspend/resume,
the join-invite popup, `reveal_solution`, `reset_game`.

---

## 8. Setup

`strands.SetupForm` with: **puzzle date** (calendar over the archive, defaulting to
the club's last-played date stepped forward — connections' pattern), **dictionary
band**, **`hint_cost`** (default 3), **`min_word_length`** (default 4), **timer**,
and **`coop_style`** (free-for-all default; turn-by-turn via the common primitive,
which strands qualifies for as a discrete-move coop game).

Register `strands_coop` in `common.gametypes` with `min_players = 1`,
`hides_solution = true`.

---

## 9. Frontend

Folder mirrors wordiply's: `manifest.ts`, `db.ts`, `theme.css`, `logo.svg`,
`hooks/useGame.ts`, `lib/`, `components/`, `pdf/`.

**Board rendering.** Bare letters — no tile borders, a deliberate departure from
the tile-and-warm-ramp vocabulary in ui.md, to be documented as a per-game
exception. A disc appears only when a tile is selected or found. Paths draw as an
**SVG overlay** absolutely positioned over the grid, beneath the letter layer:
diagonals rule out any border/box-shadow trick, and found paths persist, so the
overlay renders found words plus the live trace together.

**Colors** (own theme tokens, not eyedroppered from NYT): purple = theme word
accepted, gold = spangram accepted, light purple = active unsubmitted trace. The
last-selected tile wears a **double ring** — the "click me again to submit"
affordance, which needs its own marker or submission is undiscoverable.

**Below the board**, two rows, both fixed-height (the no-reflow rule):

1. **echo / pill slot** — the word-in-progress (`ALES`) while tracing, replaced by
   the verdict pill on submit. Mutually exclusive in time, so one slot.
2. **hint bar + Hint button** — persistent. Below the board rather than in the
   info column so it survives the mobile off-canvas collapse; the hint economy is
   core play, not a readout.

**Pill vocabulary:**

| outcome | pill |
|---|---|
| spangram | "Spangram!" |
| theme word | "Theme word" |
| valid, bar advances | "Valid word" |
| valid, bar completes | "Hint earned" |
| already credited | "Already counted" |
| below `min_word_length` | "Too short" |
| not in dictionary | "Invalid word" |

Plus a **one-time neutral pill at game start carrying the theme clue**, so mobile
players (whose info column is off-canvas) meet the clue without opening the sheet.

**Interaction state machine** — a small pure, unit-testable reducer over
`selected: [r,c][]`: click empty → append if 8-way adjacent and unconsumed; click
last → submit; click any other selected → clear. Pointer-only, no keyboard, no
drag.

---

## 10. Build order

1. **Import + schema.** Migration + `supabase/sql/strands.sql`, the importer, the
   tiling assert. Ends with real puzzles in a local table.
2. **Pure lib + tests.** Adjacency, the path reducer, classification. The NYT
   `solutions` fixture as the tracer's oracle.
3. **RPCs + pgTAP.** `create_game`, `submit_path`, `spend_hint`, `end_game`;
   shielding tests that prove a plain `authenticated` role *cannot* read
   `solution` (plant the break — a guard that can't fail is worse than none).
4. **FE board + trace.** Grid, SVG overlay, discs, the reducer wired to
   `submit_path`.
5. **Hints, turn log, info column, terminal states.**
6. **Manifest + registry + Help + theme + logo.** Registration in `src/games.ts`.
7. **Docs.** `docs/games/strands.md`; add **PP** to every dimension in
   features.md; note the new game in the CLAUDE.md table; delete this plan.
8. **e2e.** Play loop, hint economy, win.

### After the POC — the common features strands should eventually carry

Not in the first cut, but every one of these is a thing the other games have, so
they're catch-up work rather than new invention. Each should land as its own
scoped change:

- **Printable PDF** (docs/pdf.md). All thirteen games print; the fourteenth
  should. Composes from the shared `common/pdf/` helpers — the board grid plus
  the found words and the theme clue, in the three-shade greyscale language.
- **Turn-history viewer** — "show the board as it was at turn N". strands suits it
  well, since the board is strictly cumulative: replay is "the theme words found
  by turn N", which is a filter over the log rather than a reconstruction. Wire it
  through the shared `useHistoryViewer` + a per-game `lib/history.ts`, like the
  other seven.
- **Compete.** Per-player hint pools, guesses private until terminal,
  `won_compete` / `lost_compete`, `common.concede`, OpponentStrip.

**The turn log itself ships with the POC**, both halves of it: the **outcome color
bar** (`<TurnLogBar>` — theme/spangram `good`, valid word `partial`, the rest
`bad`) and the **whose-turns picker** (`useTurnLogPlayerPicker` — `Team` plus every
player by handle in coop). Neither is new work: the bar is a shared atom and the
picker is a hook plus a header action, and "every turn-log game carries it, on one
vocabulary" is a documented invariant, so deferring either would create drift
rather than save effort.

It interacts with the history viewer when that lands: `boardIsShown` goes false
when a single player is picked out of a shared coop log, so `#N` degrades to a
plain number instead of replaying the wrong turn.

---

## 11. Open / assumed

- **Where "PaulPath" comes from** — worth a line in the game doc if there's a
  story, as with the other brands.
- **Hint randomness is server-side** and persisted, necessarily: a shared coop
  pool means every player must see the *same* revealed word, so
  `Math.random()` per client would show three different ones.
- **A stray 2-cell click costs a round trip** (the FE can't know theme words, so
  it can't short-circuit "too short" locally). Acceptable; the alternative is
  exposing the shortest theme-word length, a trivial leak for a trivial gain.
- **Server-vs-FE acceptance is provisional** — see §3's reversal note. Build it
  server-side, play it, and flip only if the hand disagrees.
