-- cs-unmet

-- ============================================================
-- Test: wordsy._rebuild_data_cols — the date, and a write that assigns
-- ============================================================
-- What the blobs hold is game_data_test.sql's. This file pins how they are
-- written: only a call that says so moves status_changed_at, a rebuild
-- assigns the whole column and never merges, and the pass over every game
-- rewrites each without re-dating it.
-- ============================================================

begin;
set search_path = wordsy, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(7);

select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.g', pg_temp.ws_game(array['ada', 'bea'])::text, true);
create function pg_temp.g() returns uuid language sql as
  $$ select current_setting('t.g')::uuid $$;
reset role;

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id = pg_temp.g();
select wordsy._rebuild_data_cols(pg_temp.g(), p_update_status_changed_at => false);
select is(
  (select status_changed_at from common.games where id = pg_temp.g()),
  '2026-01-01'::timestamptz,
  'a rebuild (false) leaves status_changed_at alone');
select wordsy._rebuild_data_cols(pg_temp.g(), p_update_status_changed_at => true);
select is(
  (select status_changed_at from common.games where id = pg_temp.g()),
  now(),
  'an activity call (true) stamps status_changed_at');
select is(
  (select summary_data -> 'statusChangedAt' from common.games where id = pg_temp.g()),
  (select to_jsonb(status_changed_at) from common.games where id = pg_temp.g()),
  'the summary''s statusChangedAt is the column''s instant after a stamp');

-- ── A rebuild assigns, never merges ──
update common.games
   set summary_data = summary_data || '{"stale": 1}'::jsonb,
       game_data = game_data || '{"stale": 1}'::jsonb,
       shell_data = shell_data || '{"stale": 1}'::jsonb
 where id = pg_temp.g();
select wordsy._rebuild_data_cols(pg_temp.g(), p_update_status_changed_at => false);
select is(
  (select array[summary_data ? 'stale', game_data ? 'stale', shell_data ? 'stale']
     from common.games where id = pg_temp.g()),
  array[false, false, false],
  'a rebuild drops a stale key from all three');

-- ── Every game ──
update common.games
   set status_changed_at = '2026-01-01', static_game_data = null, game_data = null
 where id = pg_temp.g();
select cmp_ok(wordsy._rebuild_data_cols_for_all(), '>=', 1,
  '_rebuild_data_cols_for_all answers how many games it rewrote');
select is(
  (select static_game_data is not null and game_data is not null
     from common.games where id = pg_temp.g()),
  true,
  '… writing the static blob and the others');
select is(
  (select status_changed_at from common.games where id = pg_temp.g()),
  '2026-01-01'::timestamptz,
  '… without re-dating any');

select * from finish();
rollback;
