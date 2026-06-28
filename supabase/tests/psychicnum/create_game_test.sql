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

select plan(25);

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
  'must be authenticated',
  'unauthenticated create_game is rejected'
);

-- ============================================================
-- Build a club for the happy-path tests
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada','bea']) as handle;

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
  'not a member of this club',
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
  'mode must be coop or compete (got bogus)',
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
  'compete mode requires at least 2 players',
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
  'setup.guesses must be 3, 5, 7, or 9 (got 4)',
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
  'setup.guesses is required',
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
  'setup.word_count is required',
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
  'setup.word_count must be 5..20 (got 4)',
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
  'setup.timer is required',
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

-- (18) Title is a random short numeric id (#NNNNNN) — NOT the target,
-- so the secret never lands in the club-wide-readable common.games.title.
select ok(
  (select title ~ '^#[0-9]{6}$' from common.games where id = (select id from compete_game)),
  'title is a random #NNNNNN id, not the target'
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
select * from finish();
rollback;
