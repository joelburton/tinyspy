# Wordknit

A NYT-Connections-style word-grouping puzzle. The third registered gametype in this monorepo, and the first to introduce several new patterns: FE-evaluated rules, shared selection state via Supabase Realtime Broadcast, and the "pause the game when a peer disconnects" pattern.

"Wordknit" is the codename (analogous to how "Tinyspy" is the codename for Codenames Duet). User-facing copy is "Wordknit"; folder / schema / RPC names are all `wordknit`.

For the shared layer (clubs, profiles, routing, the registry) see [`common.md`](common.md). For testing conventions + persona shapes see [`testing.md`](testing.md). For per-gametype comparisons see [`tinyspy.md`](tinyspy.md) and [`psychicnum.md`](psychicnum.md).

## What the game is

A 4×4 board of 16 words split into 4 hidden groups of 4 by theme. Players select 4 tiles and submit a guess. The server evaluates against the answer key:

- **correct** — all 4 in one group: the group resolves into a colored band, the tiles leave the grid.
- **oneAway** — exactly 3 of 4 in a single group: NYT's hint that you're close; counts as a mistake.
- **wrong** — otherwise: also counts as a mistake.

You lose at 4 mistakes; you win by finding all 4 groups. On a loss, the un-found groups are revealed to the player.

Levels 0..3 map to NYT's yellow / green / blue / purple band colors — increasing difficulty in the original puzzle. Tokens in [`theme.css`](../src/wordknit/theme.css).

## POC scope (current state)

This is the first port of an existing personal project ([`../connections`](https://github.com/joelburton/...)) into this codebase. The POC implements the core wiring — game lifecycle, real shared coop play, the pause-on-disconnect pattern — with a **hardcoded board**: 16 words, 4 groups (A-words / B-words / C-words / D-words). Easy to verify visually; impossible to actually challenge anyone with.

In scope today:
- 4-mistake-lose, oneAway feedback, dup-guess-doesn't-hurt
- Reveal-on-loss (the FE reads `board.groups` directly — no separate RPC, see "FE-knows" below)
- Shared selection across all connected players via Broadcast
- Pause-on-disconnect overlay via Presence
- Common chat (the existing `ClubChatPanel`)

Deliberately deferred (per the architecture-shake-out priority):
- Hint feature ("show me the first word of each group")
- Scratchpad (the connections repo's collaborative-editor takeover-lock thing)
- Per-tile rise-and-fade animations
- Per-tile contributor ring (visual attribution of *who* selected what — the data is there in `useSharedSelection`, the rendering isn't yet)
- Per-player local shuffle
- Real puzzle data (NYT archive importer)
- The setup dialog's actual content (puzzle-date picker)
- Calendar / "puzzle of the day"
- Share dialog (the club is our share vehicle)
- "Play next puzzle" affordances

## The "FE-knows-the-answer" decision

Unlike tinyspy and psychic-num — where the server holds a secret and validates moves against it — wordknit's board (groups + tile order) is **publicly readable** by every club member. The FE has the answer key. The `submit_guess` RPC trusts the FE's verdict (correct / oneAway / wrong + matched_level) and just records it, applying atomicity for the shared state (mistakes counter, found_groups idempotency via PK).

**Why:** the evaluator is a small pure function (`evaluateGuess` in [`src/wordknit/lib/evaluate.ts`](../src/wordknit/lib/evaluate.ts) — ~15 lines), nothing on the board is genuinely secret in this codebase's deployment, and the friends-only audience per [CLAUDE.md → Trust model](../CLAUDE.md#trust-model--server-authoritative-for-cleanliness-not-anti-cheat) doesn't justify column-grant + PL/pgSQL evaluation infrastructure. Psychic-num's column-grant pattern is documented as the canonical "true server-side secret" example; reading [that file's "hidden-target mechanic" section](psychicnum.md#the-hidden-target-mechanic) is enough — repeating the pattern here for a non-secret game would be educational noise.

**What stays server-authoritative regardless:** atomic mutations of shared state. The `mistakes += 1` and `status = 'lost'` flips need to be the same transaction. Concurrent submissions ("two players hitting Submit at the same instant") still need a serializer — `SELECT FOR UPDATE` on the game row, same as psychic-num. Found-groups idempotency comes from the PK on `(game_id, level)` — if two clients race a 'correct' submission, the second INSERT raises `unique_violation` and `submit_guess` catches and silently no-ops.

**If wordknit ever ships beyond friends:** the migration to flip back is straightforward — hide the `board` column via column-level grant, add a server-side evaluator in PL/pgSQL, drop the FE's `result` / `matched_level` parameters from `submit_guess`. The architectural shape is small enough that the future-proofing is conceptual, not structural.

## Schema: `wordknit.*`

### Tables

| table | purpose |
|---|---|
| `games` | One row per playthrough. `club_id` (not null) ties to `common.clubs`. Holds `status`, `mistakes`, `board` (jsonb — groups + tileOrder — publicly readable), `config` (jsonb — currently empty; future date-picker). |
| `guesses` | Append-only log of every submission. `result` is `'correct' \| 'oneAway' \| 'wrong'`; `matched_level` is non-null iff result is correct. |
| `found_groups` | Append-only list of revealed groups. PK on `(game_id, level)` provides the idempotency / race protection for concurrent 'correct' submissions on the same group. |

### Status enum

`games.status text not null check (status in ('in_progress', 'solved', 'lost'))`

- **in_progress** — guesses being submitted. The default; no other entry state.
- **solved** — all 4 groups have been found. Terminal.
- **lost** — mistakes hit 4. Terminal.

### Why no `tiles` table

In tinyspy, the 25 words live in their own `tinyspy.words` table — one row per tile, with reveal state. Wordknit doesn't need that because:

1. The tile order is static (shuffled once at create_game time, never mutated).
2. The "is this tile still on the board?" check is derived: a tile is removed from play when its word appears in any `found_groups` row.

So `tileOrder` lives in the `board` jsonb alongside `groups`, and the FE filters out found tiles at render time. Saves a 16-rows-per-game table for nothing.

## RPCs

All `security definer`, granted only to `authenticated`, search_path pinned to `wordknit, common, public, extensions`.

### `wordknit.create_game(target_club uuid, config jsonb) → table(id uuid)`

The one entry point. Verifies caller is a club member, builds the hardcoded POC board (4 groups × 4 members), shuffles the 16 tiles into `board.tileOrder`, inserts the row in `in_progress`, upserts `common.club_active_game`.

Reject reasons: not authenticated; not a member.

**No minimum-club-size check** — wordknit plays with any club size (matches the manifest's `numberOfPlayers: [1, null]`).

### `wordknit.submit_guess(target_game uuid, tiles text[], result text, matched_level int default null)`

The only mid-game action. Validates the payload shape (4 tiles, valid result enum, level present iff correct), then records what the caller tells it. For `correct`: inserts into `found_groups` (PK as idempotency), records the guess, checks win (4 found → solved). For `wrong` / `oneAway`: records the guess, increments `mistakes`, checks loss (4 mistakes → lost).

`SELECT FOR UPDATE` on the games row serializes concurrent submissions.

The PL/pgSQL **does not re-evaluate** the guess against `board.groups` — that's the FE-knows trade. (See the file-header note in [`supabase/migrations/*_wordknit_baseline.sql`](../supabase/migrations/20260614000005_wordknit_baseline.sql).)

Reject reasons: not authenticated; not a club member; game not in progress; tile count ≠ 4; bad result enum; missing matched_level when result is correct.

### `wordknit.clear_active_on_termination` (trigger)

Fires on `status` UPDATE from `in_progress` to terminal. Deletes the matching `common.club_active_game` row. Same pattern as tinyspy / psychic-num.

## Row-level security

All three tables have RLS enabled with SELECT policies gated on `common.is_club_member(club_id)` (tracing through `wordknit.games` for the child tables via EXISTS subquery — same pattern as `psychicnum.guesses_select`).

No INSERT/UPDATE/DELETE policies. All writes go through the security-definer RPCs.

`grant select` lists all columns on each table — `board` is publicly readable, unlike `psychicnum.games.target` (which is column-grant-excluded). See "FE-knows" above for the rationale.

## Frontend

### Folder layout

```
src/wordknit/
  Root.tsx                Mounted by App.tsx for /g/wordknit/<id>. Receives gameId as prop.
  manifest.ts             GameManifest registration.
  db.ts                   export const db = supabase.schema('wordknit')
  theme.css               NYT level palette (yellow/green/blue/purple).

  components/
    BoardScreen.tsx       The play surface — header, found-group bands, tile grid, actions, pause overlay, chat.
    BoardScreen.module.css
    Setup.tsx             POC placeholder dialog — gestures at the future date picker.

  hooks/
    useGame.ts            Owns the per-game realtime channel. Loads game / guesses /
                          found_groups + the club's members. Postgres-changes drive
                          refetches.
    useSharedSelection.ts Broadcast-driven shared selection state. Click toggles
                          union membership; broadcasts the event; every client
                          (including self) applies the same delta.

  lib/
    board.ts              Wire types for the `board` jsonb (Group, Board, GroupLevel).
    evaluate.ts           Pure rules engine: 4-of-4 → correct, 3-of-4 → oneAway.
    evaluate.test.ts      Unit tests for the boundary cases.
    peerColor.ts          Stable hash userId → 5-color palette.
    peerColor.test.ts     Determinism + distinctness tests.
    config.ts             WordknitConfig type (empty for POC) + defaults.
```

### Realtime: three subscriptions on one channel

The per-game channel is `wordknit:<gameId>:<uuid>`. The UUID suffix is the StrictMode-double-mount workaround used everywhere else in the codebase. One channel carries three different things:

| subscription | purpose | used by |
|---|---|---|
| Postgres Changes | game row / guesses / found_groups events | `useGame` (refetches on each event) |
| Broadcast | shared-selection events (select / deselect / clear) | `useSharedSelection` |
| Presence | "who's connected to this game right now" | `computePause` (returns the paused flag) |

Combining onto one channel keeps the lifecycle clean: one `subscribe()`, one `removeChannel()`. The channel handle is created by `useGame` via `useMemo` so it's available on first render (consumer hooks can wire up handlers immediately, no "waited for first effect to land" gap).

### Peer selection: Broadcast + Presence pattern

Wordknit is the first place in this codebase that uses Realtime Broadcast and Presence (everything else uses only Postgres Changes). The pattern is worth documenting because it'll repeat for future games with transient shared state.

**Selection semantics:** click acts on the **union** of all players' selections, not on each player's private list. Each tile has at most one contributor; clicking a tile already in the union removes it (regardless of who put it there); clicking an unselected tile adds it to MY contribution. Submit / "deselect all" / pause-on-disconnect all broadcast a `clear` event that empties every client's local map.

**Why Broadcast (not Presence-state) for the selection:** events are the natural unit here ("I selected X", "deselect X"). The state is reconstructable by listening from the moment you join — and we don't worry about late-joiners or mid-session rejoins because [we pause the game on any disconnect](#pause-on-disconnect-paused--suspended). State lives in client memory, gets reset on every pause.

**Why Presence (not Broadcast) for "who's here":** Presence is exactly the primitive for this — it auto-cleans up on disconnect (no heartbeat plumbing), and its state-carrier capability gives us a stable list of connected `user_id`s without any custom join/leave protocol. `computePause` derives the `paused` boolean from `presence diff expected members`.

**The split is honest:** events that are events use Broadcast; state that's intrinsically "what is currently true for each connected user" uses Presence. The two complement rather than overlap.

### Pause on disconnect ("paused" ≠ "suspended")

When a peer disconnects, the game **pauses**: a `PauseOverlay` renders over the board (`common/components/PauseOverlay.tsx`), tile clicks are disabled, every client's selection broadcasts a clear. The game stays open and active in the DB; nothing about `common.club_active_game` changes. When the peer reconnects (their tab comes back, their Presence rejoins the channel), the overlay drops and play resumes with empty selections.

**Paused vs suspended** is a real terminology distinction:

- **Paused** (this overlay + helper): the transient gameplay-pause state — same UX as a video player's pause: clock stops, no moves accepted, overlay shows. Triggers: presence-disconnect (today) or manual Pause button (planned). Resolves automatically when the peer's Presence comes back (for presence-pause) or when anyone clicks Resume (for manual-pause). Game is still "active" at the club level.
- **Suspended** (existing club-level concept in `common.md`): persistent, "this game is not the one `common.club_active_game` is pointing at." Caused by another game being started in the club. Resolves when someone navigates to the suspended game and starts playing again.

The two can't coexist on the same game today — a suspended game isn't being looked at by anyone, so there's no Presence channel to track pauses for it.

**Future rollout:** the `computePause` helper + `PauseOverlay` component live in `common/` deliberately so tinyspy and psychic-num can attach the same pattern later. Joel's general principle ("if `#-present` ≠ `#-expected`, the game should pause for UX consistency") applies to all three games. The motivating case here is wordknit (where transient state would be unfair if some players kept clicking through a peer's disconnect), but the pattern transfers cleanly — see the memory note in `~/.claude/projects/-Users-joel-src-codenames/memory/`.

### Code-splitting

Same pattern as tinyspy and psychic-num — `Root` is lazy-loaded in the manifest (`React.lazy(() => import('./Root'))`). The Vite build emits wordknit's JS + CSS as separate chunks; users who only play tinyspy never download it. The lazy boundary for the Setup form is separate (also lazy via the manifest's `setup.Component` field) so the form lands in wordknit's chunk too.

## Tests

### pgTAP files

| file | covers |
|---|---|
| `tests/wordknit/create_game_test.sql` | Auth, membership, returns id row, status/mistakes initial values, hardcoded board shape (4 groups × 4 members, 16-element tileOrder, tileOrder is a permutation), config persistence, club_active_game upsert. |
| `tests/wordknit/gameplay_test.sql` | Payload validation (tile count, result enum, level-iff-correct), member-only enforcement, wrong/oneAway → mistakes++, correct → found_groups insert + win check, 4-found → status=solved, 4-mistakes → status=lost, race idempotency on (game_id, level). |
| `tests/wordknit/rls_test.sql` | dee (non-member) sees zero rows from all three tables; mutating RPCs throw with 42501; direct INSERT into game tables is blocked at the grant layer. Includes a positive baseline (ada CAN see her own game). |

### FE tests

| file | covers |
|---|---|
| `src/wordknit/lib/evaluate.test.ts` | The pure-function evaluator: 4-of-4 → correct (with level + members), 3-of-4 → oneAway, 0..2 overlap → wrong, fewer-than-4 input → wrong (defensive), order independence, returned-members defensive-copy. |
| `src/wordknit/lib/peerColor.test.ts` | The user_id → color hash: deterministic, distinct for the two persona UUIDs we care about, output is a CSS hex string. |

No FE test for the broadcast / presence plumbing — per [testing.md → What we don't test](testing.md#what-we-dont-test), realtime is the kind of integration the project covers by manual browser smoke. The hooks are exercised through the BoardScreen there.

## Open items

- **Per-tile contributor frame.** `useSharedSelection`'s internal map already tracks who selected what, but the BoardScreen doesn't yet render a per-contributor color frame — every selected tile gets a single uniform treatment. Surfacing the map (returning `selections` from the hook and rendering the frame in the tile button) is a small follow-up.
- **Per-game `setup.psql`.** Wordknit has zero tinyspy-style helpers right now (no random-position lookup, no config builder — the POC tests use literal `'{}'::jsonb`). Below the 3-helper promotion threshold from [testing.md](testing.md). Revisit when the puzzle archive lands and the create_game tests grow setup variation.

## Future work

Tracked in [`deferred.md`](deferred.md) as it gets enumerated. The big ones already visible:

- **Puzzle archive + date-picker setup.** The Setup dialog's placeholder gestures at this; the create_game RPC will swap its hardcoded board for a lookup by puzzle date.
- **Real Connections / Wordknit-flavored UI polish** (rise-and-fade, scratchpad, hint, contributor ring, etc.) — explicitly deferred for the POC. We're using the port to shake out architectural decisions before re-introducing the polish surface area.

## File locations

| asking… | look at… |
|---|---|
| What does the create_game / submit_guess RPC do | [`supabase/migrations/20260614000005_wordknit_baseline.sql`](../supabase/migrations/20260614000005_wordknit_baseline.sql) |
| Where the FE-knows rationale lives | this file (above) + the same migration's header comment |
| What does the play surface look like | [`src/wordknit/components/BoardScreen.tsx`](../src/wordknit/components/BoardScreen.tsx) |
| How shared selection works | [`src/wordknit/hooks/useSharedSelection.ts`](../src/wordknit/hooks/useSharedSelection.ts) |
| The pause-on-disconnect pattern | [`src/common/lib/pause.ts`](../src/common/lib/pause.ts) + [`src/common/components/PauseOverlay.tsx`](../src/common/components/PauseOverlay.tsx) |
| The evaluator | [`src/wordknit/lib/evaluate.ts`](../src/wordknit/lib/evaluate.ts) |
