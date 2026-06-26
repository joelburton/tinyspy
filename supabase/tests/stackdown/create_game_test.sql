-- ============================================================
-- Test: stackdown.create_game
-- ============================================================
-- Claims a board from the library, copies its tiles (public) + solution
-- (hidden), seeds one players row each, flips to 'playing'. The solution
-- stays hidden via games_state until the game ends.

begin;
set search_path = stackdown, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(14);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Stack coop', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from stackdown.create_game(
  (select handle from club),
  '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);

reset role;

select is(
  (select gametype from common.games where id = (select id from g)),
  'stackdown_coop',
  'common.games row gets the stackdown_coop gametype');

select is(
  (select mode from stackdown.games where id = (select id from g)),
  'coop',
  'stackdown.games stores mode coop');

select is(
  (select jsonb_array_length(tiles) from stackdown.games where id = (select id from g)),
  30,
  'the 30-tile board was copied onto the game');

select isnt(
  (select board_id from stackdown.games where id = (select id from g)),
  null,
  'board_id records which library board was claimed');

select is(
  (select wordlist from stackdown.games where id = (select id from g)),
  0,
  'the wordlist level is recorded (0 = the stackdown standard set)');

select is(
  (select count(*)::int from stackdown.players where game_id = (select id from g)),
  2,
  'one players row per player');

select is(
  (select play_state from common.games where id = (select id from g)),
  'playing',
  'play_state is playing');

-- A fresh game is titled "New game"; coop rewrites this to the cleared
-- words as it plays (see gameplay_test), compete keeps it.
select is(
  (select title from common.games where id = (select id from g)),
  'New game',
  'a fresh game is titled "New game" (no words cleared yet)');

-- _found_title display rules (the title builder): cap at three words,
-- ellipsis beyond. The integration cases (1 and 6 words) live in
-- gameplay_test; here we pin the three-vs-four boundary directly.
select is(stackdown._found_title(array['a','b','c','d'], 3), 'A-B-C',
  '_found_title: exactly three cleared words → no ellipsis');
select is(stackdown._found_title(array['a','b','c','d'], 4), 'A-B-C…',
  '_found_title: a fourth cleared word → capped at three, plus an ellipsis');

-- The solution is HIDDEN mid-game: games_state returns NULL.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select ok(
  (select solution from stackdown.games_state where id = (select id from g)) is null,
  'mid-game: games_state.solution is NULL (hidden)');

-- The raw solution column is not selectable by an authenticated player.
select throws_ok(
  format($$ select solution from stackdown.games where id = %L $$, (select id from g)),
  '42501', null,
  'stackdown.games.solution is column-excluded from authenticated');

-- Retiring a board (deleting it) must NOT delete games built from it: the
-- game is self-contained (tiles/solution/wordlist copied), board_id is just
-- provenance and goes NULL via ON DELETE SET NULL.
reset role;
delete from stackdown.boards
 where id = (select board_id from stackdown.games where id = (select id from g));
select is(
  (select count(*) from stackdown.games where id = (select id from g)),
  1::bigint,
  'the game survives deleting its source board');
select ok(
  (select board_id from stackdown.games where id = (select id from g)) is null,
  'board_id is nulled (ON DELETE SET NULL), the game is not cascaded away');

select * from finish();
rollback;
