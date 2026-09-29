-- cs-unmet

-- ============================================================
-- Test: wordiply.create_game
-- ============================================================
--
-- Coverage:
--   1. Coop happy path: ada creates a game; common.games + wordiply.games
--      rows materialize; mode 'coop'; gametype 'wordiply_coop'; title is
--      just the uppercased base (no length leak); is_current_view flips on;
--      the statuses are written: game_status {}, each player_status and the
--      clubpage_info at zero words used, the scores null until the end.
--   2. Compete happy path: mode 'compete'; a player_status per player at
--      zero; clubpage_info carries no team numbers. NO target_rank.
--   3. Auth: dee (outsider) rejected.
--   4. mode arg validation: invalid value;
--      setup.target_rank rejected; compete with <2 players.
--   5. Difficulty band validation: below 1 / above 6 rejected.
--   6. Board validation: base not 2–4 lowercase; max_word_length below
--      base_len+2; empty longest_words; empty legal_words.
--   7. Player-count upper bound: 7+ entries rejected.
--   8. setup.custom_base: its shape, the builder honoring it, and its
--      stripping from the club's saved default.
--
-- Fixture board (pg_temp.wordiply_board): base 'ar', max_word_length 7.

begin;

set search_path = wordiply, common, public, extensions;

select plan(32);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- Set up: an ada+bea club for the happy-path tests
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada and Bea', array['ada','bea']) as handle;

-- ============================================================
-- (1) Coop happy path
-- ============================================================

-- The whole envelope is kept, not just the id: `data.result` is the field both
-- call sites filter the `ok` on, and it reaches them through
-- `wordiply-build-board` untouched.
create temp table created on commit drop as
select wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
) as env;
create temp table g on commit drop as
select (env->'data'->>'id')::uuid as id from created;

select pg_temp.envelope_is(
  (select env from created),
  '{"type":"ok","data":{"result":"created"}}'::jsonb,
  'the answer names itself, so a call site has a case to assert');

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
  (select mode from common.games where id = (select id from g)),
  'coop',
  'common.games.mode = coop'
);

select is(
  (select ended_at from common.games where id = (select id from g)),
  null,
  'common.games.ended_at is null: the game is playing'
);

select is(
  (select is_current_view from common.games where id = (select id from g)),
  true,
  'common.games.is_current_view flips on for the new game'
);

select is(
  (select base from wordiply.games where game_id = (select id from g)),
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

-- The statuses, written at create. The scores stay null until the game ends.
select is(
  (select game_status from common.games where id = (select id from g)),
  '{}'::jsonb,
  'coop game_status is {}'
);

select is(
  (select max_word_length from wordiply.games where game_id = (select id from g)),
  7,
  'wordiply.games.max_word_length carries the board''s longest length'
);

select is(
  (select player_status from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '{"guesses_used": 0, "length_score": null, "letter_count": null,
    "player_ended_reason": null}'::jsonb,
  'coop player_status: no words used, scores null, not ended'
);

select is(
  (select clubpage_info from common.games where id = (select id from g)),
  '{"guesses_used": 0, "length_score": null, "letter_count": null,
    "winner_user_id": null, "winner_length_score": null}'::jsonb,
  'coop clubpage_info: the team''s words used at 0, scores null, no winner'
);

-- ============================================================
-- (2) Compete happy path
-- ============================================================

create temp table compete_club on commit drop as
select pg_temp.create_club('Compete club', array['ada','bea','cade']) as handle;

create temp table g_compete on commit drop as
select (wordiply.create_game(
  (select handle from compete_club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;

select is(
  (select gametype from common.games where id = (select id from g_compete)),
  'wordiply_compete',
  'compete: common.games.gametype = wordiply_compete'
);

select is(
  (select mode from common.games where id = (select id from g_compete)),
  'compete',
  'compete: common.games.mode = compete'
);

-- Every player gets a player_status of their own, at zero.
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g_compete)
      and player_status ? 'guesses_used'),
  3::bigint,
  'compete: each player (ada, bea, cade) has a player_status'
);

select is(
  (
    select bool_and((player_status->>'guesses_used')::int = 0)
      from common.game_players
     where game_id = (select id from g_compete)
  ),
  true,
  'compete player_status: every player starts at guesses_used = 0'
);

-- A race's club line shows no progress: no team numbers, no winner yet.
select is(
  (select clubpage_info from common.games where id = (select id from g_compete)),
  '{"guesses_used": null, "length_score": null, "letter_count": null,
    "winner_user_id": null, "winner_length_score": null}'::jsonb,
  'compete clubpage_info: no team numbers and no winner at create'
);

-- ============================================================
-- (3) Auth: dee (outsider) cannot create a wordiply game
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  wordiply.create_game((select handle from club), pg_temp.wordiply_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordiply_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN012"}'::jsonb,
  'dee (non-member) cannot create a wordiply game'
);

-- ============================================================
-- (4) mode + setup-field validation
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select pg_temp.envelope_is(
  wordiply.create_game((select handle from club), pg_temp.wordiply_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'solo',
    pg_temp.wordiply_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN040"}'::jsonb,
  'rejects mode value not in {coop, compete}'
);

select pg_temp.envelope_is(
  wordiply.create_game((select handle from club),
    pg_temp.wordiply_setup() || '{"target_rank": 3}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordiply_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN123",
    "message":"BUG: game with a target rank"}'::jsonb,
  'rejects setup.target_rank (wordiply is not a race-to-rank)'
);

select pg_temp.envelope_is(
  wordiply.create_game((select handle from club), pg_temp.wordiply_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'compete',
    pg_temp.wordiply_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN122",
    "message":"BUG: race with fewer than two players"}'::jsonb,
  'compete with 1 player rejected'
);

-- ============================================================
-- (5) Difficulty band validation (1..6)
-- ============================================================

select pg_temp.envelope_is(
  wordiply.create_game((select handle from club),
    pg_temp.wordiply_setup() || '{"difficulty": 0}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordiply_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN124",
    "message":"BUG: word difficulty of 0"}'::jsonb,
  'rejects setup.difficulty below 1 (band floor)'
);

select pg_temp.envelope_is(
  wordiply.create_game((select handle from club),
    pg_temp.wordiply_setup() || '{"difficulty": 7}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordiply_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN124",
    "message":"BUG: word difficulty of 7"}'::jsonb,
  'rejects setup.difficulty above 6 (band ceiling)'
);

-- ============================================================
-- (6) Board structure validation
-- ============================================================

-- base not 2–4 lowercase ASCII letters.
select pg_temp.envelope_is(
  wordiply.create_game((select handle from club), pg_temp.wordiply_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordiply_board() || '{"base": "A"}'::jsonb),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN126",
    "message":"BUG: generated board came with a starter of ''A''"}'::jsonb,
  'rejects board.base that is not 2–4 lowercase ASCII letters'
);

-- max_word_length below base_len + 2 (base 'ar' → floor 4; 3 is too low).
select pg_temp.envelope_is(
  wordiply.create_game((select handle from club), pg_temp.wordiply_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordiply_board() || '{"max_word_length": 3}'::jsonb),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN128",
    "message":"BUG: generated board left no room to grow the starter (longest word 3)"}'::jsonb,
  'rejects board.max_word_length below base length + 2 (no headroom)'
);

-- empty longest_words.
select pg_temp.envelope_is(
  wordiply.create_game((select handle from club), pg_temp.wordiply_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordiply_board() || '{"longest_words": []}'::jsonb),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN129",
    "message":"BUG: generated board arrived with no target words"}'::jsonb,
  'rejects empty board.longest_words'
);

-- empty legal_words.
select pg_temp.envelope_is(
  wordiply.create_game((select handle from club), pg_temp.wordiply_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordiply_board() || '{"legal_words": []}'::jsonb),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN130",
    "message":"BUG: generated board arrived with no legal words"}'::jsonb,
  'rejects empty board.legal_words'
);

-- ============================================================
-- (7) Player-count upper bound (max 6)
-- ============================================================

select pg_temp.envelope_is(
  wordiply.create_game((select handle from club), pg_temp.wordiply_setup(),
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
    pg_temp.wordiply_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN041"}'::jsonb,
  'rejects player_user_ids with > 6 entries (max 6)'
);

-- ============================================================
-- (8) setup.custom_base — the player-chosen starter
-- ============================================================
--
-- The "try wordiply with MOTH" challenge. create_game owns two things here:
-- the SHAPE of the request, and the cross-check that the builder honored it.
-- Whether the letters yield a board is the edge function's call, so there is
-- deliberately no dictionary assertion in this section.

-- Shape: same rule as board.base. A malformed request fails before anything
-- is created.
select pg_temp.envelope_is(
  wordiply.create_game((select handle from club),
    pg_temp.wordiply_setup() || '{"custom_base": "a"}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordiply_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN125",
    "message":"BUG: starter of ''a''"}'::jsonb,
  'rejects a setup.custom_base that is not 2–4 lowercase ASCII letters'
);

-- The cross-check. The fixture board's base is 'ar', so asking for 'moth' and
-- being handed 'ar' is a builder that ignored the request — the ONE place that
-- can catch it, since every downstream reader trusts board.base.
select pg_temp.envelope_is(
  wordiply.create_game((select handle from club),
    pg_temp.wordiply_setup() || '{"custom_base": "moth"}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordiply_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN127",
    "message":"BUG: you asked to start with ''moth'' and the generated board used ''ar''"}'::jsonb,
  'rejects a board whose base is not the requested custom_base'
);

-- The happy path: asking for the base the board actually carries.
create temp table gcustom on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup() || '{"custom_base": "ar"}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;

select is(
  (select base from wordiply.games where game_id = (select id from gcustom)),
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
