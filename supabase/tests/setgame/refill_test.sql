-- ============================================================
-- Test: the deal-three rule, the tail-compaction, and the terminal
-- ============================================================
-- Three things that only show up over a whole game:
--
--   1. A board coming DOWN from fifteen compacts from the TAIL — at most
--      three cards move, and they are the ones at the end of the layout.
--      Planted, because a fifteen-card board arises naturally in about 3% of
--      deals and a test that waits for one tests nothing most of the time.
--   2. Playing to the natural end terminates, and lands on the right verdict.
--   3. The board is never dead while cards remain — every claim leaves a set
--      to find, which is what the fixpoint in _deal_to_playable is for.

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(12);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Set refill', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

-- ── (1) Tail-compaction, on a planted fifteen-card board ─────────────
-- Cards 0..14 in slot order. 0,1,2 is a set (same count/color/shade, all
-- three shapes), and so is 12,13,14 — which matters, because the twelve left
-- behind must still hold a set or the deal rule would top the board back up
-- and we would be measuring something else.
reset role;
update setgame.games
   set board = array[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14]::smallint[]
 where id = (select id from g);

create temp table before_compact on commit drop as
select deck_left from setgame.games_state where id = (select id from g);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select setgame.submit_set((select id from g), array[0,1,2]::smallint[])->>'result'),
  'claimed', 'a set can be claimed off an oversized board');

reset role;
select is(
  pg_temp.sg_board((select id from g)),
  array[12,13,14,3,4,5,6,7,8,9,10,11]::smallint[],
  'the board came down to twelve by moving the LAST three cards into the holes');

select is(
  (select deck_left from setgame.games_state where id = (select id from g)),
  (select deck_left from before_compact),
  'an oversized board does not deal — it shrinks');

-- Slots 4..12 are the proof that compaction is local: those nine cards are
-- exactly where they were, untouched by a claim three slots away.
select is(
  (select array_agg(c order by i)
     from unnest(pg_temp.sg_board((select id from g))) with ordinality as u(c, i)
    where i between 4 and 12),
  array[3,4,5,6,7,8,9,10,11]::smallint[],
  'every card below the tail kept its slot');

-- ── (2) Play a game out ──────────────────────────────────────────────
-- A SECOND, undoctored game. The board above was planted, which injects cards
-- that were never dealt from its deck — fine for measuring compaction, but it
-- breaks the accounting the readouts below assert (and it would leave the
-- terminal to fire on a board holding cards the deck still contains).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

create temp table played on commit drop as
select pg_temp.sg_play_out(
  (select id from g2),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]) as claims;

reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'won', 'clearing the deck wins the coop game');
select ok(
  (select is_terminal from common.games where id = (select id from g2)),
  'the game is terminal');
select is(
  (select deck_left from setgame.games_state where id = (select id from g2)),
  0, 'the deck is spent');
select is(
  pg_temp.sg_live((select id from g2)), null,
  'no set remains on the table — that is what ends it');

-- ── (3) The verdict's readouts ───────────────────────────────────────
select is(
  (select (status->>'sets_found')::int from common.games where id = (select id from g2)),
  (select claims::int from played),
  'status carries the number of sets the table took');
-- Nothing records the cards left on the table, because nothing has to: with the
-- deck spent, every card is either claimed or still lying there.
select is(
  (select (status->>'stranded') from common.games where id = (select id from g2)),
  null, 'the leftover count is not stored — it is derivable, and a replay would stale it');
select is(
  81 - 3 * (select (status->>'sets_found')::int from common.games where id = (select id from g2)),
  cardinality(pg_temp.sg_board((select id from g2))),
  '…and the derivation holds: deck size minus three per claim IS what is left');

-- The per-player breakdown lands at the terminal and only there: coop shows
-- one team number while the game runs.
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g2)
      and (result->>'sets_found') is not null),
  2, 'both players get their own count in the end-of-game results');

select * from finish();
rollback;
