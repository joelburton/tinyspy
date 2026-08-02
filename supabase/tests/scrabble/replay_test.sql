-- ============================================================
-- Test: scrabble.replay_board (deal this game again from scratch)
-- ============================================================
-- The "Replay board" game-menu item. scrabble's 15×15 grid is the standard
-- layout, not a generated puzzle, so a replay restores the SETUP (same club,
-- roster, seats, dictionary bands, AI opponents) and RE-DEALS: fresh bag, new
-- racks, empty grid. Both modes reset every seat. Available from a finished
-- game OR mid-game; any game player may call it; a non-player is rejected.
--
-- The three subtleties the RPC calls out, all pinned here:
--   - `version` is BUMPED, not zeroed (a stale in-flight move must fail its
--     optimistic check rather than land on the new deal);
--   - the title stops advertising the previous deal's words;
--   - coop turn-order rewinds to the player seated first.

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(17);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select common.create_club('Scrabble rp', array['ada', 'bea']) as handle;
reset role;

-- ─── Coop: play a word, end, then replay ─────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g1 on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');
reset role;

-- Rig a known rack + play CAT through the centre, then end the game: that
-- leaves tiles on the board, a play row, a non-zero score, a rewritten title
-- and a terminal game — the full state a replay must undo.
select pg_temp.sc_coop((select id from g1), array['C','A','T','X','Y','Z','Q'],
                       array['E','E','E','E','E','E','E']);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.play_word((select id from g1),
  (select version from scrabble.games where id = (select id from g1)),
  '[{"x":7,"y":7,"letter":"C","blank":false},
    {"x":8,"y":7,"letter":"A","blank":false},
    {"x":9,"y":7,"letter":"T","blank":false}]'::jsonb,
  array['CAT'], 5);
select scrabble.end_game((select id from g1));
reset role;

-- Preconditions: terminal, a play logged, tiles on the board, title rewritten.
select ok((select is_terminal from common.games where id = (select id from g1)),
  'coop: precondition — the ended game is terminal');
-- TWO rows: the played word, plus the 'forfeit' row coop's end_game writes for
-- the leftover-tile penalty (see end_game_test.sql).
select is((select count(*) from scrabble.plays where game_id = (select id from g1)),
  2::bigint, 'coop: precondition — the play + the end-game forfeit are logged');
select isnt((select title from common.games where id = (select id from g1)),
  'New game', 'coop: precondition — the title was rewritten to the played word');

create temp table v1 on commit drop as
  select version as v from scrabble.games where id = (select id from g1);
update common.timers set ticks = 99 where game_id = (select id from g1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.replay_board((select id from g1));
reset role;

select is((select play_state from common.games where id = (select id from g1)),
  'playing', 'coop: replay → play_state back to playing');
select ok((select not is_terminal from common.games where id = (select id from g1)),
  'coop: replay → is_terminal cleared');
select is((select count(*) from scrabble.plays where game_id = (select id from g1)),
  0::bigint, 'coop: replay → the move log is cleared');
select is(
  (select count(*) from jsonb_array_elements(
     (select board from scrabble.games where id = (select id from g1))) e
    where e.value <> 'null'::jsonb),
  0::bigint, 'coop: replay → the grid is empty again');
select is((select team_score from scrabble.games where id = (select id from g1)),
  0, 'coop: replay → the team score is zeroed');
select is(
  (select array_length(shared_rack, 1) from scrabble.games where id = (select id from g1)),
  7, 'coop: replay → a fresh 7-tile shared rack is dealt');
select is(
  (select array_length(bag, 1) from scrabble.games where id = (select id from g1)),
  93, 'coop: replay → the bag is a full 100 minus the dealt rack');
select ok(
  (select version from scrabble.games where id = (select id from g1)) > (select v from v1),
  'coop: replay → version BUMPED, so an in-flight move fails its check');
select is((select title from common.games where id = (select id from g1)),
  'New game', 'coop: replay → the title stops advertising the old deal');
select is((select ticks from common.timers where game_id = (select id from g1)),
  0, 'coop: replay → the shared clock is zeroed');

-- ─── Compete: every seat re-dealt + scores zeroed ────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');
reset role;
update scrabble.players set score = 42 where game_id = (select id from g2);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.replay_board((select id from g2));
reset role;

select is(
  (select count(*) from scrabble.players
    where game_id = (select id from g2) and score = 0 and array_length(rack, 1) = 7),
  2::bigint, 'compete: replay → every seat zeroed + re-dealt 7 tiles');
select is(
  (select array_length(bag, 1) from scrabble.games where id = (select id from g2)),
  86, 'compete: replay → the bag is 100 minus two dealt racks');

-- ─── Coop turn-order rewinds to the first-seated player ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
  select id from scrabble.create_game((select handle from cl),
    jsonb_build_object('dict_2', 6, 'dict_3plus', 6,
                       'timer', jsonb_build_object('kind', 'none'),
                       'coop_style', 'turns',
                       'first_turn_user_id', 'ada11111-1111-1111-1111-111111111111'),
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');
reset role;
-- Hand the turn to bea, then replay → it must come back to ada (turn_seat 0).
select pg_temp.sc_turn((select id from g3), 'bea22222-2222-2222-2222-222222222222');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.replay_board((select id from g3));
reset role;

select is(
  (select current_turn_user_id from common.games where id = (select id from g3)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'coop turns: replay → the turn rewinds to the first-seated player');

-- ─── Non-player rejected ─────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select scrabble.replay_board(%L::uuid) $$, (select id from g1)),
  NULL, NULL, 'a non-player cannot replay the board');

select * from finish();
rollback;
