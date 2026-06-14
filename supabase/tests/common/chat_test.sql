-- ============================================================
-- Test: common.send_message + common.messages RLS
-- ============================================================
--
-- Coverage:
--   - send_message rejection paths: not authenticated, non-member,
--     empty/whitespace-only, over 1000 chars
--   - send_message happy path: row persists with correct fields
--   - RLS: non-member sees zero messages from a club they're
--     not in; member sees their club's messages
--   - direct INSERT to common.messages is blocked
--     (no grant on authenticated)
--
-- Tests existence of the chat plumbing only. Tinyspy will rewire
-- its ChatPanel to call common.send_message in commit 5; this file
-- exercises the RPC standalone.
--
-- See `tinyspy/lobby_test.sql` for the pgTAP primer.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = common, public, extensions;

select plan(10);

-- ============================================================
-- Fixtures: three users — alice + bob in a club, carol outside.
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
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Alice creates a 2-member club with bob.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('Alice and Bob', array['alice','bob']);

-- ============================================================
-- send_message rejection paths
-- ============================================================
-- Clear alice's auth context for the unauthenticated check. The
-- `select set_config(...) where false` idiom from lobby_test only
-- worked there because no `as_user` had been called yet — Postgres
-- skips the SELECT-list expressions when `WHERE false` filters out
-- the row, so the side effects never fire. We need real SELECTs
-- here.

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select throws_ok(
  format($q$ select common.send_message(%L, 'hi') $q$, (select id from club)),
  '42501',
  'must be authenticated',
  'send_message: not authenticated raises 42501'
);

-- carol (a real user) is not in this club.
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select throws_ok(
  format($q$ select common.send_message(%L, 'sneaking in') $q$, (select id from club)),
  '42501',
  'not a member of this club',
  'send_message: non-member is rejected'
);

-- alice IS a member, so she can be used for the empty/long checks.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');

select throws_ok(
  format($q$ select common.send_message(%L, '   ') $q$, (select id from club)),
  'P0001',
  'message must not be empty',
  'send_message: whitespace-only message is rejected'
);

select throws_ok(
  format($q$ select common.send_message(%L, repeat('x', 1001)) $q$, (select id from club)),
  'P0001',
  'message too long (max 1000 chars)',
  'send_message: over-1000-char message is rejected'
);

-- ============================================================
-- send_message happy path
-- ============================================================

select lives_ok(
  format($q$ select common.send_message(%L, 'hello from alice') $q$, (select id from club)),
  'send_message: member can post a normal message'
);

select is(
  (select count(*) from common.messages where club_id = (select id from club)),
  1::bigint,
  'send_message: row was inserted'
);

select is(
  (select content from common.messages where club_id = (select id from club) limit 1),
  'hello from alice',
  'send_message: content was preserved verbatim'
);

-- ============================================================
-- RLS: bob can see alice's message, carol cannot
-- ============================================================

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select is(
  (select count(*) from common.messages where club_id = (select id from club)),
  1::bigint,
  'RLS: fellow member can see club messages'
);

select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select is(
  (select count(*) from common.messages where club_id = (select id from club)),
  0::bigint,
  'RLS: non-member cannot see club messages'
);

-- ============================================================
-- Direct INSERT blocked
-- ============================================================
-- authenticated has SELECT but no INSERT grant on common.messages,
-- so even a carol-with-a-correct-club_id can't write.

select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select throws_ok(
  format(
    $q$ insert into common.messages (club_id, user_id, content)
        values (%L, %L, 'direct write') $q$,
    (select id from club),
    '33333333-3333-3333-3333-333333333333'
  ),
  '42501',
  null,
  'direct INSERT to common.messages is blocked (no grant)'
);

select * from finish();
rollback;
