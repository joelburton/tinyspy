# Supabase — how the app uses it

Everything the app knows lives in Postgres. The frontend reads it through
PostgREST, changes it only by calling RPCs, hears about changes over Realtime,
and hands the work that needs a secret or a lot of computing to an edge
function. This doc introduces how those pieces are used here and the
conventions that hold across every game; the mechanics are in the folders:

| for | see |
|---|---|
| the client, the call wrappers, and the one shape every answer comes back in | [src/common/supabase/doc.md](../src/common/supabase/doc.md), [envelopes.md](envelopes.md) |
| channels, the hook shapes, the deaf window, reconnects | [src/common/realtime/doc.md](../src/common/realtime/doc.md) |
| the `common` schema, the game-RPC helpers, RLS | [common-schema.md](common-schema.md) |
| SQL naming, `security definer`, the explicit revoke, the helper + view shield | [code-conventions.md → Database](code-conventions.md#database) |
| test patterns (pgTAP, Vitest, e2e) | [testing.md](testing.md) |

## The client and schema access

One typed client, [`supabase.ts`](../src/common/supabase/supabase.ts), made with
the publishable key and the generated `Database` type (`npm run types:gen`
after a schema change). Each game has its own Postgres schema, reached through
a pre-bound handle — `src/<game>/db.ts` is
`export const db = supabase.schema('<game>')` — and game code that needs the
common schema imports it as `commonDb`. Auth, edge functions and Realtime use
the raw client.

Two settings exist twice, once for the local stack and once for the hosted
project, and a change to one needs the other:

- **Exposed schemas.** Every schema the frontend addresses must be in
  `supabase/config.toml` → `[api] schemas` locally and in `EXPOSED_SCHEMAS`
  (`supabase/deploy/env.sh`, applied by `gmake project-config-api`) on the
  hosted project. A new game missing from the hosted list works in every local
  gate and fails in production with `Invalid schema`.
  [`schemaExposure.e2e.test.ts`](../src/guards/schemaExposure.e2e.test.ts)
  probes the local side.
- **`max_rows`**, the cap PostgREST silently applies to every response
  ([Query bounds](#query-bounds--and-the-max_rows-trap)).

Both are read by the local stack only at `supabase start`; a `db reset` doesn't
re-read `config.toml`.

## Schema vs code

Each game's SQL lives in **two files**, split by whether a statement can be
re-run:

| | file | lifecycle |
|---|---|---|
| **schema** | `supabase/migrations/<ts>_<game>.sql` | applied **once**, then frozen |
| **code** | `supabase/sql/<game>.sql` | re-applied **in full on every deploy** |

The schema file holds *shape* — `create table`, constraints, indexes,
`alter publication` (Realtime membership), and seed rows including the
`common.gametypes` registration. None of it can be re-run, so it accumulates: a
later shape change is a new migration.

The code file holds *behavior* — functions, views, RLS policies, triggers and
grants. It is not a delta: it is the **current definition**, edited in place
forever and re-applied whole. Changing an RPC adds no migration; you edit the
game's one file and `gmake db-sql` re-runs it. The trade is that git, not the
migration table, records which version of a function was live when.

**The rules that make it work:**

- **Order inside a file is load-bearing.** A policy can only reference a
  function that exists, and a function can only select from a view that exists,
  so statements stay in dependency order, and `common.sql` is applied before any
  game (`apply-sql.ts` sorts it first).
- **A signature change needs an explicit drop.** `create or replace function`
  keys on name and argument types, so a changed signature creates a *second*
  function beside the first, which PostgREST then refuses to choose between.
  Put `drop function if exists <schema>.<name>(<old types>);` above the create
  and leave it: the file runs against databases of every age.
  `tests/common/function_overloads_test.sql` fails if one slips through.
- **Views, policies and triggers are dropped, not replaced.** `create or replace
  view` can't drop or reorder columns, and policies and triggers have no replace
  form, so each is preceded by its `drop … if exists`. Functions use
  `create or replace`; a bare drop would cascade into what depends on them.
- **A migration may only touch what migrations own.** A local `db reset`, and
  the shadow database `gmake db-drift` builds, apply migrations alone — so a
  migration that alters a function or policy fails on a fresh build while
  succeeding on a deployed database. Where a migration must clear something the
  code half owns, write `drop … if exists`. A migration also cannot call a
  function from `supabase/sql/`, which is applied after it.
- **One function is pinned to the schema side:** `common.word_letter_mask`,
  because generated columns call it, so it must exist before their tables.

**Applying it.** `gmake db-sql ENV=local|prod` re-applies every file, each in
one transaction, so a syntax error rolls the file back rather than leaving half
a schema. `gmake db-reset ENV=local` runs it after the reset, and
`gmake deploy ENV=prod` after the migration push.

**Rehearsing a migration that moves data.** A local reset builds the new shape
on an empty database, so a backfill runs over zero rows, succeeds, and proves
nothing. `gmake db-rehearse ENV=local DUMP=backups/<f>.dump SINCE=<version>`
holds back the migrations from `SINCE`, resets to production's shape, restores a
dump of production's rows, applies the held-back migrations over them, reports
every table's row count before and after, and runs the pgTAP suite. `SINCE` has
no default: `supabase migration list --linked` answers it.

## Every game's log is `<game>.events`

Every game with a chronological log of what happened keeps it in one shape
(a found-words list is a set, not a log, and some games have no log at all):

```sql
create table <game>.events (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references <game>.games(id) on delete cascade,
  user_id    uuid not null references common.profiles(user_id) on delete cascade,
  kind       text not null check (kind in (…this game's kinds…)),
  took_turn  boolean not null default false,
  created_at timestamptz not null default now(),
  -- …the game's own payload columns…
);

create index <game>_events_game_id_id_idx on <game>.events (game_id, id);
```

**Read `order by id`, never by the timestamp.** Two rows written in one
transaction tie on `created_at`, and the log's meaning is its order.

**`kind` is what the player DID; the payload says how it went.** A refused
guess is `kind = 'guess'` with its verdict in a payload column; no game has a
kind meaning "a bad move". `kind` has no default, and it is always knowable
before the request — the player knew what they asked for — so the frontend can
show its pill before the round trip. (An RPC may still choose the word or
compute the result: which hint, which colors.)

**`took_turn` answers "did this event use up one of the actor's goes?"** in
every game and mode, whether or not a turn rotation is running
([common-schema.md → Turn-order](common-schema.md#turn-order--opt-in-turn-by-turn-for-coop-games)
is the rotation, a different question).

- **It is the game's judgment, not the mechanism.** A game with no rotation
  still marks its moves; a game-ending move advances nothing yet is still a
  turn.
- **Which kinds are turns is per-game and not constrained in the schema.** The
  RPC writes the value at the insert, as a literal where the branch knows it or
  an expression over the verdict where one insert serves several, so changing
  the rule is an edit to `supabase/sql/`.
- **It cannot be derived**: two rejected guesses with the same `kind` and the
  same `valid = false` can differ on whether they cost the player's go. It is
  the server's verdict, read back, never predicted by the client.

**Three numbers, and only one is a column:**

| | what it is | where it lives |
|---|---|---|
| **the ordinal** | "the 3rd row of what you're looking at" — the `#N` a log prints | computed by the frontend from the list on show; never stored |
| **the metered number** | "your 3rd of 6 guesses", "cleared in 14 turns" | derived at read time — `count(*) where took_turn`, or the game's own predicate where the meter counts something else |
| **`took_turn`** | the RPC's verdict on one event | stored, because no predicate over the row recovers it |

A metered count is correct in every mode because it counts only the caller's
own rows, which RLS always shows them; a per-player counter a game keeps anyway
stays the authority for what was spent. The payload columns are each game's
own. The frontend side — the `#N` handle, the "whose turns?" picker, the
history viewer — is [src/common/event-log/doc.md](../src/common/event-log/doc.md).

## Reading data

- **Explicit columns, always** ([code-conventions.md → Avoid `SELECT *`](code-conventions.md#avoid-select-)).
- **Read views, subscribe to base tables.** A game with hidden state reads a
  `games_state` / `players_state` view that shields the secret column until the
  row's state allows it. Realtime watches tables, not views, so the same hook
  subscribes to the base tables and its `load()` refetches the views.
- **A large immutable header is fetched once.** Where a game row carries a big
  payload that never changes (a word list, a puzzle), the hook fetches it once
  and puts only the changing child rows in the refetch loop, so a teammate's
  move doesn't re-download it.

### Query bounds — and the `max_rows` trap

PostgREST caps every response at `max_rows` (10,000 here, set above the default
so every legitimately growing query has room), silently. It is a backstop, not
a license to skip bounding a query. Most reads are bounded by nature — one row
by key, or one game's child rows — and **a read that isn't says how it is
bounded, at the site**: a recency window, a filter to active rows, an explicit
`.limit()`.

> **The trap:** an *ascending*-ordered unbounded query past the cap returns the
> **oldest** rows and silently drops the newest — the rows you wanted. A
> descending one loses the oldest; an unordered one returns an arbitrary
> subset.

A read that is *meant* to exceed the cap — a seed or library table — routes
around it, one of two ways:

- **A `.range()` paging loop**, ordered by a unique key (each window is a
  separate query, so without one windows can overlap or skip) and advancing by
  the rows actually received, stopping only on an empty page (a short page
  means nothing if the server's cap is lower than the page size).
- **Stay in SQL**: do the heavy read inside an RPC and return the answer, or a
  single `jsonb` value, which `max_rows` doesn't touch.

## Realtime

The frontend hears about writes through Realtime: `postgres_changes` (CDC) for
table changes, Broadcast and Presence for peer-to-peer state that is never
stored. Almost every data hook is refetch-on-any-event through
`useRealtimeRefetch`; the hook shapes, the channel names, the reconnect story
and the deaf window are [src/common/realtime/doc.md](../src/common/realtime/doc.md)'s.
Finding a channel is a search for `supabase.channel(` and `channelPrefix`.

### The publication invariant (load-bearing)

**Every table a channel subscribes to via `postgres_changes` must be in the
`supabase_realtime` publication.** The Realtime server rejects the channel's
*entire* subscription if any one bound table is unpublished — live updates die
for every table on that channel, with no error. Each game's migration adds its
tables at the bottom, and `tests/common/realtime_publication_test.sql` checks
both directions: what is subscribed is published, and what is deliberately left
out stays out. Nothing is published without a subscriber — a published table
nobody reads is replication overhead.

A channel whose tables are all published can still report `SUBSCRIBED` and
deliver nothing ([realtime/doc.md → A page that has stopped
updating](../src/common/realtime/doc.md#a-page-that-has-stopped-updating)); check
the publication first, since it's the cheap check.

**DELETE events are unreliable under a filter**, because a DELETE carries only
the row's replica identity. Two consequences, each commented where it lives:
`common.games` is `REPLICA IDENTITY FULL` so the club list hears a deleted game,
and a `replay_board` that deletes child rows also touches its `games` row, so
the UPDATE wakes clients to refetch.

## Server conventions

**RPCs** ([code-conventions.md → RPC functions](code-conventions.md#rpc-functions),
[common-schema.md → RPCs](common-schema.md#rpcs)):

- **Every write goes through an RPC.** There are no INSERT, UPDATE or DELETE
  policies anywhere; RLS grants reads only.
- A callable RPC is `security definer` with a pinned `search_path`; a read-only
  helper that should run as the caller says so.
- Authorization is `common.require_game_player` for a move and
  `common.require_club_member` for club-level actions like `set_current_view`
  and `tick_timer`.
- **A move locks its game row** (`select … for update`) so concurrent moves
  serialize, and so does a `replay_board`: a replay interleaved with a move could
  leave a stray log row on the fresh board, or let a game-ending move land after
  the reset and re-end it.
- A state-changing RPC updates the game's own row and the `common.games` header
  (`common.update_state` / `common.end_game`) in one transaction, so the club
  list never lags the game.
- It answers in an envelope ([envelopes.md → How SQL builds one](envelopes.md#how-sql-builds-one)).

On the frontend, a call goes through `runRpc` / `readRows` / `runEdgeFn`
([src/common/supabase/doc.md](../src/common/supabase/doc.md)).

**RLS** ([CLAUDE.md → Trust model](../CLAUDE.md#trust-model--server-authoritative-for-cleanliness-not-anti-cheat),
[common-schema.md → Row-level security](common-schema.md#row-level-security)):

- **Viewing is club-gated, acting is player-gated.** SELECT policies use
  `common.is_club_member`; moves use `require_game_player`.
- **A hidden answer is shielded** by a column grant, a `security definer`
  helper and a `security_invoker` view
  ([code-conventions.md](code-conventions.md#security-definer-helper--security_invoker-view)).
- **Some rows are owner-only**, and a compete game's policies narrow mid-game
  reads to the player's own rows, opening up at terminal. A CDC payload isn't
  filtered per column the way a query is, so a hook that could receive someone
  else's row filters it on the frontend.
- **Trusting-commit games** deliberately ship a word list or score to the
  client — a trust-model decision, not an oversight.

### Server errors — see [envelopes.md](envelopes.md)

Every RPC and edge function answers in one envelope shape, and the sentence a
player reads is written at the raise. [envelopes.md](envelopes.md) is the
introduction; [outcomes.md](outcomes.md) holds the outcome vocabulary.

## Edge functions

An edge function is a **computation venue, not a privilege escalation**. It
runs as the caller — a client built from the request's JWT, so `create_game`
and every other RPC enforce membership exactly as if the frontend had called
them. The one exception is `common-define`, which caches a definition through
one service-role write (`cache_definition`) and does everything else as the
caller.

- **Build-board** functions (the found-words games, waffle, wordiply,
  letterboxed) parse the request, fetch candidates, generate the board in
  TypeScript, and relay `create_game`'s envelope.
- **Claude** calls hold `ANTHROPIC_API_KEY` (codenamesduet's clue suggester,
  crosswords' clue explainer); scrabble's suggester and AI opponent run the
  game's own engine server-side; the crosswords importers fetch a puzzle and
  create the game with it.
- Every function answers an envelope at HTTP 200 whenever it ran, faults
  included ([envelopes.md → How edge functions build one](envelopes.md#how-edge-functions-build-one)),
  and keeps its tagged `console.log` diagnostics.
- Functions are outside `tsc -b`: check them with `deno check`, which misses a
  bare `@/` alias or an extensionless import — both fail only at boot.
