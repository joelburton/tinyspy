-- ============================================================
-- Test: strands.spend_hint — the shared coop hint economy
-- ============================================================
--
-- The hint is the one place strands MUST be server-side even if the rest of the
-- game were ever flipped to trusting-commit: the coop pool is SHARED, so every
-- player has to see the SAME revealed word. A client-side pick would show three
-- players three different hints for one spent token. That is what test (4)
-- pins — the reveal is stored on the game row, not derived per client.
--
-- What a hint publishes is COORDS, never the word: it rings the tiles and
-- leaves the player to work out the order. Test (5) is that distinction, and it
-- is a real leak if it ever regresses.

begin;

set search_path = strands, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;
select pg_temp.strands_hint_words();

create temp table game on commit drop as
select id from strands.create_game(
  (select handle from club),
  -- hint_cost 2, so the fixture's four hint words can fill the bar TWICE —
  -- which is what makes the "a hint is already showing" case reachable at all.
  pg_temp.strands_setup((select puzzle_id from fix), 5, 2, 4),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');

-- ============================================================
-- (1)–(2) You cannot spend what you have not earned
-- ============================================================

select throws_ok(
  format($$ select strands.spend_hint(%L) $$, (select id from game)),
  'P0001',
  'not enough hint points',
  'an empty bar cannot be spent'
);

select strands.submit_path((select id from game), pg_temp.strands_prefix_path(0, 4));

select throws_ok(
  format($$ select strands.spend_hint(%L) $$, (select id from game)),
  'P0001',
  'not enough hint points',
  'a PARTLY full bar (1 of 2) still cannot be spent'
);

-- ============================================================
-- (3)–(6) Spending: coords out, bar reset, spend counted
-- ============================================================

select strands.submit_path((select id from game), pg_temp.strands_prefix_path(1, 4));

create temp table hint on commit drop as
select strands.spend_hint((select id from game)) as payload;

select is(
  (select jsonb_typeof(payload->'coords') from hint),
  'array',
  'spending returns the revealed word''s coordinates'
);

-- The pool is SHARED, so the choice has to live on the game row where every
-- client reads the same value — not be re-rolled per caller.
select is(
  (select active_hint_coords from strands.players_state
    where game_id = (select id from game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  (select payload->'coords' from hint),
  'the SAME coords are persisted on the game — every coop player sees one hint'
);

-- A hint reveals WHERE, never WHAT. If the word ever rode along, the puzzle
-- would be over the moment a hint was spent.
select is(
  (select payload::text ~* '"word"' from hint),
  false,
  'the payload carries no word — a hint rings tiles, it does not name them'
);

select is(
  (select hint_points from strands.players_state
    where game_id = (select id from game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  0,
  'spending empties the bar'
);

select is(
  (select hints_spent from strands.players_state
    where game_id = (select id from game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1,
  'and counts the spend'
);

-- ============================================================
-- (7) One hint at a time
-- ============================================================
-- Refill the bar completely while the first hint still shows. That the bar CAN
-- refill is itself the point: the cap only bites a FULL bar, so once a hint is
-- cashed the team goes on earning — and is then refused a second reveal on the
-- board-readability rule rather than on points.

select strands.submit_path((select id from game), pg_temp.strands_prefix_path(2, 4));
select strands.submit_path((select id from game), pg_temp.strands_prefix_path(3, 4));

select throws_ok(
  format($$ select strands.spend_hint(%L) $$, (select id from game)),
  'P0001',
  'a hint is already showing',
  'a second hint is refused while one is unsolved — the board rings one word'
);

-- ============================================================
-- (8)–(9) The hint retires when its word is found
-- ============================================================
-- Which word was revealed is random, so the test reads it back rather than
-- assuming: whatever it pointed at, tracing THAT path must clear it.

create temp table hinted on commit drop as
select active_hint_coords as coords from strands.players_state
 where game_id = (select id from game)
   and user_id = 'ada11111-1111-1111-1111-111111111111';

select is(
  strands.submit_path((select id from game), (select coords from hinted))->>'hint_cleared',
  'true',
  'finding the hinted word reports that the hint was cleared'
);

select is(
  (select active_hint_coords from strands.players_state
    where game_id = (select id from game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  null,
  'and the hint stops showing'
);

-- ============================================================
-- (10)–(11) Access
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select strands.spend_hint(%L) $$, (select id from game)),
  '42501',
  'not playing this game',
  'an outsider cannot spend the club''s hint'
);

-- The hint above revealed a RANDOM word, and finding it consumed that row —
-- so the row this assertion traces has to be chosen, not assumed. Picking a
-- fixed row made the test pass or fail depending on the shuffle, which is the
-- kind of flake that only shows up later on someone else's machine.
create temp table free_row on commit drop as
select r from generate_series(0, 7) r
 where not exists (
   select 1 from strands.guesses g, lateral jsonb_array_elements(g.path) e
    where g.game_id = (select id from game)
      and g.result in ('theme', 'spangram')
      and (e->>0)::int = r
 )
 order by r limit 1;

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format($$ select strands.submit_path(%L, %L::jsonb) $$,
         (select id from game),
         pg_temp.strands_prefix_path((select r from free_row), 4)::text),
  'the other player can act on the shared board too (coop is shared state)'
);

select * from finish();
rollback;
