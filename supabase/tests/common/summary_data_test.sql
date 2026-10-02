-- cs-unmet

-- ============================================================
-- Test: summary_data — common._make_json_summary_data
-- ============================================================
-- The common part of every game's `summary_data`: the game named and dated,
-- and how it ended. A game's builder adds its own keys beside it and writes
-- the whole (supabase/sql/common.sql → The page blobs' common parts). This
-- file pins the common part:
--
--   1. A fresh game, as a whole, dated by the instant the builder passes
--   2. The game's ending: the group, the flag and the outcome
--   3. A game that does not exist raises
--
-- psychicnum's keys beside it are supabase/tests/psychicnum/game_data_test.sql's.
-- See games_test.sql for the as_jwt_only trick.
-- ============================================================

begin;

set search_path = common, public, extensions;

select plan(3);

\ir ../_shared/setup.psql

create function pg_temp.as_jwt_only(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
end;
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada', 'bea']) as handle;

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config('test.race', (common._create_game(
  (select handle from club), 'spellingbee_compete', 'compete',
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'test-title', '{"timer": {"kind": "none"}}'::jsonb, null))::text, true);
reset role;
select set_config('request.jwt.claims', '', true);

create function pg_temp.race() returns uuid language sql as
  $$ select current_setting('test.race')::uuid $$;

-- ─── (1) A fresh game, as a whole ───
select is(
  common._make_json_summary_data(pg_temp.race(), '2026-01-02T03:04:05Z'),
  jsonb_build_object(
    'id',              pg_temp.race(),
    'gametype',        'spellingbee_compete',
    'title',           'test-title',
    'statusChangedAt', '2026-01-02T03:04:05Z'::timestamptz,
    'ending',          null,
    'ended',           false,
    'outcome',         null),
  'the whole common part of a fresh game: named, dated by the instant passed, not ended'
);

-- ─── (2) The game ends ───
select common._end_game(
  pg_temp.race(), 'reached_goal', 'solved', 'ada11111-1111-1111-1111-111111111111',
  p_is_no_result => false,
  p_final_rankings => '{"ada11111-1111-1111-1111-111111111111": 1}'::jsonb);

select is(
  common._make_json_summary_data(pg_temp.race(), '2026-01-02T03:04:05Z')
    - 'id' - 'gametype' - 'title' - 'statusChangedAt',
  jsonb_build_object(
    'ending',  jsonb_build_object(
      'reason', 'reached_goal',
      'detail', 'solved',
      'by',     'ada11111-1111-1111-1111-111111111111',
      'winner', 'ada11111-1111-1111-1111-111111111111'),
    'ended',   true,
    'outcome', 'won'),
  'the ending: its group, the flag and the outcome, with the winner ranked first'
);

-- ─── (3) No such game ───
select throws_ok(
  $$ select common._make_json_summary_data('00000000-0000-0000-0000-000000000000', now()) $$,
  'P0002',
  'game-not-found|',
  'a game that does not exist raises'
);

select * from finish();
rollback;
