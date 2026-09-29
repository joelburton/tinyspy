-- cs-unmet

-- ============================================================
-- Test: setgame._write_statuses — the page's copies of the game
-- ============================================================
-- A status has one shape per game and every key is always present, null when
-- it has no value (plans/common-tables.md → The statuses), so this checks the
-- exact key set of game_status, player_status and clubpage_info at the start,
-- mid-game and at the end, in both modes — which is what catches a key still
-- written after it was dropped. Then the values that matter, and the one rule
-- about dates: only a call that says so moves status_changed_at.
-- ============================================================

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql

select plan(15);

create temp table want (status text primary key, keys text[]) on commit drop;
insert into want values
  ('game_status',   array['deck_remaining_count']),
  ('player_status', array['found_sets_count', 'hints_count', 'player_ended_reason']),
  ('clubpage_info', array['deck_kind', 'deck_remaining_count', 'found_sets_count',
                          'winner_found_sets_count', 'winner_user_ids']);
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

-- A set on the board now, read past the column grant.
create function pg_temp.live_set(p_game_id uuid) returns smallint[]
language sql security definer as $$
  select setgame._find_set(board) from setgame.games where game_id = p_game_id
$$;

create function pg_temp.player_numbers(p_game_id uuid) returns text[] language sql as $$
  select array_agg((player_status->>'found_sets_count') || '/' || (player_status->>'hints_count')
                   order by user_id)
    from common.game_players where game_id = p_game_id
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Setgame statuses', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (setgame.create_game(
  (select handle from club),
  '{"timer": {"kind": "none"}, "deck": "full"}'::jsonb,
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
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select (game_status->>'deck_remaining_count')::int from common.games cg
    where cg.id = (select id from g where mode = 'coop')),
  (select 81 - deck_pos from setgame.games where game_id = (select id from g where mode = 'coop')),
  'game_status has the cards still to be dealt');
select is(
  (select clubpage_info - 'deck_remaining_count' from common.games
    where id = (select id from g where mode = 'coop')),
  '{"found_sets_count": 0, "deck_kind": "full",
    "winner_user_ids": null, "winner_found_sets_count": null}'::jsonb,
  'coop: the club line starts at no sets, with the deck');

-- ── Mid-game: ada claims a set in both games; bea asks for a coop hint ──
create temp table sets on commit drop as
select mode, pg_temp.live_set(id) as cards from g;
grant select on sets to authenticated;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select setgame.submit_set((select id from g where mode = 'coop'),
                          (select cards from sets where mode = 'coop'));
select setgame.submit_set((select id from g where mode = 'compete'),
                          (select cards from sets where mode = 'compete'));
reset role;
select set_config('request.jwt.claims', '', true);

create temp table hint on commit drop as
select (pg_temp.live_set((select id from g where mode = 'coop')))[1:1] as cards;
grant select on hint to authenticated;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select setgame.record_hint((select id from g where mode = 'coop'), (select cards from hint));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set mid-game');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set mid-game');
select is(pg_temp.player_numbers((select id from g where mode = 'coop')), array['1/0', '0/1'],
  'coop: each player''s status has their own claims and hints');
select is(
  (select (clubpage_info->>'found_sets_count')::int from common.games
    where id = (select id from g where mode = 'coop')),
  1,
  'coop: the club line has the table''s sets found');

-- ── At the end: the compete clock runs out with ada ahead; coop stops ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select setgame.submit_timeout((select id from g where mode = 'compete'));
select setgame.stop_game((select id from g where mode = 'coop'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the end');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the end');
select is(
  (select (clubpage_info->>'winner_user_ids') || '/' || (clubpage_info->>'winner_found_sets_count')
     from common.games where id = (select id from g where mode = 'compete')),
  '["ada11111-1111-1111-1111-111111111111"]/1',
  'compete: the club line lists the winner and her sets');
select is(
  (select clubpage_info->'winner_user_ids' from common.games where id = (select id from g where mode = 'coop')),
  'null'::jsonb,
  'coop: the club line names no winner');

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select setgame._write_statuses(id, p_update_status_changed_at => false) from g;
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
select setgame._write_statuses((select id from g where mode = 'coop'), p_update_status_changed_at => false);
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'a rebuild drops a stale key from every status');

select * from finish();
rollback;
