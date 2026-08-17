-- ============================================================
-- Test: setgame.submit_set (coop) — the move, its rejections, the refill
-- ============================================================
-- The opening board is legal by construction, a real set is accepted, and the
-- three ways a claim can be refused each raise their own error key. The
-- refill assertions are the interesting half: a claim replaces cards IN PLACE,
-- so every card a player was already looking at keeps its slot.

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(18);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Set coop', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

-- ── The opening board ───────────────────────────────────────────────
-- The INVARIANT, not the number twelve. create_game runs the deal rule before
-- anyone sees the table, so a shuffle whose first twelve hold no set opens at
-- FIFTEEN — measured at 2.9% of 3000 shuffles through the real `_deal_to_playable`.
-- Asserting 12 therefore failed about one run in thirty-four, which is exactly
-- often enough to be dismissed as "the suite is flaky" and never chased.
select ok(
  cardinality(pg_temp.sg_board((select id from g))) >= 12
    and cardinality(pg_temp.sg_board((select id from g))) % 3 = 0,
  'the opening board is at least the floor, dealt in threes');
select isnt(
  pg_temp.sg_live((select id from g)), null,
  'the opening board always holds a set — create_game runs the deal rule first');
-- The accounting identity, not a lucky number: every card is in the deck, on
-- the table, or claimed. Asserting `69` would assume the opening deal stopped
-- at twelve, which it does not when the first twelve happen to hold no set —
-- about 3% of games, i.e. a test that fails once a month for a good reason.
select is(
  (select deck_left + cardinality(board) from setgame.games_state where id = (select id from g)),
  81, 'every card is either in the deck or on the table');
-- The title is a HANDLE, not a readout: the game's own short id, so it can be
-- quoted to another player or searched for. It never changes.
select is(
  (select title from common.games where id = (select id from g)),
  '#' || upper(left((select id from g)::text, 6)),
  'the title is the game''s own short id');

-- ── Rejections ──────────────────────────────────────────────────────
select throws_ok(
  format($$ select setgame.submit_set(%L, pg_temp.sg_not_a_set(%L)) $$,
         (select id from g), (select id from g)),
  'P0001', 'not-a-set|',
  'three cards that are not a set are refused');

select throws_ok(
  format($$ select setgame.submit_set(%L, array[0,1]::smallint[]) $$, (select id from g)),
  'P0001', 'bad-claim|',
  'a claim of two cards is refused');

select throws_ok(
  format($$ select setgame.submit_set(%L, array[%s,%s,%s]::smallint[]) $$,
         (select id from g),
         (pg_temp.sg_live((select id from g)))[1],
         (pg_temp.sg_live((select id from g)))[1],
         (pg_temp.sg_live((select id from g)))[2]),
  'P0001', 'bad-claim|',
  'the same card three times is refused, not read as a set');

-- A card that is nowhere on the board — the shape of the contention refusal.
select throws_ok(
  format($$ select setgame.submit_set(%L, array[%s,%s,%s]::smallint[]) $$,
         (select id from g),
         (pg_temp.sg_live((select id from g)))[1],
         (pg_temp.sg_live((select id from g)))[2],
         (select c from generate_series(0,80) c
           where not (c = any(pg_temp.sg_board((select id from g)))) limit 1)),
  'P0001', 'cards-gone|',
  'a card that has left the board is refused');

-- ── A real claim ────────────────────────────────────────────────────
create temp table before_claim on commit drop as
select pg_temp.sg_board((select id from g)) as board,
       pg_temp.sg_live((select id from g)) as taken;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select setgame.submit_set((select id from g), (select taken from before_claim))->>'result'),
  'claimed', 'a genuine set is accepted');

reset role;
select is(
  (select cards from setgame.events where kind = 'claim' and game_id = (select id from g)),
  (select taken from before_claim), 'the claim is logged with the cards taken');
select is(
  (select sets_found from setgame.players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1, 'the claimer''s count goes up');
select is(
  (select sets_found from setgame.players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  0, 'the other player''s count does not');
select is(
  (select title from common.games where id = (select id from g)),
  '#' || upper(left((select id from g)::text, 6)),
  '…and a claim does not rewrite it — a handle you cannot rely on is no handle');

-- ── The refill, which is where the in-place rule shows ───────────────
-- Same invariant after a claim, and deal-dependent for the same reason in the
-- other direction: if the twelve left behind hold no set, the rule deals three
-- more and the board is fifteen.
select ok(
  cardinality(pg_temp.sg_board((select id from g))) >= 12
    and cardinality(pg_temp.sg_board((select id from g))) % 3 = 0,
  'the board is topped back up to at least the floor');
select is(
  (select deck_left + cardinality(board) from setgame.games_state where id = (select id from g))
    + 3 * (select count(*)::int from setgame.events
            where kind = 'claim' and game_id = (select id from g)),
  81, 'the identity still holds after a claim: deck + table + claimed = 81');
select ok(
  not (pg_temp.sg_board((select id from g)) && (select taken from before_claim)),
  'none of the claimed cards is still on the board');

-- THE point of the in-place refill: every card that was not claimed is still
-- in the slot it was in. If the board closed up instead, all nine would have
-- shifted and this would fail.
select is(
  (select count(*)::int
     from before_claim bc,
          generate_series(1, 12) i,
          lateral (select pg_temp.sg_board((select id from g)) as cards) now
    where bc.board[i] = any(bc.taken)      -- this slot was refilled
       or bc.board[i] = now.cards[i]),     -- …or it did not move
  12, 'every unclaimed card kept its slot — a claim never shifts the board');

select is(
  (select count(*)::int from setgame.events where kind = 'claim' and game_id = (select id from g)),
  1, 'exactly one claim is on the log');

select * from finish();
rollback;
