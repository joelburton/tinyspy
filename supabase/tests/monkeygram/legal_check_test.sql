-- ============================================================
-- Test: monkeygram legal-board check (_win_blockers + peel gating)
-- ============================================================
-- The board check on a winning peel, in two layers:
--   1. _win_blockers(board, dict_2, dict_3plus, check_words): the pure
--      validator. Connectivity (one 4-connected mass) is ALWAYS enforced; the
--      word check only runs when check_words, and a word is judged against the
--      band for its LENGTH (dict_2 for 2-letter words, dict_3plus for longer).
--      Returns the blocking cells (disconnected stragglers ∪ — if checking —
--      invalid-word tiles).
--   2. peel: a WINNING peel always requires a connected grid; setup.check_words
--      additionally requires real words. Either failure returns the offending
--      cells and leaves the game in progress.
-- ============================================================

begin;

set search_path = monkeygram, common, public, extensions;

select plan(20);

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

-- A legal word, checking words → nothing blocks.
select is(
  monkeygram._win_blockers(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'), 6, 6, true),
  '{}'::int[],
  'a legal connected word blocks nothing (words checked)'
);

-- A connected non-word with the word check OFF → legal (geography is fine).
select is(
  monkeygram._win_blockers(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'XQJ'), 6, 6, false),
  '{}'::int[],
  'a connected non-word is fine when words are NOT checked'
);

-- The same non-word WITH the word check on → its tiles flag.
select is(
  monkeygram._win_blockers(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'XQJ'), 6, 6, true),
  '{0,1,2}'::int[],
  'a non-word flags its tiles when words ARE checked'
);

-- Disconnected tiles flag EVEN WITH THE WORD CHECK OFF — connectivity is always
-- enforced. CAT at row 0 (the main mass) + DOG at row 5 (floating).
select is(
  monkeygram._win_blockers(
    pg_temp.mg_h(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'), 5, 0, 'DOG'), 6, 6, false),
  '{125,126,127}'::int[],
  'disconnected tiles always flag, even without the word check'
);

-- Crossing legal words sharing the top-left tile (CAT across, plus a down word
-- C-O-T) → connected, both real → nothing blocks.
select is(
  monkeygram._win_blockers(
    pg_temp.mg_place(pg_temp.mg_place(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'),
                                      1, 0, 'O'), 2, 0, 'T'),
    6, 6, true),
  '{}'::int[],
  'crossing legal words (CAT / COT) block nothing'
);

-- A lone tile is never a word, and is trivially connected → legal.
select is(
  monkeygram._win_blockers(pg_temp.mg_place(pg_temp.empty_board(), 12, 12, 'Q'), 6, 6, true),
  '{}'::int[],
  'a single lone tile is legal'
);

-- Empty board → vacuously legal (degenerate; never reached in real play).
select is(
  monkeygram._win_blockers(pg_temp.empty_board(), 6, 6, true),
  '{}'::int[],
  'an empty board blocks nothing'
);

-- ── Per-length bands: 2-letter words use dict_2, longer words dict_3plus ──
-- A crossing board: "ZA" across (cells 0,1; ZA is a band-5 2-letter word) and
-- "ABET" down through the shared A (cells 1,26,51,76; ABET is band 4 — a 3+
-- word). Each word is judged against the band for ITS length, independently.
create temp table xword on commit drop as
select pg_temp.mg_v(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'ZA'), 0, 1, 'ABET') as b;

-- dict_2 too low for ZA (band 5) but dict_3plus fine for ABET → only ZA flags.
select is(
  monkeygram._win_blockers((select b from xword), 2, 6, true),
  '{0,1}'::int[],
  'a too-low 2-letter band flags only the 2-letter word (ZA), not the 3+ one');
-- The mirror: dict_3plus too low for ABET but dict_2 fine for ZA → only ABET.
select is(
  monkeygram._win_blockers((select b from xword), 6, 2, true),
  '{1,26,51,76}'::int[],
  'a too-low 3+ band flags only the longer word (ABET), not the 2-letter one');
-- Both bands generous → both real → nothing blocks.
select is(
  monkeygram._win_blockers((select b from xword), 6, 6, true),
  '{}'::int[],
  'both bands generous → the crossing is legal');

-- ════════════════ peel gating (integration) ════════════════
-- Solo games in ada's solo club, board/tiles/pool overwritten to a controlled
-- state (superuser bypasses RLS). An empty pool makes the next peel a WINNING
-- one (needed = 1 player × 1 > 0 = length(pool)).

-- ── Game A: check_words on + legal board → peel WINS ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ga on commit drop as
select * from monkeygram.create_game('=ada',
  '{"hand_size": 15, "bag_size": 144, "check_words": true, "dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]);

reset role;
select set_config('request.jwt.claims', '', true);
update monkeygram.player_boards
   set board = pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'), tiles = 'CAT'
 where game_id = (select id from ga);
update monkeygram.games set pool = '' where id = (select id from ga);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table pa on commit drop as select monkeygram.peel((select id from ga)) as res;
select is((select res->>'result' from pa), 'won', 'check_words on + legal board → peel wins');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from ga)),
  'won', 'the legal winning peel ended the game');

-- ── Game B: check_words on + connected NON-WORD → peel BLOCKED ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gb on commit drop as
select * from monkeygram.create_game('=ada',
  '{"hand_size": 15, "bag_size": 144, "check_words": true, "dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
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
  'check_words on + a non-word → peel is blocked');
select is((select res->'invalid_cells' from pb), '[0,1,2]'::jsonb,
  'the blocked peel returns the offending cells');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from gb)),
  'playing', 'a blocked peel leaves the game in progress');

-- ── Game C: check_words OFF + connected non-word → peel WINS (classic) ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select * from monkeygram.create_game('=ada',
  '{"hand_size": 15, "bag_size": 144, "check_words": false, "dict_2": 4, "dict_3plus": 4, "timer": {"kind": "none"}}'::jsonb,
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
  'check_words off → a CONNECTED non-word still wins (words not checked)');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from gc)),
  'won', 'the unchecked winning peel ended the game');

-- ── Game D: check_words OFF + DISCONNECTED board → peel BLOCKED (geography) ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gd on commit drop as
select * from monkeygram.create_game('=ada',
  '{"hand_size": 15, "bag_size": 144, "check_words": false, "dict_2": 4, "dict_3plus": 4, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]);

reset role;
select set_config('request.jwt.claims', '', true);
update monkeygram.player_boards
   set board = pg_temp.mg_h(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'), 5, 0, 'DOG'),
       tiles = 'CATDOG'
 where game_id = (select id from gd);
update monkeygram.games set pool = '' where id = (select id from gd);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table pd on commit drop as select monkeygram.peel((select id from gd)) as res;
select is((select res->>'result' from pd), 'illegal',
  'check_words off but DISCONNECTED → peel still blocked (geography is always checked)');
select is((select res->'invalid_cells' from pd), '[125,126,127]'::jsonb,
  'the blocked disconnected peel returns the floating tiles');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from gd)),
  'playing', 'the disconnected board left the game in progress');

select * from finish();
rollback;
