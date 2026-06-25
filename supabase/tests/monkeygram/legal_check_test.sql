-- ============================================================
-- Test: monkeygram legal-board check (_win_blockers + peel gating)
-- ============================================================
-- The opt-in "Check if board is legal to win" feature. Two layers:
--   1. _win_blockers(board, difficulty): the pure validator — connectivity
--      (one 4-connected mass) + every 2+ run a real word; returns the cells
--      that block a win (disconnected stragglers ∪ invalid-word tiles).
--   2. peel: when setup.check_legal is on, a WINNING peel only ends the game
--      if _win_blockers is empty; otherwise it returns the offending cells and
--      leaves the game in progress. check_legal off → the classic behavior.
-- ============================================================

begin;

set search_path = monkeygram, common, public, extensions;

select plan(13);

\ir ../_shared/setup.psql

-- ── Board builders: place letters into a 625-char '.' grid (idx = r*25+c) ──
create function pg_temp.mg_place(board text, r int, c int, ch text) returns text
language sql as $$ select overlay($1 placing $4 from $2 * 25 + $3 + 1 for 1) $$;

create function pg_temp.mg_h(board text, r int, c int, w text) returns text
language plpgsql as $$
declare b text := board; i int;
begin
  for i in 0 .. length(w) - 1 loop b := pg_temp.mg_place(b, r, c + i, substr(w, i + 1, 1)); end loop;
  return b;
end $$;

create function pg_temp.mg_v(board text, r int, c int, w text) returns text
language plpgsql as $$
declare b text := board; i int;
begin
  for i in 0 .. length(w) - 1 loop b := pg_temp.mg_place(b, r + i, c, substr(w, i + 1, 1)); end loop;
  return b;
end $$;

create function pg_temp.empty_board() returns text
language sql as $$ select repeat('.', 625) $$;

-- ════════════════ _win_blockers (pure validator) ════════════════

-- A single legal word across → nothing blocks a win.
select is(
  monkeygram._win_blockers(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'), 6),
  '{}'::int[],
  'a single legal word (CAT) blocks nothing'
);

-- A non-word → all its tiles are flagged.
select is(
  monkeygram._win_blockers(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'XQJ'), 6),
  '{0,1,2}'::int[],
  'a non-word (XQJ) flags its three tiles'
);

-- Two valid words not touching → the floating mass (DOG at row 5) is flagged;
-- the main mass (CAT at row 0, lowest index) is not.
select is(
  monkeygram._win_blockers(
    pg_temp.mg_h(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'), 5, 0, 'DOG'), 6),
  '{125,126,127}'::int[],
  'a disconnected second word flags its tiles (one-connected-mass rule)'
);

-- Crossing legal words sharing the top-left tile (CAT across, COT down) →
-- connected, both real → nothing blocks.
select is(
  monkeygram._win_blockers(
    pg_temp.mg_v(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'), 0, 0, 'COT'), 6),
  '{}'::int[],
  'crossing legal words (CAT / COT) block nothing'
);

-- A lone tile is never a "word" → always legal.
select is(
  monkeygram._win_blockers(pg_temp.mg_place(pg_temp.empty_board(), 12, 12, 'Q'), 6),
  '{}'::int[],
  'a single lone tile is legal (single letters are not checked)'
);

-- Empty board → vacuously legal (degenerate; never reached in real play).
select is(
  monkeygram._win_blockers(pg_temp.empty_board(), 6),
  '{}'::int[],
  'an empty board blocks nothing'
);

-- ════════════════ peel gating (integration) ════════════════
-- Solo games in ada's solo club, with the board/tiles/pool overwritten to a
-- controlled state (superuser bypasses RLS): an empty pool makes the next peel
-- a WINNING one (needed = 1 player × 1 > 0 = length(pool)).

-- ── Game A: check_legal on + legal board → peel WINS ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ga on commit drop as
select * from monkeygram.create_game('=ada',
  '{"hand_size": 15, "bag_size": 144, "check_legal": true, "dictionary": 6, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]);

reset role;
select set_config('request.jwt.claims', '', true);
update monkeygram.player_boards
   set board = pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'), tiles = 'CAT'
 where game_id = (select id from ga);
update monkeygram.games set pool = '' where id = (select id from ga);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table pa on commit drop as select monkeygram.peel((select id from ga)) as res;
select is((select res->>'result' from pa), 'won', 'check_legal on + legal board → peel wins');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from ga)),
  'won', 'the legal winning peel ended the game');

-- ── Game B: check_legal on + ILLEGAL board → peel BLOCKED ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gb on commit drop as
select * from monkeygram.create_game('=ada',
  '{"hand_size": 15, "bag_size": 144, "check_legal": true, "dictionary": 6, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]);

reset role;
select set_config('request.jwt.claims', '', true);
update monkeygram.player_boards
   set board = pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'XQJ'), tiles = 'XQJ'
 where game_id = (select id from gb);
update monkeygram.games set pool = '' where id = (select id from gb);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table pb on commit drop as select monkeygram.peel((select id from gb)) as res;
select is((select res->>'result' from pb), 'illegal',
  'check_legal on + illegal board → peel is blocked');
select is((select res->'invalid_cells' from pb), '[0,1,2]'::jsonb,
  'the blocked peel returns the offending cells');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from gb)),
  'playing', 'a blocked peel leaves the game in progress');

-- ── Game C: check_legal OFF + illegal board → peel WINS (classic) ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select * from monkeygram.create_game('=ada',
  '{"hand_size": 15, "bag_size": 144, "check_legal": false, "dictionary": 4, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]);

reset role;
select set_config('request.jwt.claims', '', true);
update monkeygram.player_boards
   set board = pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'XQJ'), tiles = 'XQJ'
 where game_id = (select id from gc);
update monkeygram.games set pool = '' where id = (select id from gc);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table pc on commit drop as select monkeygram.peel((select id from gc)) as res;
select is((select res->>'result' from pc), 'won',
  'check_legal off → an illegal board still wins (no validation)');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from gc)),
  'won', 'the unchecked winning peel ended the game');

select * from finish();
rollback;
