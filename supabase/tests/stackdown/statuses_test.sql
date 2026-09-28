-- cs-unmet

-- ============================================================
-- Test: stackdown._write_statuses — the page's copies of the game
-- ============================================================
-- A status has one shape per game and every key is always present, null when
-- it has no value (plans/common-tables.md → The statuses), so this checks the
-- exact key set of game_status, player_status and clubpage_info at the start,
-- mid-game and at the end, in both modes — which is what catches a key still
-- written after it was dropped. Then the values that matter, and the one rule
-- about dates: only a call that says so moves status_changed_at.
--
-- The fixture board (setup.psql) spells six words in order; pg_temp.sd_seq(n)
-- is the tile sequence for the nth.
-- ============================================================

begin;
set search_path = stackdown, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(15);

create temp table want (status text primary key, keys text[]) on commit drop;
insert into want values
  ('game_status',   '{}'::text[]),
  ('player_status', array['found_words_count', 'hints_count', 'player_ended_reason',
                          'spoilers_count']),
  ('clubpage_info', array['band', 'found_words_count', 'winner_user_id']);
grant select on want to authenticated;

create function pg_temp.keys_of(j jsonb) returns text[] language sql as $$
  select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(j) k
$$;

-- Every status of one game against the wanted key sets; a mismatch names
-- which status and which row.
create function pg_temp.shapes_ok(p_game_id uuid) returns text language sql as $$
  select coalesce(string_agg(bad, '; '), 'ok') from (
    select 'game_status' as bad from common.games
     where id = p_game_id
       and pg_temp.keys_of(game_status) <> (select keys from want where status = 'game_status')
    union all
    select 'clubpage_info' from common.games
     where id = p_game_id
       and pg_temp.keys_of(clubpage_info) <> (select keys from want where status = 'clubpage_info')
    union all
    select 'player_status of ' || user_id from common.game_players
     where game_id = p_game_id
       and pg_temp.keys_of(player_status) <> (select keys from want where status = 'player_status')
  ) mismatches
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Stackdown statuses', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (stackdown.create_game(
  (select handle from club),
  '{"band": 1, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;

-- ── At the start ──
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the start');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the start');
select is(
  (select clubpage_info from common.games where id = (select id from g where mode = 'coop')),
  '{"found_words_count": 0, "band": 1, "winner_user_id": null}'::jsonb,
  'coop: the club line starts at 0 words, with the setup''s band');

-- ── Mid-game: ada clears the first word and takes a hint; bea a spoiler ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select stackdown.submit_word((select id from g where mode = 'coop'), pg_temp.sd_seq(1));
select stackdown.reveal_next_hint((select id from g where mode = 'coop'));
select stackdown.submit_word((select id from g where mode = 'compete'), pg_temp.sd_seq(1));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select stackdown.reveal_next_word((select id from g where mode = 'compete'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set mid-game');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set mid-game');
select is(
  (select clubpage_info->>'found_words_count' from common.games
    where id = (select id from g where mode = 'coop')),
  '1',
  'coop: the club line has the team''s cleared words');
select is(
  (select (player_status->>'found_words_count') || '/' || (player_status->>'hints_count')
     from common.game_players
    where game_id = (select id from g where mode = 'coop')
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/1',
  'coop: a player''s status has their own words and hints');
select is(
  (select (player_status->>'spoilers_count')::int from common.game_players
    where game_id = (select id from g where mode = 'compete')
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  1,
  'compete: a racer''s status counts their spoilers');
select is(
  (select clubpage_info->'found_words_count' from common.games
    where id = (select id from g where mode = 'compete')),
  'null'::jsonb,
  'compete: the club line carries no progress');

-- ── At the end: ada clears the rest of the compete stack; coop is Stopped ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select stackdown.submit_word((select id from g where mode = 'compete'), pg_temp.sd_seq(n))
  from generate_series(2, 6) n;
select stackdown.stop_game((select id from g where mode = 'coop'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the end');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the end');
select is(
  (select clubpage_info->>'winner_user_id' from common.games
    where id = (select id from g where mode = 'compete')),
  'ada11111-1111-1111-1111-111111111111',
  'compete: the club line names the winner');

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select stackdown._write_statuses(id, p_update_status_changed_at => false) from g;
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and status_changed_at = '2026-01-01'),
  2,
  'a rebuild (false) leaves status_changed_at alone');

-- A rebuild assigns, never merges: a key planted in a status does not survive.
update common.games set clubpage_info = clubpage_info || '{"stale": 1}'::jsonb
 where id = (select id from g where mode = 'coop');
select isnt(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'precondition: the key-set check sees the planted key');
select stackdown._write_statuses((select id from g where mode = 'coop'), p_update_status_changed_at => false);
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'a rebuild drops a stale key from every status');

select * from finish();
rollback;
