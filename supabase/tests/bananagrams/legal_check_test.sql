-- ============================================================
-- Test: bananagrams legal-board check (_win_blockers + peel gating)
-- ============================================================
-- The board check, in two layers:
--   1. _win_blockers(board, dict_2, dict_3plus, check_words): the pure
--      validator (its boolean arg = "check words too"). Connectivity (one
--      4-connected mass) is ALWAYS enforced; the word check only runs when the
--      flag is set, and a word is judged against the band for its LENGTH (dict_2
--      for 2-letter words, dict_3plus for longer). Returns the blocking cells
--      (disconnected stragglers ∪ — if checking — invalid-word tiles).
--   2. peel: a WINNING peel always requires a connected grid; setup.word_check
--      'win'/'strict' additionally require real words, and 'strict' runs the
--      SAME check on every CONTINUING peel too. Either failure returns the
--      offending cells and leaves the game in progress.
-- ============================================================

begin;

set search_path = bananagrams, common, public, extensions;

select plan(25);

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
  bananagrams._win_blockers(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'), 6, 6, true),
  '{}'::int[],
  'a legal connected word blocks nothing (words checked)'
);

-- A connected non-word with the word check OFF → legal (geography is fine).
select is(
  bananagrams._win_blockers(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'XQJ'), 6, 6, false),
  '{}'::int[],
  'a connected non-word is fine when words are NOT checked'
);

-- The same non-word WITH the word check on → its tiles flag.
select is(
  bananagrams._win_blockers(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'XQJ'), 6, 6, true),
  '{0,1,2}'::int[],
  'a non-word flags its tiles when words ARE checked'
);

-- Disconnected tiles flag EVEN WITH THE WORD CHECK OFF — connectivity is always
-- enforced. CAT at row 0 (the main mass) + DOG at row 5 (floating).
select is(
  bananagrams._win_blockers(
    pg_temp.mg_h(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'), 5, 0, 'DOG'), 6, 6, false),
  '{125,126,127}'::int[],
  'disconnected tiles always flag, even without the word check'
);

-- Crossing legal words sharing the top-left tile (CAT across, plus a down word
-- C-O-T) → connected, both real → nothing blocks.
select is(
  bananagrams._win_blockers(
    pg_temp.mg_place(pg_temp.mg_place(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'),
                                      1, 0, 'O'), 2, 0, 'T'),
    6, 6, true),
  '{}'::int[],
  'crossing legal words (CAT / COT) block nothing'
);

-- A lone tile is never a word, and is trivially connected → legal.
select is(
  bananagrams._win_blockers(pg_temp.mg_place(pg_temp.empty_board(), 12, 12, 'Q'), 6, 6, true),
  '{}'::int[],
  'a single lone tile is legal'
);

-- Empty board → vacuously legal (degenerate; never reached in real play).
select is(
  bananagrams._win_blockers(pg_temp.empty_board(), 6, 6, true),
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
  bananagrams._win_blockers((select b from xword), 2, 6, true),
  '{0,1}'::int[],
  'a too-low 2-letter band flags only the 2-letter word (ZA), not the 3+ one');
-- The mirror: dict_3plus too low for ABET but dict_2 fine for ZA → only ABET.
select is(
  bananagrams._win_blockers((select b from xword), 6, 2, true),
  '{1,26,51,76}'::int[],
  'a too-low 3+ band flags only the longer word (ABET), not the 2-letter one');
-- Both bands generous → both real → nothing blocks.
select is(
  bananagrams._win_blockers((select b from xword), 6, 6, true),
  '{}'::int[],
  'both bands generous → the crossing is legal');

-- ════════════════ peel gating (integration) ════════════════
-- Solo games in ada's solo club, board/tiles/pool overwritten to a controlled
-- state (superuser bypasses RLS). An empty pool makes the next peel a WINNING
-- one (needed = 1 player × 1 > 0 = length(pool)).

-- ── Game A: word_check win + legal board → peel WINS ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ga on commit drop as
select * from bananagrams.create_game('=ada',
  '{"hand_size": 15, "bag_size": 144, "word_check": "win", "dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]);

reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.player_boards
   set board = pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'), tiles = 'CAT'
 where game_id = (select id from ga);
update bananagrams.games set pool = '' where id = (select id from ga);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table pa on commit drop as select bananagrams.peel((select id from ga)) as res;
select is((select res->>'result' from pa), 'won', 'word_check win + legal board → peel wins');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from ga)),
  'won', 'the legal winning peel ended the game');

-- ── Game B: word_check win + connected NON-WORD → peel BLOCKED ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gb on commit drop as
select * from bananagrams.create_game('=ada',
  '{"hand_size": 15, "bag_size": 144, "word_check": "win", "dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]);

reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.player_boards
   set board = pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'XQJ'), tiles = 'XQJ'
 where game_id = (select id from gb);
update bananagrams.games set pool = '' where id = (select id from gb);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table pb on commit drop as select bananagrams.peel((select id from gb)) as res;
select is((select res->>'result' from pb), 'illegal',
  'word_check win + a non-word → peel is blocked');
select is((select res->'invalid_cells' from pb), '[0,1,2]'::jsonb,
  'the blocked peel returns the offending cells');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from gb)),
  'playing', 'a blocked peel leaves the game in progress');

-- ── Game C: word_check off + connected non-word → peel WINS (classic) ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select * from bananagrams.create_game('=ada',
  '{"hand_size": 15, "bag_size": 144, "word_check": "off", "dict_2": 4, "dict_3plus": 4, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]);

reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.player_boards
   set board = pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'XQJ'), tiles = 'XQJ'
 where game_id = (select id from gc);
update bananagrams.games set pool = '' where id = (select id from gc);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table pc on commit drop as select bananagrams.peel((select id from gc)) as res;
select is((select res->>'result' from pc), 'won',
  'word_check off → a CONNECTED non-word still wins (words not checked)');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from gc)),
  'won', 'the unchecked winning peel ended the game');

-- ── Game D: word_check off + DISCONNECTED board → peel BLOCKED (geography) ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gd on commit drop as
select * from bananagrams.create_game('=ada',
  '{"hand_size": 15, "bag_size": 144, "word_check": "off", "dict_2": 4, "dict_3plus": 4, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]);

reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.player_boards
   set board = pg_temp.mg_h(pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'), 5, 0, 'DOG'),
       tiles = 'CATDOG'
 where game_id = (select id from gd);
update bananagrams.games set pool = '' where id = (select id from gd);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table pd on commit drop as select bananagrams.peel((select id from gd)) as res;
select is((select res->>'result' from pd), 'illegal',
  'word_check off but DISCONNECTED → peel still blocked (geography is always checked)');
select is((select res->'invalid_cells' from pd), '[125,126,127]'::jsonb,
  'the blocked disconnected peel returns the floating tiles');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from gd)),
  'playing', 'the disconnected board left the game in progress');

-- ════════════════ strict mode: a CONTINUING peel is checked too ════════════════
-- Above, every peel was a WINNING one (empty pool). Here the pool is NON-empty,
-- so `length(pool) >= needed` (1 player × 1) makes the peel a CONTINUING one
-- ("everyone draws"). word_check 'strict' still validates it; 'win' does not.

-- ── Game E: strict + continuing peel + NON-WORD → BLOCKED (no deal) ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ge on commit drop as
select * from bananagrams.create_game('=ada',
  '{"hand_size": 15, "bag_size": 144, "word_check": "strict", "dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]);

reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.player_boards
   set board = pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'XQJ'), tiles = 'XQJ'
 where game_id = (select id from ge);
update bananagrams.games set pool = 'ABCDEFGHIJ' where id = (select id from ge);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table pe on commit drop as select bananagrams.peel((select id from ge)) as res;
select is((select res->>'result' from pe), 'illegal',
  'strict + a non-word on a CONTINUING peel → blocked (not just at win)');
select is((select res->'invalid_cells' from pe), '[0,1,2]'::jsonb,
  'the blocked strict peel returns the offending cells');
reset role;
select set_config('request.jwt.claims', '', true);
-- Nothing was dealt: the pool is untouched and the game is still in progress.
select is((select length(pool) from bananagrams.games where id = (select id from ge)), 10,
  'a blocked strict peel deals nothing (pool untouched)');

-- ── Game F: strict + continuing peel + VALID word → DEALS ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gf on commit drop as
select * from bananagrams.create_game('=ada',
  '{"hand_size": 15, "bag_size": 144, "word_check": "strict", "dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]);

reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.player_boards
   set board = pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'CAT'), tiles = 'CAT'
 where game_id = (select id from gf);
update bananagrams.games set pool = 'ABCDEFGHIJ' where id = (select id from gf);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table pf on commit drop as select bananagrams.peel((select id from gf)) as res;
select is((select res->>'result' from pf), 'dealt',
  'strict + a valid board on a continuing peel → deals normally');

-- ── Game G: word_check 'win' + continuing peel + NON-WORD → DEALS (not checked) ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gg on commit drop as
select * from bananagrams.create_game('=ada',
  '{"hand_size": 15, "bag_size": 144, "word_check": "win", "dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]);

reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.player_boards
   set board = pg_temp.mg_h(pg_temp.empty_board(), 0, 0, 'XQJ'), tiles = 'XQJ'
 where game_id = (select id from gg);
update bananagrams.games set pool = 'ABCDEFGHIJ' where id = (select id from gg);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table pg on commit drop as select bananagrams.peel((select id from gg)) as res;
select is((select res->>'result' from pg), 'dealt',
  'word_check win does NOT check a continuing peel (only the winning one)');

select * from finish();
rollback;
