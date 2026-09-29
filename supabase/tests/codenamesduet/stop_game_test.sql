-- cs-blessed-codenamesduet

-- ============================================================
-- Test: codenamesduet.stop_game — manual stop
-- ============================================================
--
-- The friends' explicit "we're done here" button. Any current game
-- player can fire it in ordinary play or in sudden death; it ends the
-- game NEUTRAL (stopped/'stopped', ended by the caller) with every
-- player unranked and neutral — stopping on purpose is a valid outcome,
-- not a loss. Same lock / auth / ended gate as submit_timeout.
--
-- Coverage:
--   - happy path from ordinary play: ended_at set, outcome neutral,
--     reason stopped by the caller, both players unranked and neutral
--   - the codenamesduet.games row is written (the clue seat cleared)
--   - idempotency: a second call on the ended game answers the
--     shared game-over race
--   - _require_game_player: a non-player is rejected
--
-- See ../codenamesduet/create_game_test.sql for the pgTAP primer and
-- ./submit_timeout_test.sql for the sibling timer-driven ending.
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(9);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- 2-member club; ada + bea are seated. dee is signed in but
-- outside the club / not playing the game.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada and Bea', array['ada','bea']) as handle;

-- ============================================================
-- (1) Happy path: playing → ended via stop_game
-- ============================================================

create temp table g on commit drop as
select (codenamesduet.create_game(
  (select handle from club),
  pg_temp.codenamesduet_setup(9),
  pg_temp.codenamesduet_players()
)->'data'->>'id')::uuid as id;

-- The row's physical address before the end — see the write assertion below.
create temp table ctid_before on commit drop as
select ctid::text as row_address from codenamesduet.games where game_id = (select id from g);

select lives_ok(
  format(
    $$ select codenamesduet.stop_game(%L::uuid) $$,
    (select id from g)
  ),
  'stop_game: playing game accepts the call'
);

-- stop_game writes codenamesduet.games — it clears the clue seat, since
-- nobody clues in an ended game. An UPDATE always moves the tuple, while the
-- `for update` lock stop_game also takes does not. (`xmin` cannot tell: the
-- whole test is one transaction, create_game's write included.)
select isnt(
  (select ctid::text from codenamesduet.games where game_id = (select id from g)),
  (select row_address from ctid_before),
  'stop_game: writes the codenamesduet.games row (the clue seat cleared)'
);

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g)),
  'neutral',
  'stop_game: the game ends neutral'
);

-- stop_game ends the game on the common header, by the caller.
select is(
  (select game_ended_by_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'stop_game: ended_at set on the common header, ended by the caller'
);

-- The reason is carried through to common.games.
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games
    where id = (select id from g)),
  'stopped/stopped',
  'stop_game: the reason is stopped'
);

-- Cooperative game: nobody wins a manually-stopped game. Both seated players
-- are unranked and neutral.
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'unranked/neutral',
  'stop_game: ada is unranked and neutral'
);
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'unranked/neutral',
  'stop_game: bea is unranked and neutral'
);

-- ============================================================
-- (2) Idempotency — second call rejected
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  codenamesduet.stop_game((select id from g)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'stop_game: rejects on games that have ended');

-- ============================================================
-- (3) Non-player rejected (_require_game_player gate)
-- ============================================================
-- dee is signed in but isn't in common.game_players for this game —
-- the player roster is frozen at create_game time. Use a fresh game
-- so the game-ended guard doesn't fire first.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (codenamesduet.create_game(
  (select handle from club),
  pg_temp.codenamesduet_setup(9),
  pg_temp.codenamesduet_players()
)->'data'->>'id')::uuid as id;

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  codenamesduet.stop_game((select id from g2)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'stop_game: non-player rejected via _require_game_player');

-- ============================================================
select * from finish();
rollback;
