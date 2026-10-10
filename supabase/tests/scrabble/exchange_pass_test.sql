-- cs-unmet

-- ============================================================
-- Test: scrabble.exchange_tiles + scrabble.pass_turn
-- ============================================================
-- Exchange returns tiles to the bag, reshuffles, redraws the same count
-- (needs bag ≥ 7). Pass forfeits a compete turn. Both bump version and
-- advance the turn (coop has no pass), but they treat the blocked-end
-- streak oppositely: a pass feeds it, an exchange clears it. Either one into
-- a game a friend just deleted is the shared race (PN485).

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(22);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select pg_temp.create_club('Exchange', array['ada', 'bea']) as handle;
reset role;

-- ─── Exchange: bag-≥7 gate ───────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gco on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;
reset role;
select pg_temp.sc_coop((select id from gco), array['a','b','c','d','e','f','g'],
  array['h','i','j']);  -- only 3 in the bag

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  scrabble.exchange_tiles((select id from gco), 0, array['a','b']),
  '{"type":"not-ok","severity":"fault","dbcode":"PN450",
    "message":"BUG: a swap against a bag under seven"}'::jsonb,
  'exchange is rejected when the bag holds < 7 tiles');
reset role;

-- ─── Exchange: happy path (coop) ─────────────────────────
select pg_temp.sc_bag((select id from gco),
  array['h','i','j','k','l','m','n','o','p','q']);  -- 10 in the bag

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table rex on commit drop as
  select scrabble.exchange_tiles((select id from gco), 0, array['a','b']) as res;
reset role;
select is((select res -> 'data' ->> 'result' from rex), 'exchanged', 'a valid exchange succeeds');
select is((select jsonb_array_length(res -> 'data' -> 'drawn') from rex), 2,
  'two tiles are drawn to replace the two returned');
select is((select array_length(team_rack, 1) from scrabble.games where game_id = (select id from gco)),
  7, 'the rack is still 7 tiles after the swap');
select is((select array_length(bag, 1) from scrabble.games where game_id = (select id from gco)),
  10, 'the bag count is unchanged (2 returned, 2 drawn)');
select is((select version from scrabble.games where game_id = (select id from gco)), 1,
  'exchange bumps version');
select is((select kind || ':' || tile_count from scrabble.events
           where game_id = (select id from gco)), 'exchange:2',
  'the exchange is logged with its tile count');
select is((select rack from scrabble.events where game_id = (select id from gco)),
  array['a','b','c','d','e','f','g'], 'the row keeps the rack the exchange was made from');
select is((select exchanged from scrabble.events where game_id = (select id from gco)),
  array['a','b'], 'and the tiles it put back');

-- ─── Pass (compete) advances the turn + pass streak ──────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gcp on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
select pg_temp.sc_turn((select id from gcp), 'ada11111-1111-1111-1111-111111111111');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table rpass on commit drop as
  select scrabble.pass_turn((select id from gcp), 0) as res;
reset role;
select is((select res -> 'data' ->> 'result' from rpass), 'passed', 'a pass is accepted');
select is((select consecutive_passes from scrabble.games where game_id = (select id from gcp)), 1,
  'pass bumps the pass streak');
select is(pg_temp.sc_current_user((select id from gcp)),
  'bea22222-2222-2222-2222-222222222222'::uuid, 'pass advances the turn');
select is((select e.rack from scrabble.events e
            where e.game_id = (select id from gcp) and e.kind = 'pass'),
  (select p.rack from scrabble.players p
    where p.game_id = (select id from gcp) and p.user_id = 'ada11111-1111-1111-1111-111111111111'),
  'a pass keeps the rack it passed on');

-- ─── The blocked end: everyone passed in a row ───────────
-- The casual house rule (not tournament Scrabble's 6 scoreless turns): one
-- lap of the table with nobody willing to play ends it. Two seats here, so
-- bea's pass is the second and last.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
create temp table rp2 on commit drop as
  select scrabble.pass_turn((select id from gcp), 1) as res;
reset role;
select isnt((select ended_at from common.games where id = (select id from gcp)), null,
  'a full round of passes ends the game');
select is((select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from gcp)),
  'all_passed/blocked', 'the all-passed end is stamped all_passed / blocked');

-- ─── An exchange CLEARS the streak ───────────────────────
-- Two scoreless turns in a row (pass then exchange) must NOT end the game:
-- swapping tiles is an attempt to get unstuck, not a refusal to move. Under
-- the old 6-scoreless rule an exchange fed the same counter as a pass.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gcx on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
select pg_temp.sc_turn((select id from gcx), 'ada11111-1111-1111-1111-111111111111');
select pg_temp.sc_rack((select id from gcx), 'bea22222-2222-2222-2222-222222222222',
  array['a','b','c','d','e','f','g']);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.pass_turn((select id from gcx), 0);
reset role;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select scrabble.exchange_tiles((select id from gcx), 1, array['a']);
reset role;
select is((select consecutive_passes from scrabble.games where game_id = (select id from gcx)), 0,
  'an exchange clears the pass streak');
select is((select ended_at from common.games where id = (select id from gcx)), null,
  'pass-then-exchange does NOT end the game');

-- ─── Coop has no pass ────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- A fault because the FE renders PassButton in compete only. Whether it
-- SHOULD be refused in turn-by-turn coop, where there is a turn to pass and the
-- other two cores respect it, is docs/games/scrabble.md → Deferred.
select pg_temp.envelope_is(
  scrabble.pass_turn((select id from gco), 1),
  '{"type":"not-ok","severity":"fault","dbcode":"PN454",
    "message":"BUG: a pass in a coop game"}'::jsonb,
  'passing is rejected in coop');

-- ─── Exchange can return a blank `?` to the bag ──────────
-- The exchange path runs `?` through `_remove_tiles` just like a letter;
-- the glyph must round-trip (the reshuffle may draw it straight back, so we
-- assert CONSERVATION across rack+bag rather than its position).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gbk on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;
reset role;
select pg_temp.sc_coop((select id from gbk),
  array['?','a','b','c','d','e','f'], array['h','i','j','k','l','m','n']);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table rbk on commit drop as
  select scrabble.exchange_tiles((select id from gbk), 0, array['?']) as res;
reset role;
select is((select res -> 'data' ->> 'result' from rbk), 'exchanged',
  'a blank `?` can be exchanged');
select is((select count(*)::int from
            unnest((select team_rack from scrabble.games where game_id = (select id from gbk))
                   || (select bag from scrabble.games where game_id = (select id from gbk))) t
           where t = '?'),
  1, 'the `?` is conserved in the rack+bag pool (neither lost nor duplicated)');

-- ─── A move into a game a friend just deleted ────────────
-- The delete takes the game's rows and every membership together, so the move
-- is answered by the shared race rather than by a fault, or by "You are not in
-- this game" (docs/envelopes.md → a missing game row is PN485).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gdel on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
delete from common.games where id = (select id from gdel);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  scrabble.exchange_tiles((select id from gdel), 0, array['a']),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'exchange_tiles into a deleted game is the shared race (PN485)');
select pg_temp.envelope_is(
  scrabble.pass_turn((select id from gdel), 0),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'pass_turn into a deleted game is the shared race (PN485)');

select * from finish();
rollback;
