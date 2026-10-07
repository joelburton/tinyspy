-- cs-unmet

-- ============================================================
-- Test: summary_data — common._make_json_summary_data
-- ============================================================
-- The common part of every game's `summary_data`: the game named and dated,
-- how it ended, and how each player came out of it. A game's builder adds its
-- own keys beside it and writes the whole (supabase/sql/common.sql → The page
-- blobs' common parts). This file pins the common part:
--
--   1. A fresh game, as a whole, dated by the instant the builder passes
--   2. The game's ending: the group, the flag, the outcome and the players
--   3. A game that does not exist raises
--   4. Co-winners: both players ranked 1, both `won`
--   5. A ranking below first is `near`
--   6. A conceder is unranked, `lost`, and marked
--   7. A player who ended while the game goes on: their ending, not still
--      playing, and solved when they solved
--
-- 2 and 4–6 compare each player's outcome keys only (`pg_temp.outcomes`); 1
-- and 7 pin the whole entry.
--
-- psychicnum's keys beside it are supabase/tests/psychicnum/game_data_test.sql's.
-- See games_test.sql for the as_jwt_only trick.
-- ============================================================

begin;

set search_path = common, public, extensions;

select plan(7);

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

-- Another two-player game, for the cases that end one differently.
create function pg_temp.new_game() returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  perform pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
  v_id := common._create_game(
    (select handle from club), 'spellingbee_compete', 'compete',
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    'test-title', '{"timer": {"kind": "none"}}'::jsonb, null);
  perform set_config('request.jwt.claims', '', true);
  return v_id;
end;
$$;

-- One player's outcome keys, as the summary lists them.
create function pg_temp.player(p_id text, p_outcome text, p_ranking int, p_conceded boolean)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id, 'outcome', p_outcome, 'finalRanking', p_ranking, 'conceded', p_conceded)
$$;

-- A summary's players cut to their outcome keys, for the cases about how
-- each came out.
create function pg_temp.outcomes(p_summary jsonb) returns jsonb
language sql as $$
  select jsonb_agg(jsonb_build_object(
           'id',           p -> 'id',
           'outcome',      p -> 'outcome',
           'finalRanking', p -> 'finalRanking',
           'conceded',     p -> 'conceded') order by ord)
    from jsonb_array_elements(p_summary -> 'players') with ordinality as t(p, ord)
$$;

-- A player still in a fresh game, every key.
create function pg_temp.fresh_player(p_id text) returns jsonb
language sql as $$
  select pg_temp.player(p_id, null, null, false)
      || jsonb_build_object('ending', null, 'solved', false, 'stillPlaying', true)
$$;

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
    'outcome',         null,
    'players',         jsonb_build_array(
      pg_temp.fresh_player('ada11111-1111-1111-1111-111111111111'),
      pg_temp.fresh_player('bea22222-2222-2222-2222-222222222222'))),
  'the whole common part of a fresh game: named, dated by the instant passed, not ended, every player listed'
);

-- ─── (2) The game ends ───
select common._end_game(
  pg_temp.race(), 'reached_goal', 'solved', 'ada11111-1111-1111-1111-111111111111',
  p_is_no_result => false,
  p_final_rankings => '{"ada11111-1111-1111-1111-111111111111": 1}'::jsonb);

select is(
  (common._make_json_summary_data(pg_temp.race(), '2026-01-02T03:04:05Z')
    - 'id' - 'gametype' - 'title' - 'statusChangedAt' - 'players')
    || jsonb_build_object('players', pg_temp.outcomes(
         common._make_json_summary_data(pg_temp.race(), '2026-01-02T03:04:05Z'))),
  jsonb_build_object(
    'ending',  jsonb_build_object(
      'reason', 'reached_goal',
      'detail', 'solved',
      'by',     'ada11111-1111-1111-1111-111111111111'),
    'ended',   true,
    'outcome', 'won',
    'players', jsonb_build_array(
      pg_temp.player('ada11111-1111-1111-1111-111111111111', 'won', 1, false),
      pg_temp.player('bea22222-2222-2222-2222-222222222222', 'lost', null, false))),
  'the ending: its group, the flag, the outcome, and each player''s outcome and ranking'
);

-- ─── (3) No such game ───
select throws_ok(
  $$ select common._make_json_summary_data('00000000-0000-0000-0000-000000000000', now()) $$,
  'P0002',
  'game-not-found|',
  'a game that does not exist raises'
);

-- ─── (4) Co-winners ───
select set_config('test.tie', pg_temp.new_game()::text, true);
select common._end_game(
  current_setting('test.tie')::uuid, 'timeout', 'timeout', null,
  p_is_no_result => false,
  p_final_rankings => '{"ada11111-1111-1111-1111-111111111111": 1,
                        "bea22222-2222-2222-2222-222222222222": 1}'::jsonb);

select is(
  pg_temp.outcomes(common._make_json_summary_data(current_setting('test.tie')::uuid, now())),
  jsonb_build_array(
    pg_temp.player('ada11111-1111-1111-1111-111111111111', 'won', 1, false),
    pg_temp.player('bea22222-2222-2222-2222-222222222222', 'won', 1, false)),
  'co-winners: both players ranked 1, both won'
);

-- ─── (5) Ranked below first ───
select set_config('test.near', pg_temp.new_game()::text, true);
select common._end_game(
  current_setting('test.near')::uuid, 'timeout', 'timeout', null,
  p_is_no_result => false,
  p_final_rankings => '{"ada11111-1111-1111-1111-111111111111": 1,
                        "bea22222-2222-2222-2222-222222222222": 2}'::jsonb);

select is(
  pg_temp.outcomes(common._make_json_summary_data(current_setting('test.near')::uuid, now())),
  jsonb_build_array(
    pg_temp.player('ada11111-1111-1111-1111-111111111111', 'won', 1, false),
    pg_temp.player('bea22222-2222-2222-2222-222222222222', 'near', 2, false)),
  'a ranking below first is near'
);

-- ─── (6) A conceder ───
select set_config('test.conceded', pg_temp.new_game()::text, true);
update common.game_players
   set player_ended_at = now(), player_ended_reason = 'conceded',
       player_ended_reason_detail = 'conceded'
 where game_id = current_setting('test.conceded')::uuid
   and user_id = 'bea22222-2222-2222-2222-222222222222';
select common._end_game(
  current_setting('test.conceded')::uuid, 'reached_goal', 'solved',
  'ada11111-1111-1111-1111-111111111111',
  p_is_no_result => false,
  p_final_rankings => '{"ada11111-1111-1111-1111-111111111111": 1}'::jsonb);

select is(
  pg_temp.outcomes(common._make_json_summary_data(current_setting('test.conceded')::uuid, now())),
  jsonb_build_array(
    pg_temp.player('ada11111-1111-1111-1111-111111111111', 'won', 1, false),
    pg_temp.player('bea22222-2222-2222-2222-222222222222', 'lost', null, true)),
  'a conceder is unranked, lost, and marked conceded'
);

-- ─── (7) A player who ended while the game goes on ───
select set_config('test.mid', pg_temp.new_game()::text, true);
update common.game_players
   set player_ended_at = '2026-01-02T03:04:05Z', player_ended_reason = 'reached_goal',
       player_ended_reason_detail = 'solved', solved_at = '2026-01-02T03:04:05Z',
       outcome = 'neutral'
 where game_id = current_setting('test.mid')::uuid
   and user_id = 'bea22222-2222-2222-2222-222222222222';

select is(
  common._make_json_summary_data(current_setting('test.mid')::uuid, now()) -> 'players',
  jsonb_build_array(
    pg_temp.fresh_player('ada11111-1111-1111-1111-111111111111'),
    pg_temp.player('bea22222-2222-2222-2222-222222222222', 'neutral', null, false)
      || jsonb_build_object(
           'ending', jsonb_build_object(
             'at', '2026-01-02T03:04:05Z'::timestamptz,
             'reason', 'reached_goal',
             'detail', 'solved'),
           'solved', true,
           'stillPlaying', false)),
  'a player out of play mid-game: their ending, solved, and no longer still playing; the other plays on'
);

select * from finish();
rollback;
