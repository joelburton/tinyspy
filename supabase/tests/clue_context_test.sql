-- ============================================================
-- Test: get_clue_context (RPC used by suggest-clue Edge Function)
-- ============================================================
--
-- The RPC's job is to enforce "you are the current clue-giver in an
-- active game" so the Edge Function can stay thin. This file checks
-- the three rejection paths plus one happy path that returns a shape
-- with the expected keys.
--
-- See lobby_test.sql for the pgTAP primer.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = tinyspy, common, public, extensions;

select plan(6);

-- ============================================================
-- Fixtures
-- ============================================================

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@test.local', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@test.local', now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'carol@test.local', now(), now(), now());

create function pg_temp.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Set up an active game with alice as clue-giver (default after start).
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table g on commit drop as select * from create_game();

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select join_game((select join_code from g));

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select start_game((select id from g));

-- ============================================================
-- (1) Non-player rejection
-- ============================================================

select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$ select get_clue_context((select id from g)) $$,
  '42501',
  'not a player in this game',
  'get_clue_context rejects a non-player caller'
);

-- ============================================================
-- (2) Bob (the non-clue-giver) cannot ask
-- ============================================================

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$ select get_clue_context((select id from g)) $$,
  'P0001',
  'only the current clue-giver can request a suggestion',
  'get_clue_context rejects the non-clue-giver player'
);

-- ============================================================
-- (3) Lobby-state game is rejected (separate game still in lobby)
-- ============================================================

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table lobby_game on commit drop as select * from create_game();
select throws_ok(
  $$ select get_clue_context((select id from lobby_game)) $$,
  'P0001',
  'no suggestions outside of active play',
  'get_clue_context rejects when status is lobby'
);

-- ============================================================
-- (4)–(6) Happy path: alice gets a context with the expected keys
-- and the greens array has exactly 9 entries (one per A-side green).
-- ============================================================

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');

create temp table ctx on commit drop as
  select get_clue_context((select id from g)) as data;

select is(
  (select jsonb_typeof(data) from ctx),
  'object',
  'returns a jsonb object'
);

select is(
  (select jsonb_array_length(data->'greens') from ctx),
  9,
  'greens array has 9 entries (the A-side green count at start)'
);

select is(
  (select jsonb_array_length(data->'previous_clues') from ctx),
  0,
  'previous_clues array is empty before any clue submitted'
);

-- ============================================================
select * from finish();
rollback;
