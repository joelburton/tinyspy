-- ============================================================
-- Test: crosswords.submit_timeout — countdown expired
-- ============================================================
--
-- The FE fires this RPC when a timed game's countdown hits 0. It ends the
-- game as a LOSS for everyone: play_state → 'lost' (coop) / 'lost_compete'
-- (compete), status {mode, outcome:'timeout'}, every player's result
-- won = false.
--
-- Unlike codenamesduet / connections (which THROW on a second call),
-- crosswords.submit_timeout is idempotent by NO-OP: it returns silently
-- when the game isn't 'playing' (its only non-terminal state). That's the
-- load-bearing guard here — a timeout racing a just-recorded WIN must not
-- clobber it (group E). Every sibling tests submit_timeout; crosswords was
-- the last gap.
--
-- Coverage:
--   A. require_game_player: a non-player (dee) is rejected (42501).
--   B. coop timeout: playing → lost + timeout status + all-lose results.
--   C. idempotency: a second call on the now-terminal game is a silent no-op.
--   D. compete timeout: playing → lost_compete + timeout status + all-lose.
--   E. a timeout on an already-WON game does NOT overwrite the win.
--
-- See ./create_game_test.sql for the pgTAP primer + setup.psql fixtures.
-- ============================================================

begin;
set search_path = crosswords, common, public, extensions;
select plan(19);

\ir ../_shared/setup.psql
\ir setup.psql

-- Puzzles are superuser-seeded (authenticated has no INSERT on puzzles).
select pg_temp.xw_insert_puzzle('h-2x2', pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_id \gset

-- Club: ada, bea, cade are members; dee is the outsider (a non-player).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select common.create_club('XW Club', array['ada', 'bea', 'cade']) as club_handle \gset

-- Three games off the one puzzle: a coop to time out, a compete to time out,
-- and a coop we'll SOLVE first and then try to time out.
select id as gc_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop') \gset
select id as gp_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete') \gset
select id as gw_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop') \gset
reset role;

-- ── A. require_game_player gate ──────────────────────────────────────
-- dee is signed in but isn't in this game's roster (frozen at create_game).
-- The gate is the RPC's first statement, so it fires even while playing.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format('select crosswords.submit_timeout(%L::uuid)', :'gc_id'),
  '42501', null, 'submit_timeout: a non-player is rejected (require_game_player)');

-- ── B. Coop timeout: playing → lost ──────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format('select crosswords.submit_timeout(%L::uuid)', :'gc_id'),
  'submit_timeout: a player can time out a playing coop game');
reset role;

select is((select play_state from common.games where id = :'gc_id'), 'lost',
  'coop timeout → play_state lost');
select is((select is_terminal from common.games where id = :'gc_id'), true,
  'coop timeout → is_terminal');
select is((select status->>'outcome' from common.games where id = :'gc_id'), 'timeout',
  'coop timeout → status.outcome = timeout');
select is((select status->>'mode' from common.games where id = :'gc_id'), 'coop',
  'coop timeout → status.mode = coop');
select is(
  (select result->'won' from common.game_players
     where game_id = :'gc_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'false'::jsonb, 'coop timeout → ada result won = false');
select is(
  (select result->'won' from common.game_players
     where game_id = :'gc_id' and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'false'::jsonb, 'coop timeout → bea result won = false');

-- ── C. Idempotency: a second call is a silent no-op ──────────────────
-- crosswords returns without error when play_state isn't 'playing' (where
-- the sibling games throw). The already-terminal state is left untouched.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format('select crosswords.submit_timeout(%L::uuid)', :'gc_id'),
  'submit_timeout: a second call on a terminal game does not throw (no-op)');
reset role;
select is((select play_state from common.games where id = :'gc_id'), 'lost',
  'coop timeout: the second call left play_state unchanged (still lost)');

-- ── D. Compete timeout: playing → lost_compete ───────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format('select crosswords.submit_timeout(%L::uuid)', :'gp_id'),
  'submit_timeout: a player can time out a playing compete game');
reset role;
select is((select play_state from common.games where id = :'gp_id'), 'lost_compete',
  'compete timeout → play_state lost_compete');
select is((select status->>'outcome' from common.games where id = :'gp_id'), 'timeout',
  'compete timeout → status.outcome = timeout');
select is((select status->>'mode' from common.games where id = :'gp_id'), 'compete',
  'compete timeout → status.mode = compete');
select is(
  (select result->'won' from common.game_players
     where game_id = :'gp_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'false'::jsonb, 'compete timeout → ada result won = false');
select is(
  (select result->'won' from common.game_players
     where game_id = :'gp_id' and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'false'::jsonb, 'compete timeout → bea result won = false');

-- ── E. A timeout must NOT clobber an already-recorded WIN ─────────────
-- Solve gw fully (coop, ada only) → play_state 'won'. A racing timeout then
-- passes require_game_player but trips the play_state guard, so the win
-- stands. Answers: (0,0)C (0,1)A (1,0)T (1,1)S.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select set_cell from crosswords.set_cell(:'gw_id', 0, 0, 'c', false);
select set_cell from crosswords.set_cell(:'gw_id', 0, 1, 'a', false);
select set_cell from crosswords.set_cell(:'gw_id', 1, 0, 't', false);
select set_cell from crosswords.set_cell(:'gw_id', 1, 1, 's', false);
select lives_ok(
  format('select crosswords.submit_timeout(%L::uuid)', :'gw_id'),
  'submit_timeout: a timeout on an already-won game does not throw (no-op)');
reset role;
select is((select play_state from common.games where id = :'gw_id'), 'won',
  'a racing timeout leaves the recorded win intact (still won)');
select is(
  (select result->'won' from common.game_players
     where game_id = :'gw_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'true'::jsonb, 'the winner result stays won = true after the no-op timeout');

select * from finish();
rollback;
