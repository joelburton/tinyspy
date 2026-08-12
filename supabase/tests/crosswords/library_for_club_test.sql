-- ============================================================
-- Test: crosswords.library_for_club(target_club)
-- ============================================================
--
-- The RPC behind the setup form's Library picker. It returns EVERY library
-- puzzle plus a per-club `status` ('solved' / 'playing' / 'lost' /
-- 'unplayed') so each row can carry a color bar telling the club which
-- crossword it hasn't done yet.
--
-- Properties to pin:
--   1. shape — title / author / width / height come off the puzzle's meta.
--   2. one row per library puzzle, no matter how many games reference it
--      (the LEFT JOIN fans out; the GROUP BY has to fold it back).
--   3. the four status values, including 'ended' landing in the yellow
--      'playing' bucket rather than inventing a fifth.
--   4. precedence — solved beats playing beats lost, when one puzzle has
--      several games in the same club.
--   5. club scoping — another club's game must not color this club's row,
--      and (the half that actually proves scoping works) that same game
--      MUST color the other club's row.
--   6. mode-agnostic — a compete win reads 'solved' just like a coop win.
--   7. RLS — a non-member sees every puzzle as 'unplayed'. security_invoker
--      means common.games's club-member policy does this for free; a
--      SECURITY DEFINER rewrite would leak one club's history to another
--      club, and this is the test that would catch it.
--
-- See ../codenamesduet/create_game_test.sql for the pgTAP primer.

begin;
set search_path = crosswords, common, public, extensions;
select plan(16);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Fixtures: nine library puzzles, one per scenario
-- ============================================================
-- Every puzzle is the same 2×2 toy grid; only the content_hash differs
-- (it's UNIQUE, so each call needs its own). What varies is the games
-- hung off each one below.

select pg_temp.xw_insert_puzzle('lfc-unplayed',  pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_unplayed  \gset
select pg_temp.xw_insert_puzzle('lfc-playing',   pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_playing   \gset
select pg_temp.xw_insert_puzzle('lfc-solved',    pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_solved    \gset
select pg_temp.xw_insert_puzzle('lfc-lost',      pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_lost      \gset
select pg_temp.xw_insert_puzzle('lfc-ended',     pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_ended     \gset
select pg_temp.xw_insert_puzzle('lfc-winloss',   pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_winloss   \gset
select pg_temp.xw_insert_puzzle('lfc-lossopen',  pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_lossopen  \gset
select pg_temp.xw_insert_puzzle('lfc-compete',   pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_compete   \gset
select pg_temp.xw_insert_puzzle('lfc-otherclub', pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_other     \gset

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select common.create_club('XW Library A', array['ada', 'bea']) as club_a \gset
select common.create_club('XW Library B', array['ada', 'bea']) as club_b \gset

-- A coop game per scenario in club A. `xw_new_game` keeps the noise down —
-- every one of these is "ada + bea, coop, on this puzzle, in this club".
create function pg_temp.xw_new_game(p_club text, p_puzzle uuid, p_mode text default 'coop')
returns uuid language sql as $$
  select id from crosswords.create_game(
    p_club, pg_temp.xw_setup(p_puzzle),
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    p_mode);
$$;

select pg_temp.xw_new_game(:'club_a', :'pz_playing')  as g_playing  \gset
select pg_temp.xw_new_game(:'club_a', :'pz_solved')   as g_solved   \gset
select pg_temp.xw_new_game(:'club_a', :'pz_lost')     as g_lost     \gset
select pg_temp.xw_new_game(:'club_a', :'pz_ended')    as g_ended    \gset
select pg_temp.xw_new_game(:'club_a', :'pz_winloss')  as g_wl_win   \gset
select pg_temp.xw_new_game(:'club_a', :'pz_winloss')  as g_wl_loss  \gset
select pg_temp.xw_new_game(:'club_a', :'pz_lossopen') as g_lo_loss  \gset
select pg_temp.xw_new_game(:'club_a', :'pz_lossopen') as g_lo_open  \gset
select pg_temp.xw_new_game(:'club_a', :'pz_compete', 'compete') as g_compete \gset
select pg_temp.xw_new_game(:'club_b', :'pz_other')    as g_other   \gset

-- Drive the terminal states directly. The real solve path is covered by
-- win_test.sql / timeout_test.sql; what THIS file cares about is the
-- play_state → status mapping, so setting play_state outright keeps each
-- scenario one unambiguous line.
reset role;
select set_config('request.jwt.claims', '', true);

create function pg_temp.xw_end(p_game uuid, p_state text)
returns void language sql as $$
  select common.end_game(p_game, p_state, '{}'::jsonb, '{}'::jsonb);
$$;

select pg_temp.xw_end(:'g_solved',  'won');
select pg_temp.xw_end(:'g_lost',    'lost');
select pg_temp.xw_end(:'g_ended',   'ended');
select pg_temp.xw_end(:'g_wl_win',  'won');
select pg_temp.xw_end(:'g_wl_loss', 'lost');
select pg_temp.xw_end(:'g_lo_loss', 'lost');
-- g_lo_open deliberately left 'playing'.
select pg_temp.xw_end(:'g_compete', 'won_compete');
select pg_temp.xw_end(:'g_other',   'won');

-- A reusable "what does club A's picker say about this puzzle?" probe.
create function pg_temp.xw_status(p_club text, p_puzzle uuid)
returns text language sql as $$
  select status from crosswords.library_for_club(p_club) where id = p_puzzle;
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- ============================================================
-- (1) Shape — the four display fields come off meta
-- ============================================================

select is(
  (select title from crosswords.library_for_club(:'club_a') where id = :'pz_solved'),
  'Toy', 'library_for_club: title comes from meta->>title');

select is(
  (select author from crosswords.library_for_club(:'club_a') where id = :'pz_solved'),
  'T', 'library_for_club: author comes from meta->>author');

select is(
  (select width || 'x' || height from crosswords.library_for_club(:'club_a')
    where id = :'pz_solved'),
  '2x2', 'library_for_club: width/height come from meta');

-- ============================================================
-- (2) One row per library puzzle — the join must not fan out
-- ============================================================
-- pz_winloss and pz_lossopen have TWO games each. Without the GROUP BY
-- they'd appear twice and the picker would render duplicate rows.

select is(
  (select count(*)::int from crosswords.library_for_club(:'club_a')
    where id = :'pz_winloss'),
  1, 'library_for_club: a puzzle with two games still yields exactly one row');

select is(
  (select count(*)::int from crosswords.library_for_club(:'club_a')),
  (select count(*)::int from crosswords.puzzles where source = 'library'),
  'library_for_club: exactly one row per library puzzle');

-- ============================================================
-- (3) The four status values
-- ============================================================

select is(pg_temp.xw_status(:'club_a', :'pz_unplayed'), 'unplayed',
  'library_for_club: a puzzle this club never started reads unplayed');

select is(pg_temp.xw_status(:'club_a', :'pz_playing'), 'playing',
  'library_for_club: a live game reads playing');

select is(pg_temp.xw_status(:'club_a', :'pz_solved'), 'solved',
  'library_for_club: a coop win reads solved');

select is(pg_temp.xw_status(:'club_a', :'pz_lost'), 'lost',
  'library_for_club: a game that only ever lost reads lost');

-- 'ended' is the manual end-game — neither a win nor a loss. It shares the
-- yellow bucket with 'playing' rather than getting a fifth color.
select is(pg_temp.xw_status(:'club_a', :'pz_ended'), 'playing',
  'library_for_club: a manually ended game reads playing (the yellow bucket)');

-- ============================================================
-- (4) Precedence when one puzzle has several games
-- ============================================================

select is(pg_temp.xw_status(:'club_a', :'pz_winloss'), 'solved',
  'library_for_club: win + loss on one puzzle reads solved (green beats red)');

select is(pg_temp.xw_status(:'club_a', :'pz_lossopen'), 'playing',
  'library_for_club: loss + live game reads playing (yellow beats red)');

-- ============================================================
-- (5) Mode-agnostic
-- ============================================================
-- No mode parameter: a compete win colors the row green in BOTH dialogs.

select is(pg_temp.xw_status(:'club_a', :'pz_compete'), 'solved',
  'library_for_club: a compete win reads solved, same as a coop win');

-- ============================================================
-- (6) Club scoping — both directions
-- ============================================================
-- ada is in both clubs, so RLS lets her see g_other either way. The
-- scoping has to come from the join predicate, not from what she can read.

select is(pg_temp.xw_status(:'club_a', :'pz_other'), 'unplayed',
  'library_for_club: another club''s game does not color this club''s row');

select is(pg_temp.xw_status(:'club_b', :'pz_other'), 'solved',
  'library_for_club: that same game DOES color its own club''s row');

-- ============================================================
-- (7) RLS — a non-member sees an all-unplayed library
-- ============================================================
-- dee is in neither club. security_invoker keeps common.games's
-- club-member policy in force, so every game row vanishes for her and the
-- whole library reads unplayed. A SECURITY DEFINER rewrite of this
-- function would hand her club A's play history instead.

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

select is(
  (select count(*)::int from crosswords.library_for_club(:'club_a')
    where status <> 'unplayed'),
  0, 'library_for_club: a non-member sees every puzzle as unplayed (RLS)');

select * from finish();
rollback;
