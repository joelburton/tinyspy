-- cs-unmet

-- ============================================================
-- Test: setgame.create_game(target_club, setup, players, mode)
-- ============================================================
--
-- setgame had no test for its own create_game until the envelope conversion
-- (2026-08-28), so neither of its two raises had ever been asserted. What it
-- covers:
--   1. the gates it inherits — signed out, non-member, unknown mode
--   2. its own two refusals: the deck kind and the first player
--   3. the happy path: a deck is dealt, twelve cards are on the board
--
-- Every refusal here is a FAULT: the setup form offers a deck picker with two
-- options and a first-player list drawn from the checked players, so none of
-- these can be asked for. Arriving means something other than the form sent it.
-- ============================================================

begin;

set search_path = setgame, common, public, extensions;

select plan(9);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- (1) Signed out
-- ============================================================

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select pg_temp.envelope_is(
  setgame.create_game(
    'placeholder-club', '{"timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN011"}'::jsonb,
  'a signed-out caller is refused as a fault'
);

-- ============================================================
-- A club to build in
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Set create', array['ada', 'bea']) as handle;

-- (2) dee is signed in, but outside the club.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  setgame.create_game(
    (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN012"}'::jsonb,
  'a non-member is refused, through this function''s own handler'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- (3) A mode nobody can pick.
select pg_temp.envelope_is(
  setgame.create_game(
    (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'solo'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN040"}'::jsonb,
  'an unknown mode is a fault — no control offers one'
);

-- ============================================================
-- (4) The deck kind — setgame's own refusal
-- ============================================================
-- The form's picker offers exactly `full` and `junior`, so anything else
-- means the client is wrong rather than the player.

select pg_temp.envelope_is(
  setgame.create_game(
    (select handle from club),
    '{"timer": {"kind": "none"}, "deck": "tarot"}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN075"}'::jsonb,
  'a deck kind outside {full, junior} is a fault'
);

-- (5) …and both real decks are accepted.
select pg_temp.envelope_is(
  setgame.create_game(
    (select handle from club),
    '{"timer": {"kind": "none"}, "deck": "junior"}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop'),
  '{"type":"ok"}'::jsonb,
  'the junior deck is accepted'
);

-- ============================================================
-- (6) The first player, when co-op is played in turns
-- ============================================================
-- The picker lists only the checked players, so a stranger cannot be chosen.

select pg_temp.envelope_is(
  setgame.create_game(
    (select handle from club),
    ('{"timer": {"kind": "none"}, "coop_style": "turns",'
     || '"first_turn_user_id": "cade3333-3333-3333-3333-333333333333"}')::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN076"}'::jsonb,
  'a first player who is not in the game is a fault'
);

-- ============================================================
-- (7)–(8) The happy path
-- ============================================================

-- The whole envelope is kept, not just the id: `data.result` is what the two
-- call sites branch on (the in-game New Game and, once the interface follows,
-- SetupGameModal), and nothing was holding it to the contract.
create temp table created on commit drop as
select setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop') as env;
create temp table g on commit drop as
select (env->'data'->>'id')::uuid as id from created;

reset role;
select pg_temp.envelope_is(
  (select env from created),
  '{"type":"ok","data":{"result":"created"}}'::jsonb,
  'the answer names itself, so a call site has a case to assert'
);
select is(
  (select gametype from common.games where id = (select id from g)),
  'setgame_coop',
  'a coop game registers as setgame_coop in common.games'
);
select is(
  (select array_length(board, 1) from setgame.games where id = (select id from g)),
  12,
  'the opening board holds twelve cards'
);

-- ============================================================
select * from finish();
rollback;
