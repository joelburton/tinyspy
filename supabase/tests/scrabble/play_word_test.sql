-- ============================================================
-- Test: scrabble.play_word — the trusting commit
-- ============================================================
-- The FE sends placements + the words it read + the score it computed; the
-- server does only what it alone can: the optimistic-concurrency version
-- check, the integrity guards (in-bounds / empty square / tile-in-rack),
-- the dictionary check, the bag draw, and the bookkeeping. Geometry +
-- scoring are NOT re-checked here (that's lib/play.test.ts).

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(24);

-- ─── Game A (coop) — happy path + stale + occupied ───────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ca on commit drop as
  select common.create_club('Rackplay', array['ada', 'bea']) as handle;
create temp table ga on commit drop as
  select id from scrabble.create_game((select handle from ca),
    '{"difficulty": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');
reset role;
-- Known rack + a 3-tile bag so the draw is deterministic.
select pg_temp.sc_coop((select id from ga),
  array['C','A','T','S','E','R','D'], array['X','Y','Z']);

-- Stale: a wrong base_version is rejected with no state change.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table stale on commit drop as
  select scrabble.play_word((select id from ga), 99,
    '[{"x":7,"y":7,"letter":"C","blank":false}]'::jsonb, array['CO'], 4) as res;
reset role;
select is((select res->>'result' from stale), 'stale', 'a wrong base_version is rejected as stale');
select is((select version from scrabble.games where id = (select id from ga)), 0,
  'a stale play leaves version untouched');
select is((select count(*)::int from scrabble.plays where game_id = (select id from ga)), 0,
  'a stale play writes no log row');

-- Happy path: CAT across the center.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table acc on commit drop as
  select scrabble.play_word((select id from ga), 0,
    '[{"x":7,"y":7,"letter":"C","blank":false},
      {"x":8,"y":7,"letter":"A","blank":false},
      {"x":9,"y":7,"letter":"T","blank":false}]'::jsonb, array['CAT'], 5) as res;
reset role;
select is((select res->>'result' from acc), 'accepted', 'a valid word is accepted');
select is((select board->112 from scrabble.games where id = (select id from ga)),
  '{"l":"C","b":false}'::jsonb, 'the C tile landed on the center square (7,7)');
select is((select board->114 from scrabble.games where id = (select id from ga)),
  '{"l":"T","b":false}'::jsonb, 'the T tile landed at (9,7)');
select is((select team_score from scrabble.games where id = (select id from ga)), 5,
  'the trusted score is added to the team total');
select is((select version from scrabble.games where id = (select id from ga)), 1,
  'version bumps to 1');
select is((select shared_rack from scrabble.games where id = (select id from ga)),
  array['S','E','R','D','X','Y','Z'],
  'the rack loses C/A/T and refills from the bag (X/Y/Z)');
select is((select coalesce(array_length(bag,1),0) from scrabble.games where id = (select id from ga)),
  0, 'the 3-tile bag is now empty');
select is((select acc.res->'drawn' from acc), '["X","Y","Z"]'::jsonb,
  'play_word returns the newly-drawn tiles');
select is((select string_agg(seq||':'||kind, ',') from scrabble.plays where game_id = (select id from ga)),
  '1:word', 'one word play is logged');
select is((select title from common.games where id = (select id from ga)),
  'CAT', 'the game title becomes the first word played');

-- Occupied-square guard: replaying onto (7,7) (now version 1) is rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok($$
  select scrabble.play_word((select id from ga), 1,
    '[{"x":7,"y":7,"letter":"S","blank":false}]'::jsonb, array['SO'], 2)
$$, 'P0001', null, 'placing on an occupied square is rejected');
reset role;

-- ─── Game B (coop) — dictionary reject + guards ──────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gb on commit drop as
  select id from scrabble.create_game((select handle from ca),
    '{"difficulty": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');
reset role;
select pg_temp.sc_coop((select id from gb),
  array['Z','X','Q','J','A','E','I'], array['N','N','N']);

-- Dictionary free reject: a non-word commits nothing.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table inv on commit drop as
  select scrabble.play_word((select id from gb), 0,
    '[{"x":7,"y":7,"letter":"Z","blank":false},
      {"x":8,"y":7,"letter":"X","blank":false},
      {"x":9,"y":7,"letter":"Q","blank":false},
      {"x":10,"y":7,"letter":"J","blank":false}]'::jsonb, array['ZXQJ'], 99) as res;
reset role;
select is((select res->>'result' from inv), 'invalid', 'a non-word is rejected (free)');
select is((select inv.res->'bad_words' from inv), '["ZXQJ"]'::jsonb,
  'the rejecting word is reported');
select is((select version from scrabble.games where id = (select id from gb)), 0,
  'a rejected word leaves version untouched (no state change)');
select is((select count(*)::int from scrabble.plays where game_id = (select id from gb)), 0,
  'a rejected word writes no log row');

-- Tile-not-in-rack guard: a B isn't in the rigged rack.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok($$
  select scrabble.play_word((select id from gb), 0,
    '[{"x":7,"y":7,"letter":"B","blank":false}]'::jsonb, array['BE'], 4)
$$, 'P0001', null, 'playing a tile not in the rack is rejected');

-- Out-of-bounds guard.
select throws_ok($$
  select scrabble.play_word((select id from gb), 0,
    '[{"x":20,"y":7,"letter":"A","blank":false}]'::jsonb, array['AA'], 2)
$$, 'P0001', null, 'an out-of-bounds placement is rejected');
reset role;

-- ─── Game C (compete) — turn gate + advance ──────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
  select id from scrabble.create_game((select handle from ca),
    '{"difficulty": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');
reset role;
select pg_temp.sc_turn((select id from gc), 'ada11111-1111-1111-1111-111111111111');
select pg_temp.sc_rack((select id from gc), 'ada11111-1111-1111-1111-111111111111',
  array['C','A','T','S','E','R','D']);
select pg_temp.sc_bag((select id from gc), array['X','Y','Z','N','M','P','L']);

-- Not your turn: bea can't play while it's ada's turn.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok($$
  select scrabble.play_word((select id from gc), 0,
    '[{"x":7,"y":7,"letter":"C","blank":false}]'::jsonb, array['CO'], 4)
$$, 'P0001', null, 'a player cannot play out of turn (compete)');

-- ada plays → turn advances to bea.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cacc on commit drop as
  select scrabble.play_word((select id from gc), 0,
    '[{"x":7,"y":7,"letter":"C","blank":false},
      {"x":8,"y":7,"letter":"A","blank":false},
      {"x":9,"y":7,"letter":"T","blank":false}]'::jsonb, array['CAT'], 5) as res;
reset role;
select is((select res->>'result' from cacc), 'accepted', 'compete: a valid word is accepted');
select is((select current_user_id from scrabble.games where id = (select id from gc)),
  'bea22222-2222-2222-2222-222222222222', 'the turn advances to the next player');
select is((select version from scrabble.games where id = (select id from gc)), 1,
  'compete play bumps version');

select * from finish();
rollback;
