-- cs-unmet

-- ============================================================
-- Test: crosswords.submit_timeout — countdown expired
-- ============================================================
--
-- The FE fires this RPC when a timed game's countdown hits 0. It ends the
-- game as a LOSS for everyone, in either mode: timeout/'timeout', ended by
-- nobody (crosswords has no turn order), every player unranked and lost.
--
-- A second call finds the game ended and answers the game-over race, which
-- is the load-bearing guard here — a timeout racing a just-recorded WIN must
-- not clobber it (group E).
--
-- Coverage:
--   A. _require_game_player: a non-player (dee) is rejected (PN253).
--   B. coop timeout: the game ends lost, timeout, nobody ranked.
--   C. idempotency: a second call on the ended game is the game-over race.
--   D. compete timeout: the same ending.
--   E. a timeout on an already-WON game does NOT overwrite the win.
--
-- See ./create_game_test.sql for the pgTAP primer + setup.psql fixtures.
-- ============================================================

begin;
set search_path = crosswords, common, public, extensions;
select plan(19);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- Puzzles are superuser-seeded (authenticated has no INSERT on puzzles).
select pg_temp.xw_insert_puzzle('h-2x2', pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_id \gset

-- Club: ada, bea, cade are members; dee is the outsider (a non-player).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.create_club('XW Club', array['ada', 'bea', 'cade']) as club_handle \gset

-- Three games off the one puzzle: a coop to time out, a compete to time out,
-- and a coop we'll SOLVE first and then try to time out.
select (crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as gc_id \gset
select (crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as gp_id \gset
select (crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop')->'data'->>'id')::uuid as gw_id \gset
reset role;

-- ── A. _require_game_player gate ──────────────────────────────────────
-- dee is signed in but isn't in this game's roster (frozen at create_game).
-- The gate comes before the ended check, so it fires while the game is on.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  crosswords.submit_timeout(:'gc_id'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'submit_timeout: a non-player is rejected (_require_game_player)');

-- ── B. Coop timeout: the game ends lost ──────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format('select crosswords.submit_timeout(%L::uuid)', :'gc_id'),
  'submit_timeout: a player can time out a coop game being played');
reset role;

select is((select game_ended_outcome from common.games where id = :'gc_id'), 'lost',
  'coop timeout → the game ends lost');
select isnt((select ended_at from common.games where id = :'gc_id'), null,
  'coop timeout → ended_at set');
select is((select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = :'gc_id'),
  'timeout/timeout',
  'coop timeout → the reason is timeout');
select is((select game_ended_by_user_id from common.games where id = :'gc_id'), null,
  'coop timeout → ended by nobody');
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
     where game_id = :'gc_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'unranked/lost', 'coop timeout → ada is unranked and lost');
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
     where game_id = :'gc_id' and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'unranked/lost', 'coop timeout → bea is unranked and lost');

-- ── C. Idempotency: a second call is the game-over race ──────────────
-- The ended game is left untouched.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  crosswords.submit_timeout(:'gc_id'),
  '{"type":"not-ok","severity":"race","dbcode":"PN486","message":"Game over"}'::jsonb,
  'submit_timeout: a second call on an ended game is the game-over race');
reset role;
select is((select game_ended_reason || '/' || game_ended_outcome from common.games where id = :'gc_id'),
  'timeout/lost',
  'coop timeout: the second call left the ending unchanged (still a timeout loss)');

-- ── D. Compete timeout: the game ends lost ───────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format('select crosswords.submit_timeout(%L::uuid)', :'gp_id'),
  'submit_timeout: a player can time out a compete game being played');
reset role;
select is((select game_ended_outcome from common.games where id = :'gp_id'), 'lost',
  'compete timeout → the game ends lost');
select is((select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = :'gp_id'),
  'timeout/timeout',
  'compete timeout → the reason is timeout');
select is((select game_ended_by_user_id from common.games where id = :'gp_id'), null,
  'compete timeout → ended by nobody');
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
     where game_id = :'gp_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'unranked/lost', 'compete timeout → ada is unranked and lost');
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
     where game_id = :'gp_id' and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'unranked/lost', 'compete timeout → bea is unranked and lost');

-- ── E. A timeout must NOT clobber an already-recorded WIN ─────────────
-- Solve gw fully (coop, ada only) → the game ends won. A racing timeout then
-- passes _require_game_player but trips the ended guard, so the win stands.
-- Answers: (0,0)C (0,1)A (1,0)T (1,1)S.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.set_cell(:'gw_id', 0, 0, 'c', false);
select crosswords.set_cell(:'gw_id', 0, 1, 'a', false);
select crosswords.set_cell(:'gw_id', 1, 0, 't', false);
select crosswords.set_cell(:'gw_id', 1, 1, 's', false);
select pg_temp.envelope_is(
  crosswords.submit_timeout(:'gw_id'),
  '{"type":"not-ok","severity":"race","dbcode":"PN486","message":"Game over"}'::jsonb,
  'submit_timeout: a timeout on an already-won game is the game-over race');
reset role;
select is((select game_ended_outcome || '/' || game_ended_reason from common.games where id = :'gw_id'),
  'won/reached_goal',
  'a racing timeout leaves the recorded win intact (still won)');
select is(
  (select final_ranking || '/' || outcome from common.game_players
     where game_id = :'gw_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won', 'the winner stays ranked 1, won, after the refused timeout');

select * from finish();
rollback;
