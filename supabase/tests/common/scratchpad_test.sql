begin;
set search_path = common, public, extensions;
select plan(12);

\ir ../_shared/setup.psql

-- A club (ada, bea, cade) + a game with ada & bea as players. The game row
-- is inserted directly (the scratchpad is a common feature; no game schema
-- needed) — crosswords_coop is just a registered gametype to satisfy the FK.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select common.create_club('SP Club', array['ada', 'bea', 'cade']) as club_handle \gset
reset role;

insert into common.games (club_handle, gametype, created_by, title, setup)
values (:'club_handle', 'crosswords_coop',
        'ada11111-1111-1111-1111-111111111111', 'Scratchpad game', '{}'::jsonb)
returning id as game_id \gset
insert into common.game_players (game_id, user_id) values
  (:'game_id', 'ada11111-1111-1111-1111-111111111111'),
  (:'game_id', 'bea22222-2222-2222-2222-222222222222');

-- ── Shared pad (owner null): any player writes; version bumps ─────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select common.set_scratchpad(:'game_id'::uuid, null::uuid, 'ada was here') as v1 \gset
select is(:'v1'::bigint, 0::bigint, 'first shared-pad write returns version 0');

select common.set_scratchpad(:'game_id'::uuid, null::uuid, 'edited') as v2 \gset
select is(:'v2'::bigint, 1::bigint, 'second shared-pad write bumps version to 1');
reset role;

select is(
  (select body from common.game_scratchpads where game_id = :'game_id' and owner_id is null),
  'edited', 'shared pad body persists');

-- bea (another player) can also write the shared pad.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format($$ select common.set_scratchpad(%L::uuid, null::uuid, 'bea too') $$, :'game_id'),
  'any player can write the shared pad');
reset role;

-- ── Private pads (owner = self) ──────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format($$ select common.set_scratchpad(%L::uuid, %L::uuid, 'ada private') $$,
         :'game_id', 'ada11111-1111-1111-1111-111111111111'),
  'a player can write their own private pad');

-- ada cannot write bea's private pad.
select throws_ok(
  format($$ select common.set_scratchpad(%L::uuid, %L::uuid, 'sneaky') $$,
         :'game_id', 'bea22222-2222-2222-2222-222222222222'),
  '42501', null, 'cannot write another player''s private pad');
reset role;

-- bea writes her own private pad (for the RLS test below).
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select common.set_scratchpad(:'game_id'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid, 'bea private');
reset role;

-- Non-player cannot write.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select common.set_scratchpad(%L::uuid, null::uuid, 'nope') $$, :'game_id'),
  '42501', null, 'a non-player cannot write the scratchpad');
reset role;

-- ── RLS: shared + own private visible; other's private hidden ────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from common.game_scratchpads
     where game_id = :'game_id' and owner_id is null),
  1, 'ada sees the shared pad');
select is(
  (select count(*)::int from common.game_scratchpads
     where game_id = :'game_id' and owner_id = 'ada11111-1111-1111-1111-111111111111'),
  1, 'ada sees her own private pad');
select is(
  (select count(*)::int from common.game_scratchpads
     where game_id = :'game_id' and owner_id = 'bea22222-2222-2222-2222-222222222222'),
  0, 'ada does NOT see bea''s private pad (RLS)');
reset role;

-- Non-player sees nothing at all.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from common.game_scratchpads where game_id = :'game_id'),
  0, 'a non-player sees no scratchpads');
reset role;

-- Over-length body is rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select common.set_scratchpad(%L::uuid, null::uuid, %L) $$,
         :'game_id', repeat('x', 10001)),
  'P0001', null, 'a body over 10000 chars is rejected');
reset role;

select * from finish();
rollback;
