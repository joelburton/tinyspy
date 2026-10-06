-- cs-unmet

-- ============================================================
-- Test: the common parts of game_data and static_game_data —
-- common._make_json_game_data, common._make_json_static_game_data
-- ============================================================
-- Every game's game_data starts from common._make_json_game_data: the game
-- facts every game shares that a move can change, and each player with the
-- standing terms of docs/win-lose.md → Where a player stands; its
-- static_game_data starts from common._make_json_static_game_data: the facts
-- nothing after create changes (supabase/sql/common.sql → The page blobs'
-- common parts). A game's builder adds its own fields on top; this file pins
-- the parts it starts from, through a game's life:
--
--   1. A fresh free-for-all game, as a whole: the static part with the
--      gametype's brand; no turns, nobody ended, every player
--      on turn
--   2. A turn-order game: seat order, the holder, who waits; the turn advances
--   3. A player who ended while the game plays on, and one who conceded
--   4. The game's ending: reason, by, winner; every player's outcome
--   5. A Restart undoes all of it, in both games
--
-- The helper is a pure read, so each case reads it right after the common
-- helper it exercises. See games_test.sql for the as_jwt_only trick.
-- ============================================================

begin;

set search_path = common, public, extensions;

select plan(23);

\ir ../_shared/setup.psql

-- Set JWT claims WITHOUT switching role away from postgres — keeps execute
-- privilege on the security-revoked helpers.
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
select pg_temp.create_club('test club', array['ada', 'bea']) as handle;

reset role;
select set_config('request.jwt.claims', '', true);

-- The two games: a free-for-all compete race, and a coop game seated in turns.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config('test.race', (common._create_game(
  (select handle from club), 'spellingbee_compete', 'compete',
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'test-title', '{"timer": {"kind": "none"}}'::jsonb, null))::text, true);
select set_config('test.turns', (common._create_game(
  (select handle from club), 'psychicnum_coop', 'coop',
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'turns-title', '{"timer": {"kind": "none"}}'::jsonb, null))::text, true);
reset role;
select set_config('request.jwt.claims', '', true);

-- Shorthands: the two games' ids, a game's common game_data, and one player
-- inside it.
create function pg_temp.race() returns uuid language sql as
  $$ select current_setting('test.race')::uuid $$;
create function pg_temp.turns() returns uuid language sql as
  $$ select current_setting('test.turns')::uuid $$;
create function pg_temp.game_data(game uuid) returns jsonb language sql as
  $$ select common._make_json_game_data(game) $$;
create function pg_temp.static_game_data(game uuid) returns jsonb language sql as
  $$ select common._make_json_static_game_data(game) $$;
create function pg_temp.player(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements(common._make_json_game_data(game) -> 'players') p
      where p ->> 'id' = uid::text $$;

-- A player who has not moved: what every seat of a fresh game shows.
create function pg_temp.fresh_player(uid uuid, name text, seat int) returns jsonb language sql as $$
  select jsonb_build_object(
    'id',             uid,
    'username',       name,
    'color',          (select color from common.profiles where user_id = uid),
    'ai',             false,
    'seat',           seat,
    'ending',         null,
    'outcome',        null,
    'finalRanking',   null,
    'solvedAt',       null,
    'conceded',       false,
    'solved',         false,
    'stillPlaying',   true,
    'onTurn',         true,
    'waitingForTurn', false)
$$;

-- ─── (1) A fresh free-for-all game, as a whole ───
select is(
  pg_temp.static_game_data(pg_temp.race()),
  jsonb_build_object(
    'id',       pg_temp.race(),
    'gametype', 'spellingbee_compete',
    'brand',    'FreeBee',
    'club',     jsonb_build_object('handle', (select handle from club)),
    'mode',     'compete',
    'coop',     false,
    'compete',  true,
    'setup',    '{"timer": {"kind": "none"}}'::jsonb),
  'the whole static common part: the game facts, the gametype''s brand, the setup'
);
select is(
  pg_temp.game_data(pg_temp.race()),
  jsonb_build_object(
    'title',    'test-title',
    'turns',    null,
    'ending',   null,
    'ended',    false,
    'outcome',  null,
    'players',  jsonb_build_array(
      pg_temp.fresh_player('ada11111-1111-1111-1111-111111111111', 'ada', null),
      pg_temp.fresh_player('bea22222-2222-2222-2222-222222222222', 'bea', null))),
  'the whole game_data common part of a fresh game: no turns, no ending, both players on turn, by username'
);

-- ─── (2) A turn-order game ───
select common._assign_turn_order(pg_temp.turns(), 'bea22222-2222-2222-2222-222222222222');

select is(
  pg_temp.game_data(pg_temp.turns()) -> 'turns',
  jsonb_build_object('holder', 'bea22222-2222-2222-2222-222222222222'),
  'a seated game has turns, and the holder is the first player'
);
select is(
  (select jsonb_agg(p ->> 'username') from jsonb_array_elements(pg_temp.game_data(pg_temp.turns()) -> 'players') p),
  '["bea", "ada"]'::jsonb,
  'players come in seat order'
);
select is(
  pg_temp.player(pg_temp.turns(), 'bea22222-2222-2222-2222-222222222222'),
  pg_temp.fresh_player('bea22222-2222-2222-2222-222222222222', 'bea', 0),
  'the holder: seat 0, on turn'
);
select is(
  pg_temp.player(pg_temp.turns(), 'ada11111-1111-1111-1111-111111111111'),
  pg_temp.fresh_player('ada11111-1111-1111-1111-111111111111', 'ada', 1)
    || '{"onTurn": false, "waitingForTurn": true}'::jsonb,
  'the other player: seat 1, still playing, waiting for the turn'
);
select is(
  (pg_temp.static_game_data(pg_temp.turns()) ->> 'coop')::boolean
    and pg_temp.static_game_data(pg_temp.turns()) ->> 'brand' = 'PsychicNum',
  true,
  'coop and the brand come off the game and its gametype'
);

select common._advance_turn(pg_temp.turns());

select is(
  pg_temp.game_data(pg_temp.turns()) -> 'turns' ->> 'holder',
  'ada11111-1111-1111-1111-111111111111',
  'advancing the turn moves the holder'
);
select is(
  (pg_temp.player(pg_temp.turns(), 'ada11111-1111-1111-1111-111111111111') ->> 'onTurn')::boolean,
  true,
  '… and the new holder is on turn'
);
select is(
  (pg_temp.player(pg_temp.turns(), 'bea22222-2222-2222-2222-222222222222') ->> 'waitingForTurn')::boolean,
  true,
  '… while the old one waits'
);

-- ─── (3) A player ends while the game plays on ───
-- ada solves; the game writes solved_at itself, and tells common she ended.
update common.game_players set solved_at = now()
 where game_id = pg_temp.race() and user_id = 'ada11111-1111-1111-1111-111111111111';
select common._set_player_ended(
  pg_temp.race(), 'ada11111-1111-1111-1111-111111111111',
  'reached_goal', 'solved', 'won');

select is(
  pg_temp.player(pg_temp.race(), 'ada11111-1111-1111-1111-111111111111'),
  pg_temp.fresh_player('ada11111-1111-1111-1111-111111111111', 'ada', null) || jsonb_build_object(
    'ending',       jsonb_build_object('at', now(), 'reason', 'reached_goal', 'detail', 'solved'),
    'outcome',      'won',
    'solvedAt',     now(),
    'solved',       true,
    'stillPlaying', false,
    'onTurn',       false),
  'a solver: her ending, solved, her early outcome; no longer playing or on turn'
);
select is(
  pg_temp.player(pg_temp.race(), 'bea22222-2222-2222-2222-222222222222'),
  pg_temp.fresh_player('bea22222-2222-2222-2222-222222222222', 'bea', null),
  'the other racer plays on, unchanged'
);

-- bea concedes.
select pg_temp.as_jwt_only('bea22222-2222-2222-2222-222222222222');
select common._concede(pg_temp.race());
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.player(pg_temp.race(), 'bea22222-2222-2222-2222-222222222222'),
  pg_temp.fresh_player('bea22222-2222-2222-2222-222222222222', 'bea', null) || jsonb_build_object(
    'ending',       jsonb_build_object('at', now(), 'reason', 'conceded', 'detail', 'conceded'),
    'outcome',      'lost',
    'conceded',     true,
    'stillPlaying', false,
    'onTurn',       false),
  'a conceder: conceded, lost at once, out of the game'
);

-- ─── (4) The game ends ───
select common._end_game(
  pg_temp.race(), 'reached_goal', 'solved', 'ada11111-1111-1111-1111-111111111111',
  p_is_no_result => false,
  p_final_rankings => '{"ada11111-1111-1111-1111-111111111111": 1}'::jsonb);

select is(
  pg_temp.game_data(pg_temp.race()) -> 'ending',
  jsonb_build_object(
    'reason', 'reached_goal',
    'detail', 'solved',
    'by',     'ada11111-1111-1111-1111-111111111111',
    'winner', 'ada11111-1111-1111-1111-111111111111'),
  'the ending: reason pair, who ended it, the player ranked first'
);
select is(
  pg_temp.game_data(pg_temp.race()) ->> 'outcome',
  'won',
  'the game''s outcome'
);
select is(
  (pg_temp.player(pg_temp.race(), 'ada11111-1111-1111-1111-111111111111') ->> 'finalRanking')::int,
  1,
  'the winner is ranked 1'
);
select is(
  pg_temp.player(pg_temp.race(), 'ada11111-1111-1111-1111-111111111111') ->> 'outcome',
  'won',
  '… and won'
);
select is(
  pg_temp.player(pg_temp.race(), 'bea22222-2222-2222-2222-222222222222') -> 'finalRanking',
  'null'::jsonb,
  'the conceder is unranked'
);
select is(
  pg_temp.player(pg_temp.race(), 'bea22222-2222-2222-2222-222222222222') ->> 'outcome',
  'lost',
  '… and lost'
);

-- ─── (5) A Restart undoes all of it ───
select common._reset_game(pg_temp.race());

select is(
  pg_temp.game_data(pg_temp.race()) -> 'players',
  jsonb_build_array(
    pg_temp.fresh_player('ada11111-1111-1111-1111-111111111111', 'ada', null),
    pg_temp.fresh_player('bea22222-2222-2222-2222-222222222222', 'bea', null)),
  'after a Restart every player is fresh again'
);
select is(
  pg_temp.game_data(pg_temp.race()) -> 'ending',
  'null'::jsonb,
  '… the ending is gone'
);
select is(
  pg_temp.game_data(pg_temp.race()) -> 'outcome',
  'null'::jsonb,
  '… with no outcome yet'
);

select common._reset_game(pg_temp.turns());

select is(
  pg_temp.game_data(pg_temp.turns()) -> 'turns' ->> 'holder',
  'bea22222-2222-2222-2222-222222222222',
  'a Restart hands the turn back to seat 0'
);

select * from finish();
rollback;
