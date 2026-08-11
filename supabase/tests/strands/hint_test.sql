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

select plan(17);

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
-- (1) Both players can act on the shared board
-- ============================================================
-- Done FIRST, before anything is found, and that ordering is the point: the
-- hint below reveals a RANDOM word, and finding it consumes that row — so an
-- equivalent check afterwards passed or failed on the shuffle. (It did, about
-- one run in ten, and chasing the mechanism cost more than removing the
-- dependency.) Row 5's prefix is in no seeded word list, so the verdict here
-- is deterministic whatever else happens later.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  strands.submit_path((select id from game), pg_temp.strands_prefix_path(5, 4))->>'result',
  'invalid',
  'the other player can act on the shared board too (coop is shared state)'
);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- ============================================================
-- (2)–(3) You cannot spend what you have not earned
-- ============================================================

select throws_ok(
  format($$ select strands.spend_hint(%L) $$, (select id from game)),
  'P0001',
  'not-enough-hint-points|',
  'an empty bar cannot be spent'
);

select strands.submit_path((select id from game), pg_temp.strands_prefix_path(0, 4));

select throws_ok(
  format($$ select strands.spend_hint(%L) $$, (select id from game)),
  'P0001',
  'not-enough-hint-points|',
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
-- (7)–(10) The spend is LOGGED — strands.events, kind='hint'
-- ============================================================
-- A spent hint is a turn-log row: it is the one thing besides a find that
-- changes the board, and in compete it IS the ranking metric.

-- ONE row, and this is the case worth pinning: the counters above fan out to
-- every player row in coop (the pool is the team's), and the obvious mistake is
-- to fan the log row out the same way. A shared pool still has a single person
-- who decided to cash it.
select is(
  (select count(*) from strands.events
    where game_id = (select id from game) and kind = 'hint'),
  1::bigint,
  'spending logs exactly ONE event, not one per player as the counters do'
);

select is(
  (select user_id from strands.events
    where game_id = (select id from game) and kind = 'hint'),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'attributed to whoever cashed it'
);

-- The coords ARE stored (that is what lets the history viewer re-ring a past
-- hint), the word is NOT — the same distinction the payload makes, held in the
-- one place that outlives the on-board ring being retired.
select is(
  (select path from strands.events
    where game_id = (select id from game) and kind = 'hint'),
  (select payload->'coords' from hint),
  'carrying the revealed coords — and, per the CHECK, no word'
);

-- The load-bearing consequence of `result` being null on a hint: every query in
-- supabase/sql/strands.sql filters on `result`, so a hint row is invisible to
-- ALL of them by construction. That is why adding hints changed no existing
-- query, and this is the assertion that keeps it true — it fails the moment
-- somebody gives hint rows a result value.
select is(
  (select count(*) from strands.events
    where game_id = (select id from game)
      and result in ('theme','spangram','hint_word','duplicate','too_short','invalid')),
  3::bigint,
  'the three GUESSES so far match every result predicate; the hint matches none'
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
  'hint-already-showing|',
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
  'not-a-player|',
  'an outsider cannot spend the club''s hint'
);

-- ============================================================
-- (15) A replay wipes the hint rows with everything else
-- ============================================================
-- replay_board deletes the game's events unconditionally, so this holds
-- structurally rather than by a rule about hints — which is exactly why it is
-- worth one line: a future "keep some rows" would silently strand them.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select strands.replay_board((select id from game));
select is(
  (select count(*) from strands.events where game_id = (select id from game)),
  0::bigint,
  'a replay clears the hint rows too — a restart is indistinguishable from a fresh game'
);

select * from finish();
rollback;
