-- cs-unmet

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
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(19);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select pg_temp.create_club('Scrabble rp', array['ada', 'bea']) as handle;
reset role;

-- ─── Coop: play a word, end, then replay ─────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g1 on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;
reset role;

-- Rig a known rack + play CAT through the center, then end the game: that
-- leaves tiles on the board, a play row, a non-zero score, a rewritten title
-- and an ended game — the full state a replay must undo.
select pg_temp.sc_coop((select id from g1), array['C','A','T','X','Y','Z','Q'],
                       array['E','E','E','E','E','E','E']);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.play_word((select id from g1),
  (select version from scrabble.games where game_id = (select id from g1)),
  '[{"x":7,"y":7,"letter":"C","blank":false},
    {"x":8,"y":7,"letter":"A","blank":false},
    {"x":9,"y":7,"letter":"T","blank":false}]'::jsonb,
  array['CAT'], 5);
select scrabble.stop_game((select id from g1));
reset role;

-- Preconditions: ended, a play logged, tiles on the board, title rewritten.
select isnt((select ended_at from common.games where id = (select id from g1)), null,
  'coop: precondition — the game has ended');
-- TWO rows: the played word, plus the 'leftovers' row coop's stop_game writes for
-- the leftover-tile penalty (see stop_game_test.sql).
select is((select count(*) from scrabble.events where game_id = (select id from g1)),
  2::bigint, 'coop: precondition — the play + the end-game forfeit are logged');
select isnt((select title from common.games where id = (select id from g1)),
  'New game', 'coop: precondition — the title was rewritten to the played word');

create temp table v1 on commit drop as
  select version as v from scrabble.games where game_id = (select id from g1);
update common.timers set ticks = 99 where game_id = (select id from g1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.replay_board((select id from g1));
reset role;

select is((select ended_at from common.games where id = (select id from g1)),
  null, 'coop: replay → the game is no longer ended');
select is((select count(*)::int from common.game_players
            where game_id = (select id from g1)
              and (player_ended_at is not null or outcome is not null)),
  0, 'coop: replay → every player''s ending is cleared');
select is((select count(*) from scrabble.events where game_id = (select id from g1)),
  0::bigint, 'coop: replay → the move log is cleared');
select is(
  (select count(*) from jsonb_array_elements(
     (select board from scrabble.games where game_id = (select id from g1))) e
    where e.value <> 'null'::jsonb),
  0::bigint, 'coop: replay → the grid is empty again');
select is((select coop_score from scrabble.games where game_id = (select id from g1)),
  0, 'coop: replay → the coop score is zeroed');
select is(
  (select array_length(coop_rack, 1) from scrabble.games where game_id = (select id from g1)),
  7, 'coop: replay → a fresh 7-tile shared rack is dealt');
select is(
  (select array_length(bag, 1) from scrabble.games where game_id = (select id from g1)),
  93, 'coop: replay → the bag is a full 100 minus the dealt rack');
select ok(
  (select version from scrabble.games where game_id = (select id from g1)) > (select v from v1),
  'coop: replay → version BUMPED, so an in-flight move fails its check');
select is((select title from common.games where id = (select id from g1)),
  'New game', 'coop: replay → the title stops advertising the old deal');
select is((select ticks from common.timers where game_id = (select id from g1)),
  0, 'coop: replay → the shared clock is zeroed');

-- ─── Compete: every seat re-dealt + scores zeroed ────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
update scrabble.players set score = 42 where game_id = (select id from g2);

-- Capture the version an in-flight client would be holding, so we can prove
-- the bump below actually invalidates it.
select set_config('test.v2',
  (select version::text from scrabble.games where game_id = (select id from g2)), true);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.replay_board((select id from g2));
reset role;

select is(
  (select count(*) from scrabble.players
    where game_id = (select id from g2) and score = 0 and array_length(rack, 1) = 7),
  2::bigint, 'compete: replay → every seat zeroed + re-dealt 7 tiles');

-- ─── The mid-game bump, which is the whole reason `version` isn't zeroed ──
-- This game was never ended: a restart mid-race is legal (nothing guards on the
-- game having ended), and it's the ONLY case where the counter matters — an
-- ended game has no in-flight moves. A client that had already read the pre-restart version must
-- be told 'stale' rather than committing its move against the fresh deal.
select ok(
  (select version from scrabble.games where game_id = (select id from g2))
    > current_setting('test.v2')::int,
  'compete: a MID-GAME replay bumps version (never zeroes it)');
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- The restart bumped the version, so a move built on the old one has lost the
-- same race a peer's move would have won: a not-ok, in the words the FE used to
-- write for itself.
select pg_temp.envelope_is(
  scrabble.play_word((select id from g2), current_setting('test.v2')::int,
     '[{"x":7,"y":7,"letter":"C","blank":false}]'::jsonb, array['CAT'], 5),
  '{"type":"not-ok","severity":"race","dbcode":"PN437",
    "message":"Board changed"}'::jsonb,
  'compete: a move carrying the pre-restart version is rejected as stale');
reset role;
select is(
  (select array_length(bag, 1) from scrabble.games where game_id = (select id from g2)),
  86, 'compete: replay → the bag is 100 minus two dealt racks');

-- ─── Coop turn-order rewinds to the first-seated player ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
  select (scrabble.create_game((select handle from cl),
    jsonb_build_object('dict_2', 6, 'dict_3plus', 6,
                       'timer', jsonb_build_object('kind', 'none'),
                       'coop_style', 'turns',
                       'first_turn_user_id', 'ada11111-1111-1111-1111-111111111111'),
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;
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
-- PN253 is common._require_game_player's "You are not in this game".
select pg_temp.envelope_is(
  scrabble.replay_board((select id from g1)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot replay the board');

select * from finish();
rollback;
