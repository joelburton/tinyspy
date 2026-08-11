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

select plan(28);

\ir ../_shared/setup.psql

-- ============================================================
-- (1) Unauthenticated callers are rejected
-- ============================================================

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select throws_ok(
  $$ select psychicnum.create_game(
       'placeholder-club',
       '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'bea22222-2222-2222-2222-222222222222'::uuid],
       'coop'
     ) $$,
  '42501',
  'not-authenticated|',
  'unauthenticated create_game is rejected'
);

-- ============================================================
-- Build a club for the happy-path tests
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada','bea']) as handle;

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
select throws_ok(
  format(
    $$ select psychicnum.create_game(%L, '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'bea22222-2222-2222-2222-222222222222'::uuid], 'coop') $$,
    (select handle from club)
  ),
  '42501',
  'not-club-member|',
  'non-member create_game is rejected'
);

-- ============================================================
-- (3) Bad mode value is rejected
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format(
    $$ select psychicnum.create_game(%L, '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'bea22222-2222-2222-2222-222222222222'::uuid], 'bogus') $$,
    (select handle from club)
  ),
  'P0001',
  'bad-mode|bogus|',
  'mode validation rejects unknown values'
);

-- ============================================================
-- (4) Compete-mode requires 2+ players
-- ============================================================
-- ada starts a solo club; compete on a single-player array is
-- the degenerate "race yourself" case the FE manifest hides
-- (numberOfPlayers: [2, 6]) — server enforces it too.

select throws_ok(
  format(
    $$ select psychicnum.create_game(%L, '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete') $$,
    (select handle from club)
  ),
  'P0001',
  'too-few-players|',
  'compete mode rejects 1-player arrays'
);

-- ============================================================
-- (5) Coop accepts a 1-player array (solo coop is fine)
-- ============================================================
-- The 1-player case is the solo club's main use. lives_ok rather
-- than is() — we don't capture the row, just that no exception
-- raises.

select lives_ok(
  format(
    $$ select psychicnum.create_game(%L, '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop') $$,
    (select handle from club)
  ),
  'coop create_game accepts 1-player arrays'
);

-- ============================================================
-- (6) Setup-shape validation
-- ============================================================

-- guesses out of range
select throws_ok(
  format(
    $$ select psychicnum.create_game(%L, '{"guesses": 4, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'bea22222-2222-2222-2222-222222222222'::uuid], 'coop') $$,
    (select handle from club)
  ),
  'P0001',
  'bad-guesses|4|',
  'guesses out of range is rejected'
);

-- guesses missing
select throws_ok(
  format(
    $$ select psychicnum.create_game(%L, '{}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'bea22222-2222-2222-2222-222222222222'::uuid], 'coop') $$,
    (select handle from club)
  ),
  'P0001',
  'missing-guesses|',
  'missing guesses is rejected'
);

-- word_count missing (board size is required)
select throws_ok(
  format(
    $$ select psychicnum.create_game(%L, '{"guesses": 7, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'bea22222-2222-2222-2222-222222222222'::uuid], 'coop') $$,
    (select handle from club)
  ),
  'P0001',
  'missing-word-count|',
  'missing word_count is rejected'
);

-- word_count out of range (must be 5..20)
select throws_ok(
  format(
    $$ select psychicnum.create_game(%L, '{"guesses": 7, "word_count": 4, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'bea22222-2222-2222-2222-222222222222'::uuid], 'coop') $$,
    (select handle from club)
  ),
  'P0001',
  'bad-word-count|4|',
  'word_count out of range is rejected'
);

-- timer missing entirely (timer is required for every game)
select throws_ok(
  format(
    $$ select psychicnum.create_game(%L, '{"guesses": 7, "word_count": 8, "difficulty": 3}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'bea22222-2222-2222-2222-222222222222'::uuid], 'coop') $$,
    (select handle from club)
  ),
  'P0001',
  'missing-timer|',
  'missing timer is rejected'
);

-- ============================================================
-- Happy path (coop)
-- ============================================================

create temp table coop_game on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 5, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
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
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 3, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);

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
  select id from psychicnum.create_game((select handle from club),
    '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');
create temp table seeded_cmp on commit drop as
  select id from psychicnum.create_game((select handle from club),
    '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');
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
