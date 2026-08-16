-- ============================================================
-- Test: strands RLS + THE SHIELD
-- ============================================================
--
-- strands is a hidden-solution game — the single most important security
-- property it has, because the answer key IS the puzzle. Unlike connections
-- (which hands its board to the FE and says so), strands classifies server-side
-- precisely so `solution` never leaves the database until the game is over.
--
-- The mechanism is a COLUMN GRANT that omits `solution`, plus the SECURITY
-- DEFINER `_solution_for` helper surfaced through the `games_state` view and
-- gated on `common.games.is_terminal`. Both halves are pinned here: a
-- future migration that re-grants the column, or a view edit that selects it
-- directly, has to fail a test rather than quietly ship.
--
-- Also pinned: puzzles.solution is unreadable too. Browsing the archive is how
-- the setup date-picker works, so the rows ARE visible — but a player who can
-- read tomorrow's answer key from the library has the same leak by another
-- door. The archive's readable set is pinned from BOTH sides: the board and
-- solution must stay refused, and id/source_id/puzzle_date/clue must stay
-- readable (the picker breaks silently if a column it needs is revoked — the
-- fetch ignores its error, so the whole list comes back empty).
--
-- Personas: ada + bea in the club; dee is the outsider.

begin;

set search_path = strands, common, public, extensions;

select plan(15);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up: a 2-member club + a coop strands game
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;

create temp table game on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

-- ============================================================
-- (1)–(4) The column grant: `solution` is not selectable at all
-- ============================================================
-- Not "returns null" — the grant makes the column itself unreadable, so the
-- attempt is an error. That distinction matters: a null could be mistaken for
-- "no solution stored".

select throws_ok(
  $$ select solution from strands.games limit 1 $$,
  '42501',
  'permission denied for table games',
  'a player CANNOT select strands.games.solution — the column grant hides it'
);

select throws_ok(
  $$ select solution from strands.puzzles limit 1 $$,
  '42501',
  'permission denied for table puzzles',
  'a player CANNOT select strands.puzzles.solution — the archive is shielded too'
);

select throws_ok(
  $$ select board from strands.puzzles limit 1 $$,
  '42501',
  'permission denied for table puzzles',
  'nor the archive board — browsing must not become studying tomorrow''s puzzle'
);

select lives_ok(
  $$ select id, source_id, puzzle_date from strands.puzzles limit 1 $$,
  'but the date picker CAN list puzzles (id, source_id, puzzle_date)'
);

-- The clue is READABLE from the archive (2026-08-13), and that is a decision,
-- not an oversight — so it is pinned rather than left to the absence of a
-- failing test. The picker shows it under the date so you can recognise a
-- puzzle you have already played; it is the game's own title and is on screen
-- from the first second of play, so it reveals nothing the club page doesn't.
-- The board and solution above stay shielded: those ARE the puzzle.
select lives_ok(
  $$ select clue from strands.puzzles limit 1 $$,
  'and the picker CAN read the clue — it is the puzzle''s label, not its answer'
);

-- ============================================================
-- (5)–(7) games_state: the playable columns, without the answer
-- ============================================================

select is(
  (select solution from strands.games_state where id = (select id from game)),
  null,
  'games_state.solution is NULL during play'
);

select is(
  (select board from strands.games_state where id = (select id from game)),
  pg_temp.strands_board(),
  'games_state DOES expose the board — you can see the letters, not the answer'
);

select is(
  (select clue from strands.games_state where id = (select id from game)),
  'Rows of nonsense',
  'games_state exposes the clue — it is the prompt, not the answer'
);

-- ============================================================
-- (8)–(9) The shield LIFTS at is_terminal, not on a guess
-- ============================================================
-- Over for EVERYONE is the only thing worth protecting: whether a player is
-- LOOKING at the answer is a display choice each makes for themselves in the FE
-- (docs/ui.md → Terminal results). What the server owes is that a compete racer
-- who solved early or conceded can't pull the answer while the rest are still
-- tracing — and that is exactly this gate.

reset role;
update common.games set is_terminal = true where id = (select id from game);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select isnt(
  (select solution from strands.games_state where id = (select id from game)),
  null,
  'once the game is terminal, games_state hands the answer over'
);

select is(
  (select solution->'spangram'->>'word' from strands.games_state where id = (select id from game)),
  'ZZQEJK',
  'and it is the real answer key, not a placeholder'
);

reset role;
update common.games set is_terminal = false where id = (select id from game);

-- ============================================================
-- (10)–(12) Club gating
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from strands.games_state where id = (select id from game)),
  1::bigint,
  'a fellow club member sees the game'
);

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*) from strands.games_state where id = (select id from game)),
  0::bigint,
  'an outsider sees no game at all (RLS on the base table)'
);

select is(
  (select count(*) from strands.events where game_id = (select id from game)),
  0::bigint,
  'an outsider sees no events'
);

-- ============================================================
-- (13)–(14) Writes never go direct
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ insert into strands.events (game_id, user_id, word, path, result)
            values (%L, %L, 'ZZQA', '[[0,0]]'::jsonb, 'hint_word') $$,
         (select id from game), 'ada11111-1111-1111-1111-111111111111'),
  '42501',
  null,
  'a player cannot INSERT a guess directly — submit_path is the only writer'
);

select throws_ok(
  format($$ update strands.players set hint_points = 99 where game_id = %L $$, (select id from game)),
  '42501',
  null,
  'a player cannot hand themselves hint points'
);

select * from finish();
rollback;
