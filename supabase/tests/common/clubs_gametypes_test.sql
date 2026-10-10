-- cs-unmet

-- ============================================================
-- Test: common.gametypes + common.clubs_gametypes m2m
-- ============================================================
--
-- Coverage:
--   1. common.gametypes is populated for every registered gametype
--      family — both psychicnum siblings ('psychicnum_coop' AND
--      'psychicnum_compete'), both connections siblings (coop and
--      compete), plus codenamesduet + spellingbee.
--      Each manifest entry is its own row.
--   2. claim_username populates clubs_gametypes for each solo
--      club it creates — a row per registered gametype, LISTED
--      (is_enabled) only for the solo-playable ones (min_players <= 1)
--   3. create_club populates clubs_gametypes for each new (friend)
--      club — a row per gametype, listed for every default-enroll one
--      (psychicnum's pair opts out: it's the architecture toy, opt-in
--      via club settings)
--   4. RLS: a non-member cannot see clubs_gametypes rows for a
--      club they're outside; a member can
--   5. RLS: common.gametypes is permissively readable (sanity
--      check — gametype identifiers are not sensitive)
--
-- See `codenamesduet/create_game_test.sql` for the pgTAP / auth-
-- simulation primer.

begin;

set search_path = common, public, extensions;

select plan(19);

-- Cast: ada + bea form the test club; dee is the outsider used
-- for the RLS-negative assertions. The personas come from
-- _shared/setup.psql, which manually materializes the
-- profile + solo-club + clubs_gametypes for each one (mirroring
-- what claim_username does at first sign-in).

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

-- ============================================================
-- (1)–(2) common.gametypes registry: today.s gametypes are present
-- ============================================================

select is(
  (select count(*) from common.gametypes),
  33::bigint,
  'common.gametypes contains thirty-three rows (codenamesduet + 2 psychicnum + 2 connections + 2 spellingbee + bananagrams + 2 waffle + 2 wordle + 2 wordleone + 2 stackdown + 2 scrabble + 2 boggle + 2 crosswords + 2 wordwheel + 2 wordiply + 2 strands + 2 letterboxed + 2 setgame + wordsy_compete)'
);

select is(
  (select array_agg(gametype order by gametype) from common.gametypes),
  array['bananagrams','boggle_compete','boggle_coop','codenamesduet','connections_compete','connections_coop','crosswords_compete','crosswords_coop','letterboxed_compete','letterboxed_coop','psychicnum_compete','psychicnum_coop','scrabble_compete','scrabble_coop','setgame_compete','setgame_coop','spellingbee_compete','spellingbee_coop','stackdown_compete','stackdown_coop','strands_compete','strands_coop','waffle_compete','waffle_coop','wordiply_compete','wordiply_coop','wordle_compete','wordle_coop','wordleone_compete','wordleone_coop','wordsy_compete','wordwheel_compete','wordwheel_coop'],
  'common.gametypes contains the thirty-three registered gametypes by name'
);

-- ============================================================
-- (3)–(4) claim_username populates m2m for solo clubs
-- ============================================================
-- The personas were inserted by _shared/setup.psql. Each one's
-- solo club exists with handle '=' + username. We check ada's
-- solo club — same shape for every persona by construction.

-- Every club carries a row per registered gametype (paw protection: the cap
-- and the saved setup live on the row), and `is_enabled` is what the old
-- "row exists" used to say. A solo club LISTS only solo-playable gametypes
-- (min_players <= 1): the coop/solo variants — plus scrabble_compete, which
-- is solo-playable because you can race an AI opponent alone
-- (docs/games/scrabble.md). psychicnum_coop is solo-playable but
-- default_enroll = false, so it is unlisted too.
select is(
  (
    select count(*)
    from common.clubs_gametypes k
    join common.clubs c on c.handle = k.club_handle
    where c.handle = '=ada'
  ),
  33::bigint,
  'claim_username populated a clubs_gametypes row for every registered gametype on ada''s solo club'
);

select is(
  (
    select array_agg(k.gametype order by k.gametype)
    from common.clubs_gametypes k
    join common.clubs c on c.handle = k.club_handle
    where c.handle = '=ada' and k.is_enabled
  ),
  array['bananagrams','boggle_coop','connections_coop','crosswords_coop','letterboxed_coop','scrabble_compete','scrabble_coop','setgame_coop','spellingbee_coop','stackdown_coop','strands_coop','waffle_coop','wordiply_coop','wordle_coop','wordleone_coop','wordwheel_coop'],
  'ada''s solo club lists the sixteen solo-playable default-enroll gametypes (incl. scrabble_compete vs AI)'
);

-- ============================================================
-- (5)–(6) create_club populates m2m for the new club
-- ============================================================
-- `common.create_club` directly, not the fixture's `pg_temp.create_club`,
-- which enables every gametype on the club it makes: the default
-- enrollment is this test's subject.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) -> 'data' ->> 'handle' as handle;

reset role;
select is(
  (
    select count(*)
    from common.clubs_gametypes
    where club_handle = (select handle from club)
  ),
  33::bigint,
  'create_club populated a row for every registered gametype on the new club'
);

select is(
  (
    select array_agg(gametype order by gametype)
    from common.clubs_gametypes
    where club_handle = (select handle from club) and is_enabled
  ),
  array['bananagrams','boggle_compete','boggle_coop','codenamesduet','connections_compete','connections_coop','crosswords_compete','crosswords_coop','letterboxed_compete','letterboxed_coop','scrabble_compete','scrabble_coop','setgame_compete','setgame_coop','spellingbee_compete','spellingbee_coop','stackdown_compete','stackdown_coop','strands_compete','strands_coop','waffle_compete','waffle_coop','wordiply_compete','wordiply_coop','wordle_compete','wordle_coop','wordleone_compete','wordleone_coop','wordsy_compete','wordwheel_compete','wordwheel_coop'],
  'new club lists the thirty-one default-enroll gametypes — no psychicnum'
);

-- ============================================================
-- (7) Ada (member) can SELECT her club's m2m rows
-- ============================================================
-- Positive baseline for the RLS negative check below.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (
    select count(*)
    from common.clubs_gametypes
    where club_handle = (select handle from club)
  ),
  33::bigint,
  'sanity: ada (a member) sees her club''s m2m rows'
);

-- ============================================================
-- (8) Dee (outsider) cannot SELECT the m2m rows
-- ============================================================
-- clubs_gametypes_select is gated on common._is_club_member.

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (
    select count(*)
    from common.clubs_gametypes
    where club_handle = (select handle from club)
  ),
  0::bigint,
  'dee (non-member) sees zero m2m rows for ada+bea''s club (RLS hides)'
);

-- ============================================================
-- (9) Dee can still SELECT from common.gametypes
-- ============================================================
-- Gametype identifiers aren't club-scoped — the registry has a
-- permissive SELECT policy so the FE can resolve "what
-- gametypes exist" without needing a club context.

select is(
  (select count(*) from common.gametypes),
  33::bigint,
  'common.gametypes is readable by any signed-in user'
);

-- ============================================================
-- (10) Direct INSERT into clubs_gametypes is blocked
-- ============================================================
-- No INSERT/UPDATE/DELETE grants for authenticated — writes go
-- through the security-definer create_club / handle_new_user.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  $$ insert into common.clubs_gametypes (club_handle, gametype)
     values ((select handle from common.clubs where handle = '=ada'),
             'codenamesduet') $$,
  '42501',
  'permission denied for table clubs_gametypes',
  'direct INSERT into clubs_gametypes is blocked (no grant on authenticated)'
);

-- ============================================================
-- (11) min_players mirrors each manifest's player-count lower bound
-- ============================================================
-- Solo-playable games register 1; two-player games register 2.
-- Sorted by gametype: bananagrams(1), codenamesduet(2),
-- spellingbee_compete(2), spellingbee_coop(1).
select is(
  (select array_agg(min_players order by gametype)
     from common.gametypes
    where gametype in ('codenamesduet', 'bananagrams', 'spellingbee_coop', 'spellingbee_compete')),
  array[1, 2, 2, 1]::smallint[],
  'common.gametypes.min_players: solo games register 1, two-player games register 2'
);

-- ============================================================
-- (11b) default_enroll: exactly psychicnum's pair opts out
-- ============================================================
-- The registry fact behind (3)/(5) above. Asserting the exact set (not just
-- the count) means a new game accidentally registering false shows up here
-- by name.
select is(
  (select array_agg(gametype order by gametype)
     from common.gametypes where not default_enroll),
  array['psychicnum_compete', 'psychicnum_coop'],
  'default_enroll is false for exactly psychicnum''s pair — the architecture toy'
);

-- ============================================================
-- (12)-(15) set_club_gametypes — the club-settings editor
-- ============================================================
-- Seed a default_setup on one row first, so we can prove an edit
-- keeps it: the RPC updates rows and never deletes one. Done as the
-- superuser — authenticated has no write grant on the table.

reset role;
update common.clubs_gametypes
   set default_setup = '{"turns": 9}'::jsonb
 where club_handle = (select handle from club)
   and gametype = 'codenamesduet';

-- Ada (a member) sends three entries: psychicnum_coop listed — proving
-- default_enroll = false means off-by-default, not banned — wordle_coop
-- unlisted, and a cap of 3 on codenamesduet. Every other row is left alone.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  common.set_club_gametypes(
    (select handle from club),
    '[{"gametype": "psychicnum_coop", "is_enabled": true},
      {"gametype": "wordle_coop", "is_enabled": false},
      {"gametype": "codenamesduet", "max_daily_games": 3}]'::jsonb),
  '{"type": "ok", "data": {"result": "saved"}}'::jsonb,
  'set_club_gametypes: a member can change the listing and the caps (incl. opting into an off-by-default game)'
);

select is(
  (select array_agg(gametype order by gametype)
     from common.clubs_gametypes
    where club_handle = (select handle from club) and is_enabled),
  array['bananagrams','boggle_compete','boggle_coop','codenamesduet','connections_compete','connections_coop','crosswords_compete','crosswords_coop','letterboxed_compete','letterboxed_coop','psychicnum_coop','scrabble_compete','scrabble_coop','setgame_compete','setgame_coop','spellingbee_compete','spellingbee_coop','stackdown_compete','stackdown_coop','strands_compete','strands_coop','waffle_compete','waffle_coop','wordiply_compete','wordiply_coop','wordle_compete','wordleone_compete','wordleone_coop','wordsy_compete','wordwheel_compete','wordwheel_coop'],
  'set_club_gametypes listed psychicnum_coop, unlisted wordle_coop, and left the rest'
);

select is(
  (select default_setup->>'turns'
     from common.clubs_gametypes
    where club_handle = (select handle from club) and gametype = 'codenamesduet'),
  '9',
  'set_club_gametypes preserved default_setup on a row it changed'
);

select is(
  (select array_agg(max_daily_games order by gametype)
     from common.clubs_gametypes
    where club_handle = (select handle from club)
      and gametype in ('codenamesduet', 'wordle_coop')),
  array[3, null]::smallint[],
  'set_club_gametypes wrote the one cap it was sent and left the other null'
);

-- ============================================================
-- (16)-(17) An empty table changes nothing
-- ============================================================
select pg_temp.envelope_is(
  common.set_club_gametypes((select handle from club), '[]'::jsonb),
  '{"type": "ok", "data": {"result": "saved"}}'::jsonb,
  'set_club_gametypes: an empty table is accepted'
);
select is(
  (select count(*) from common.clubs_gametypes
    where club_handle = (select handle from club) and is_enabled),
  31::bigint,
  'set_club_gametypes with an empty table leaves every row as it was'
);

-- ============================================================
-- (18) A non-member cannot edit the club's gametypes
-- ============================================================
-- Same membership gate as every other club RPC (_require_club_member),
-- whose raise this function's handler catches like any other.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  common.set_club_gametypes(
    (select handle from club), '[{"gametype": "codenamesduet", "is_enabled": false}]'::jsonb),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN012",
    "message": "You are not a member of this club"}'::jsonb,
  'set_club_gametypes: a non-member gets a declared fault'
);

-- ============================================================
select * from finish();
rollback;
