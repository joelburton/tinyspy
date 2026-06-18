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
-- Tests the chat plumbing standalone, with no game involved.
-- ClubChatPanel (used by every game's BoardScreen) calls
-- common.send_message and reads common.messages via RLS — this
-- file exercises both directly.
--
-- See `tinyspy/create_game_test.sql` for the pgTAP primer.

begin;

set search_path = common, public, extensions;

\ir ../_shared/setup.psql

select plan(10);

-- Cast: ada + bea inside a club; dee outside it (the outsider
-- whose calls + reads should all be blocked).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

-- ============================================================
-- send_message rejection paths
-- ============================================================
-- Clear ada's auth context for the unauthenticated check. Note
-- the `select set_config(...) where false` shortcut only works
-- when no `as_user` has been called yet on this connection —
-- Postgres skips the SELECT-list expressions when `WHERE false`
-- filters out the row, so the side effects never fire. After an
-- as_user call, we need real SELECTs (no `where false`) to
-- actually run set_config and roll the role back to postgres.

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select throws_ok(
  format($q$ select common.send_message(%L, 'hi') $q$, (select handle from club)),
  '42501',
  'must be authenticated',
  'send_message: not authenticated raises 42501'
);

-- dee (a real user) is not in this club.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($q$ select common.send_message(%L, 'sneaking in') $q$, (select handle from club)),
  '42501',
  'not a member of this club',
  'send_message: non-member is rejected'
);

-- ada IS a member, so she can be used for the empty/long checks.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select throws_ok(
  format($q$ select common.send_message(%L, '   ') $q$, (select handle from club)),
  'P0001',
  'message must not be empty',
  'send_message: whitespace-only message is rejected'
);

select throws_ok(
  format($q$ select common.send_message(%L, repeat('x', 1001)) $q$, (select handle from club)),
  'P0001',
  'message too long (max 1000 chars)',
  'send_message: over-1000-char message is rejected'
);

-- ============================================================
-- send_message happy path
-- ============================================================

select lives_ok(
  format($q$ select common.send_message(%L, 'hello from ada') $q$, (select handle from club)),
  'send_message: member can post a normal message'
);

select is(
  (select count(*) from common.messages where club_handle = (select handle from club)),
  1::bigint,
  'send_message: row was inserted'
);

select is(
  (select content from common.messages where club_handle = (select handle from club) limit 1),
  'hello from ada',
  'send_message: content was preserved verbatim'
);

-- ============================================================
-- RLS: bea can see ada's message, dee cannot
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from common.messages where club_handle = (select handle from club)),
  1::bigint,
  'RLS: fellow member can see club messages'
);

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*) from common.messages where club_handle = (select handle from club)),
  0::bigint,
  'RLS: non-member cannot see club messages'
);

-- ============================================================
-- Direct INSERT blocked
-- ============================================================
-- authenticated has SELECT but no INSERT grant on common.messages,
-- so even a dee-with-a-correct-club_handle can't write.

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $q$ insert into common.messages (club_handle, user_id, content)
        values (%L, %L, 'direct write') $q$,
    (select handle from club),
    'dee44444-4444-4444-4444-444444444444'
  ),
  '42501',
  null,
  'direct INSERT to common.messages is blocked (no grant)'
);

select * from finish();
rollback;
