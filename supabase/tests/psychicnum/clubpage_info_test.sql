-- cs-unmet

-- ============================================================
-- Test: psychicnum._rebuild_data_cols — clubpage_info, and the one rule about dates
-- ============================================================
-- The page blobs are game_data_test.sql's. This file pins what the builder
-- still writes beside them: `clubpage_info`, which the club page reads until
-- it reads `summary_data`, with its exact key set at the start, mid-game and
-- at the end in both modes — which is what catches a key still written after
-- it was dropped — and the one rule about dates: only a call that says so
-- moves status_changed_at.
-- ============================================================

begin;
set search_path = psychicnum, common, public, extensions;
\ir ../_shared/setup.psql

select plan(16);

-- The key set, written once.
create function pg_temp.keys_of(j jsonb) returns text[] language sql as $$
  select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(j) k
$$;
create function pg_temp.shape_ok(p_game_id uuid) returns boolean language sql as $$
  select pg_temp.keys_of(clubpage_info) = array['found_secrets_count', 'guesses_used', 'max_guesses',
                                                'required_secrets_count', 'winner_user_id']
    from common.games where id = p_game_id
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Psychic statuses', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 5, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;
reset role;
update psychicnum.games
   set words = array['zalpha','zbravo','zcharlie','zdelta','zecho','zfoxtrot','zgolf','zhotel'],
       secrets = array['zalpha','zbravo','zcharlie']
 where game_id in (select id from g);

-- ── At the start ──
select is(pg_temp.shape_ok((select id from g where mode = 'coop')), true,
  'coop: clubpage_info has its full key set at the start');
select is(pg_temp.shape_ok((select id from g where mode = 'compete')), true,
  'compete: clubpage_info has its full key set at the start');

-- ── Mid-game ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g where mode = 'coop'), 'zalpha');
select psychicnum.submit_guess((select id from g where mode = 'compete'), 'zdelta');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from g where mode = 'coop'), 'zdelta');
select psychicnum.submit_guess((select id from g where mode = 'compete'), 'zalpha');
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shape_ok((select id from g where mode = 'coop')), true,
  'coop: clubpage_info has its full key set mid-game');
select is(pg_temp.shape_ok((select id from g where mode = 'compete')), true,
  'compete: clubpage_info has its full key set mid-game');
select is(
  (select clubpage_info->>'found_secrets_count' || '/' || (clubpage_info->>'guesses_used')
     from common.games where id = (select id from g where mode = 'coop')),
  '1/2',
  'coop: the summary has the team''s finds and the team''s used count, each summed');
select is(
  (select clubpage_info->'found_secrets_count' from common.games
    where id = (select id from g where mode = 'compete')),
  'null'::jsonb,
  'compete: the summary carries no progress');

-- ── At the end: bea wins the race, ada has conceded ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.concede((select id from g where mode = 'compete'));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from g where mode = 'compete'), 'zbravo');
select psychicnum.submit_guess((select id from g where mode = 'compete'), 'zcharlie');
select psychicnum.stop_game((select id from g where mode = 'coop'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shape_ok((select id from g where mode = 'coop')), true,
  'coop: clubpage_info has its full key set at the end');
select is(pg_temp.shape_ok((select id from g where mode = 'compete')), true,
  'compete: clubpage_info has its full key set at the end');
select is(
  (select clubpage_info->>'winner_user_id' from common.games
    where id = (select id from g where mode = 'compete')),
  'bea22222-2222-2222-2222-222222222222',
  'compete: the summary names the winner at the end');
select is(
  (select clubpage_info->'winner_user_id' from common.games
    where id = (select id from g where mode = 'coop')),
  'null'::jsonb,
  'coop: the summary names no winner');

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select psychicnum._rebuild_data_cols(id, p_update_status_changed_at => false) from g;
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and status_changed_at = '2026-01-01'),
  2,
  'a rebuild (false) leaves status_changed_at alone');
select psychicnum._rebuild_data_cols((select id from g where mode = 'coop'), p_update_status_changed_at => true);
select is(
  (select status_changed_at from common.games where id = (select id from g where mode = 'coop')),
  now(),
  'an activity call (true) stamps status_changed_at');

-- A rebuild assigns, never merges: a key planted in the column does not survive.
update common.games set clubpage_info = clubpage_info || '{"stale": 1}'::jsonb
 where id = (select id from g where mode = 'coop');
select is(pg_temp.shape_ok((select id from g where mode = 'coop')), false,
  'precondition: the key-set check sees the planted key');
select psychicnum._rebuild_data_cols((select id from g where mode = 'coop'), p_update_status_changed_at => false);
select is(pg_temp.shape_ok((select id from g where mode = 'coop')), true,
  'a rebuild drops a stale key');

-- Opening a game (the current-view pointer) never moves the date.
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select common.unset_current_view((select id from g where mode = 'compete'));
select common.set_current_view((select id from g where mode = 'coop'));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and status_changed_at = '2026-01-01'),
  2,
  'opening and leaving games leaves status_changed_at alone');
select is(
  (select is_current_view from common.games where id = (select id from g where mode = 'coop')),
  true,
  'precondition: the pointer did move');

select * from finish();
rollback;
