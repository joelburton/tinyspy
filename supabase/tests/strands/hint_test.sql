-- cs-unmet

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
-- is a real leak if it ever regresses. A hint asked of a game a friend just
-- deleted is the shared race (PN485).

begin;

set search_path = strands, common, public, extensions;

select plan(19);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada and Bea', array['ada','bea']) as handle;
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;
select pg_temp.strands_hint_words();

create temp table game on commit drop as
select (strands.create_game(
  (select handle from club),
  -- hint_cost 2, so the fixture's four hint words can fill the bar TWICE —
  -- which is what makes the "a hint is already showing" case reachable at all.
  pg_temp.strands_setup((select puzzle_id from fix), 5, 2, 4),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;

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
  strands.submit_path((select id from game), pg_temp.strands_prefix_path(5, 4)) -> 'data' ->> 'result',
  'invalid',
  'the other player can act on the shared board too (coop is shared state)'
);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- ============================================================
-- (2)–(3) You cannot spend what you have not earned
-- ============================================================

-- A RACE, not a fault, and the shared pool is why: the button computes the
-- shortfall itself and says so without calling, so reaching the server proves
-- the bar moved after that check — which in coop a teammate can do.
select pg_temp.envelope_is(
  strands.spend_hint((select id from game)),
  '{"type":"not-ok","severity":"race","dbcode":"PN432",
    "message":"Hint bar not full yet"}'::jsonb,
  'an empty bar cannot be spent'
);

select strands.submit_path((select id from game), pg_temp.strands_prefix_path(0, 4));

select pg_temp.envelope_is(
  strands.spend_hint((select id from game)),
  '{"type":"not-ok","severity":"race","dbcode":"PN432",
    "message":"Hint bar not full yet"}'::jsonb,
  'a PARTLY full bar (1 of 2) still cannot be spent'
);

-- ============================================================
-- (3)–(6) Spending: coords out, bar reset, spend counted
-- ============================================================

select strands.submit_path((select id from game), pg_temp.strands_prefix_path(1, 4));

-- ONE call, two columns off it: spending twice here would cash two hints and
-- make everything below read the wrong one.
create temp table hint on commit drop as
select e as envelope, e -> 'data' as payload
  from strands.spend_hint((select id from game)) e;

select pg_temp.envelope_is(
  (select envelope from hint),
  '{"type":"ok","outcome":null,"data":{"result":"hinted"}}'::jsonb,
  'spending answers ok/hinted, with no outcome: lib/answer.ts says what a hint reads as'
);

select is(
  (select jsonb_array_length(cg.game_data->'team'->'board'->'hintTileIds')
     from common.games cg
    where cg.id = (select id from game)),
  6,
  'the ringed word lands on the coop team''s one board, as one word''s tile ids'
);

-- The pool is SHARED, so the choice has to be persisted where every client
-- reads the same value — not be re-rolled per caller.
select is(
  (select count(distinct active_hint_coords)::int from strands.players
    where game_id = (select id from game) and active_hint_coords is not null),
  1,
  'the SAME coords are persisted on every coop row — every player sees one hint'
);

-- A hint reveals WHERE, never WHAT. If the word ever rode along, the puzzle
-- would be over the moment a hint was spent.
select is(
  (select payload::text ~* '"word"' from hint),
  false,
  'the payload carries no word — a hint rings tiles, it does not name them'
);

select is(
  (select max(hint_points) from strands.players
    where game_id = (select id from game)),
  0,
  'spending empties the bar, on every coop row'
);

select is(
  (select string_agg(n_hints_used::text, ',' order by user_id) from strands.players
    where game_id = (select id from game)),
  '1,0',
  'and counts the spend to whoever cashed it alone'
);

-- ============================================================
-- (7)–(10) The spend is LOGGED — strands.events, kind='hint'
-- ============================================================
-- A spent hint is an event-log row: it is the one thing besides a find that
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
  (select active_hint_coords from strands.players
    where game_id = (select id from game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
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

-- Also a race, and also the shared pool: a teammate's spend rings a word
-- between your click and this call.
select pg_temp.envelope_is(
  strands.spend_hint((select id from game)),
  '{"type":"not-ok","severity":"race","dbcode":"PN433",
    "message":"A hint is already showing"}'::jsonb,
  'a second hint is refused while one is unsolved — the board rings one word'
);

-- ============================================================
-- (8)–(9) The hint retires when its word is found
-- ============================================================
-- Which word was revealed is random, so the test reads it back rather than
-- assuming: whatever it pointed at, tracing THAT path must clear it.

create temp table hinted on commit drop as
select active_hint_coords as coords from strands.players
 where game_id = (select id from game)
   and user_id = 'ada11111-1111-1111-1111-111111111111';

select ok(
  strands.submit_path((select id from game), (select coords from hinted)) -> 'data' ->> 'result'
    in ('theme', 'spangram'),
  'tracing the hinted word finds it'
);

select is(
  (select count(*) from strands.players
    where game_id = (select id from game) and active_hint_coords is not null),
  0::bigint,
  'and the hint stops showing, for every coop player'
);

-- ============================================================
-- (10)–(11) Access
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  strands.spend_hint((select id from game)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
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

-- ============================================================
-- A move into a game a friend just deleted
-- ============================================================
-- The delete takes the game's rows and every membership together, so the move
-- is answered by the shared race rather than by a fault, or by "You are not in
-- this game" (docs/envelopes.md → a missing game row is PN485).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gdel on commit drop as
select (strands.create_game(
  (select handle from club), pg_temp.strands_setup((select puzzle_id from fix)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;
reset role;
delete from common.games where id = (select id from gdel);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  strands.spend_hint((select id from gdel)),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'spend_hint on a deleted game is the shared race (PN485)'
);

select * from finish();
rollback;
