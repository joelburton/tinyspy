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
    useGame.ts            The one realtime entry point. Owns the per-game channel
                          end-to-end: postgres-changes (game / guesses /
                          found_groups), broadcast (shared selection + manual-
                          pause events), and presence (who's connected). Returns
                          a flat surface the BoardScreen consumes — data,
                          selections, paused flag, pause helpers, member list.

  lib/
    board.ts              Wire types for the `board` jsonb (Group, Board, GroupLevel).
    evaluate.ts           Pure rules engine: 4-of-4 → correct, 3-of-4 → oneAway.
    evaluate.test.ts      Unit tests for the boundary cases.
    peerColor.ts          Stable hash userId → 5-color palette.
    peerColor.test.ts     Determinism + distinctness tests.
    config.ts             WordknitConfig type (empty for POC) + defaults.
```

### Realtime: three subscriptions on one channel

The per-game channel is `wordknit:<gameId>` — **no per-tab UUID suffix**, unlike tinyspy / psychic-num. The UUID workaround used elsewhere sidesteps supabase-js's per-client channel cache, but it does that by putting each tab in its own Realtime "room." For wordknit we *need* every tab in the same room because broadcast and presence only merge across clients with matching channel names. The StrictMode-double-mount issue is handled by the hook's own cleanup: `removeChannel()` clears the cache before the next effect run. See `docs/code-conventions.md` → "Realtime channel names."

One channel carries three concerns:

| subscription | purpose |
|---|---|
| Postgres Changes | game row / guesses / found_groups events drive `useGame`'s refetch |
| Broadcast | shared-selection events (select / deselect / clear) and manual-pause events (manualPause / manualUnpause) |
| Presence | each client's `track({ user_id })` builds the connected-users set; the `paused` flag is derived from `presence vs. expected members` via `computePause` |

**Why one channel, not three:** supabase-js requires every `.on()` listener to be registered *before* `.subscribe()`. Splitting across hooks would mean each hook's effect attaches its listeners separately — but consumer hooks' effects run after the channel-owner's, so their `.on()` calls would land post-subscribe and supabase-js rejects them. The pragmatic shape is one hook (`useGame`) attaching everything synchronously in a single effect. (Previous iterations split into `useGameFreeze` + `useSharedSelection` + `useGame` and hit this constraint head-on; the merge is the resolution.)

### Peer selection: Broadcast + Presence pattern

Wordknit is the first place in this codebase that uses Realtime Broadcast and Presence (everything else uses only Postgres Changes). The pattern is worth documenting because it'll repeat for future games with transient shared state.

**Selection semantics:** click acts on the **union** of all players' selections, not on each player's private list. Each tile has at most one contributor; clicking a tile already in the union removes it (regardless of who put it there); clicking an unselected tile adds it to MY contribution. Submit / "deselect all" / pause-on-disconnect all broadcast a `clear` event that empties every client's local map.

**Why Broadcast (not Presence-state) for the selection:** events are the natural unit here ("I selected X", "deselect X"). The state is reconstructable by listening from the moment you join — and we don't worry about late-joiners or mid-session rejoins because [we pause the game on any disconnect](#pause-on-disconnect-paused--suspended). State lives in client memory, gets reset on every pause.

**Why Presence (not Broadcast) for "who's here":** Presence is exactly the primitive for this — it auto-cleans up on disconnect (no heartbeat plumbing), and its state-carrier capability gives us a stable list of connected `user_id`s without any custom join/leave protocol. `computePause` derives the `paused` boolean from `presence diff expected members`.

**The split is honest:** events that are events use Broadcast; state that's intrinsically "what is currently true for each connected user" uses Presence. The two complement rather than overlap.

### Pause (presence-driven + manual)

The game has a single `paused` flag with two trigger sources, both treated identically by the UX layer. The flag is the union of:

- **Presence-pause**: derived from `computePause(presentUserIds, members)`. True when some expected club member isn't on the channel.
- **Manual-pause**: any player clicks the Pause button in the header → broadcasts a `manualPause` event with their `user_id` → all clients (including self) set `manuallyPausedById`. Any player can click Resume in the overlay → broadcasts `manualUnpause`. No privileged "original pauser" check; we're friends, not cutthroat competitors.

When `paused` is true (from either source), the `PauseBoundary` (`common/components/PauseBoundary.tsx`) wrapping the play area hides the children via `visibility: hidden` (so the boundary keeps its layout dimensions for the overlay to fill) and renders the `PauseOverlay` (`common/components/PauseOverlay.tsx`) on top. The overlay's copy adapts to the source:

| source | overlay copy | Resume button? |
|---|---|---|
| presence-only | "Waiting for Bea to reconnect…" | no — resolves when Bea's Presence rejoins |
| manual-only | "Bea paused the game" | yes — any player can click |
| both | both messages stacked | yes — clearing manual leaves presence-pause still active |

On the *transition* into paused (false → true), `PauseBoundary`'s `onPause` callback fires. Wordknit wires this to `sendClear` so all clients' shared selections empty — reconnecting peers land in a clean state rather than seeing stale tile highlights.

**Manual-pause persistence across mid-game peer reconnects:** if Bea is in a manually-paused game, then Ada drops + reconnects, Ada's local state would otherwise not know about the manual pause. The hook handles this by **re-broadcasting active manual-pause on every Presence change** — any client that observes a manual pause rebroadcasts when a peer joins. Idempotent receivers + broadcast-is-cheap make "everyone re-broadcasts on every presence change" the simplest robust shape. Documented in `useGame.ts`.

**Paused vs suspended** — code-level terminology distinction worth knowing:

- **Paused** (this overlay + the `PauseBoundary` wrapper + `computePause` helper): the transient gameplay-pause state — same UX as a video player's pause: clock stops, no moves accepted, overlay shows. Triggers: presence-disconnect or manual Pause button (both shipped). Resolves automatically when presence comes back, or when anyone clicks Resume.
- **Suspended** (club-level concept in `common.md`): persistent, "this game is not the one `common.club_active_game` is pointing at." Caused by another game being started in the club. Resolves when someone navigates to the suspended game and starts playing again.

The two never coexist on the same game — a suspended game isn't being looked at by anyone, so there's no Presence channel to track pauses for it.

**Future rollout:** the `computePause` helper + `PauseOverlay` + `PauseBoundary` live in `common/` deliberately so tinyspy and psychic-num can attach the same pattern later. Joel's general principle ("if `#-present` ≠ `#-expected`, the game should pause for UX consistency") applies to all three games. The motivating case here is wordknit (where transient state would be unfair if some players kept clicking through a peer's disconnect), but the pattern transfers cleanly — see the memory note in `~/.claude/projects/-Users-joel-src-codenames/memory/feedback_pause_on_disconnect.md`. Each game's BoardScreen wraps its play area in `<PauseBoundary>` once useGame is wired to track presence.

### Timer (browser-side, no server sync)

Wordknit declares `timerMode: { kind: 'countdown', seconds: 600 }` on its manifest — a 10-minute count-down. When the timer hits 0, the FE fires `wordknit.submit_timeout` and the game's status flips to `lost`.

**Browser-side, not server-synced.** Every client anchors at `games.created_at` (a server-stamped ISO timestamp), then ticks locally using `Date.now()`. There's no heartbeat back to the server, no periodic sync, no pause-log column.

**Why:** the alternative — a server-canonical clock that clients fetch periodically — was tried in a prior project and had a specific UX problem: at sync boundaries the displayed seconds would "fast-second" or "slow-second" depending on which way the local clock drifted relative to the server's. To smooth this, the heartbeat frequency has to be cranked up, which is a lot of plumbing for a small benefit. Browser-side ticking is always smooth.

**Drift across clients.** Two effects compound: wall-clock differences between machines (typically 30-50ms between NTP-synced consumer laptops), and per-pause broadcast latency (~30-100ms each time someone pauses or resumes). For a typical game with 1-2 pauses, total drift between two clients at end-of-game is well under 500ms. Invisible at friends-coop scale.

**The `useGameTimer` hook** (`src/common/hooks/useGameTimer.ts`) implements this. Built on React's `useSyncExternalStore` — the canonical pattern for "this hook observes an external time source" — so it satisfies the React-19 hook lint rules around impure calls during render. The hook is mode-aware (`countup` / `countdown(seconds)` / `none`), pause-aware (freezes the display while `paused`, accumulates pause windows so resume continues from where it left off), and recomputes-from-`Date.now()` rather than incrementing a counter (so backgrounded tabs and slept laptops catch up correctly when they return).

**Timeout-loss firing.** When `useGameTimer` reports `expired: true`, BoardScreen fires `wordknit.submit_timeout(target_game)`. The RPC is idempotent: it raises `P0001 "game is not in progress"` if the game has already ended, which can happen if two clients race the expiry. The FE swallows that specific error silently — realtime propagates the loss state to all clients within ~200ms.

**Future timer modes.** When boggle lands, it'll set its own `timerMode` on its manifest. The same `useGameTimer` hook handles whatever shape is declared. Each game writes its own timeout-loss RPC (since the loss semantics differ — boggle would end the round, tinyspy might enter sudden-death, etc.) but they all consume the same hook.

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
| How shared selection works | [`src/wordknit/hooks/useGame.ts`](../src/wordknit/hooks/useGame.ts) (the `apply` callbacks + `toggleTile` + selection-events broadcast) |
| The pause-on-disconnect pattern | [`src/common/lib/pause.ts`](../src/common/lib/pause.ts) + [`src/common/components/PauseOverlay.tsx`](../src/common/components/PauseOverlay.tsx) + [`src/common/components/PauseBoundary.tsx`](../src/common/components/PauseBoundary.tsx) |
| The browser-side timer | [`src/common/hooks/useGameTimer.ts`](../src/common/hooks/useGameTimer.ts) + the wordknit manifest's `timerMode` field |
| The evaluator | [`src/wordknit/lib/evaluate.ts`](../src/wordknit/lib/evaluate.ts) |
