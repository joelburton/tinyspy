# Supabase — conventions and divergences

How the app talks to Supabase, end to end: the client, schema access, query
shapes, Realtime, RPCs, RLS, and Edge Functions. This doc is the **map** —
it names each convention, says who follows it, and records every deliberate
divergence in one register. The deeper mechanics live in the docs this one
links to:

| for | see |
|---|---|
| DB conventions (schemas, RPC style, RLS helpers, the definer-helper + invoker-view shape), the Pattern A / Pattern B realtime-hook decision rule | [code-conventions.md](code-conventions.md) |
| The `common` schema, the game-RPC helpers (`create_game` / `end_game` / concede / timers), RLS philosophy, auth & magic links | [common.md](common.md) |
| Per-game schema details | [games/*.md](games/) |
| Test patterns for all of this (pgTAP + Vitest + the e2e gates) | [testing.md](testing.md) |

## The client

One typed client for the whole app —
[`src/common/lib/supabase/supabase.ts`](../src/common/lib/supabase/supabase.ts):

- Created once with the **publishable key** and the generated `Database`
  type (`npm run types:gen` after any schema change). There is no
  service-role key anywhere in the FE, and none in the Edge Functions
  either — see [Edge Functions](#edge-functions).
- Auth options are the supabase-js defaults, **stated explicitly**
  (`persistSession` / `autoRefreshToken` / `detectSessionInUrl`) so the
  contract is visible.
- Dev nicety: when the page is loaded from a LAN IP but
  `VITE_SUPABASE_URL` points at loopback, the client rewrites the Supabase
  host to the page's host — this is what makes phone-over-LAN testing Just
  Work. No-op in prod.
- On session restore, `useSession` round-trips `auth.getUser()` and probes
  `common.profiles` to catch stale JWTs (post-`db reset`, deleted users).
  Transient 5xx keeps the stored session; hard failures sign out.

## Schema access

One Postgres schema per gametype plus `common`
([code-conventions.md → Schemas](code-conventions.md#schemas)). The FE
reaches each through a **pre-bound handle**:

- Every game folder has a one-line `src/<game>/db.ts`:
  `export const db = supabase.schema('<game>')`.
- The common layer has [`src/common/db.ts`](../src/common/db.ts); game
  code that needs common tables imports it as `commonDb` to alias around
  its own `db`.
- Auth, Edge Functions, and Realtime channels use the raw `supabase`
  client — those aren't schema-scoped.

Two operational invariants ride on this:

- **PostgREST exposure.** Every schema the FE addresses must be in
  `supabase/config.toml` `[api] schemas`, and that config is only read at
  `supabase start` — a `db reset` does NOT re-apply it. A missing/unapplied
  schema fails every request with `PGRST106`.
  [`src/schemaExposure.e2e.test.ts`](../src/schemaExposure.e2e.test.ts)
  probes every registered game's schema over real HTTP to pin this.
- **`max_rows = 10000`** (config.toml): PostgREST silently caps every
  response at this many rows. It's a backstop against a missing-filter
  bug fetching a whole seed table, not a license to skip `.limit()` —
  see [Query bounds](#query-bounds-and-the-max_rows-trap). Set above the
  1000 default so the connections puzzle picker (1122 dated rows) isn't
  truncated and every legitimately-growing query has years of headroom.
  Two gotchas (both in the config.toml comment): applied only at
  `supabase stop && supabase start`, and the hosted project's Max Rows is
  a separate dashboard setting to keep in sync.

## Query conventions

### Explicit columns, always

Every `.select()` in the app lists its columns by name; there is no
`select('*')` anywhere. The consuming
hook usually narrows the row with a TypeScript `Pick`-style type right next
to the query. This is what makes schema evolution safe: adding a column
can't silently fatten every payload, and removing one fails loudly at the
query that named it.

### Read views, subscribe to base tables

Games with hidden state (psychicnum, spellingbee, waffle, wordle,
stackdown, scrabble, crosswords, wordwheel, wordiply) read from a
`games_state` / `players_state` **view** that gates the shielded column
(solution / target / opponent board) on row state — the
[definer-helper + invoker-view shape](code-conventions.md#security-definer-helper--security_invoker-view).
But Realtime CDC watches **tables**, not views, so their subscriptions
target the base tables (`games`, `players`, …) while `load()` refetches
the views. waffle's `useGame` is the canonical commented example.

### Split lifecycle: immutable header once, live rows on every event

Games whose header row carries a large immutable payload (boggle's word
lists, wordiply's `legal_words`, crosswords' puzzle meta, the
`makeFoundWordsGame` pair spellingbee/wordwheel) fetch it **once** in a
plain effect and wire only the volatile child rows (`found_words`,
`guesses`, `cells`) into the refetch loop. This avoids re-downloading a
multi-kilobyte word list every time a teammate finds a word. Games with
small headers (psychicnum, wordle, …) just refetch everything — simpler,
and the volumes don't justify the split.

### Two-step joins over PostgREST embeds

Roster-shaped reads (`game_players` → `profiles`, `clubs_members` →
`profiles`) are written as two explicit queries with an `.in()` on the
collected ids, not as embedded selects. The embed would save a round-trip;
the two-step form keeps column control obvious and reads the same in every
call site. `useCommonGame` documents the choice inline.

### Query bounds — and the `max_rows` trap

Most queries are naturally bounded: one row by PK, or child rows of a
single game (human-scale — nobody finds 1000 words). A handful are
**unbounded by anything except `max_rows`**, and the failure mode is
worse than it sounds because of ordering:

> **The trap:** an *ascending*-ordered unbounded query past the cap
> returns the **oldest** rows and silently drops the newest — exactly the
> rows you wanted. A descending-ordered one degrades gracefully (you lose
> the oldest). An *unordered* one returns an unspecified subset.

The `max_rows` cap of 10,000 keeps the cliff years out for all of these,
but the cliff still exists — a busy club (a couple dozen quick games a day
is realistic) accumulates games, chat, and lifetime seats faster than
"per year" intuitions suggest. Every unbounded query is now bounded by an
explicit mechanism:

| query | order | bound | status |
|---|---|---|---|
| `useClubChat` messages (`useClubChat.ts`) | `sent_at` **asc** | a 7-day recency window (`.gte('sent_at', cutoff)`, cutoff computed once per subscription) | **bounded** ✓ (a recency window, not a row limit — the window matches how chat is read) |
| `useGameInvitations` (`game_players` for self) | n/a | one `!inner` embed filtered to `is_terminal = false`, so the row set is my *active* games (a handful), not every seat I've ever held | **bounded** ✓ |
| ClubPage games list | `last_active_at` **desc** | explicit `.limit(200)`; overflow drops the oldest games (deliberate, commented) | **bounded** ✓ |
| `makeFoundWordsGame` / boggle / wordiply child rows | `found_at` asc | human-bounded (nobody finds thousands of words in one game) | note the pattern, no action |

### The flip side: reads that legitimately NEED >1000 rows

`max_rows` cuts both ways — a query whose table is *supposed* to exceed
the cap gets silently truncated unless it deliberately routes around it.
Two escape hatches are in use, and picking one is **mandatory** for any
read of a seed/library table:

- **`.range()` paging loop over a stable order** (PostgREST reads that
  need the whole set). The build-board edge functions do this. Two rules
  make the loop correct:
  1. **`.order()` by a unique key (the PK)** — each window is a separate
     query, and without an ORDER BY Postgres guarantees nothing across
     statements, so windows could overlap or skip rows.
  2. **Cap-agnostic advance**: step `from` by the rows *actually
     received* and stop only on an **empty** page. Never treat a
     short-of-`PAGE_SIZE` page as "last page" — if the server's live cap
     is lower than `PAGE_SIZE` (config drift, hosted dashboard out of
     sync), every page comes back "short" and the naive loop silently
     exits after one window. With the cap-agnostic shape, a cap mismatch
     just costs extra round-trips; `PAGE_SIZE` is purely an optimization
     knob.
- **Stay in SQL** — do the heavy read inside an RPC (or via `psql` for
  CLIs), where `max_rows` doesn't exist.

The inventory (row counts from a freshly-imported dev DB):

| reader | table (rows) | mechanism | capped? |
|---|---|---|---|
| waffle-build-board | `common.words` (283k source pool) | `.range()` paging loop | no ✓ |
| spellingbee-build-board | `spellingbee.pangrams` (1.9k) | `.range()` paging loop | no ✓ |
| wordwheel-build-board | `wordwheel.pangrams` (36.7k) | `.range()` paging loop | no ✓ |
| wordiply-build-board | `candidate_bases` / `try_base` | SQL RPCs; fn takes `.limit(1)` | no ✓ |
| boggle-build-board | — | dictionary **bundled** in the fn (`dict.ts`); no fetch | no ✓ |
| stackdown `create_game` board pick | `stackdown.boards` (1.2k) | `order by random() limit 1` inside the RPC | no ✓ |
| import CLIs (`npm run import`) | everything | direct Postgres (`psql \copy`), not PostgREST | no ✓ |
| connections SetupForm puzzle picker | `connections.puzzles` (**1122** NYT-dated) | plain select, no limit | fits under the 10k cap (1122 rows); needs a paging loop if the library ever nears 10k. A min/max-dates shortcut does NOT work here: the import skips unusable puzzles (image-word days), so dates are sparse, and the calendar needs per-date statuses anyway |
| connections SetupForm `club_game_status` | grows with the club's games per mode | plain select | headroom to 10k; a club playing daily takes decades, but watch it if clubs binge one mode |
| crosswords SetupForm library list | `crosswords.puzzles` (3 today; the planned dictionary-puzzle import will be **large**) | plain select | fine until that import — give it a paging loop (or a limit + real picker UI, which >10k puzzles needs regardless) **before** importing in bulk (deferred: [crosswords.md §9](games/crosswords.md#9-deferred--future)) |

## Realtime

### Channel-name registry

Every channel in the app, in one place. The naming pattern is
`<topic>:<id>[:<uuid>]`
([code-conventions.md → Realtime channel names](code-conventions.md#realtime-channel-names));
**stable names** are used iff peers must share the room (presence rosters
and broadcasts are per-channel-name), **UUID-suffixed names** (via
`channelDedupSuffix()`) everywhere else, to sidestep supabase-js's
name-cache + StrictMode double-mount collision. Every CDC subscription is
filtered (`id=eq` / `game_id=eq` / `club_handle=eq` / `user_id=eq`) — none
is broader than the rows the hook consumes.

| channel | opened by | stable? | carries |
|---|---|---|---|
| `game:<gameId>` | `useCommonGame` (every game page) | **stable** | presence, manual-pause + suspend Broadcast, CDC on `common.games` + `common.game_players` |
| `game:<gameId>` (temp, ~1s) | ClubPage `handleDelete` | **stable** | send-only suspend Broadcast into the same room before deleting a current game (never mounted concurrently with a GamePage in the same tab, so no cache collision) |
| `club:<handle>` | `useClubPresence` | **stable** | presence only |
| `club-setup:<handle>` | `useClubSetupPresence` | **stable** | presence only (setup-dialog open state) |
| `scratchpad:<gameId>` | `useScratchpad` | **stable** | CDC on `common.game_scratchpads` (direct-apply, newer-wins) + shared-lock Broadcast |
| `connections:<gameId>` | connections `useGame` | **stable** | shared-selection Broadcast (coop) + CDC on 3 tables |
| `scrabble:<gameId>` | `useSharedMove` | **stable** | ephemeral show-move Broadcast (coop only; never stored) |
| `crosswords:cursors:<gameId>` | `usePeerCursors` | **stable** | presence + cursor/fill/notes Broadcast (coop only) |
| `club-games:<handle>:<uuid>` | ClubPage | uuid | CDC on `common.games` filtered by club |
| `club-chat:<handle>:<uuid>` | `useClubChat` | uuid | CDC INSERT on `common.messages` |
| `game-invites:<selfId>:<uuid>` | `useGameInvitations` | uuid | CDC INSERT on `common.game_players` filtered by self |
| `home-clubs:<selfId>:<uuid>` | HomePage | uuid | CDC on `common.clubs_members` filtered by self |
| `<gametype>:<gameId>:<uuid>` | each per-game `useGame` (or factory) | uuid | CDC on that game's tables |
| `crosswords:cells:<gameId>:<uuid>` | `useCells` | uuid | CDC UPDATE on `crosswords.cells` (direct-apply) |
| `codenamesduet:game:` / `codenamesduet:board:` / `codenamesduet:clues:` `<gameId>:<uuid>` | codenamesduet's three hooks | uuid | CDC per concern (concern-keyed like `crosswords:cells` / `crosswords:cursors`) |
| `bananagrams-board:` / `bananagrams-progress:` `<gameId>:<uuid>` | bananagrams' two hooks | uuid | CDC per RLS boundary |

### The four data-hook shapes

The decision rule lives in
[code-conventions.md → Realtime data hooks](code-conventions.md#realtime-data-hooks--two-patterns);
the short version, with every current member:

1. **Pattern A — refetch-on-any-event via
   [`useRealtimeRefetch`](../src/common/hooks/realtime/useRealtimeRefetch.ts).**
   The default. Initial load + refetch on every CDC event + refetch on
   every SUBSCRIBED (reconnect catch-up), with a generation counter so a
   slow superseded load can't clobber a newer one. Members: codenamesduet
   (×3 hooks), psychicnum, wordle, stackdown, scrabble (data side),
   waffle, bananagrams (×2 hooks), boggle, wordiply, the
   spellingbee/wordwheel factory, HomePage.
2. **Pattern B — broadcast/presence-coupled, hand-rolled, stable name.**
   `useCommonGame`, connections `useGame`, `useScratchpad`,
   `useClubPresence`, `useClubSetupPresence`, `usePeerCursors`,
   `useSharedMove`.
3. **Append-on-INSERT** — `useClubChat` only. Appends each INSERT instead
   of refetching; its SUBSCRIBED refetch must **merge, never replace**
   (the rule and the bug that taught it:
   [code-conventions.md → Append-on-event exception](code-conventions.md#append-on-event-exception--and-the-merge-rule-it-requires)).
4. **Direct CDC apply** — crosswords `useCells` (per-cell `version`,
   newer-wins, optimistic echo + rollback) and `useScratchpad`'s body
   (same newer-wins idea, one row). For high-frequency per-row writes
   where refetch-per-event would be a storm. Full refetch only on
   SUBSCRIBED.

### Reconnect story

Three cooperating pieces:

- Every data hook refetches on **every SUBSCRIBED status**, not just the
  first — that's the catch-up after a dropped socket (events during the
  gap are simply refetched over).
- [`useRealtimeReconnect`](../src/common/hooks/realtime/useRealtimeReconnect.ts)
  (mounted once at app level) nudges the socket on visibilitychange /
  focus / online, so the SUBSCRIBED refetch actually fires promptly after
  a laptop-lid cycle.
- Broadcast traffic lost during a disconnect is covered by design, not
  replay: presence-pause freezes the game while anyone is missing, so no
  broadcasts happen while someone can't hear them.

### The publication invariant (load-bearing)

**Every table a channel subscribes to via `postgres_changes` must be in
the `supabase_realtime` publication.** The Realtime server rejects the
channel's *entire* subscription if any one bound table is unpublished —
live updates silently die for all tables on that channel, with no error.
Each game's `schema_test.sql` pins its publication membership, and each
game's migration adds its tables at the bottom of the file.

Related server-side subtleties:

- **`REPLICA IDENTITY FULL` on `common.games`** — ClubPage's subscription
  filters on `club_handle`; DELETE events only carry the old row's
  replica identity, which by default is the PK. Without FULL, deletes
  would never match the filter and the club list wouldn't refresh.
- **DELETE events don't reliably match filters** in general — which is why
  `replay_board` RPCs (spellingbee/wordwheel/boggle/wordiply) do a **no-op
  UPDATE touch on `games`** after deleting the child rows: the UPDATE
  event is what wakes clients to refetch the now-empty list. This is why
  those games subscribe to `games` at all.
- **Nothing is published without a subscriber.** A published-but-unread
  table is harmless (the invariant only kills things in the other
  direction) but pure replication overhead, so the publication is kept
  minimal. `crosswords` publishes only `cells` — its `clear_board` UPDATEs
  cells rather than deleting them, so the cells subscription hears it
  directly, and `crosswords.games` is unpublished (`useGame` is one-shot;
  status flows through `common.games`). Publication membership is pinned
  per-schema by `tests/common/publication_test.sql` and
  `tests/crosswords/publication_test.sql` (both directions: the
  load-bearing tables published, the deliberately-absent ones absent).
- Reference/seed tables (`common.profiles`, `common.clubs`,
  `wordwheel.pangrams`, `crosswords.puzzles`, …) are deliberately
  unpublished.

## RPCs

Server-side conventions
([code-conventions.md → RPC functions](code-conventions.md#rpc-functions),
[common.md → RPCs](common.md#rpcs)):

- All callable RPCs are `SECURITY DEFINER` with a pinned
  `search_path = <game>, common, public, extensions`; cross-schema calls
  are fully qualified anyway.
- **No INSERT/UPDATE/DELETE policies exist anywhere** — every write goes
  through an RPC. Reads are the only thing RLS grants directly.
- Authorization gates: `common.require_game_player` for moves,
  `common.require_club_member` for viewing-adjacent actions
  (`set_current_view`, `tick_timer`);
  errcode `42501` for authz failures, `P0001` for validation.
- **Every mid-game mutation locks the game row** (`select … for update`)
  to serialize concurrent moves — across all games (codenamesduet,
  psychicnum, connections, waffle ×4, bananagrams ×3, scrabble ×3, …).
  scrabble adds a `base_version` optimistic-concurrency check on top.
- **Duplicate-write discipline:** state-transitioning RPCs update both the
  per-game row and the `common.games` header (`common.update_state` /
  `common.end_game`) in one transaction, so the club list's labels and
  `is_terminal` never lag the game.

FE-side, three shared wrappers in
[`manifestRpcs.ts`](../src/common/lib/game/manifestRpcs.ts) keep call sites
uniform: `makeRpcDispatcher(db, 'submit_timeout' | 'end_game' | …)` for
fire-and-report RPCs, `invokeStartGameEdgeFn` for edge-function game
creation, and `unwrapEdgeFnError` for reading the real server message out
of a FunctionsHttpError's read-once body. `useStandardGameActions` builds
the End/Concede/Replay handlers on top.

## RLS & grants

The philosophy is in [CLAUDE.md → Trust model](../CLAUDE.md) and
[common.md → Row-level security](common.md#row-level-security); the shapes:

- **Viewing is club-gated, acting is player-gated.** SELECT policies use
  `common.is_club_member` (STABLE, SECURITY DEFINER helper); move RPCs use
  `require_game_player`. Spectating falls out for free.
- **Hidden-solution shielding** = column-level grant on the base table +
  `SECURITY DEFINER` helper + `security_invoker` view
  ([code-conventions.md](code-conventions.md#security-definer-helper--security_invoker-view)).
  Users: psychicnum (secrets), waffle + stackdown + crosswords (solution),
  wordle (target), scrabble (bag, compete racks), spellingbee/wordwheel
  (required_words until terminal).
- **Owner-only rows**: bananagrams `player_boards` (private board;
  club-readable `progress` is its public projection) and per-owner
  scratchpad rows.
- **Mode-aware policies**: compete variants narrow mid-game reads to own
  rows (wordle guesses, crosswords cells, waffle boards, scrabble racks),
  opening up at terminal. Note the FE double-checks where CDC can leak:
  `useCells` drops rows whose `owner_id` isn't mine, because the CDC
  payload isn't RLS-filtered per-column the way a query is.
- **Trusting-commit games** (spellingbee, wordwheel, boggle, scrabble
  scoring, wordiply) deliberately ship word lists / score client-side —
  a documented trust-model call, not an oversight.

## Edge Functions

All 13 functions follow the `_shared/` conventions
(`supabase/functions/_shared/`):

- **Caller's JWT, never service-role.** `callerClient(authHeader)` builds
  a client as the requesting user; membership and validation are enforced
  by the `create_game` RPC exactly as if the FE had called it. An edge
  function is a *computation* venue (board generation, AI calls), not a
  privilege escalation.
- **Build-board family** (spellingbee, wordwheel, wordiply, waffle,
  boggle): `parseBuildBoardRequest` gates the request →
  fetch candidate words (paged past `max_rows` where needed) → generate
  the board in TypeScript → `invokeCreateGame` → `{ id }` or a
  status-coded `{ error }`.
- **AI family** (codenamesduet-suggest-clue, scrabble-ai-move,
  scrabble-suggest-move, crosswords-explain-clue, common-define): the edge
  function exists to hold the `ANTHROPIC_API_KEY` (or to reuse the
  FE engine server-side), fetching game context via a dedicated
  `get_*_context` RPC as the caller.
- Error convention: `{ error }` with 400 (validation) / 401 (no JWT) /
  403 (authz) / 500; tagged `console.log` diagnostics (keep these — see
  the keep-logs house rule).
- Verification: `deno check` (edge fns are outside `tsc -b`); the local
  edge runtime hot-reloads file edits.

## Divergence register

Every place the code deviates from the sibling-standard path, and why.
All of these are commented at the site; this table is the index.

| divergence | where | why |
|---|---|---|
| Three data hooks instead of one | codenamesduet (`useGame`/`useBoard`/`useClues`) | per-concern lifecycles; PlayArea splits the same way |
| Two data hooks instead of one | bananagrams (`useGame`/`useProgress`) | RLS boundary: owner-only board vs club-readable progress |
| Broadcast-coupled hand-rolled channel | connections `useGame` | shared-selection Broadcast needs the stable room; CDC rides along |
| Ephemeral broadcast on a second stable channel | scrabble `useSharedMove` | staged-move preview is never stored; a missed broadcast just means no preview |
| Direct CDC apply instead of refetch | crosswords `useCells`, scratchpad body | per-keystroke frequency; version-merge ("newer wins") + optimistic echo + rollback |
| Append-on-INSERT instead of refetch | `useClubChat` | chat volume; requires merge-on-refetch (see the rule) |
| Find-or-create instead of create | connections `startGameInClub` | one game per puzzle per mode per club |
| No whole-game `end_game` | bananagrams | per-player concede IS the drop-out model |
| Shared `useGame` factory across two games | `makeFoundWordsGame` (spellingbee + wordwheel) | byte-identical lifecycle; fork it back if they diverge |
| One-shot on-demand fetch | crosswords Reveal (`games_state.solution`) | solution is gated; fetched only when the button is pressed |
| Stable-name temp channel | ClubPage delete-current-game broadcast | borrows `useCommonGame`'s room name to reach peers, send-only, ~1s lifetime |
| FE-side owner filter on CDC | crosswords `useCells` | compete privacy: CDC payload carries other owners' cells; dropped before apply |

## Bounds & realtime work — where it's tracked

This doc describes the current surface. Deferred bounds/realtime items
(e.g. the crosswords library-picker bound, owed before the bulk
dictionary-puzzle import) live in [deferred.md](deferred.md) and the
per-game deferred registers ([crosswords.md §9](games/crosswords.md#9-deferred--future)).

Gates for any code change here: `npx tsc -b` (NOT `tsc --noEmit` — the
root tsconfig checks nothing), `npm test`, and `npm run test:db` for
migration changes.
