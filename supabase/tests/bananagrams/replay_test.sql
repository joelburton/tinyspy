-- ============================================================
-- Test: bananagrams.replay_board(target_game)
-- ============================================================
-- The "Restart" menu item / terminal-row Restart, added 2026-08-03. Same game
-- row, same tiles: boards emptied, hands re-dealt from the immutable
-- `bunch_seed`, draw pile and out-of-play bag back to their opening sizes.
--
-- bananagrams is the game where a restart looks *least* necessary — with no
-- shared puzzle it deals what a New game would — so the things worth pinning
-- are the ones that make it a genuine RESET rather than an alias:
--
--   1. the SAME game row (no new id) and the SAME hands come back;
--   2. every board is blank and progress is zeroed;
--   3. the bunch is the seed's undealt remainder, and the bag is the full
--      144-tile distribution minus the seed — exact even after dumps have
--      shuffled tiles between the two;
--   4. tile conservation still holds: hands + bunch + bag = 144;
--   5. it works mid-game AND at terminal (no play_state guard — it's a
--      restart), and a non-player is rejected.
-- ============================================================

begin;

set search_path = bananagrams, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea']) as handle;

-- 2 players, hand_size 21 → bunch = 144 − 42 = 102, bag = 0 (full bunch).
create temp table g1 on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]);
reset role;

-- Snapshot the opening deal, so we can prove the SAME hands come back.
create temp table dealt on commit drop as
select user_id, tiles from bananagrams.player_boards where game_id = (select id from g1);

-- ─── Dirty the game: place tiles, take a peel ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- Park a letter on ada's board (the FE owns the board string; the RPC persists
-- whatever it's handed).
select bananagrams.save_player_board(
  (select id from g1),
  overlay(repeat('.', 625) placing
    (select left(tiles, 1) from bananagrams.player_boards
      where game_id = (select id from g1)
        and user_id = 'ada11111-1111-1111-1111-111111111111') from 1));
reset role;

select isnt(
  (select board from bananagrams.player_boards
    where game_id = (select id from g1)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  repeat('.', 625), 'precondition — a board has been played on');

-- ─── Restart it MID-GAME (no play_state guard — it's a restart) ───
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format($$ select bananagrams.replay_board(%L::uuid) $$, (select id from g1)),
  'any player may restart a game that is still in progress');
reset role;

select is(
  (select play_state from common.games where id = (select id from g1)),
  'playing', 'restart → the game is (still) playing');
select is(
  (select count(*)::int from bananagrams.player_boards
    where game_id = (select id from g1) and board = repeat('.', 625)),
  2, 'restart → every board is blank again');
select is(
  (select count(*)::int from bananagrams.progress
    where game_id = (select id from g1)
      and unplaced = 21 and placed = 0 and not solved and finished_at is null),
  2, 'restart → progress is back to the opening deal');

-- The SAME hands — this is a restart, not a reshuffle.
select is(
  (select count(*)::int from bananagrams.player_boards pb
     join dealt d on d.user_id = pb.user_id and d.tiles = pb.tiles
    where pb.game_id = (select id from g1)),
  2, 'restart → both players get their ORIGINAL hands back');

-- Bunch + bag rebuilt from the seed.
select is(
  (select length(bunch) from bananagrams.games where id = (select id from g1)),
  102, 'restart → the draw pile is the seed''s undealt remainder');
select is(
  (select length(bag) from bananagrams.games where id = (select id from g1)),
  0, 'restart → the out-of-play bag is the 144 minus the seed (empty here)');
select is(
  (select (status->>'bunch_remaining')::int from common.games where id = (select id from g1)),
  102, 'restart → the status counter the FE reads matches');

-- Conservation: nothing was invented or lost.
select is(
  (select length(g.bunch) + length(g.bag)
        + (select coalesce(sum(length(pb.tiles))::int, 0) from bananagrams.player_boards pb
            where pb.game_id = g.id)
     from bananagrams.games g where g.id = (select id from g1)),
  144, 'restart → hands + bunch + bag still account for all 144 tiles');

-- ─── At terminal, and non-players ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.end_game((select id from g1));
select lives_ok(
  format($$ select bananagrams.replay_board(%L::uuid) $$, (select id from g1)),
  'a finished game can be restarted too');
reset role;

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select bananagrams.replay_board(%L::uuid) $$, (select id from g1)),
  '42501', 'not-a-player|', 'a non-player cannot restart');
reset role;

select * from finish();
rollback;
