-- ============================================================
-- Test: wordiply.create_game (sibling-manifest era)
-- ============================================================
--
-- A fork of wordwheel's create_game_test. Coverage:
--   1. Coop happy path: ada creates a game; common.games + wordiply.games
--      rows materialize; mode='coop'; gametype 'wordiply_coop'; title is
--      just the uppercased base (no length leak); is_current_view flips on; status seeded
--      with the coop shape {mode,base,max_word_length,guesses_used:0}.
--   2. Compete happy path: mode='compete'; compete-shape status seeded
--      (leaderboard with per-player guesses_used:0). NO target_rank.
--   3. Auth: dee (outsider) rejected with 42501.
--   4. mode arg validation: invalid value;
--      setup.target_rank rejected; compete with <2 players.
--   5. Difficulty band validation: below 1 / above 6 rejected.
--   6. Board validation: base not 2–4 lowercase; max_word_length below
--      base_len+2; empty longest_words; empty legal_words.
--   7. Player-count upper bound: 7+ entries rejected.
--
-- Fixture board (pg_temp.wordiply_board): base 'ar', max_word_length 7.

begin;

set search_path = wordiply, common, public, extensions;

select plan(30);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up: an ada+bea club for the happy-path tests
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

-- ============================================================
-- (1) Coop happy path
-- ============================================================

create temp table g on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
);

select isnt(
  (select id from g), null,
  'coop create_game returns a non-null id'
);

select is(
  (select gametype from common.games where id = (select id from g)),
  'wordiply_coop',
  'common.games.gametype = wordiply_coop (mode routes the suffix)'
);

select is(
  (select mode from wordiply.games where id = (select id from g)),
  'coop',
  'wordiply.games.mode = coop (denormalized for RLS branching)'
);

select is(
  (select play_state from common.games where id = (select id from g)),
  'playing',
  'common.games.play_state initialized to "playing"'
);

select is(
  (select is_current_view from common.games where id = (select id from g)),
  true,
  'common.games.is_current_view flips on for the new game'
);

select is(
  (select base from wordiply.games where id = (select id from g)),
  'ar',
  'wordiply.games.base carries the board base verbatim'
);

-- Title is just the uppercased base — NOT "<BASE> · best <N>", so the club
-- page never leaks the secret longest-word length.
select is(
  (select title from common.games where id = (select id from g)),
  'AR',
  'title is just the uppercased base (no length leak)'
);

-- Coop status shape.
select is(
  (select status->>'mode' from common.games where id = (select id from g)),
  'coop',
  'coop status.mode = "coop"'
);

select is(
  (select status->>'base' from common.games where id = (select id from g)),
  'ar',
  'coop status.base seeded from the board'
);

select is(
  (select (status->>'max_word_length')::int from common.games where id = (select id from g)),
  7,
  'coop status.max_word_length seeded from the board'
);

select is(
  (select (status->>'guesses_used')::int from common.games where id = (select id from g)),
  0,
  'coop status.guesses_used = 0 at create time'
);

-- ============================================================
-- (2) Compete happy path
-- ============================================================

create temp table compete_club on commit drop as
select common.create_club('Compete club', array['ada','bea','cade']) as handle;

create temp table g_compete on commit drop as
select * from wordiply.create_game(
  (select handle from compete_club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.wordiply_board()
);

select is(
  (select gametype from common.games where id = (select id from g_compete)),
  'wordiply_compete',
  'compete: common.games.gametype = wordiply_compete'
);

select is(
  (select status->>'mode' from common.games where id = (select id from g_compete)),
  'compete',
  'compete status.mode = "compete"'
);

-- Compete seeds a per-player leaderboard, each entry guesses_used:0.
select is(
  (select jsonb_array_length(status->'leaderboard') from common.games where id = (select id from g_compete)),
  3,
  'compete status.leaderboard has one entry per player (ada, bea, cade)'
);

select is(
  (
    select bool_and((entry->>'guesses_used')::int = 0)
      from common.games cg,
           jsonb_array_elements(cg.status->'leaderboard') entry
     where cg.id = (select id from g_compete)
  ),
  true,
  'compete status.leaderboard: every player starts at guesses_used = 0'
);

-- ============================================================
-- (3) Auth: dee (outsider) cannot create a wordiply game
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select wordiply.create_game(%L, pg_temp.wordiply_setup(),
                                  array['ada11111-1111-1111-1111-111111111111'::uuid],
                                  'coop',
                                  pg_temp.wordiply_board()) $$,
    (select handle from club)
  ),
  '42501',
  null,
  'dee (non-member) cannot create a wordiply game'
);

-- ============================================================
-- (4) mode + setup-field validation
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select throws_ok(
  format(
    $$ select wordiply.create_game(%L, pg_temp.wordiply_setup(),
                                  array['ada11111-1111-1111-1111-111111111111'::uuid],
                                  'solo',
                                  pg_temp.wordiply_board()) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects mode value not in {coop, compete}'
);

select throws_ok(
  format(
    $$ select wordiply.create_game(%L,
                                  pg_temp.wordiply_setup() || '{"target_rank": 3}'::jsonb,
                                  array['ada11111-1111-1111-1111-111111111111'::uuid],
                                  'coop',
                                  pg_temp.wordiply_board()) $$,
    (select handle from club)
  ),
  'P0001',
  'no-target-rank|',
  'rejects setup.target_rank (wordiply is not a race-to-rank)'
);

select throws_ok(
  format(
    $$ select wordiply.create_game(%L, pg_temp.wordiply_setup(),
                                  array['ada11111-1111-1111-1111-111111111111'::uuid],
                                  'compete',
                                  pg_temp.wordiply_board()) $$,
    (select handle from club)
  ),
  'P0001',
  'too-few-players|',
  'compete with 1 player rejected'
);

-- ============================================================
-- (5) Difficulty band validation (1..6)
-- ============================================================

select throws_ok(
  format(
    $$ select wordiply.create_game(%L,
                                  pg_temp.wordiply_setup() || '{"difficulty": 0}'::jsonb,
                                  array['ada11111-1111-1111-1111-111111111111'::uuid],
                                  'coop',
                                  pg_temp.wordiply_board()) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects setup.difficulty below 1 (band floor)'
);

select throws_ok(
  format(
    $$ select wordiply.create_game(%L,
                                  pg_temp.wordiply_setup() || '{"difficulty": 7}'::jsonb,
                                  array['ada11111-1111-1111-1111-111111111111'::uuid],
                                  'coop',
                                  pg_temp.wordiply_board()) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects setup.difficulty above 6 (band ceiling)'
);

-- ============================================================
-- (6) Board structure validation
-- ============================================================

-- base not 2–4 lowercase ASCII letters.
select throws_ok(
  format(
    $$ select wordiply.create_game(%L, pg_temp.wordiply_setup(),
                                  array['ada11111-1111-1111-1111-111111111111'::uuid],
                                  'coop',
                                  pg_temp.wordiply_board() || '{"base": "A"}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects board.base that is not 2–4 lowercase ASCII letters'
);

-- max_word_length below base_len + 2 (base 'ar' → floor 4; 3 is too low).
select throws_ok(
  format(
    $$ select wordiply.create_game(%L, pg_temp.wordiply_setup(),
                                  array['ada11111-1111-1111-1111-111111111111'::uuid],
                                  'coop',
                                  pg_temp.wordiply_board() || '{"max_word_length": 3}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects board.max_word_length below base length + 2 (no headroom)'
);

-- empty longest_words.
select throws_ok(
  format(
    $$ select wordiply.create_game(%L, pg_temp.wordiply_setup(),
                                  array['ada11111-1111-1111-1111-111111111111'::uuid],
                                  'coop',
                                  pg_temp.wordiply_board() || '{"longest_words": []}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001',
  'bad-longest-words|',
  'rejects empty board.longest_words'
);

-- empty legal_words.
select throws_ok(
  format(
    $$ select wordiply.create_game(%L, pg_temp.wordiply_setup(),
                                  array['ada11111-1111-1111-1111-111111111111'::uuid],
                                  'coop',
                                  pg_temp.wordiply_board() || '{"legal_words": []}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001',
  'bad-legal-words|',
  'rejects empty board.legal_words'
);

-- ============================================================
-- (7) Player-count upper bound (max 6)
-- ============================================================

select throws_ok(
  format(
    $$ select wordiply.create_game(%L, pg_temp.wordiply_setup(),
                                  array[
                                    'ada11111-1111-1111-1111-111111111111'::uuid,
                                    'bea22222-2222-2222-2222-222222222222'::uuid,
                                    gen_random_uuid(),
                                    gen_random_uuid(),
                                    gen_random_uuid(),
                                    gen_random_uuid(),
                                    gen_random_uuid()
                                  ],
                                  'coop',
                                  pg_temp.wordiply_board()) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects player_user_ids with > 6 entries (max 6)'
);

-- ============================================================
-- (8) setup.custom_base — the player-chosen starter
-- ============================================================
--
-- The "try wordiply with MOTH" challenge. create_game owns two things here:
-- the SHAPE of the request, and the cross-check that the builder honoured it.
-- Whether the letters yield a board is the edge function's call, so there is
-- deliberately no dictionary assertion in this section.

-- Shape: same rule as board.base. A malformed request fails before anything
-- is created.
select throws_ok(
  format(
    $$ select wordiply.create_game(%L,
                                  pg_temp.wordiply_setup() || '{"custom_base": "a"}'::jsonb,
                                  array['ada11111-1111-1111-1111-111111111111'::uuid],
                                  'coop',
                                  pg_temp.wordiply_board()) $$,
    (select handle from club)
  ),
  'P0001',
  'bad-custom-base|a|',
  'rejects a setup.custom_base that is not 2–4 lowercase ASCII letters'
);

-- The cross-check. The fixture board's base is 'ar', so asking for 'moth' and
-- being handed 'ar' is a builder that ignored the request — the ONE place that
-- can catch it, since every downstream reader trusts board.base.
select throws_ok(
  format(
    $$ select wordiply.create_game(%L,
                                  pg_temp.wordiply_setup() || '{"custom_base": "moth"}'::jsonb,
                                  array['ada11111-1111-1111-1111-111111111111'::uuid],
                                  'coop',
                                  pg_temp.wordiply_board()) $$,
    (select handle from club)
  ),
  'P0001',
  'base-mismatch|moth|ar|',
  'rejects a board whose base is not the requested custom_base'
);

-- The happy path: asking for the base the board actually carries.
create temp table gcustom on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup() || '{"custom_base": "ar"}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop',
  pg_temp.wordiply_board()
);

select is(
  (select base from wordiply.games where id = (select id from gcustom)),
  'ar',
  'accepts a setup.custom_base matching the board and keeps that base'
);

-- The override is a ONE-OFF, not a new club baseline: it must not come back
-- as the default the next game is set up with. (spellingbee strips its custom
-- letters the same way — without this, every later game in the club silently
-- defaults to the challenge base.)
select is(
  (select default_setup ? 'custom_base'
     from common.clubs_gametypes
    where club_handle = (select handle from club)
      and gametype = 'wordiply_coop'),
  false,
  'custom_base is stripped from the club''s saved default setup'
);

-- ============================================================
select * from finish();
rollback;
