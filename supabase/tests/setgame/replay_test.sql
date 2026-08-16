-- ============================================================
-- Test: replay_board — the same deck, dealt again
-- ============================================================
-- Restart rewinds the deal position instead of reshuffling, so the cards come
-- back in exactly the order they came the first time. That is the whole point
-- of storing the deck whole and frozen: a reshuffle would make Restart just
-- another New game.

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(8);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Set replay', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

create temp table opening on commit drop as
select pg_temp.sg_board((select id from g)) as board;

-- Take a few sets and cash a hint, so there is real state to wipe.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select setgame.record_hint((select id from g), (pg_temp.sg_live((select id from g)))[1:1]);
select setgame.submit_set((select id from g), pg_temp.sg_live((select id from g)));
select setgame.submit_set((select id from g), pg_temp.sg_live((select id from g)));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select setgame.submit_set((select id from g), pg_temp.sg_live((select id from g)));

reset role;
select is(
  (select count(*)::int from setgame.events where kind = 'claim' and game_id = (select id from g)),
  3, 'three sets were taken before the restart');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select setgame.replay_board((select id from g));

reset role;
select is(
  pg_temp.sg_board((select id from g)),
  (select board from opening),
  'the SAME opening board comes back, card for card and slot for slot');
-- Rewound to wherever the OPENING deal stopped, which is what `opening` holds
-- — not a fixed 69, since a board that opened set-free was dealt past twelve.
select is(
  (select deck_left + cardinality(board) from setgame.games_state where id = (select id from g)),
  81, 'the deal position is rewound to the opening');
select is(
  (select count(*)::int from setgame.events where kind = 'claim' and game_id = (select id from g)),
  0, 'the claims are gone');
select is(
  (select sum(sets_found)::int from setgame.players where game_id = (select id from g)),
  0, 'every count is back to zero');
select is(
  (select sum(hints_used)::int from setgame.players where game_id = (select id from g)),
  0, 'hints spent do not carry over — a replay is a genuine second try');
select is(
  (select title from common.games where id = (select id from g)),
  '#' || upper(left((select id from g)::text, 6)),
  'the title survives a replay — it names the GAME, not the run');
select is(
  (select play_state from common.games where id = (select id from g)),
  'playing', 'and the game is live again');

select * from finish();
rollback;
