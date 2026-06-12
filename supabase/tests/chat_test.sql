-- ============================================================
-- Test: in-game chat (messages table + send_message RPC)
-- ============================================================
--
-- Coverage:
--   - send_message rejection paths: non-player, empty, too long
--   - happy path: message persists, sender visible via the embed
--   - RLS: a non-player cannot see chat for a game they're outside
--   - direct INSERT to messages is blocked (no grant on authenticated)
--
-- send_message doesn't check games.status, so we run against a game
-- still in lobby — no need to seat keys to exercise chat.
--
-- See `lobby_test.sql` for the pgTAP primer.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

-- ============================================================
-- Fixtures: three users — alice + bob seated, carol outside
-- ============================================================

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@test.local', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@test.local',   now(), now(), now()),
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

-- Alice creates a game; Bob joins.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table g on commit drop as select * from create_game();

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select join_game((select join_code from g));

-- ============================================================
-- (1) Non-player cannot send a message
-- ============================================================

select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$ select send_message((select id from g), 'hi from outside') $$,
  '42501',
  'not a player in this game',
  'send_message rejects a caller who is not seated in the game'
);

-- ============================================================
-- (2) Empty / whitespace-only content is rejected
-- ============================================================

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$ select send_message((select id from g), '') $$,
  'P0001',
  'message must not be empty',
  'send_message rejects an empty body'
);

select throws_ok(
  $$ select send_message((select id from g), '   ') $$,
  'P0001',
  'message must not be empty',
  'send_message rejects whitespace-only content (trimmed to empty)'
);

-- ============================================================
-- (3) Content > 1000 chars is rejected
-- ============================================================

select throws_ok(
  format($$ select send_message(%L, %L) $$,
         (select id from g)::text,
         repeat('a', 1001)),
  'P0001',
  'message too long (max 1000 chars)',
  'send_message rejects content over the 1000-char cap'
);

-- ============================================================
-- (4) Happy path: alice sends a message, persists with her user_id
-- ============================================================

select lives_ok(
  $$ select send_message((select id from g), 'hello bob') $$,
  'send_message succeeds for a seated player with valid content'
);

select is(
  (select content from messages
   where game_id = (select id from g)
     and user_id = '11111111-1111-1111-1111-111111111111'),
  'hello bob',
  'message row persists with the trimmed content and the sender id'
);

-- ============================================================
-- (5) RLS — carol can't see the chat; alice can
-- ============================================================

-- Alice (a player) sees the message.
select is(
  (select count(*) from messages where game_id = (select id from g)),
  1::bigint,
  'sanity: alice (a player) sees the messages row'
);

-- Carol (not a player) sees nothing.
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select is(
  (select count(*) from messages where game_id = (select id from g)),
  0::bigint,
  'carol (not a player) cannot SELECT messages — RLS filters the row out'
);

-- ============================================================
-- (6) Direct INSERT is blocked by the missing grant
-- ============================================================
-- Same defense-in-depth pattern as rls_test.sql: there's no INSERT
-- policy on messages and no INSERT grant to authenticated, so a
-- direct write fails with "permission denied" before RLS even runs.

select throws_ok(
  $$ insert into messages (game_id, user_id, content)
     values ((select id from g),
             '33333333-3333-3333-3333-333333333333',
             'sneaky') $$,
  '42501',
  'permission denied for table messages',
  'direct INSERT into messages is blocked (no grant on authenticated)'
);

-- ============================================================
select * from finish();
rollback;
