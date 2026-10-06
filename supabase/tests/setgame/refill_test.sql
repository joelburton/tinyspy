-- cs-unmet

-- ============================================================
-- Test: the deal-three rule, the tail-compaction, and the ending
-- ============================================================
-- Three things that only show up over a whole game:
--
--   1. A board coming DOWN from fifteen compacts from the TAIL — at most
--      three tiles move, and they are the ones at the end of the layout.
--      Planted, because a fifteen-tile board arises naturally in about 3% of
--      deals and a test that waits for one tests nothing most of the time.
--   2. Playing to the natural end terminates, and lands on the right verdict.
--   3. The board is never dead while tiles remain — every claim leaves a set
--      to find, which is what the fixpoint in _deal_to_playable is for.

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(12);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Set refill', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;

-- ── (1) Tail-compaction, on a planted fifteen-tile board ─────────────
-- Fifteen tiles in slot order. 1111,1112,1113 is a set (same count, color and
-- fill, all three shapes), and so is 1221,1222,1223 — which matters, because the twelve left
-- behind must still hold a set or the deal rule would top the board back up
-- and we would be measuring something else.
reset role;
update setgame.games
   set board = array[1111,1112,1113,1121,1122,1123,1131,1132,1133,1211,1212,1213,1221,1222,1223]::smallint[]
 where game_id = (select id from g);

create temp table before_compact on commit drop as
select pg_temp.sg_tiles_in_deck((select id from g)) as tiles_in_deck;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select setgame.submit_set((select id from g), array[1111,1112,1113]::smallint[])->'data'->>'result'),
  'claimed', 'a set can be claimed off an oversized board');

reset role;
select is(
  pg_temp.sg_board((select id from g)),
  array[1221,1222,1223,1121,1122,1123,1131,1132,1133,1211,1212,1213]::smallint[],
  'the board came down to twelve by moving the LAST three tiles into the holes');

select is(
  pg_temp.sg_tiles_in_deck((select id from g)),
  (select tiles_in_deck from before_compact),
  'an oversized board does not deal — it shrinks');

-- Slots 4..12 are the proof that compaction is local: those nine tiles are
-- exactly where they were, untouched by a claim three slots away.
select is(
  (select array_agg(c order by i)
     from unnest(pg_temp.sg_board((select id from g))) with ordinality as u(c, i)
    where i between 4 and 12),
  array[1121,1122,1123,1131,1132,1133,1211,1212,1213]::smallint[],
  'every tile below the tail kept its slot');

-- ── (2) Play a game out ──────────────────────────────────────────────
-- A SECOND, undoctored game. The board above was planted, which injects tiles
-- that were never dealt from its deck — fine for measuring compaction, but it
-- breaks the accounting the readouts below assert (and it would leave the
-- ending to fire on a board holding tiles the deck still contains).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;

create temp table played on commit drop as
select pg_temp.sg_play_out(
  (select id from g2),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]) as claims;

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g2)),
  'reached_goal/cleared/won', 'clearing the deck wins the coop game');
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g2) and final_ranking = 1 and outcome = 'won'),
  2, 'the whole team is ranked 1');
select is(
  pg_temp.sg_tiles_in_deck((select id from g2)),
  0, 'the deck is spent');
select is(
  pg_temp.sg_live((select id from g2)), null,
  'no set remains on the table — that is what ends it');

-- ── (3) The verdict's readouts ───────────────────────────────────────
select is(
  (select (summary_data->'team'->>'nSetsFound')::int from common.games where id = (select id from g2)),
  (select claims::int from played),
  'the summary carries the number of sets the table took');
select is(
  (select (summary_data->>'perfectClear')::boolean from common.games where id = (select id from g2)),
  cardinality(pg_temp.sg_board((select id from g2))) = 0,
  'a perfect clear is a win that left the table empty');
select is(
  81 - 3 * (select (summary_data->'team'->>'nSetsFound')::int from common.games where id = (select id from g2)),
  cardinality(pg_temp.sg_board((select id from g2))),
  'deck size minus three per claim IS what is left on the table');

-- Each player's own count, which the team's sums.
select is(
  (select sum((p->>'nSetsFound')::int)::int
     from common.games, jsonb_array_elements(game_data->'players') p
    where id = (select id from g2)),
  (select claims::int from played),
  'both players carry their own count, and together they are the table''s');

select * from finish();
rollback;
