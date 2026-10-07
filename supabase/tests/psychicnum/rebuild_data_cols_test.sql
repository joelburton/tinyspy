-- cs-unmet

-- ============================================================
-- Test: psychicnum._rebuild_data_cols — the date, and a write that assigns
-- ============================================================
-- What the blobs hold is game_data_test.sql's. This file pins how they are
-- written: only a call that says so moves status_changed_at, and a rebuild
-- assigns the whole column and never merges.
-- ============================================================

begin;
set search_path = psychicnum, common, public, extensions;
\ir ../_shared/setup.psql

select plan(8);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Psychic rebuild', array['ada', 'bea']) as handle;

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
select is(
  (select summary_data -> 'statusChangedAt' from common.games where id = (select id from g where mode = 'coop')),
  (select to_jsonb(status_changed_at) from common.games where id = (select id from g where mode = 'coop')),
  'the summary''s statusChangedAt is the column''s instant after a stamp');
select is(
  (select summary_data -> 'statusChangedAt' from common.games where id = (select id from g where mode = 'compete')),
  to_jsonb('2026-01-01'::timestamptz),
  '… and the frozen instant after a rebuild (false)');

-- ── A rebuild assigns, never merges: a key planted in the column does not survive ──
update common.games set summary_data = summary_data || '{"stale": 1}'::jsonb
 where id = (select id from g where mode = 'coop');
select is(
  (select summary_data ? 'stale' from common.games where id = (select id from g where mode = 'coop')),
  true,
  'precondition: the planted key is in the column');
select psychicnum._rebuild_data_cols((select id from g where mode = 'coop'), p_update_status_changed_at => false);
select is(
  (select summary_data ? 'stale' from common.games where id = (select id from g where mode = 'coop')),
  false,
  'a rebuild drops a stale key');

-- ── Opening a game (the current-view pointer) never moves the date ──
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
