# connections

A NYT-Connections-style word-grouping puzzle. The third gametype family in this monorepo (after codenamesduet and psychicnum), now registered as a sibling-manifest pair — `connections_coop` + `connections_compete`. connections was the first place in this codebase to introduce several patterns: FE-evaluated rules, shared selection state via Supabase Realtime Broadcast (coop only), and the "pause the game when a peer disconnects" pattern.

"connections" is the codename (analogous to how "codenamesduet" is the codename for Codenames Duet). User-facing copy is "connections"; folder / schema / RPC names are all `connections`.

For the shared layer (clubs, profiles, routing, the registry) see [`common.md`](../common.md). For testing conventions + persona shapes see [`testing.md`](../testing.md). For per-gametype comparisons see [`codenamesduet.md`](codenamesduet.md) and [`psychicnum.md`](psychicnum.md).

**Manifest declarations.** Two-manifest family (sibling-pattern). See [The sibling-manifest pattern](#the-sibling-manifest-pattern) below.

## The sibling-manifest pattern

connections exports two manifest entries from one folder, mirroring psychicnum's split:

| field                | `connectionsCoopGame`     | `connectionsCompeteGame`     |
|----------------------|------------------------|----------------------------|
| `gametype`           | `connections_coop`         | `connections_compete`          |
| `schema`             | `connections`              | `connections`                  |
| `baseGametype`       | `connections`              | `connections`                  |
| `mode`               | `'coop'`                | `'compete'`                 |
| `name`               | `connections`              | `connections`                  |
| `numberOfPlayers`    | `[1, 6]`                | `[2, 6]`                    |

The two siblings share the same `name` — the coop/compete distinction is shown at presentation time via the `<ModePill>` (read from `mode`), not baked into the name string. See [ui.md → Mode pills](../ui.md#mode-pills).

Both ship the same `PlayArea`, `SetupForm`, `Help`, `useGame`, `theme.css`, and `logo.svg`. The mode branches at render time (`game.mode === 'coop'` vs `'compete'`) — the FE-level analog of `connections.games.mode`, denormalized for RLS branching. The DB inserts **two rows in `common.gametypes`** but a **single set of connections tables**; one `connections.create_game(target_club, setup, players, mode)` RPC routes both manifests' Start clicks.

The canonical write-up of this pattern lives in [`psychicnum.md → The sibling-manifest pattern`](psychicnum.md#the-sibling-manifest-pattern); the two implementations are intentional structural twins so a reader of either understands both.

## What the game is

A 4×4 board of 16 tiles split into 4 hidden **categories** of 4 by theme. Players select 4 tiles and submit a guess. The FE evaluates against the answer key (see [FE-knows-the-answer](#the-fe-knows-the-answer-decision)):

- **correct** — all 4 in one category: the category resolves into a colored band, the tiles leave the grid.
- **oneAway** — exactly 3 of 4 in a single category: NYT's hint that you're close; counts as a mistake.
- **wrong** — otherwise: also counts as a mistake.

**Coop mode.** Everyone shares one set of matched categories + one mistake counter. You lose at 4 mistakes; you win by matching all 4 categories. On a loss, the unmatched categories are revealed.

**Compete mode.** Each player races independently on their own copy of the puzzle. Per-player mistake counter, per-player matched-categories. **First to all 4 wins** — the race ends instantly for everyone, with the winner getting `{won: true}` and the rest `{won: false}`. **4 mistakes eliminates that player** but the game continues; once every player is eliminated (or the timer expires) it's a collective loss. Opponents see each other's mistake counts (so the race has tension) but **not** their guesses or which categories they've matched (RLS enforces). On individual elimination, the eliminated player gets their unmatched categories revealed and sits in a spectator state while the rest race on.

Each category has a **rank** 0..3, mapped to NYT's yellow / green / blue / purple band colors — increasing difficulty in the original puzzle. Tokens in [`theme.css`](../../src/connections/theme.css) (`--connections-rank-N`).

## Vocabulary

The schema and FE use a small, deliberate set of terms; the in-codebase glossary lives in [`naming.md`](../naming.md) but the connections-specific calls are:

| term | what it means |
|---|---|
| **category** | One of the 4 hidden groupings of 4 tiles (what NYT calls a "group"; we use "category" because "group" overloads with club groups / user groups elsewhere — see the watch list in [`naming.md`](../naming.md)). |
| **rank** | The difficulty index 0..3 of a category — yellow / green / blue / purple in NYT's palette. Named `rank` rather than `level` because `level` overloads with puzzle-difficulty levels, app-routing levels, and other meanings the codebase shouldn't pre-commit. Different concept from spellingbee's `rank` (player progress); the per-game scope disambiguates. |
| **tile** | One of the 16 selectable words on the board. `tile` generalizes the scrabble-tile / boggle-die vocabulary to "any selectable thing on a board." Future word-grid games (boggle) should reuse the same word. Not "member" — that already means a person in a club. |
| **matched** | The verb (and resolution state) for a category once a correct guess identifies it. Unifies with the `matched_category_rank` column on `connections.guesses` so the FE-state name (`matchedCategories`) and the column root (`matched_…`) read as one vocabulary. |
| **mistake_count** | The integer counter of wrong + oneAway submissions for a game. Explicit `_count` suffix because a list of the actual mistakes (the `guesses` rows with `result <> 'correct'`) is the FE's natural projection — see the count-vs-list rule in [`naming.md`](../naming.md). |

## Scope (current state)

Ported from an existing personal project ([`../connections`](https://github.com/joelburton/...)). Plays the real NYT Connections archive — every puzzle from 2023-06-12 onward, imported from [Eyefyre/NYT-Connections-Answers](https://github.com/Eyefyre/NYT-Connections-Answers) via the `npm run connections:import` script. The setup dialog has a date picker; create_game copies the chosen puzzle into a fresh `connections.games` row.

In scope today:
- Both **coop** and **compete** modes (sibling-manifest pair — see [The sibling-manifest pattern](#the-sibling-manifest-pattern))
- Real puzzle archive (~1000+ puzzles, daily-updated upstream)
- Calendar picker in the setup dialog, defaulting to today's puzzle. Mode-scoped: the same date can hold a separate coop game and a separate compete game for the same club
- Same-date-same-mode opens the existing club game (no replay path — picking a date the club already has in this mode reopens that game rather than creating a new one)
- 4-mistake-lose, oneAway feedback, dup-guess-doesn't-hurt
- Reveal-on-loss (the FE reads `board.categories` directly — no separate RPC, see "FE-knows" below). In compete, individual-elimination triggers a personal reveal while the game keeps going for survivors
- Compete OpponentStrip showing per-player mistake counts (the entire "what opponents know about you" surface — guesses + matched-categories stay private)
- Shared selection across connected players via Broadcast in coop; private per-player selection in compete (broadcast send suppressed)
- Per-player local-shuffle button
- Hint dialog (reveal-on-demand modal: one row per category, each gated behind a "Reveal" button that surfaces that category's first tile when clicked; client-side and per-player, never broadcast or persisted; opened from the GamePage menu)
- Pause-on-disconnect overlay via Presence
- Common chat (the floating, draggable, resizable `<FloatingChat>` panel)

Deliberately deferred:
- Scratchpad (the connections repo's collaborative-editor takeover-lock thing) — tracked under common/architecture, not connections-specific
- Per-tile rise-and-fade animations on category match
- Scheduled / automated puzzle import (today: manual `npm run connections:import`; eventually a GitHub Action or a Supabase scheduled Edge Function)
- "Play next puzzle" affordances

## The "FE-knows-the-answer" decision

Unlike codenamesduet and psychicnum — where the server holds a secret and validates moves against it — connections's board (categories + tile order) is **publicly readable** by every club member, in both coop and compete modes. The FE has the answer key. The `submit_guess` RPC trusts the FE's verdict (correct / oneAway / wrong + `matched_category_rank`) and just records it, applying atomicity for the shared state (per-player `mistake_count` on `connections.players`, mode-aware one-correct-per-rank idempotency via partial unique indexes on `guesses`).

**Why:** the evaluator is a small pure function (`evaluateGuess` in [`src/connections/lib/evaluate.ts`](../../src/connections/lib/evaluate.ts) — ~15 lines), nothing on the board is genuinely secret in this codebase's deployment, and the friends-only audience per [CLAUDE.md → Trust model](../../CLAUDE.md#trust-model--server-authoritative-for-cleanliness-not-anti-cheat) doesn't justify column-grant + PL/pgSQL evaluation infrastructure. Psychic-num's column-grant pattern is documented as the canonical "true server-side secret" example; reading [that file's "hidden-target mechanic" section](psychicnum.md#the-hidden-target-mechanic) is enough — repeating the pattern here for a non-secret game would be educational noise. Compete mode introduces a cheating *incentive* coop didn't have (a player could read `board.categories` in devtools and pick the right 4 tiles instantly), but the trust model says we're not the gatekeeper of that — we're friends.

**What stays server-authoritative regardless:** atomic mutations of shared state. The mistake-count increment and the `play_state` terminal flip need to be the same transaction. Concurrent submissions ("two players hitting Submit at the same instant") still need a serializer — `SELECT FOR UPDATE` on the game row, same as psychicnum. One-correct-per-rank idempotency comes from two mode-aware **partial unique indexes** on `connections.guesses` (the schema section below has the exact predicates) — if two clients race a 'correct' submission, the second INSERT raises `unique_violation` and `submit_guess` catches and silently no-ops.

**If connections ever ships beyond friends:** the migration to flip back is straightforward — hide the `board` column via column-level grant, add a server-side evaluator in PL/pgSQL, drop the FE's `result` / `matched_category_rank` parameters from `submit_guess`. The architectural shape is small enough that the future-proofing is conceptual, not structural. Compete is where this matters first.

## Schema: `connections.*`

### Tables

| table | purpose |
|---|---|
| `puzzles` | The source-of-truth puzzle archive. One row per NYT Connections puzzle, with `source_id` (the NYT puzzle number, as text), `nyt_date`, and `categories` jsonb (matching the games.board.categories shape). Imported via `npm run connections:import`. Publicly readable. Distinct from `games.board` — puzzles stay pristine; games copy from them. See [Puzzles](#puzzles) below. |
| `games` | One row per playthrough. `club_handle` (not null) ties to `common.clubs`. `puzzle_id` (not null) references the puzzle. `mode` (text, `coop` or `compete`) is denormalized for RLS branching — same pattern as `psychicnum.games.mode`. `board` jsonb holds the puzzle's categories + this game's shuffled tileOrder (publicly readable). Play-state (`play_state` + `is_terminal`) and the setup blob both live on `common.games`. |
| `players` | Per-player mistake tracking. One row per `(game_id, user_id)` with `mistake_count int default 0`. In coop, all rows update in lock-step (every wrong guess hits every row); in compete, only the guesser's row increments. Created at game-start time, seeded to 0. Per-player outcome (`won` / `lost`) doesn't live here — it goes on `common.game_players.result` at game-end. Same shape as `psychicnum.players`. |
| `guesses` | Append-only log of every submission. `result` is `'correct' \| 'oneAway' \| 'wrong'`; `matched_category_rank` is non-null iff result is correct. `mode` (text) is denormalized from `games.mode` so the mode-aware partial unique indexes (below) can filter without a subquery, and the mode-aware RLS policy can branch without a join. Two partial unique indexes enforce idempotency: `(game_id, matched_category_rank) where result='correct' and mode='coop'` in coop; `(game_id, user_id, matched_category_rank) where result='correct' and mode='compete'` in compete (each player can independently solve every category). |

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

### Play-state enum

`common.games.play_state` carries connections's lifecycle enum, mode-aware:

**Coop:**
- **playing** — guesses being submitted. The default; no other entry state.
- **solved** — all 4 categories have been matched. Terminal.
- **lost** — mistakes hit 4 (or the countdown timer expired). Terminal.

**Compete:**
- **playing** — guesses being submitted. Eliminated players (4 mistakes) sit in a spectator state without ending the game.
- **solved_compete** — a player matched all 4 categories first. Terminal. That player's `common.game_players.result = {won: true}`; everyone else's `= {won: false}`.
- **lost_compete** — every player exhausted their mistake budget OR the timer expired with nobody having matched all 4. Terminal. Everyone's `result = {won: false}`.

### Data differences between coop and compete — at a glance

Anything not listed here is identical across modes. The shape mirrors [`psychicnum.md → Data differences`](psychicnum.md#data-differences-between-coop-and-compete--at-a-glance).

| dimension                                  | coop                                                        | compete                                                              |
|--------------------------------------------|-------------------------------------------------------------|----------------------------------------------------------------------|
| **gametype string**                        | `'connections_coop'`                                           | `'connections_compete'`                                                 |
| **`connections.games.mode`**                  | `'coop'`                                                    | `'compete'`                                                          |
| **manifest `numberOfPlayers`**             | `[1, 6]` (solo OK)                                          | `[2, 6]` (needs ≥1 opponent)                                         |
| **`connections.players.mistake_count` per row**| Always equal across rows (lock-step decrement)             | Independent per row (only the guesser's row increments)              |
| **`connections.guesses` RLS**                 | Club-wide visible                                           | Caller-only — `using (... and guesses.user_id = auth.uid())`         |
| **`connections.players` RLS**                 | Club-wide visible                                           | Club-wide visible (same — opponents see each other's mistake counts) |
| **correct-row partial unique index**       | `(game_id, matched_category_rank)` — one match per rank per game | `(game_id, user_id, matched_category_rank)` — one match per rank PER PLAYER per game |
| **`submit_guess` correct-guess terminal**  | 4 total correct rows → `play_state='solved'`, all `{won: true}` | Caller's 4th correct → `play_state='solved_compete'`, caller `{won: true}`, others `{won: false}` |
| **`submit_guess` mistake terminal**        | First row's mistake_count hits 4 → `play_state='lost'`, all `{won: false}` | MIN(mistake_count) across all players ≥ 4 → `play_state='lost_compete'`, all `{won: false}` |
| **eliminated mid-game**                    | Game would already be terminal — no in-between state        | Caller can no longer submit; game continues for survivors            |
| **`submit_timeout` terminal**              | `play_state='lost'`, outcome `lost_timeout`                 | `play_state='lost_compete'`, outcome `lost_compete_timeout`          |
| **FE opponent visibility**                 | N/A (everyone's on the same team)                           | OpponentStrip showing per-player mistake counts; no peer guesses, no peer matched-counts |
| **FE GuessHistory**                        | Every guess with username attribution                       | Only caller's guesses (RLS filters server-side)                      |
| **GameOverModal verdict**                  | "You win!" / "You lost: out of mistakes/time" (team)        | "You won the race!" / "Beaten to the punch." / "Everyone eliminated — nobody won." |

The shape that's the same in both modes:
- The `connections.games` table (modulo the `mode` value).
- The `connections.players` table structure (one row per player; only the update mechanics differ).
- The `connections.guesses` table rows (modulo the `mode` denorm + RLS).
- The setup blob (`{ puzzleId, timer }`) — same fields, same defaults.
- The `board` jsonb stays publicly readable in both modes (FE-knows holds — see below).
- `common.games.title` formula and the per-game `common.game_players.result` shape.

### Why no `tiles` table, no separate "matched categories" table

In codenamesduet, the 25 words live in their own `codenamesduet.words` table — one row per tile, with reveal state. connections doesn't need that because:

1. The tile order is static (shuffled once at create_game time, never mutated).
2. The "is this tile still on the board?" check is derived: a tile is removed from play when its category appears as a `result='correct'` row in the guess log (per-player in compete; club-wide in coop, since coop everyone shares the same matched set).

So `tileOrder` lives in the `board` jsonb alongside `categories`, and the FE filters out matched tiles at render time. Saves a 16-rows-per-game table for nothing.

Race-idempotency for concurrent correct submissions is provided by the two mode-aware partial unique indexes on `guesses` (see the [Tables section](#tables) above for the exact predicates) — coop enforces one correct row per rank per game; compete enforces one per rank PER PLAYER per game.

## RPCs

All `security definer`, granted only to `authenticated`, search_path pinned to `connections, common, public, extensions`.

### `connections.create_game(target_club text, setup jsonb, player_user_ids uuid[], mode text) → table(id uuid)`

The one entry point. **One RPC for both modes** — the `mode` parameter:

- Routes the gametype string to `'connections_coop'` or `'connections_compete'` on `common.games.gametype`.
- Lands on `connections.games.mode` for RLS branching.
- Triggers the player-count check (compete requires ≥2).
- Drives the per-mode terminal-state vocabulary that `submit_guess` writes later.

Verifies caller is a club member, validates `setup.puzzleId` (must be a uuid that exists in `connections.puzzles`) and `setup.timer` shape (see [Timer](#timer-server-authoritative-ticks)), loads the puzzle's categories, shuffles the 16 tiles into `board.tileOrder`, builds the title as `"#<source_id> <nyt_date> (<TILE1>/<TILE2>)"` where TILE1/TILE2 are the first 2 alphabetical tiles across all 16. Calls `common.create_game(target_club, 'connections_<mode>', player_user_ids, title, setup, setup)` which inserts the `common.games` header (`is_current_view=true`, `play_state='playing'`, with `setup` persisted on `common.games.setup`), then inserts the `connections.games` row with `mode` + `puzzle_id`, then inserts one `connections.players` row per player_user_ids entry with `mistake_count=0`. The board is a copy of the puzzle's categories + this game's shuffled tileOrder; the puzzle row stays pristine.

Reject reasons: not authenticated; not a member; `mode` not in `{coop, compete}`; compete with <2 players; >6 players; missing/malformed `setup.puzzleId`; `setup.puzzleId` doesn't reference a known puzzle (P0002 `'puzzle not found'`); bad `setup.timer` shape.

**Player-count gates:**
- Coop: `common.require_player_count_max(player_user_ids, 6)`. Matches `numberOfPlayers: [1, 6]`. No minimum-of-2; solo play is fine.
- Compete: same max-6 plus `array_length(player_user_ids, 1) >= 2`. Matches `numberOfPlayers: [2, 6]`.

### `connections.submit_guess(target_game uuid, tiles text[], result text, matched_category_rank int default null)`

The only mid-game action. Validates the payload shape (4 tiles, valid result enum, rank present iff correct), then branches on `connections.games.mode`. `SELECT FOR UPDATE` on the gametype row serializes concurrent submissions in both modes.

**Coop branch:**
- `correct` → insert a row with `mode='coop'` (partial unique on `(game_id, matched_category_rank)` filtered to `result='correct' AND mode='coop'` catches dup-races); count correct rows; 4 → `play_state='solved'`, all players `{won: true}`.
- `wrong` / `oneAway` → insert row; UPDATE every `connections.players` row `mistake_count = mistake_count + 1`; if hits 4 → `play_state='lost'`, all players `{won: false}`.

**Compete branch:**
- Caller eliminated check (`connections.players.mistake_count >= 4` for caller) raises P0001 'you are eliminated from this game'.
- `correct` → insert a row with `mode='compete'` (partial unique on `(game_id, user_id, matched_category_rank)` filtered to `result='correct' AND mode='compete'` catches same-player dup-races; different players can match the same rank, each gets their own row); count caller's correct rows; 4 → `play_state='solved_compete'`, caller `{won: true}`, opponents `{won: false}`. Race ends instantly — survivors with remaining lives no longer get to submit.
- `wrong` / `oneAway` → insert row; UPDATE only the caller's `connections.players` row; check `MIN(mistake_count)` across all players ≥ 4 → `play_state='lost_compete'`, all `{won: false}`. Caller-just-eliminated-but-others-alive lets the game continue.

The PL/pgSQL **does not re-evaluate** the guess against `board.categories` — that's the FE-knows trade, preserved in both modes (see [the FE-knows section](#the-fe-knows-the-answer-decision) above for the cheating-incentive note that's specific to compete).

Reject reasons: not authenticated; not a club member; play_state ≠ playing; tile count ≠ 4; bad result enum; missing or out-of-range `matched_category_rank` when result is correct; (compete only) caller is eliminated.

### `connections.submit_timeout(target_game uuid)`

Fires when the countdown timer expires. Mode-aware terminal:
- Coop: `play_state='lost'`, status `{outcome: 'lost_timeout', mistake_count, matched_count}`.
- Compete: `play_state='lost_compete'`, status `{outcome: 'lost_compete_timeout'}`. Everyone `{won: false}` — the race ended without a winner; that's a collective loss.

Idempotent — a second concurrent call on the already-terminal game raises `P0001 "game is not in progress"`, which the FE swallows. See [Timer](#timer-server-authoritative-ticks).

### `connections.end_game(target_game uuid) → void`

The "End game" menu item fires this — the manual, **neutral** stop available in both modes. Where `submit_timeout` writes a "you lost" terminal, `end_game` writes `play_state='ended'` with status `{outcome: 'manual', mode}` and every player `{won: false}`: the friends agreed to quit, so nobody won and nobody lost. The FE renders the green "Game ended" `GameOverModal` (outcome `'won'` with neutral copy), not the red loss modal; `labelFor` learns `'ended'` in both manifests. Any current game player can call it (same `require_game_player` gate as `submit_guess`).

Same shape as `submit_timeout` but with one extra wrinkle: a **Realtime touch** at the tail (`update connections.games set club_handle = club_handle where id = target_game`). `submit_guess`/`submit_timeout` each also write a `connections` table on their way to `common.end_game`, so the FE's `useGame` subscription (postgres_changes on `connections.{games,guesses,players}`) wakes naturally. `end_game` writes *only* `common.games` via `common.end_game`, so without the self-set WAL entry the FE would never refetch and the modal would never pop until a reload. Same trick `spellingbee.end_game`/`spellingbee.submit_timeout` use. Idempotent — a second call raises `P0001 "game is not in progress"`, which the FE swallows.

Terminal transitions in `submit_guess`, `submit_timeout`, and `end_game` write `common.games.play_state` + `is_terminal=true` + the `status` jsonb via `common.end_game`. They do **not** clear `is_current_view` — a terminal game stays in the club's current slot until the last viewer leaves (review-the-final-state is a legitimate use case for the current view).

## Row-level security

All three tables (`games`, `players`, `guesses`) have RLS enabled.

- **`games`** + **`players`** are club-wide visible: `using (common.is_club_member(club_handle))` (games) / EXISTS via `connections.games` join (players). Every club member sees every player's mistake_count in both modes — that's the "opponents see remaining mistakes but not guesses" property.

- **`guesses`** is mode-aware, mirroring `psychicnum.guesses_select`:

  ```sql
  create policy guesses_select on connections.guesses
    for select to authenticated
    using (
      exists (
        select 1 from connections.games g
         where g.id = guesses.game_id
           and common.is_club_member(g.club_handle)
           and (guesses.mode = 'coop' or guesses.user_id = auth.uid())
      )
    );
  ```

  Coop: any club member sees any guess. Compete: club members only see their own guesses. The `guesses.mode` denorm is what lets the policy branch without joining to `connections.games` on every visibility check.

No INSERT/UPDATE/DELETE policies. All writes go through the security-definer RPCs.

`grant select` lists all columns on each table — `board` is publicly readable, unlike `psychicnum.games.target` (which is column-grant-excluded). See "FE-knows" above for the rationale; the trade is preserved in compete despite the cheating incentive.

`connections.puzzles` has no RLS — puzzles are public knowledge. The `service_role` separately has INSERT (used by the import script); `authenticated` has only SELECT.

## Puzzles

A *puzzle* is a prewritten board shape — one date's NYT Connections puzzle, imported from the [Eyefyre/NYT-Connections-Answers](https://github.com/Eyefyre/NYT-Connections-Answers) JSON archive. Puzzles stay pristine in `connections.puzzles`; games copy from them at create-time into `games.board` (along with this game's shuffled `tileOrder`). The split is the same vocabulary you'd use for crosswords: the puzzle is the source, the board is the played instance. See [naming.md → puzzle vs. board](../naming.md).

### Schema shape

```
connections.puzzles {
  id          uuid PK
  source_id   text unique     -- NYT puzzle number ("1", "500"); text so a
                                  future "500-bonus" doesn't break the schema
  nyt_date    date unique     -- NYT publication date; drives the FE picker
  categories  jsonb           -- same shape as games.board.categories
  imported_at timestamptz
}
```

### Import script

[`supabase/scripts/import-connections-puzzles.ts`](../../supabase/scripts/import-connections-puzzles.ts), run via `npm run connections:import`. Fetches the connections.json from Eyefyre's repo (or `--file <path>` for offline), maps the upstream `{id, date, answers:[{group, members}]}` shape to our `{source_id, nyt_date, categories:[{rank, name, tiles}]}` shape, upserts on `source_id` with `ignoreDuplicates: true`. Re-runs are no-ops on already-imported rows.

Two upstream-shape notes worth keeping in mind:
- The `level` field is dropped in later upstream records, so the importer uses the array index as `rank` (the array is always in rank order).
- Upstream `group` → our `name`, upstream `members` → our `tiles`.

For v1 this script is run manually. It graduates to a scheduled job (GitHub Action or Supabase Edge Function with `pg_cron`) when the manual run gets annoying enough.

### Title formula

`"#<source_id> <nyt_date> (<TILE1>/<TILE2>)"` where TILE1/TILE2 are the first 2 alphabetical tiles across all 16. Example: `"#1 2023-06-12 (BUCKS/HAIL)"`. Built at create_game time from the puzzle's data, so it carries forward unchanged for the life of the game. Each puzzle's NYT number + date is the canonical identity; the 2 tiles ground it in something memorable ("oh, the one with BUCKS and HAIL").

## Frontend

### Folder layout

```
src/connections/
  manifest.ts             TWO GameManifest entries (connectionsCoopGame + connectionsCompeteGame)
                          sharing all the loaders below; differ on gametype string, name,
                          numberOfPlayers, and the mode passed to startGameInClub. See the
                          sibling-manifest pattern section above.
  db.ts                   export const db = supabase.schema('connections')
  theme.css               NYT rank palette (yellow/green/blue/purple = --connections-rank-0..3).
                          Imported by PlayArea.tsx so it loads with the chunk.
  logo.svg                connections's game-tile / launcher icon, referenced from the manifest.

  components/
    PlayArea.tsx          Shared between the two manifests. Branches on game.mode for the
                          shared <OpponentStrip> (common/components/OpponentStrip, compete-only)
                          and the eliminated-spectator state. Loads via useGame, derives
                          remaining-tiles and ownerByTile, mounts the pieces, owns the
                          submit/clear handlers. Mounted by <GamePage> as its render-prop child.
    PlayArea.module.css
    CategoryBands.tsx     The colored matched-category bands above the tile grid (plus the
                          unmatched-revealed bands rendered on game-over loss OR on compete
                          per-player elimination). Pulls the RANK_TOKEN rank → CSS-variable
                          map from lib/rankColors.
    TileGrid.tsx          The 4×4 of remaining tiles + per-tile isMine/isPeer attribution.
                          Pure render — degenerate to "all mine, no peers" in compete because
                          useGame's broadcast send is suppressed there (the selections map
                          only ever contains the caller).
    MistakeDots.tsx       NYT-style mistakes indicator — a row of dots, one per allowed
                          mistake, filled for remaining and dimmed for used (default budget 4).
    MistakeDots.module.css
    GuessHistory.tsx      The append-only log of this game's guesses, rendered beside the
                          board. Stateless/presentational; mirrors psychicnum's <GuessHistory>.
    GuessHistory.module.css
    HintModal.tsx         Reveal-on-demand hint panel: one row per category, each gated behind
                          a "Reveal" button that surfaces that category's first tile. Purely
                          client-side per-player state (a Set of revealed ranks) — never
                          broadcast or persisted. Uses the shared <FloatingPanel> shell.
    HintModal.module.css
    SetupForm.tsx         Puzzle date picker + timer-mode field. Fetches the puzzle list +
                          (mode-scoped) club_game_status for the calendar overlay. Defaults
                          to today's puzzle if available, else the most recent.
    SetupForm.module.css
    Calendar.tsx          The month-grid date picker used by SetupForm. Colors each day square
                          by the club's outcome for that date (won / lost / in-progress) and
                          gates clickability to dates with an imported puzzle.
    Calendar.module.css
    Help.tsx              connections's help / rules modal (placeholder content), opened from the
                          GamePage menu — implements the manifest's `help` contract.

  hooks/
    useGame.ts            Owns postgres-changes (games / guesses / players) on a stable
                          per-game channel `connections:${gameId}` (stable because coop's
                          selection Broadcast needs a shared room across peers). Returns
                          mode-aware projections: mistakeCount (caller's row),
                          opponentMistakes (Map for compete; empty in coop), isEliminated.
                          Cross-cutting state (presence, manual-pause, members, timer) lives
                          on common's useCommonGame, consumed by GamePage.

  lib/
    board.ts              Wire types for the `board` jsonb (Category, Board, CategoryRank).
    evaluate.ts           Pure rules engine: 4-of-4 → correct, 3-of-4 → oneAway.
    evaluate.test.ts      Unit tests for the boundary cases.
    setup.ts              ConnectionsSetup type (puzzleId + timer) + defaults.
    rankColors.ts         RANK_TOKEN: rank 0..3 → `--connections-rank-N` CSS-variable lookup.
                          Standalone file so components can import it without tripping Vite
                          Fast Refresh's "components-only file" rule. Consumed by CategoryBands
                          and HintModal.
    localOrder.ts         Per-player local-shuffle ordering helpers (Fisher–Yates shuffle +
                          reset). Purely view-local — no broadcast, no server write; losing
                          the order on pause is fine.
    localOrder.test.ts    Unit tests for the shuffle/reset helpers.
    monthGrid.ts          Pure month-grid layout helper extracted from Calendar (so the
                          component file holds only React). Returns the 7-wide cell array
                          with leading-blank / trailing-pad nulls for a given year+month.
    monthGrid.test.ts     Unit tests for the grid-layout edge cases.
```

### Realtime: two channels

Two channels — one common-side, one connections-side — both stable-named because each carries broadcasts that need to merge across peer tabs:

| channel | who opens it | what rides on it |
|---|---|---|
| `game:${gameId}` (stable, no suffix) | `useCommonGame` | Presence + manual-pause Broadcast. Stable name because broadcast + presence only merge across clients with matching channel names. StrictMode handled by the hook's own `removeChannel()` cleanup. |
| `connections:${gameId}` (stable, no suffix) | connections's `useGame` | Postgres-changes on `connections.{games, guesses, players}` AND shared-selection Broadcast (select / deselect / clear). Same channel because supabase-js requires every `.on()` to be registered before `.subscribe()` — one hook per channel keeps registration synchronous. The Broadcast send is suppressed in compete (see [Peer selection](#peer-selection-broadcast--presence-pattern-coop-only)) so compete tabs effectively use this channel as postgres-changes-only. |

See `docs/code-conventions.md` → "Realtime channel names" for the cache-shape framing.

### `matchedCategories` is a projection

The FE doesn't query a "matched categories" table — there isn't one. `useGame` projects `matchedCategories` by walking the `guesses` log, filtering to `result='correct'`, and joining each row's `matched_category_rank` to the static `board.categories[]`. The DB's partial unique indexes guarantee at most one correct guess per (game, rank) in coop, and at most one per (game, user, rank) in compete; the projection has at most 4 entries per player. Compete callers see only their own correct guesses (RLS filters server-side), so the natural projection yields per-player matched-categories without any FE branch — the data shape is the same; the data simply degenerates.

### Peer selection: Broadcast + Presence pattern (coop only)

connections is the first place in this codebase that uses Realtime Broadcast and Presence (everything else uses only Postgres Changes). The pattern is worth documenting because it'll repeat for future coop games with transient shared state.

**Selection semantics (coop):** click acts on the **union** of all players' selections, not on each player's private list. Each tile has at most one contributor; clicking a tile already in the union removes it (regardless of who put it there); clicking an unselected tile adds it to MY contribution. Submit / "deselect all" / pause-on-disconnect all broadcast a `clear` event that empties every client's local map.

**Compete selection is private.** Each player has their own selection state — opponents never see what you're hovering on. The implementation: useGame's `broadcast()` short-circuits when `game.mode === 'compete'` (local apply only, no `channel.send`). Peer compete clients also short-circuit, so no foreign selection events arrive. The selections map only ever contains the caller's tiles; ownerByTile resolves to caller; TileGrid renders every selected tile as "mine" without the per-tile peer-attribution code activating. Same shape, degenerate data — no separate compete-TileGrid branch needed.

**Why Broadcast (not Presence-state) for the coop selection:** events are the natural unit here ("I selected X", "deselect X"). The state is reconstructable by listening from the moment you join — and we don't worry about late-joiners or mid-session rejoins because [we pause the game on any disconnect](#pause-presence-driven--manual). State lives in client memory, gets reset on every pause.

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

**Clean-by-unmount.** connections's shared-tile selections live in component-local state inside `useGame` (the per-tab map of `tile → contributorId`). Because `PauseBoundary` unmounts the PlayArea on pause, that state disappears with it — no explicit `sendClear`-on-pause-transition wiring needed. Reconnecting peers see a clean grid. This is the canonical example of the "should this survive a pause?" rule from [`common.md`](../common.md): selections are *intrinsically* pause-transient, so they sit in PlayArea-local state and the unmount handles cleanup for free. `sendClear` (still on `useGame`) is now only used for the post-submit clear after a guess resolves.

**Manual-pause persistence across mid-game peer reconnects:** if Bea is in a manually-paused game, then Ada drops + reconnects, Ada's local state would otherwise not know about the manual pause. The hook handles this by **re-broadcasting active manual-pause on every Presence change** — any client that observes a manual pause rebroadcasts when a peer joins. Idempotent receivers + broadcast-is-cheap make "everyone re-broadcasts on every presence change" the simplest robust shape. Lives in `useCommonGame.ts` now (alongside the rest of the presence + manual-pause plumbing).

**Paused vs suspended** — code-level terminology distinction worth knowing:

- **Paused** (this overlay + the `PauseBoundary` wrapper + `computePause` helper): the transient gameplay-pause state — same UX as a video player's pause: clock stops, no moves accepted, overlay shows. Triggers: presence-disconnect or manual Pause button (both shipped). Resolves automatically when presence comes back, or when anyone clicks Resume.
- **Suspended** (club-level concept in `common.md`): persistent, "this game's `common.games.is_current_view` is false but it isn't terminal either." Caused by another game being started in the club, or by the last viewer leaving via the suspend-confirm modal. Resolves when someone navigates back to the game (which fires `common.set_current_view` and re-flips it to current).

The two never coexist on the same game — a suspended game isn't being looked at by anyone, so there's no Presence channel to track pauses for it.

**Rollout status:** every registered gametype (both connections modes, both psychicnum modes, codenamesduet, spellingbee) inherits pause for free via `<GamePage>` + `useCommonGame` — the `computePause` helper + `PauseOverlay` + `PauseBoundary` machinery runs uniformly under every gametype that mounts the common shell. No per-gametype wiring is required. **One caveat in connections compete:** an eliminated player is still in `members`, so leaving their tab drops their Presence and pauses the game for survivors. Annoying but tolerable for v1 — see `deferred.md` / the next-session pickup memory for the planned fix.

### Timer (server-authoritative ticks)

The timer is a **per-game setup choice**, not a manifest-level constant. The setup dialog renders a None / Up / Down radio + an MM:SS input for the count-down case (1 second to 60 minutes); the choice lives on `common.games.setup.timer` and is server-side validated in `create_game`. The default is countdown 10:00. When a count-down hits 0, the FE fires `connections.submit_timeout` and the game's play_state flips to the mode-appropriate terminal value — `lost` in coop, `lost_compete` in compete.

**An additive tick count, not wall-clock-minus-gaps.** The clock is one integer — `common.timers.ticks`, the number of whole seconds of *active play* (see [common.md → Timer](../common.md#timer)). Every actively-playing client calls `common.tick_timer` once a second; its conditional (`now() - last_tick >= 1 second`) advances `ticks` by at most 1 per real second. The FE derives the display: countdown shows `max(0, duration - ticks)`, countup shows `ticks`.

**Why additive.** Pause and "nobody viewing" need *no tracking* — when the game is paused, or no one is on the page, nobody calls `tick_timer`, so the clock simply stops. A second with no tick is, by construction, a second that didn't count. This replaced a subtractive `now - startedAt - pause - idle` computation that needed a server idle accumulator (folded on every view transition) *and* a client pause accumulator — both gone.

**Robust by construction.** Because the count only moves while someone is actively ticking, a navigate-away / browser crash / tab kill just stops it — there's no "remember to record the gap" write to miss. (This is what retired the old "leaving the page doesn't pause the timer" bug + the idle-accumulator leak.) The server's `now()` is the authority, so a client's clock skew or a throttled background-tab `setInterval` can only *trigger* an attempt, not move the count.

**Accuracy + smoothness.** A pause costs ±~1s (the resume tick is `+1`, not the gap). The display updates once per `tick_timer` round-trip, so the second-flip carries the network latency as jitter — invisible for friendly word games. If perfectly-smooth display ever matters, local interpolation between ticks is an easy add; we deliberately kept it simple.

**The `useGameTimer` hook** (`src/common/hooks/useGameTimer.ts`) implements this: a one-time read of `ticks` to seed the display, then a 1Hz driver that calls `tick_timer` while the game is live, not paused, and timed (stopping the driver *is* the pause/idle mechanism). `ticks` only moves forward locally (`Math.max`), so an out-of-order response can't rewind the display.

**Timeout-loss firing.** When `useGameTimer` (inside `useCommonGame`) reports `expired: true`, GamePage dispatches the connections manifest's `submitTimeout`, which calls `connections.submit_timeout(target_game)`. The RPC is idempotent: it raises `P0001 "game is not in progress"` if the game has already ended, which can happen if two clients race the expiry. The FE swallows that specific error silently — realtime propagates the loss state to all clients within ~200ms.

**Where the mode comes from.** Per-game (like connections) lives in `common.games.setup.timer`; `useCommonGame` reads it and drives `useGameTimer`, surfacing the result via GamePage. Per-gametype (a hypothetical Boggle with a fixed-3-minute round) would set `timerMode` on the manifest and skip a per-game choice. Both shapes are supported. Each game writes its own timeout-loss RPC (since the loss semantics differ — boggle would end the round, codenamesduet might enter sudden-death, etc.) and exposes it through its manifest's `submitTimeout`, which GamePage fires on countdown expiry.

### Code-splitting

Same pattern as codenamesduet and psychicnum — the manifest's `PlayArea` is lazy-loaded (`React.lazy(() => import('./components/PlayArea'))`). The Vite build emits connections's JS + CSS as separate chunks; users who only play codenamesduet never download it. The lazy boundary for the SetupForm is separate (also lazy via the manifest's `setupForm.Component` field) so the form lands in connections's chunk too.

## Tests

### pgTAP files

| file | covers |
|---|---|
| `tests/connections/create_game_test.sql` | Coop-mode create_game: auth, membership, setup.puzzleId validation (missing / bad uuid / not-found), setup.timer shape validation, returns id row, mistake_count initial values (on connections.players), board shape, games.puzzle_id linkage, setup persistence, active-flag tracking, title formula. |
| `tests/connections/gameplay_test.sql` | Coop-mode submit_guess: payload validation, member-only enforcement, wrong/oneAway → players.mistake_count++ in lock-step, correct → guesses row + win check, 4-correct → play_state='solved', 4-mistakes → play_state='lost', race idempotency on the coop partial unique index, submit_timeout happy + idempotency. |
| `tests/connections/compete_test.sql` | Compete-mode delta: mode validation (rejects invalid mode), compete with <2 players rejected, per-player mistake decrement (caller's row only), per-player partial unique index allows different players to match same rank, first-to-all-4 → solved_compete (winner {won:true}, others {won:false}, opponents can't submit post-win), elimination + collective loss → lost_compete, eliminated player's submit rejected, submit_timeout writes lost_compete + lost_compete_timeout, RLS scopes guesses caller-only while leaving players club-wide visible. |
| `tests/connections/rls_test.sql` | dee (non-member) sees zero rows from both tables; mutating RPCs throw with 42501; direct INSERT into game tables is blocked at the grant layer. Includes a positive baseline (ada CAN see her own game). |

### Per-game `setup.psql` helpers

Promoted out of inline test fixtures because every connections test needs them and they're non-trivial:

- **`pg_temp.connections_puzzle() → uuid`** — inserts a known fixture puzzle (`source_id='TEST-FIXTURE'`, `nyt_date='1900-01-01'`, deterministic A/B/C/D-words categories) and returns its id. SECURITY DEFINER so it works regardless of which role the calling test has switched into. The fixture's date and source_id are deliberately alien to real NYT data so tests don't collide with imported puzzles.
- **`pg_temp.connections_setup(puzzle_id uuid, timer jsonb default ...) → jsonb`** — build a valid create_game setup payload referencing a puzzle. Defaults to a 10-minute countdown; tests override `timer` to exercise specific validation paths. Tests that need a *missing* field (no puzzleId, no timer) skip this helper and build jsonb_build_object inline so the malformed shape reads at the call site.

### FE tests

| file | covers |
|---|---|
| `src/connections/lib/evaluate.test.ts` | The pure-function evaluator: 4-of-4 → correct (with rank + name + tiles), 3-of-4 → oneAway, 0..2 overlap → wrong, fewer-than-4 input → wrong (defensive), order independence, returned-tiles defensive-copy. |

No FE test for the broadcast / presence plumbing — per [testing.md → What we don't test](../testing.md#what-we-dont-test), realtime is the kind of integration the project covers by manual browser smoke. The hooks are exercised through the PlayArea there.

## Future work

Tracked in [`deferred.md`](../deferred.md). The connections-specific ones today:

- **Scheduled puzzle import.** Today's `npm run connections:import` is manual. Graduates to a GitHub Action or a Supabase scheduled Edge Function when the manual cadence gets annoying enough.
- **Per-tile rise-and-fade animations** on category match. The wrong-guess shake exists; the match-resolved animation doesn't.

## File locations

| asking… | look at… |
|---|---|
| What does the create_game / submit_guess RPC do | [`supabase/migrations/20260615000003_connections.sql`](../../supabase/migrations/20260615000003_connections.sql) — the full schema + RPCs, both modes |
| What does compete mode look like at the schema level | Same file — `mode` columns, the `players` table, mode-aware partial indexes + RLS, the RPCs' per-mode branches, and the `connections_coop`/`connections_compete` gametype rows |
| How does the FE branch on mode | [`src/connections/components/PlayArea.tsx`](../../src/connections/components/PlayArea.tsx) (OpponentStrip + buildOver + eliminated state) and [`src/connections/hooks/useGame.ts`](../../src/connections/hooks/useGame.ts) (mistakeCount / opponentMistakes / isEliminated projections + broadcast short-circuit) |
| Where the FE-knows rationale lives | this file (above) + the same migration's header comment |
| How are puzzles imported | [`supabase/scripts/import-connections-puzzles.ts`](../../supabase/scripts/import-connections-puzzles.ts) — run via `npm run connections:import` |
| What does the play surface look like | [`src/connections/components/PlayArea.tsx`](../../src/connections/components/PlayArea.tsx) (mounted as the render-prop child of `<GamePage>` from App.tsx) |
| What does the tile grid look like | [`src/connections/components/TileGrid.tsx`](../../src/connections/components/TileGrid.tsx) (per-tile self/peer attribution; peer-frame degenerate-unused in compete) |
| What does the category-band render look like | [`src/connections/components/CategoryBands.tsx`](../../src/connections/components/CategoryBands.tsx) (matched + unmatched-revealed bands; owns `RANK_TOKEN`) |
| How shared selection works | [`src/connections/hooks/useGame.ts`](../../src/connections/hooks/useGame.ts) (the `apply` callbacks + `toggleTile` + selection-events broadcast; `broadcast()` short-circuits to local-only in compete) |
| How `matchedCategories` is projected | [`src/connections/hooks/useGame.ts`](../../src/connections/hooks/useGame.ts) (the projection at the bottom of the hook) |
| The pause-on-disconnect pattern | [`src/common/lib/pause.ts`](../../src/common/lib/pause.ts) + [`src/common/components/PauseOverlay.tsx`](../../src/common/components/PauseOverlay.tsx) + [`src/common/components/PauseBoundary.tsx`](../../src/common/components/PauseBoundary.tsx) |
| The browser-side timer | [`src/common/hooks/useGameTimer.ts`](../../src/common/hooks/useGameTimer.ts) + the connections setup dialog's timer field |
| The evaluator | [`src/connections/lib/evaluate.ts`](../../src/connections/lib/evaluate.ts) |
