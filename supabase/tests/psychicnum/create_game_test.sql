-- cs-unmet

-- ============================================================
-- Test: psychicnum.create_game(target_club, setup, players, mode)
-- ============================================================
--
-- One RPC, two modes ('coop' and 'compete'). What we cover:
--   1. Auth + membership gating (same in both modes)
--   2. Mode validation: rejected when not in {coop, compete}
--   3. Compete-mode player-count floor (>= 2 players)
--   4. Setup-shape validation: guesses + timer
--   5. Happy path (coop): writes psychicnum_coop gametype,
--      seeds per-player budget rows, mode='coop' on the row,
--      word_count board words + three distinct secrets drawn from them
--   6. Happy path (compete): same, with psychicnum_compete
--      gametype string and mode='compete'
--   7. The `secrets` column is NOT readable to authenticated
-- ============================================================

begin;

set search_path = psychicnum, common, public, extensions;

select plan(31);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

-- ============================================================
-- (1) Unauthenticated callers are rejected
-- ============================================================

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

-- Nothing THROWS out of this function any more: its handler turns every one of
-- our own raises into an envelope, so even the signed-out gate comes back as a
-- value. The severity is what says it is not the player's doing.
select pg_temp.envelope_is(
  psychicnum.create_game(
    'placeholder-club',
    '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN011"}'::jsonb,
  'a signed-out caller is refused as a fault, not a validation'
);

-- ============================================================
-- Build a club for the happy-path tests
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada','bea']) as handle;

-- psychicnum is default_enroll = false (the architecture toy), so a fresh
-- club doesn't carry its clubs_gametypes rows — and the default_setup
-- auto-save in create_game lands on those rows. Opt in, the way a real
-- club that wants the toy would.
select common.set_club_gametypes(
  (select handle from club), array['psychicnum_coop', 'psychicnum_compete']);

-- ============================================================
-- (2) Non-member callers are rejected
-- ============================================================
-- dee is signed in but outside ada+bea's club.

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  psychicnum.create_game(
    (select handle from club),
    '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
           'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN012"}'::jsonb,
  'a non-member gets the membership gate, through this function''s own handler'
);

-- ============================================================
-- (3) Bad mode value is rejected
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  psychicnum.create_game(
    (select handle from club),
    '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
           'bea22222-2222-2222-2222-222222222222'::uuid],
    'bogus'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN040"}'::jsonb,
  'an unknown mode is a fault — no control offers one'
);

-- ============================================================
-- (4) Compete-mode requires 2+ players
-- ============================================================
-- ada starts a solo club; compete on a single-player array is
-- the degenerate "race yourself" case the FE manifest hides
-- (numberOfPlayers: [2, 6]) — server enforces it too.

select pg_temp.envelope_is(
  psychicnum.create_game(
    (select handle from club),
    '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'compete'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN042"}'::jsonb,
  'a solo race is refused, and the picker is what to fix'
);

-- ============================================================
-- (5) Coop accepts a 1-player array (solo coop is fine)
-- ============================================================
-- The 1-player case is the solo club's main use. lives_ok rather
-- than is() — we don't capture the row, just that no exception
-- raises.

select pg_temp.envelope_is(
  psychicnum.create_game(
    (select handle from club),
    '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop'),
  '{"type":"ok"}'::jsonb,
  'coop accepts a 1-player array — the solo club''s main use'
);

-- ============================================================
-- (6) Setup-shape validation
-- ============================================================

-- Every one of these names the FIELD it is about, which is what carries the
-- message to the right box on the setup form.
select pg_temp.envelope_is(
  psychicnum.create_game(
    (select handle from club),
    '{"guesses": 4, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
           'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN044"}'::jsonb,
  'guesses out of range names the guesses field'
);

select pg_temp.envelope_is(
  psychicnum.create_game(
    (select handle from club),
    '{}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
           'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN043"}'::jsonb,
  'missing guesses names the guesses field'
);

select pg_temp.envelope_is(
  psychicnum.create_game(
    (select handle from club),
    '{"guesses": 7, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
           'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN045"}'::jsonb,
  'missing word_count names the word_count field'
);

select pg_temp.envelope_is(
  psychicnum.create_game(
    (select handle from club),
    '{"guesses": 7, "word_count": 4, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
           'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN046"}'::jsonb,
  'word_count out of range names the word_count field'
);

-- A SHARED guard's raise (common.require_valid_timer), caught by this
-- function's handler. A FAULT rather than a validation: the timer control
-- always sends a kind and keeps the last VALID seconds, so neither of these
-- can come from the form — arriving means something else is wrong.
select pg_temp.envelope_is(
  psychicnum.create_game(
    (select handle from club),
    '{"guesses": 7, "word_count": 8, "difficulty": 3}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
           'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN035"}'::jsonb,
  'a missing timer is a fault — the control always sends one'
);

select pg_temp.envelope_is(
  psychicnum.create_game(
    (select handle from club),
    '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "countdown", "seconds": 99999}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
           'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN039"}'::jsonb,
  'an out-of-range countdown is a fault — the box keeps the last valid length'
);

select pg_temp.envelope_is(
  psychicnum.create_game(
    (select handle from club),
    '{"guesses": 7, "word_count": 8, "difficulty": 9, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
           'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN048"}'::jsonb,
  'a band outside 1..6 names the difficulty field'
);

-- ============================================================
-- Happy path (coop)
-- ============================================================

-- The whole envelope is kept, not just the id: `data.result` is the field both
-- call sites filter the `ok` on.
create temp table coop_created on commit drop as
select psychicnum.create_game(
  (select handle from club),
  '{"guesses": 5, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop') as env;
create temp table coop_game on commit drop as
select (env->'data'->>'id')::uuid as id from coop_created;

select pg_temp.envelope_is(
  (select env from coop_created),
  '{"type":"ok","data":{"result":"created"}}'::jsonb,
  'the answer names itself, so a call site has a case to assert'
);

-- (7) Coop write produces a row with mode='coop'
select is(
  (select mode from psychicnum.games where id = (select id from coop_game)),
  'coop',
  'coop: psychicnum.games.mode = coop'
);

-- (8) Coop write registers as psychicnum_coop in common.games
select is(
  (select gametype from common.games where id = (select id from coop_game)),
  'psychicnum_coop',
  'coop: common.games.gametype = psychicnum_coop'
);

-- (9) Coop seeds two player rows, both with budget = 5
select is(
  (select count(*)::int from psychicnum.players
    where game_id = (select id from coop_game)),
  2,
  'coop: per-player rows inserted for every player_user_ids entry'
);

select is(
  (select array_agg(guesses_remaining order by user_id) from psychicnum.players
    where game_id = (select id from coop_game)),
  array[5, 5],
  'coop: every player_row starts with setup.guesses'
);

-- (10) Target is a 1..10 int
reset role;
select ok(
  (select array_length(words, 1) = 8                       -- the word_count
        and array_length(secrets, 1) = 3                   -- three secrets
        and (select count(distinct s) = 3 from unnest(secrets) s)
        and secrets <@ words                               -- secrets ⊆ board
     from psychicnum.games where id = (select id from coop_game)),
  'coop: 8 board words, three distinct secrets drawn from them'
);

-- (11) secrets is not visible to authenticated SELECT (words IS — it's the
-- public board)
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format(
    $$ select secrets from psychicnum.games where id = %L::uuid $$,
    (select id from coop_game)
  ),
  '42501',
  null,
  'secrets column SELECT is blocked for authenticated'
);

-- ============================================================
-- Happy path (compete)
-- ============================================================

create temp table compete_game on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"guesses": 3, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

-- (12) Compete write produces a row with mode='compete'
select is(
  (select mode from psychicnum.games where id = (select id from compete_game)),
  'compete',
  'compete: psychicnum.games.mode = compete'
);

-- (13) Compete write registers as psychicnum_compete in common.games
select is(
  (select gametype from common.games where id = (select id from compete_game)),
  'psychicnum_compete',
  'compete: common.games.gametype = psychicnum_compete'
);

-- (14) Compete also seeds per-player rows
select is(
  (select count(*)::int from psychicnum.players
    where game_id = (select id from compete_game)),
  2,
  'compete: per-player rows inserted'
);

-- (15) Compete budgets seeded from setup.guesses
select is(
  (select array_agg(guesses_remaining order by user_id) from psychicnum.players
    where game_id = (select id from compete_game)),
  array[3, 3],
  'compete: every player_row starts with setup.guesses'
);

-- (16) is_current_view flipped to true for the new game; the
--      old (coop_game) had its flag vacated.
reset role;
select is(
  (select id from common.games
    where club_handle = (select handle from club) and is_current_view = true),
  (select id from compete_game),
  'new game is the club current view; prior is_current_view vacated'
);

-- (17) initial play_state is 'playing'
select is(
  (select play_state from common.games where id = (select id from compete_game)),
  'playing',
  'compete: initial play_state is playing'
);

-- (18) Title is the first three BOARD words alphabetically, dash-joined.
-- The board is public, so this leaks nothing; what must never land in the
-- club-wide-readable common.games.title is the SECRETS, and three words in
-- alphabetical order say nothing about which of them are secret.
select is(
  (select title from common.games where id = (select id from compete_game)),
  (select string_agg(upper(w), '-' order by w)
     from (select unnest(words) as w
             from psychicnum.games where id = (select id from compete_game)
            order by 1 limit 3) first3),
  'title is the first three board words, alphabetical + dash-joined'
);
-- …and it is NOT any single secret verbatim (the shape makes that impossible,
-- but assert it: this is the property that actually matters).
select ok(
  (select not exists (
     select 1 from psychicnum.games g, unnest(g.secrets) s
      where g.id = (select id from compete_game)
        and (select title from common.games where id = g.id) = upper(s))),
  'title is never a bare secret word'
);

-- (19) common.game_players seeded with both players, result=null mid-game
select is(
  (select count(*)::int from common.game_players where game_id = (select id from compete_game)),
  2,
  'common.game_players has both players for the compete game'
);

-- (20) clubs_gametypes default_setup auto-saved
select is(
  (select default_setup->>'guesses' from common.clubs_gametypes
    where club_handle = (select handle from club)
      and gametype = 'psychicnum_compete'),
  '3',
  'auto-saved default_setup carries the player''s last choice'
);

-- ============================================================
-- Status is SEEDED at create (not left NULL until the first guess)
-- ============================================================
-- Every other game on the roster seeds its club-list readout at create; without
-- this a brand-new psychicnum game rendered a bare "Playing". Coop carries the
-- shared budget + the 0/N tally; compete carries only the SUMMED budget (a
-- shared found-count would leak how close an opponent is).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table seeded_coop on commit drop as
  select (psychicnum.create_game((select handle from club),
    '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;
create temp table seeded_cmp on commit drop as
  select (psychicnum.create_game((select handle from club),
    '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
select is(
  (select status from common.games where id = (select id from seeded_coop)),
  '{"found_secrets_count": 0, "required_secrets_count": 3, "guesses_remaining": 7}'::jsonb,
  'coop seeds the shared budget + the 0/3 found tally at create');
select is(
  (select status from common.games where id = (select id from seeded_cmp)),
  '{"guesses_remaining": 14}'::jsonb,
  'compete seeds only the SUMMED budget (2 players x 7) — no shared progress');

-- ============================================================
select * from finish();
rollback;
