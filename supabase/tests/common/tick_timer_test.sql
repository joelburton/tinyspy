-- ============================================================
-- Test: common.tick_timer + common.timers (the additive clock)
-- ============================================================
--
-- The game clock is an additive tick count, advanced by every
-- actively-playing client once a second. tick_timer's conditional
-- (`now() - last_tick >= 1 second`) carries the whole design:
--   - advances by AT MOST 1 per real second;
--   - dedupes across players (concurrent calls in the same second
--     don't double-count);
--   - a pause / idle GAP costs +1 on resume, not the gap;
--   - returns the current count either way.
--
-- We control `last_tick` directly (as postgres) to simulate elapsed
-- real time deterministically — no sleeping.
--
-- Personas: ada + bea in the club; dee is the outsider.

begin;

set search_path = common, public, extensions;

\ir ../_shared/setup.psql

select plan(9);

-- Set JWT claims WITHOUT switching role away from postgres, so we
-- keep execute privilege on the security-revoked tick_timer while
-- auth.uid() still resolves (same trick as games_test.sql).
create function pg_temp.as_jwt_only(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
end;
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Tick Club', array['ada','bea']) as handle;

reset role;
select set_config('request.jwt.claims', '', true);

-- ============================================================
-- create_game seeds a timers row at 0
-- ============================================================
-- Called as postgres + ada's JWT (common.create_game isn't granted
-- to authenticated — gametype RPCs call it — but it needs a real
-- auth.uid()). The point is the `insert into common.timers` it does.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
create temp table seeded on commit drop as
select common.create_game(
  (select handle from club),
  'tinyspy',
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'Seeded game',
  '{}'::jsonb,
  null
) as id;

select is(
  (select ticks from common.timers where game_id = (select id from seeded)),
  0,
  'create_game seeds a timers row at ticks = 0'
);

-- ============================================================
-- A game + timer we fully control (direct insert)
-- ============================================================
create temp table g on commit drop as select gen_random_uuid() as id;
grant select on g to authenticated;
insert into common.games (id, club_handle, gametype, title, setup)
  select id, (select handle from club), 'tinyspy', 'Tick test', '{}'::jsonb from g;
insert into common.timers (game_id, ticks, last_tick)
  select id, 0, now() from g;

-- (2) A second hasn't passed yet → no advance, returns 0.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select is(
  common.tick_timer((select id from g)),
  0,
  'tick_timer: within the first second → no advance, returns 0'
);

-- Rewind last_tick by 2s to simulate a real second elapsing.
reset role;
select set_config('request.jwt.claims', '', true);
update common.timers set last_tick = now() - interval '2 seconds'
 where game_id = (select id from g);

-- (3) Now a second has passed → advance to 1.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select is(
  common.tick_timer((select id from g)),
  1,
  'tick_timer: ≥1s elapsed → advances to 1'
);

-- (4) Dedup: an immediate second call (last_tick just set to now)
--     does NOT advance — returns the same 1. Stands in for a second
--     player calling within the same second.
select is(
  common.tick_timer((select id from g)),
  1,
  'tick_timer: a call within the same second does not double-count'
);

-- (5) bea (a second player) calling, still within the second, also
--     no-ops — the clock is per-game, not per-player.
select pg_temp.as_jwt_only('bea22222-2222-2222-2222-222222222222');
select is(
  common.tick_timer((select id from g)),
  1,
  'tick_timer: a different player in the same second also no-ops'
);

-- (6) Pause/idle gap: rewind last_tick by a full minute (nobody
--     called for a minute). The next call adds +1, NOT +60.
reset role;
select set_config('request.jwt.claims', '', true);
update common.timers set last_tick = now() - interval '60 seconds'
 where game_id = (select id from g);

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select is(
  common.tick_timer((select id from g)),
  2,
  'tick_timer: a 60s gap costs +1 (resume), not +60'
);

-- (7) The row reflects the advance + last_tick was refreshed.
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select ticks from common.timers where game_id = (select id from g)),
  2,
  'tick_timer: persisted ticks = 2'
);

-- (8) Non-member (dee) is rejected.
select pg_temp.as_jwt_only('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select common.tick_timer(%L::uuid) $$, (select id from g)),
  '42501',
  'not a member of this club',
  'tick_timer: non-member is rejected'
);

-- (9) Unknown game raises P0002.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  $$ select common.tick_timer('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  'P0002',
  'game not found',
  'tick_timer: unknown game raises P0002'
);

select * from finish();
rollback;
