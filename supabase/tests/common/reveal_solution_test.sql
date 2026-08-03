-- ============================================================
-- Test: common.reveal_solution + the common.games.solution_revealed flag
-- ============================================================
--
-- The ONE place that answers "may the players see the solution?" — see the
-- column comment in the baseline migration and docs/ui.md → Terminal results.
-- The flag replaced per-game FE state, so the rules it has to keep are:
--
--   - a fresh game starts hidden;
--   - reveal is TERMINAL-ONLY — "ended for everyone", so a conceded compete
--     player can't open the answer while the others are still racing;
--   - non-players can't reveal at all;
--   - it's idempotent (a second click, or a peer's, is a no-op);
--   - a WIN reveals by itself, with no call;
--   - a gametype that does NOT hide its solution (`gametypes.hides_solution`
--     false — the word-find games, connections, wordiply) reveals at any
--     ending, with no caller passing anything;
--   - and `reset_game` CLEARS it, so a replay of the same board starts blind.
--
-- The last one is the whole reason the flag is common: every game gets the
-- re-hide for free and none of them can forget it.
--
-- Gametype-agnostic like concede_test — these are all common-layer RPCs, so
-- this file doesn't couple to any one game's create_game. It does pick
-- gametypes for their REGISTRY flag: wordle_compete hides its solution,
-- spellingbee_compete doesn't.
-- ============================================================

begin;

set search_path = common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql

-- Set JWT claims WITHOUT switching role away from postgres — keeps execute
-- privilege on the internal RPCs (same trick as concede_test / games_test).
create function pg_temp.as_jwt_only(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
end;
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea']) as handle;

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config(
  'test.game_id',
  (common.create_game(
    (select handle from club),
    'wordle_compete',   -- hides_solution = true
    array[
      'ada11111-1111-1111-1111-111111111111'::uuid,
      'bea22222-2222-2222-2222-222222222222'::uuid
    ],
    'test-title',
    '{}'::jsonb,
    null
  ))::text,
  true
);
reset role;
select set_config('request.jwt.claims', '', true);

-- ─── (1) A fresh game starts hidden ───
select is(
  (select solution_revealed from common.games where id = current_setting('test.game_id')::uuid),
  false,
  'a new game starts with the solution hidden'
);

-- ─── (2) Mid-game reveal is rejected — "ended for everyone" is the gate ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select common.reveal_solution(%L) $$, current_setting('test.game_id')),
  'P0001',
  'game is not over',
  'reveal is rejected while the game is in progress'
);

-- ─── (3) …and conceding does NOT open that door: the others are still racing ───
select common.concede(current_setting('test.game_id')::uuid);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select is_terminal from common.games where id = current_setting('test.game_id')::uuid),
  false,
  'one conceder does not end the game for everyone'
);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select common.reveal_solution(%L) $$, current_setting('test.game_id')),
  'P0001',
  'game is not over',
  'a conceded player cannot reveal while the others race'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- ─── (4) A plain (non-win) ending leaves it hidden ───
select common.end_game(
  current_setting('test.game_id')::uuid, 'ended', '{}'::jsonb, null);
select is(
  (select solution_revealed from common.games where id = current_setting('test.game_id')::uuid),
  false,
  'a neutral ending does not reveal by itself'
);

-- ─── (5) A non-player is refused even at terminal ───
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select throws_ok(
  format($$ select common.reveal_solution(%L) $$, current_setting('test.game_id')),
  '42501',
  'not playing this game',
  'a non-player cannot reveal'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- ─── (6) A player reveals, and it's shared + idempotent ───
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format($$ select common.reveal_solution(%L) $$, current_setting('test.game_id')),
  'any game player may reveal once the game is over'
);
select lives_ok(
  format($$ select common.reveal_solution(%L) $$, current_setting('test.game_id')),
  'revealing twice is a no-op, not an error'
);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select solution_revealed from common.games where id = current_setting('test.game_id')::uuid),
  true,
  'the flag is set for the whole table, not per player'
);

-- ─── (7) reset_game re-hides it — the replay starts blind ───
select common.reset_game(current_setting('test.game_id')::uuid, '{}'::jsonb);
select is(
  (select solution_revealed from common.games where id = current_setting('test.game_id')::uuid),
  false,
  'reset_game clears the flag, so a replayed board is hidden again'
);

-- ─── (8) A WIN reveals with no call ───
select common.end_game(
  current_setting('test.game_id')::uuid, 'won_compete', '{}'::jsonb, null);
select is(
  (select solution_revealed from common.games where id = current_setting('test.game_id')::uuid),
  true,
  'a win reveals by itself — you produced the solution to get there'
);

-- ─── (9) A gametype that doesn't hide its solution reveals at ANY ending ───
-- No caller passes anything: end_game reads gametypes.hides_solution, which is
-- what keeps common.concede's all-conceded terminal right too.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config(
  'test.open_game',
  (common.create_game(
    (select handle from club),
    'spellingbee_compete',   -- hides_solution = false
    array[
      'ada11111-1111-1111-1111-111111111111'::uuid,
      'bea22222-2222-2222-2222-222222222222'::uuid
    ],
    'open-title',
    '{}'::jsonb,
    null
  ))::text,
  true
);
reset role;
select set_config('request.jwt.claims', '', true);
select common.end_game(
  current_setting('test.open_game')::uuid, 'lost_compete', '{}'::jsonb, null);
select is(
  (select solution_revealed from common.games where id = current_setting('test.open_game')::uuid),
  true,
  'a game that never hides its solution reveals on a loss, with no caller opt-in'
);

select * from finish();
rollback;
