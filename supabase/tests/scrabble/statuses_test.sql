-- cs-unmet

-- ============================================================
-- Test: scrabble._write_statuses — the page's copies of the game
-- ============================================================
-- A status has one shape per game and every key is always present, null when
-- it has no value (plans/common-tables.md → The statuses), so this checks the
-- exact key set of game_status, player_status and clubpage_info at the start,
-- mid-game and at the end, in both modes — which is what catches a key still
-- written after it was dropped. Then the values that matter, and the one rule
-- about dates: only a call that says so moves status_changed_at.
--
-- Racks and scores are set by hand where a value depends on them, since the
-- deal is random.
-- ============================================================

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql

select plan(15);

create temp table want (status text primary key, keys text[]) on commit drop;
insert into want values
  ('game_status',   array['bag_tiles_count']),
  ('player_status', array['player_ended_reason', 'rack_tiles_count', 'score']),
  ('clubpage_info', array['bag_tiles_count', 'coop_score', 'winner_score', 'winner_user_id']);
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

create function pg_temp.player_numbers(p_game_id uuid) returns text[] language sql as $$
  select array_agg((player_status->>'score') || '/' || (player_status->>'rack_tiles_count')
                   order by user_id)
    from common.game_players where game_id = p_game_id
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Scrabble statuses', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (scrabble.create_game(
  (select handle from club),
  '{"timer": {"kind": "none"}}'::jsonb,
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
  (select game_status->'bag_tiles_count' from common.games where id = (select id from g where mode = 'compete')),
  '86'::jsonb,
  'game_status has the bag after two racks of seven');
select is(
  (select clubpage_info from common.games where id = (select id from g where mode = 'coop')),
  '{"coop_score": 0, "bag_tiles_count": 93, "winner_user_id": null, "winner_score": null}'::jsonb,
  'coop: the club line starts at no points and the bag after one rack');
select is(pg_temp.player_numbers((select id from g where mode = 'coop')), array['0/7', '0/7'],
  'coop: every player''s status has the team''s score and rack');

-- ── Mid-game: the coop team plays CAT from a known rack ──
reset role;
select set_config('request.jwt.claims', '', true);
update scrabble.games set coop_rack = array['C','A','T','E','E','E','E']
 where game_id = (select id from g where mode = 'coop');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.play_word(
  (select id from g where mode = 'coop'),
  (select version from scrabble.games where game_id = (select id from g where mode = 'coop')),
  '[{"x": 7, "y": 7, "letter": "C"}, {"x": 8, "y": 7, "letter": "A"}, {"x": 9, "y": 7, "letter": "T"}]'::jsonb,
  array['CAT'], 5);
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set mid-game');
select is(pg_temp.player_numbers((select id from g where mode = 'coop')), array['5/7', '5/7'],
  'coop: the play scores the team and redraws its rack');
select is(
  (select clubpage_info->'bag_tiles_count' from common.games where id = (select id from g where mode = 'coop')),
  '90'::jsonb,
  'coop: the club line''s bag follows the draw');

-- ── At the end: the compete clock runs out with ada ahead; coop stops ──
update scrabble.players set score = 10, rack = array['A']
 where game_id = (select id from g where mode = 'compete')
   and user_id = 'ada11111-1111-1111-1111-111111111111';
update scrabble.players set score = 5, rack = array['B']
 where game_id = (select id from g where mode = 'compete')
   and user_id = 'bea22222-2222-2222-2222-222222222222';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.submit_timeout((select id from g where mode = 'compete'));
select scrabble.stop_game((select id from g where mode = 'coop'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the end');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the end');
select is(pg_temp.player_numbers((select id from g where mode = 'compete')), array['9/1', '2/1'],
  'compete: each player''s status has their final score, leftovers subtracted');
select is(
  (select (clubpage_info->>'winner_user_id') || '/' || (clubpage_info->>'winner_score')
     from common.games where id = (select id from g where mode = 'compete')),
  'ada11111-1111-1111-1111-111111111111/9',
  'compete: the club line names the winner and the winning score');

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select scrabble._write_statuses(id, p_update_status_changed_at => false) from g;
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and status_changed_at = '2026-01-01'),
  2,
  'a rebuild (false) leaves status_changed_at alone');

-- A rebuild assigns, never merges: a key planted in a status does not survive.
update common.games set game_status = game_status || '{"stale": 1}'::jsonb
 where id = (select id from g where mode = 'coop');
select isnt(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'precondition: the key-set check sees the planted key');
select scrabble._write_statuses((select id from g where mode = 'coop'), p_update_status_changed_at => false);
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'a rebuild drops a stale key from every status');

select * from finish();
rollback;
