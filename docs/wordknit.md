# Wordknit

A NYT-Connections-style word-grouping puzzle. The third registered gametype in this monorepo, and the first to introduce several new patterns: FE-evaluated rules, shared selection state via Supabase Realtime Broadcast, and the "pause the game when a peer disconnects" pattern.

"Wordknit" is the codename (analogous to how "Tinyspy" is the codename for Codenames Duet). User-facing copy is "Wordknit"; folder / schema / RPC names are all `wordknit`.

For the shared layer (clubs, profiles, routing, the registry) see [`common.md`](common.md). For testing conventions + persona shapes see [`testing.md`](testing.md). For per-gametype comparisons see [`tinyspy.md`](tinyspy.md) and [`psychicnum.md`](psychicnum.md).

## What the game is

A 4×4 board of 16 tiles split into 4 hidden **categories** of 4 by theme. Players select 4 tiles and submit a guess. The server evaluates against the answer key:

- **correct** — all 4 in one category: the category resolves into a colored band, the tiles leave the grid.
- **oneAway** — exactly 3 of 4 in a single category: NYT's hint that you're close; counts as a mistake.
- **wrong** — otherwise: also counts as a mistake.

You lose at 4 mistakes; you win by matching all 4 categories. On a loss, the unmatched categories are revealed to the player.

Each category has a **rank** 0..3, mapped to NYT's yellow / green / blue / purple band colors — increasing difficulty in the original puzzle. Tokens in [`theme.css`](../src/wordknit/theme.css) (`--wordknit-rank-N`).

## Vocabulary

The schema and FE use a small, deliberate set of terms; the in-codebase glossary lives in [`naming.md`](naming.md) but the wordknit-specific calls are:

| term | what it means |
|---|---|
| **category** | one of the 4 hidden groupings of 4 tiles (what NYT calls a "group"; we use "category" because "group" overloads with club groups / user groups elsewhere) |
| **rank** | the difficulty index 0..3 of a category (was "level" — renamed because "level" overloads with puzzle-difficulty levels, app-routing levels, etc.) |
| **tile** | one of the 16 selectable words on the board (was "member" inside the JSON — renamed because "member" already means a person in a club) |
| **matched** | the resolution state for a category once a correct guess identifies it (was "found" — `matched` unifies with the `matched_category_rank` column and reads cohesively across copy + code) |
| **mistake_count** | the integer column counting wrong+oneAway submissions for a game (was `mistakes` — `_count` is explicit that it's a number, not the mistakes themselves) |

## Scope (current state)

Ported from an existing personal project ([`../connections`](https://github.com/joelburton/...)). Plays the real NYT Connections archive — every puzzle from 2023-06-12 onward, imported from [Eyefyre/NYT-Connections-Answers](https://github.com/Eyefyre/NYT-Connections-Answers) via the `npm run puzzles:import` script. The setup dialog has a date picker; create_game copies the chosen puzzle into a fresh `wordknit.games` row.

In scope today:
- Real puzzle archive (~1000+ puzzles, daily-updated upstream)
- Date-picker setup form, defaulting to today's puzzle
- 4-mistake-lose, oneAway feedback, dup-guess-doesn't-hurt
- Reveal-on-loss (the FE reads `board.categories` directly — no separate RPC, see "FE-knows" below)
- Shared selection across all connected players via Broadcast
- Pause-on-disconnect overlay via Presence
- Common chat (the existing `ClubChatPanel`)

Deliberately deferred (per the architecture-shake-out priority):
- Hint feature ("show me the first word of each category")
- Scratchpad (the connections repo's collaborative-editor takeover-lock thing)
- Per-tile rise-and-fade animations
- Per-player local shuffle
- Scheduled / automated puzzle import (today: manual `npm run puzzles:import`; eventually a GitHub Action or a Supabase scheduled Edge Function)
- Calendar / "puzzle of the day" UX (today: bare `<input type="date">`; eventually a calendar with already-played indicators per club)
- Per-club replay tracking (preventing or labelling already-played puzzles for a club)
- Share dialog (the club is our share vehicle)
- "Play next puzzle" affordances

## The "FE-knows-the-answer" decision

Unlike tinyspy and psychic-num — where the server holds a secret and validates moves against it — wordknit's board (categories + tile order) is **publicly readable** by every club member. The FE has the answer key. The `submit_guess` RPC trusts the FE's verdict (correct / oneAway / wrong + `matched_category_rank`) and just records it, applying atomicity for the shared state (`mistake_count`, and one-correct-per-rank idempotency via a partial unique index on `guesses`).

**Why:** the evaluator is a small pure function (`evaluateGuess` in [`src/wordknit/lib/evaluate.ts`](../src/wordknit/lib/evaluate.ts) — ~15 lines), nothing on the board is genuinely secret in this codebase's deployment, and the friends-only audience per [CLAUDE.md → Trust model](../CLAUDE.md#trust-model--server-authoritative-for-cleanliness-not-anti-cheat) doesn't justify column-grant + PL/pgSQL evaluation infrastructure. Psychic-num's column-grant pattern is documented as the canonical "true server-side secret" example; reading [that file's "hidden-target mechanic" section](psychicnum.md#the-hidden-target-mechanic) is enough — repeating the pattern here for a non-secret game would be educational noise.

**What stays server-authoritative regardless:** atomic mutations of shared state. The `mistake_count += 1` and `status = 'lost'` flips need to be the same transaction. Concurrent submissions ("two players hitting Submit at the same instant") still need a serializer — `SELECT FOR UPDATE` on the game row, same as psychic-num. One-correct-per-rank idempotency comes from a **partial unique index** on `wordknit.guesses (game_id, matched_category_rank) where result = 'correct'` — if two clients race a 'correct' submission, the second INSERT raises `unique_violation` and `submit_guess` catches and silently no-ops.

**If wordknit ever ships beyond friends:** the migration to flip back is straightforward — hide the `board` column via column-level grant, add a server-side evaluator in PL/pgSQL, drop the FE's `result` / `matched_category_rank` parameters from `submit_guess`. The architectural shape is small enough that the future-proofing is conceptual, not structural.

## Schema: `wordknit.*`

### Tables

| table | purpose |
|---|---|
| `puzzles` | The source-of-truth puzzle archive. One row per NYT Connections puzzle, with `source_id` (the NYT puzzle number, as text), `nyt_date`, and `categories` jsonb (matching the games.board.categories shape). Imported via `npm run puzzles:import`. Publicly readable. Distinct from `games.board` — puzzles stay pristine; games copy from them. See [Puzzles](#puzzles) below. |
| `games` | One row per playthrough. `club_id` (not null) ties to `common.clubs`. `puzzle_id` (not null) references the puzzle this game was created from. Holds `status`, `mistake_count`, `board` (jsonb — the puzzle's categories + this game's shuffled tileOrder — publicly readable). (The setup blob — puzzleId + timer mode — lives on `common.games.setup`; the per-gametype `setup` column was dropped when the blob moved to common.) |
| `guesses` | Append-only log of every submission. `result` is `'correct' \| 'oneAway' \| 'wrong'`; `matched_category_rank` is non-null iff result is correct. A partial unique index on `(game_id, matched_category_rank) where result = 'correct'` enforces one match per category per game. |

### `board` jsonb shape

```
{
  categories: [
    { rank: 0..3, name: text, tiles: text[4] },
    ...  // exactly 4 categories
  ],
  tileOrder: [text, text, ...16]  // shuffled display order
}
```

The whole board is publicly readable. The FE reads `board.categories` to evaluate guesses (FE-knows-the-answer) and to render the colored bands on reveal; it reads `board.tileOrder` for the 4×4 grid display order.

### Status enum

`games.status text not null check (status in ('in_progress', 'solved', 'lost'))`

- **in_progress** — guesses being submitted. The default; no other entry state.
- **solved** — all 4 categories have been matched. Terminal.
- **lost** — mistakes hit 4 (or the countdown timer expired). Terminal.

### Why no `tiles` table, no separate "matched categories" table

In tinyspy, the 25 words live in their own `tinyspy.words` table — one row per tile, with reveal state. Wordknit doesn't need that because:

1. The tile order is static (shuffled once at create_game time, never mutated).
2. The "is this tile still on the board?" check is derived: a tile is removed from play when its category appears as a `result='correct'` row in the guess log.

So `tileOrder` lives in the `board` jsonb alongside `categories`, and the FE filters out matched tiles at render time. Saves a 16-rows-per-game table for nothing.

Earlier versions of this schema had a separate `wordknit.found_groups` table whose PK on `(game_id, level)` provided the race-idempotency for concurrent correct submissions. That's been collapsed into the partial unique index on `guesses` — same guarantee, one less table, one less postgres-changes fan-out for the FE to subscribe to.

## RPCs

All `security definer`, granted only to `authenticated`, search_path pinned to `wordknit, common, public, extensions`.

### `wordknit.create_game(target_club uuid, setup jsonb, player_user_ids uuid[]) → table(id uuid)`

The one entry point. Verifies caller is a club member, validates `setup.puzzleId` (must be a uuid that exists in `wordknit.puzzles`) and `setup.timer` shape (see [Timer](#timer-browser-side-no-server-sync)), loads the puzzle's categories, shuffles the 16 tiles into `board.tileOrder`, builds the title as `"#<source_id> <nyt_date> (<TILE1>/<TILE2>)"` where TILE1/TILE2 are the first 2 alphabetical tiles across all 16, calls `common.create_game(target_club, 'wordknit', player_user_ids, title, setup)` which inserts the `common.games` header (`is_active=true`, with `setup` persisted on `common.games.setup`), then inserts the wordknit detail row referencing `puzzle_id` with status `in_progress`. The board is a copy of the puzzle's categories + this game's shuffled tileOrder; the puzzle row stays pristine.

Reject reasons: not authenticated; not a member; missing/malformed `setup.puzzleId`; `setup.puzzleId` doesn't reference a known puzzle (P0002 `'puzzle not found'`); bad `setup.timer` shape.

**No minimum-club-size check** — wordknit plays with any club size (matches the manifest's `numberOfPlayers: [1, null]`).

### `wordknit.submit_guess(target_game uuid, tiles text[], result text, matched_category_rank int default null)`

The only mid-game action. Validates the payload shape (4 tiles, valid result enum, rank present iff correct), then records what the caller tells it. For `correct`: inserts a `result='correct'` row into `guesses` (the partial unique index on `(game_id, matched_category_rank)` filtered to correct rows is the race-idempotency check), then counts correct rows to detect the win (4 correct → solved). For `wrong` / `oneAway`: records the guess, increments `mistake_count`, checks loss (4 mistakes → lost).

`SELECT FOR UPDATE` on the games row serializes concurrent submissions.

The PL/pgSQL **does not re-evaluate** the guess against `board.categories` — that's the FE-knows trade. (See the file-header note in [`supabase/migrations/*_wordknit_baseline.sql`](../supabase/migrations/20260614000005_wordknit_baseline.sql).)

Reject reasons: not authenticated; not a club member; game not in progress; tile count ≠ 4; bad result enum; missing or out-of-range `matched_category_rank` when result is correct.

### `wordknit.submit_timeout(target_game uuid)`

Fires when the countdown timer expires; flips `status` to `lost`. Idempotent — a second concurrent call on the already-terminal game raises `P0001 "game is not in progress"`, which the FE swallows. See [Timer](#timer-browser-side-no-server-sync).

### `wordknit.clear_active_on_termination` (trigger)

Fires on `status` UPDATE from `in_progress` to terminal. Deletes the matching `common.games (is_active=true)` row. Same pattern as tinyspy / psychic-num.

## Row-level security

Both tables have RLS enabled with SELECT policies gated on `common.is_club_member(club_id)` (`wordknit.guesses` traces through `wordknit.games` for the membership check via EXISTS subquery — same pattern as `psychicnum.guesses_select`).

No INSERT/UPDATE/DELETE policies. All writes go through the security-definer RPCs.

`grant select` lists all columns on each table — `board` is publicly readable, unlike `psychicnum.games.target` (which is column-grant-excluded). See "FE-knows" above for the rationale.

`wordknit.puzzles` has no RLS — puzzles are public knowledge. The `service_role` separately has INSERT (used by the import script); `authenticated` has only SELECT.

## Puzzles

A *puzzle* is a prewritten board shape — one date's NYT Connections puzzle, imported from the [Eyefyre/NYT-Connections-Answers](https://github.com/Eyefyre/NYT-Connections-Answers) JSON archive. Puzzles stay pristine in `wordknit.puzzles`; games copy from them at create-time into `games.board` (along with this game's shuffled `tileOrder`). The split is the same vocabulary you'd use for crosswords: the puzzle is the source, the board is the played instance. See [naming.md → puzzle vs. board](naming.md).

### Schema shape

```
wordknit.puzzles {
  id          uuid PK
  source_id   text unique     -- NYT puzzle number ("1", "500"); text so a
                                  future "500-bonus" doesn't break the schema
  nyt_date    date unique     -- NYT publication date; drives the FE picker
  categories  jsonb           -- same shape as games.board.categories
  imported_at timestamptz
}
```

### Import script

[`supabase/scripts/import-wordknit-puzzles.ts`](../supabase/scripts/import-wordknit-puzzles.ts), run via `npm run puzzles:import`. Fetches the connections.json from Eyefyre's repo (or `--file <path>` for offline), maps the upstream `{id, date, answers:[{group, members}]}` shape to our `{source_id, nyt_date, categories:[{rank, name, tiles}]}` shape, upserts on `source_id` with `ignoreDuplicates: true`. Re-runs are no-ops on already-imported rows.

Two upstream-shape notes worth keeping in mind:
- The `level` field is dropped in later upstream records, so the importer uses the array index as `rank` (the array is always in rank order).
- Upstream `group` → our `name`, upstream `members` → our `tiles`.

For v1 this script is run manually. It graduates to a scheduled job (GitHub Action or Supabase Edge Function with `pg_cron`) when the manual run gets annoying enough.

### Title formula

`"#<source_id> <nyt_date> (<TILE1>/<TILE2>)"` where TILE1/TILE2 are the first 2 alphabetical tiles across all 16. Example: `"#1 2023-06-12 (BUCKS/HAIL)"`. Built at create_game time from the puzzle's data, so it carries forward unchanged for the life of the game. The previous (POC-era) formula was "first 4 alphabetical tiles, comma-joined" — degenerate for the hardcoded board; replaced once real puzzles arrived.

## Frontend

### Folder layout

```
src/wordknit/
  manifest.ts             GameManifest registration. Lazy-loads ./components/PlayArea
                          directly (no Root.tsx); declares submitTimeout dispatch.
  db.ts                   export const db = supabase.schema('wordknit')
  theme.css               NYT rank palette (yellow/green/blue/purple = --wordknit-rank-0..3).
                          Imported by PlayArea.tsx so it loads with the chunk.

  components/
    PlayArea.tsx          Thin composition file. Loads via useGame, derives remaining-tiles
                          and ownerByTile, mounts the pieces, owns the submit/clear handlers
                          + transient banner. Mounted by <GamePage> as its render-prop child;
                          receives { session, gameId, members, timer } (GamePageCtx) as
                          props. Header / pause / chat / timer live in <GamePage>.
    PlayArea.module.css
    CategoryBands.tsx     The colored matched-category bands above the tile grid (plus the
                          unmatched-revealed bands rendered on game-over loss). Owns the
                          RANK_TOKEN rank → CSS-variable map.
    TileGrid.tsx          The 4×4 of remaining tiles + per-tile isMine/isPeer selection
                          attribution. Pure render against the (tiles, ownerByTile,
                          selfUserId, onToggle) props — the shared-selection machinery
                          lives in useGame.
    SetupForm.tsx         Puzzle date picker + timer-mode field. Fetches the
                          puzzle list from wordknit.puzzles on mount; defaults
                          to today's puzzle if available, else the most recent.
                          Shows a help banner if puzzles haven't been imported.
    SetupForm.module.css

  hooks/
    useGame.ts            Slimmed: now owns just postgres-changes (games / guesses) on its
                          own per-tab UUID-suffixed channel, AND the shared-selection
                          Broadcast events on a separate stable channel
                          `wordknit:${gameId}`. Presence / manual-pause / members / timer
                          all moved to common's useCommonGame (consumed by GamePage).

  lib/
    board.ts              Wire types for the `board` jsonb (Category, Board, CategoryRank).
    evaluate.ts           Pure rules engine: 4-of-4 → correct, 3-of-4 → oneAway.
    evaluate.test.ts      Unit tests for the boundary cases.
    peerColor.ts          Stable hash userId → 5-color palette.
    peerColor.test.ts     Determinism + distinctness tests.
    setup.ts              WordknitSetup type (puzzleId + timer) + defaults.
```

### Realtime: two channels now

Two channels, with deliberately different cache shapes:

| channel | who opens it | what rides on it |
|---|---|---|
| `game:${gameId}` (stable, no suffix) | `useCommonGame` | Presence + manual-pause Broadcast. Stable name because broadcast + presence only merge across clients with matching channel names. StrictMode handled by the hook's own `removeChannel()` cleanup. |
| `wordknit:${gameId}` (stable, no suffix) | wordknit's `useGame` | Shared-selection Broadcast (select / deselect / clear). Same stable-name rationale. |
| `wordknit:${gameId}:${uuid}` | wordknit's `useGame` | Postgres-changes on `wordknit.{games, guesses}`. Per-tab UUID-suffixed because postgres-changes don't need cross-client merging; the suffix sidesteps supabase-js's StrictMode-cache bite. |

See `docs/code-conventions.md` → "Realtime channel names" for the cache-shape framing.

### `matchedCategories` is a projection

The FE doesn't query a "matched categories" table — there isn't one. `useGame` projects `matchedCategories` by walking the `guesses` log, filtering to `result='correct'`, and joining each row's `matched_category_rank` to the static `board.categories[]`. The DB's partial unique index guarantees at most one correct guess per (game, rank), so the projection has at most 4 entries; ordering is by `guessed_at` (so the FE can show the bands in the order they were resolved if it ever wants to).

### Peer selection: Broadcast + Presence pattern

Wordknit is the first place in this codebase that uses Realtime Broadcast and Presence (everything else uses only Postgres Changes). The pattern is worth documenting because it'll repeat for future games with transient shared state.

**Selection semantics:** click acts on the **union** of all players' selections, not on each player's private list. Each tile has at most one contributor; clicking a tile already in the union removes it (regardless of who put it there); clicking an unselected tile adds it to MY contribution. Submit / "deselect all" / pause-on-disconnect all broadcast a `clear` event that empties every client's local map.

**Why Broadcast (not Presence-state) for the selection:** events are the natural unit here ("I selected X", "deselect X"). The state is reconstructable by listening from the moment you join — and we don't worry about late-joiners or mid-session rejoins because [we pause the game on any disconnect](#pause-presence-driven--manual). State lives in client memory, gets reset on every pause.

**Why Presence (not Broadcast) for "who's here":** Presence is exactly the primitive for this — it auto-cleans up on disconnect (no heartbeat plumbing), and its state-carrier capability gives us a stable list of connected `user_id`s without any custom join/leave protocol. `computePause` derives the `paused` boolean from `presence diff expected members`.

**The split is honest:** events that are events use Broadcast; state that's intrinsically "what is currently true for each connected user" uses Presence. The two complement rather than overlap.

### Pause (presence-driven + manual)

The game has a single `paused` flag with two trigger sources, both treated identically by the UX layer. The flag is the union of:

- **Presence-pause**: derived from `computePause(presentUserIds, members)`. True when some expected club member isn't on the channel.
- **Manual-pause**: any player clicks the Pause button in the header → broadcasts a `manualPause` event with their `user_id` → all clients (including self) set `manuallyPausedById`. Any player can click Resume in the overlay → broadcasts `manualUnpause`. No privileged "original pauser" check; we're friends, not cutthroat competitors.

When `paused` is true (from either source), the `PauseBoundary` (`common/components/PauseBoundary.tsx`) — mounted by `<GamePage>` around the PlayArea — **conditionally renders**: the PlayArea unmounts entirely and `PauseOverlay` (`common/components/PauseOverlay.tsx`) renders in its place. The overlay's copy adapts to the source:

| source | overlay copy | Resume button? |
|---|---|---|
| presence-only | "Waiting for Bea to reconnect…" | no — resolves when Bea's Presence rejoins |
| manual-only | "Bea paused the game" | yes — any player can click |
| both | both messages stacked | yes — clearing manual leaves presence-pause still active |

**Clean-by-unmount.** Wordknit's shared-tile selections live in component-local state inside `useGame` (the per-tab map of `tile → contributorId`). Because `PauseBoundary` unmounts the PlayArea on pause, that state disappears with it — no explicit `sendClear`-on-pause-transition wiring needed. Reconnecting peers see a clean grid. This is the canonical example of the "should this survive a pause?" rule from [`common.md`](common.md): selections are *intrinsically* pause-transient, so they sit in PlayArea-local state and the unmount handles cleanup for free. `sendClear` (still on `useGame`) is now only used for the post-submit clear after a guess resolves.

**Manual-pause persistence across mid-game peer reconnects:** if Bea is in a manually-paused game, then Ada drops + reconnects, Ada's local state would otherwise not know about the manual pause. The hook handles this by **re-broadcasting active manual-pause on every Presence change** — any client that observes a manual pause rebroadcasts when a peer joins. Idempotent receivers + broadcast-is-cheap make "everyone re-broadcasts on every presence change" the simplest robust shape. Lives in `useCommonGame.ts` now (alongside the rest of the presence + manual-pause plumbing).

**Paused vs suspended** — code-level terminology distinction worth knowing:

- **Paused** (this overlay + the `PauseBoundary` wrapper + `computePause` helper): the transient gameplay-pause state — same UX as a video player's pause: clock stops, no moves accepted, overlay shows. Triggers: presence-disconnect or manual Pause button (both shipped). Resolves automatically when presence comes back, or when anyone clicks Resume.
- **Suspended** (club-level concept in `common.md`): persistent, "this game is not the one `common.games (is_active=true)` is pointing at." Caused by another game being started in the club. Resolves when someone navigates to the suspended game and starts playing again.

The two never coexist on the same game — a suspended game isn't being looked at by anyone, so there's no Presence channel to track pauses for it.

**Future rollout:** the `computePause` helper + `PauseOverlay` + `PauseBoundary` + `useCommonGame` live in `common/` deliberately so tinyspy and psychic-num can attach the same pattern. With `useCommonGame` owning presence + manual-pause centrally and `<GamePage>` wrapping every PlayArea in `<PauseBoundary>`, the rollout is essentially free — any gametype that mounts GamePage gets the pause behavior. Joel's general principle ("if `#-present` ≠ `#-expected`, the game should pause for UX consistency") applies to all three games. The motivating case here is wordknit (where transient state would be unfair if some players kept clicking through a peer's disconnect), but the pattern transfers cleanly — see the memory note in `~/.claude/projects/-Users-joel-src-codenames/memory/feedback_pause_on_disconnect.md`.

### Timer (browser-side, no server sync)

The timer is a **per-game setup choice**, not a manifest-level constant. The setup dialog renders a None / Up / Down radio + an MM:SS input for the count-down case (1 second to 60 minutes); the choice lives on `wordknit.games.setup.timer` and is server-side validated in `create_game`. The default is countdown 10:00. When a count-down hits 0, the FE fires `wordknit.submit_timeout` and the game's status flips to `lost`.

**Browser-side, not server-synced.** Every client anchors at `games.created_at` (a server-stamped ISO timestamp), then ticks locally using `Date.now()`. There's no heartbeat back to the server, no periodic sync, no pause-log column.

**Why:** the alternative — a server-canonical clock that clients fetch periodically — was tried in a prior project and had a specific UX problem: at sync boundaries the displayed seconds would "fast-second" or "slow-second" depending on which way the local clock drifted relative to the server's. To smooth this, the heartbeat frequency has to be cranked up, which is a lot of plumbing for a small benefit. Browser-side ticking is always smooth.

**Drift across clients.** Two effects compound: wall-clock differences between machines (typically 30-50ms between NTP-synced consumer laptops), and per-pause broadcast latency (~30-100ms each time someone pauses or resumes). For a typical game with 1-2 pauses, total drift between two clients at end-of-game is well under 500ms. Invisible at friends-coop scale.

**Known bug — leaving the page doesn't pause the timer.** The pause infrastructure (presence + manual) only tracks pauses observed by clients currently on the channel. If everyone navigates away, the wall clock keeps moving and the timer loses that gap. Documented as a deferred item in [deferred.md → Wordknit](deferred.md) — the fix is part of a broader UX reframe (replace "Leave game" with an explicit "Suspend game" affordance that pauses the game on the way out). Until then: use the manual Pause button if you need to step away during a count-down; navigating home while the clock is running will cost you the time.

**The `useGameTimer` hook** (`src/common/hooks/useGameTimer.ts`) implements this. Built on React's `useSyncExternalStore` — the canonical pattern for "this hook observes an external time source" — so it satisfies the React-19 hook lint rules around impure calls during render. The hook is mode-aware (`countup` / `countdown(seconds)` / `none`), pause-aware (freezes the display while `paused`, accumulates pause windows so resume continues from where it left off), and recomputes-from-`Date.now()` rather than incrementing a counter (so backgrounded tabs and slept laptops catch up correctly when they return).

**Timeout-loss firing.** When `useGameTimer` (inside `useCommonGame`) reports `expired: true`, GamePage dispatches the wordknit manifest's `submitTimeout`, which calls `wordknit.submit_timeout(target_game)`. The RPC is idempotent: it raises `P0001 "game is not in progress"` if the game has already ended, which can happen if two clients race the expiry. The FE swallows that specific error silently — realtime propagates the loss state to all clients within ~200ms.

**Where the mode comes from.** Per-game (like wordknit) lives in `common.games.setup.timer`; `useCommonGame` reads it and drives `useGameTimer`, surfacing the result via GamePage. Per-gametype (a hypothetical Boggle with a fixed-3-minute round) would set `timerMode` on the manifest and skip a per-game choice. Both shapes are supported. Each game writes its own timeout-loss RPC (since the loss semantics differ — boggle would end the round, tinyspy might enter sudden-death, etc.) and exposes it through its manifest's `submitTimeout`, which GamePage fires on countdown expiry.

### Code-splitting

Same pattern as tinyspy and psychic-num — the manifest's `PlayArea` is lazy-loaded (`React.lazy(() => import('./components/PlayArea'))`). The Vite build emits wordknit's JS + CSS as separate chunks; users who only play tinyspy never download it. The lazy boundary for the SetupForm is separate (also lazy via the manifest's `setupForm.Component` field) so the form lands in wordknit's chunk too.

## Tests

### pgTAP files

| file | covers |
|---|---|
| `tests/wordknit/create_game_test.sql` | Auth, membership, setup.puzzleId validation (missing / bad uuid / not-found), setup.timer shape validation (missing / bad kind / missing or out-of-range seconds, accept none/countup), returns id row, status/mistake_count initial values, board shape (4 categories × 4 tiles, 16-element tileOrder, tileOrder is a permutation), games.puzzle_id linkage, setup persistence, active-flag tracking via common.games, title formula assertion. |
| `tests/wordknit/gameplay_test.sql` | Payload validation (tile count, result enum, rank-iff-correct), member-only enforcement, wrong/oneAway → mistake_count++, correct → guesses row + win check, 4-correct → status=solved, 4-mistakes → status=lost, race idempotency on (game_id, matched_category_rank) via the partial unique index, submit_timeout happy + idempotency paths. |
| `tests/wordknit/rls_test.sql` | dee (non-member) sees zero rows from both tables; mutating RPCs throw with 42501; direct INSERT into game tables is blocked at the grant layer. Includes a positive baseline (ada CAN see her own game). |

### Per-game `setup.psql` helpers

Promoted out of inline test fixtures because every wordknit test needs them and they're non-trivial:

- **`pg_temp.wordknit_puzzle() → uuid`** — inserts a known fixture puzzle (`source_id='TEST-FIXTURE'`, `nyt_date='1900-01-01'`, deterministic A/B/C/D-words categories) and returns its id. SECURITY DEFINER so it works regardless of which role the calling test has switched into. The fixture's date and source_id are deliberately alien to real NYT data so tests don't collide with imported puzzles.
- **`pg_temp.wordknit_setup(puzzle_id uuid, timer jsonb default ...) → jsonb`** — build a valid create_game setup payload referencing a puzzle. Defaults to a 10-minute countdown; tests override `timer` to exercise specific validation paths. Tests that need a *missing* field (no puzzleId, no timer) skip this helper and build jsonb_build_object inline so the malformed shape reads at the call site.

### FE tests

| file | covers |
|---|---|
| `src/wordknit/lib/evaluate.test.ts` | The pure-function evaluator: 4-of-4 → correct (with rank + name + tiles), 3-of-4 → oneAway, 0..2 overlap → wrong, fewer-than-4 input → wrong (defensive), order independence, returned-tiles defensive-copy. |
| `src/wordknit/lib/peerColor.test.ts` | The user_id → color hash: deterministic, distinct for the two persona UUIDs we care about, output is a CSS hex string. |

No FE test for the broadcast / presence plumbing — per [testing.md → What we don't test](testing.md#what-we-dont-test), realtime is the kind of integration the project covers by manual browser smoke. The hooks are exercised through the PlayArea there.

## Future work

Tracked in [`deferred.md`](deferred.md) as it gets enumerated. The big ones already visible:

- **Scheduled puzzle import.** Today's `npm run puzzles:import` is manual. Graduates to a GitHub Action or a Supabase scheduled Edge Function when the manual cadence gets annoying enough.
- **Calendar picker.** Today's `<input type="date">` is the minimum-viable picker. A real calendar with per-club already-played indicators ("won" / "lost" / "in progress" coloring) is a natural follow-up.
- **Per-club replay tracking.** A unique constraint on `(club_id, puzzle_id)` would prevent a club from replaying the same puzzle; informational tracking without enforcement is another option. Either way, the data is already there — `wordknit.games.puzzle_id` is the join.
- **Real Connections / Wordknit-flavored UI polish** (rise-and-fade, scratchpad, hint, contributor ring, etc.) — deliberately deferred from the port. We're using this to shake out architectural decisions before re-introducing the polish surface area.

## File locations

| asking… | look at… |
|---|---|
| What does the create_game / submit_guess RPC do | [`supabase/migrations/20260615000003_wordknit_baseline.sql`](../supabase/migrations/20260615000003_wordknit_baseline.sql) |
| Where the FE-knows rationale lives | this file (above) + the same migration's header comment |
| How are puzzles imported | [`supabase/scripts/import-wordknit-puzzles.ts`](../supabase/scripts/import-wordknit-puzzles.ts) — run via `npm run puzzles:import` |
| What does the play surface look like | [`src/wordknit/components/PlayArea.tsx`](../src/wordknit/components/PlayArea.tsx) (mounted as the render-prop child of `<GamePage>` from App.tsx) |
| What does the tile grid look like | [`src/wordknit/components/TileGrid.tsx`](../src/wordknit/components/TileGrid.tsx) (per-tile self/peer attribution) |
| What does the category-band render look like | [`src/wordknit/components/CategoryBands.tsx`](../src/wordknit/components/CategoryBands.tsx) (matched + unmatched-revealed bands; owns `RANK_TOKEN`) |
| How shared selection works | [`src/wordknit/hooks/useGame.ts`](../src/wordknit/hooks/useGame.ts) (the `apply` callbacks + `toggleTile` + selection-events broadcast) |
| How `matchedCategories` is projected | [`src/wordknit/hooks/useGame.ts`](../src/wordknit/hooks/useGame.ts) (the projection at the bottom of the hook) |
| The pause-on-disconnect pattern | [`src/common/lib/pause.ts`](../src/common/lib/pause.ts) + [`src/common/components/PauseOverlay.tsx`](../src/common/components/PauseOverlay.tsx) + [`src/common/components/PauseBoundary.tsx`](../src/common/components/PauseBoundary.tsx) |
| The browser-side timer | [`src/common/hooks/useGameTimer.ts`](../src/common/hooks/useGameTimer.ts) + the wordknit setup dialog's timer field |
| The evaluator | [`src/wordknit/lib/evaluate.ts`](../src/wordknit/lib/evaluate.ts) |
