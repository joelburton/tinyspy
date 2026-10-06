# Broadcast nudge — the game page re-reads on one "changed" message per move

**Status: being built.** Steps 1–5 are done: the verification, the trigger
and its pgTAP test, the page on the nudge, and its tests, the rewritten
deaf-window e2e included. The game page only; the club page
comes after, under its own plan.

## The problem

`useCommonGame` subscribes to `postgres_changes` on `common.games`, filtered to
the game, and re-reads `shell_data, game_data` (and the timer) on every message.
Realtime sends one message per row write, not per move, and `common.games` is
`REPLICA IDENTITY FULL`, so each message carries the whole old row and the whole
new row, `summary_data`, `clubpage_info` and `setup` included. The page throws
the message away and reads the row again.

`gmake move-bytes` (docs/testing.md → What a move costs) measured one coop move
with two players, on 2026-10-06. Per move, both pages together:

| gametype | writes | loads | CDC bytes | refetch bytes | total bytes |
|---|---|---|---|---|---|
| crosswords_coop (Sunday 21×21) | 1 | 4 | 122,074 | 57,982 | 180,227 |
| codenamesduet | 2 | 8 | 80,502 | 34,672 | 115,424 |
| stackdown_coop | 2 | 8 | 63,662 | 24,716 | 88,537 |
| psychicnum_coop | 1 | 4 | 20,190 | 7,110 | 27,475 |

The frame is two to three times the re-read, and a move that writes the row
twice (a title update before the rebuild, `_advance_turn`, `_end_game`) pays
everything twice.

## The design

### One nudge per move, sent by a trigger

Two triggers on `common.games`, in `supabase/sql/common.sql`:

- **`AFTER UPDATE … FOR EACH ROW WHEN (old.updated_at IS DISTINCT FROM new.updated_at)`**
  sends `realtime.send('{}'::jsonb, 'changed', 'game:' || new.id, false)`.
- **`AFTER DELETE … FOR EACH ROW`** sends the same to `'game:' || old.id`.

Why it fires once per move: a move is one RPC, and an RPC is one transaction.
`common._stamp_games_updated_at` (`BEFORE UPDATE`) sets `updated_at := now()`,
and `now()` is the transaction's start time, the same for every statement in
it. So the move's first write changes `updated_at`, and every later write in
the same move stamps the same value and fails the `WHEN`.

Why firing on the FIRST write is safe: `realtime.send` is an `INSERT` into
`realtime.messages`, which Realtime reads through logical replication, so the
message is delivered at the commit, after every write of the move is visible,
and never for a rolled-back move (verified locally 2026-10-05).

What it covers with no census: every writer of `common.games` — each game's
`_rebuild_data_cols`, the title updates, `_advance_turn`, `_end_game`,
`set_current_view` — and `common.delete_game`, which today the page hears as a
DELETE. No game's SQL changes. A write the page doesn't show (`set_current_view`
on a join) costs one extra re-read, which is harmless.

`realtime.send` catches its own errors as a `WARNING`, so a failed send never
fails the move; the page stays stale until its next re-read.

A public topic is fine: anyone who knows a game id could hear "changed", which
under the trust model is nothing.

### The page listens on the room it already joins

`useCommonGame` already joins `game:<id>` for presence, manual pause and
suspend. In `joinRoom`:

- **adds** `ch.on('broadcast', { event: 'changed' }, () => load('event'))`;
- **drops** the `postgres_changes` handler and the `onPostgresAttached`
  re-read, and `'attached'` from `load`'s causes;
- **keeps** the re-read on `SUBSCRIBED` (the catch-up after a join or a
  reconnect) and the `resubscribeCount` bump there.

Games don't change: they are handed `game_data` as before.

## Steps

1. **Verify on the local stack before building. Done 2026-10-06**, with a
   probe copy of the trigger (since dropped) and a client on `game:<id>`:
   - `realtime.send(payload, event, topic, private default true)`; the order
     above is right.
   - Two writes in one transaction sent one nudge; two transactions sent two; a
     rolled-back write sent none; a real `psychicnum.submit_guess` sent one; a
     delete sent one.
   - The trigger function works as `security invoker`, like
     `_stamp_games_updated_at`: the RPCs are owned by `postgres`, which may
     insert into `realtime.messages`, and `authenticated` cannot update
     `common.games` directly.
   - **No deaf window found for broadcast from the database.** A nudge
     committed at `SUBSCRIBED` arrived 10 of 10 times on a warm tenant. After a
     restart of the Realtime container, three times, `SUBSCRIBED` came about 3s
     in and every one of 32 nudges sent every 250ms from that moment arrived,
     the first included. Not tried: a CPU-capped boot, or hosted Realtime. So
     the page needs no closer beyond its re-read on `SUBSCRIBED`.
2. **SQL** in `supabase/sql/common.sql`: the trigger function and the two
   triggers, beside `games_stamp_updated_at`. Behavior, so no migration.
3. **pgTAP**, a new `supabase/tests/common/` file: a transaction that writes the
   row twice inserts ONE `realtime.messages` row (topic `game:<id>`, event
   `changed`); a delete inserts one; a write that leaves `updated_at` alone
   (within the same transaction) inserts none. Each verified by planting.
   `function_grants_test.sql` covers the new function's grants.
4. **FE**: `useCommonGame` as above, and its docstring and the `joinRoom`
   comments.
5. **Tests**:
   - `useCommonGame.test.ts`: the `postgres_changes` handler and the attach
     cases become a `changed` broadcast case; the attach case goes.
   - `e2e/realtime-deaf-window.e2e.ts`: both layers watch the game room's
     `(attached)` line, which no longer exists. Retarget them to a hook that
     still subscribes to rows (`useClubGames`), or rewrite them to whatever step
     1 found. Ask before running any e2e.
6. **`gmake move-bytes`**: count `broadcast:changed` frames in the table's
   writes column, then run it before and after. Expected per page per move:
   one small frame and one re-read — crosswords about 180 KB to about 58 KB,
   stackdown about 88 KB to about 12 KB.
7. **Docs**:
   - src/common/realtime/doc.md: the game room hears a nudge; what the deaf
     window still covers.
   - src/common/game-page/doc.md.
   - docs/supabase.md → Realtime.
   - `useRealtimeRefetch`'s docstring ("A game's `useGame` … reloads off the
     page's `common.games` subscription").
   - `realtime_publication_test.sql`'s comment on who subscribes to
     `common.games`: the club page, still.
8. **Prod**: before deploying, check that the hosted Realtime version delivers
   broadcasts sent from the database (`realtime.send`, `realtime.messages`).

## Open

- **`useRefetchOnGameUpdate` has no callers**, and no game reads
  `resubscribeCount`, which only `GamePage` passes down. Whether both go is a
  separate question; this plan keeps `resubscribeCount` counting joins.

## Not in this plan

- **The club page.** `useClubGames` keeps its `postgres_changes` subscription.
  The same triggers can later send to `club:<handle>`, with an `AFTER INSERT`
  for a new game; until then `common.games` stays in the publication and keeps
  `REPLICA IDENTITY FULL` for the club page's DELETE.
- **Splitting what never changes out of `game_data`**, which shrinks the
  re-read that is left.
