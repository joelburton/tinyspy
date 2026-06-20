-- ============================================================
-- Test: monkeygram.declare_done(target_game)
-- ============================================================
-- v1's whole win condition. Covers:
--   1. Empty hand required — declaring with tiles in hand is rejected
--   2. A valid declaration ends the game (play_state = won, terminal)
--   3. status.winner_username names the declarer
--   4. The winner's progress.done flips to true
--   5. Per-player results: winner won:true, everyone else won:false
--   6. Race: a second declaration after the game is over is rejected
--   7. Non-players cannot declare
-- ============================================================

begin;

set search_path = monkeygram, common, public, extensions;

select plan(9);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea']) as handle;

create temp table mg_game on commit drop as
select * from monkeygram.create_game(
  (select handle from club),
  '{"hand_size": 21, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- ─── Tiles still in hand → declaration rejected ───
-- ada was dealt 21 tiles; she hasn't emptied her hand yet.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select monkeygram.declare_done(%L) $$, (select id from mg_game)),
  'P0001',
  'your hand is not empty',
  'cannot declare done while tiles remain in hand'
);

-- ─── ada empties her hand (snapshots an all-placed board), then declares ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select monkeygram.save_player_board(
  (select id from mg_game),
  jsonb_build_object(
    'board', 'ABCDEFGHIJKLMNOPQRSTU' || repeat('.', 25 * 25 - 21),
    'hand', ''
  )
);
select monkeygram.declare_done((select id from mg_game));

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select play_state from common.games where id = (select id from mg_game)),
  'won',
  'declare_done sets play_state = won'
);

select is(
  (select is_terminal from common.games where id = (select id from mg_game)),
  true,
  'declare_done marks the game terminal'
);

select is(
  (select status->>'winner_username' from common.games where id = (select id from mg_game)),
  'ada',
  'status.winner_username is the declarer'
);

select is(
  (select done from monkeygram.progress
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true,
  'winner progress.done flipped to true'
);

select is(
  (select result->>'won' from common.game_players
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'true',
  'winner game_players result is won:true'
);

select is(
  (select result->>'won' from common.game_players
    where game_id = (select id from mg_game)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'false',
  'loser game_players result is won:false'
);

-- ─── Race: bea declaring after ada already won is rejected ───
-- The play_state guard fires before the hand check, so bea is rejected as
-- "game is not active" regardless of her hand. This is what makes
-- "first to finish wins" safe under a simultaneous second click.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select monkeygram.declare_done(%L) $$, (select id from mg_game)),
  'P0001',
  'game is not active',
  'declaring after someone already won is rejected (the race is over)'
);

-- ─── A non-player cannot declare (require_game_player gate) ───
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select monkeygram.declare_done(%L) $$, (select id from mg_game)),
  '42501',
  'not playing this game',
  'a non-player cannot declare done'
);

select * from finish();
rollback;
