-- cs-unmet

-- ============================================================
-- Test: letterboxed._write_statuses — the page's copies of the game
-- ============================================================
-- A status has one shape per game and every key is always present, null when
-- it has no value (plans/common-tables.md → The statuses), so this checks the
-- exact key set of game_status, player_status and clubpage_info at the start,
-- mid-game and at the end, in both modes — which is what catches a key still
-- written after it was dropped. Then the values that matter, and the one rule
-- about dates: only a call that says so moves status_changed_at.
--
-- The fixture board (setup.psql) is solved by ADGJBEHK (8 letters) then
-- KCFIL; its cap is five words.
-- ============================================================

begin;
set search_path = letterboxed, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(15);

create temp table want (status text primary key, keys text[]) on commit drop;
insert into want values
  ('game_status',   array['max_words']),
  ('player_status', array['letters_covered_count', 'player_ended_reason', 'words_used']),
  ('clubpage_info', array['best_letters_covered_count', 'letters_covered_count', 'max_words',
                          'winner_user_id', 'winner_words_count', 'words_used']);
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

create function pg_temp.progress(p_game_id uuid) returns text[] language sql as $$
  select array_agg((player_status->>'words_used') || '/' || (player_status->>'letters_covered_count')
                   order by user_id)
    from common.game_players where game_id = p_game_id
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Letterboxed statuses', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode,
  pg_temp.lb_board()
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;

-- ── At the start ──
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the start');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the start');
select is(
  (select game_status from common.games where id = (select id from g where mode = 'coop')),
  '{"max_words": 5}'::jsonb,
  'game_status holds the cap');
select is(
  (select clubpage_info from common.games where id = (select id from g where mode = 'coop')),
  '{"words_used": 0, "letters_covered_count": 0, "max_words": 5,
    "best_letters_covered_count": null, "winner_user_id": null,
    "winner_words_count": null}'::jsonb,
  'coop: the club line starts at an empty chain');

-- ── Mid-game: ada plays the first word in coop, bea in the race ──
select letterboxed.submit_word((select id from g where mode = 'coop'), 'adgjbehk');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.submit_word((select id from g where mode = 'compete'), 'adgjbehk');
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set mid-game');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set mid-game');
select is(pg_temp.progress((select id from g where mode = 'coop')), array['1/8', '1/8'],
  'coop: every player''s status has the shared chain');
select is(pg_temp.progress((select id from g where mode = 'compete')), array['0/0', '1/8'],
  'compete: each racer''s status has their own chain');
select is(
  (select clubpage_info from common.games where id = (select id from g where mode = 'compete')),
  '{"words_used": null, "letters_covered_count": null, "max_words": 5,
    "best_letters_covered_count": 8, "winner_user_id": null,
    "winner_words_count": null}'::jsonb,
  'compete: the club line has the best coverage so far and no chain');

-- ── At the end: bea finishes the race; the coop game is stopped ──
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.submit_word((select id from g where mode = 'compete'), 'kcfil');
select letterboxed.stop_game((select id from g where mode = 'coop'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the end');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the end');
select is(
  (select (clubpage_info->>'winner_user_id') || '/' || (clubpage_info->>'winner_words_count')
     from common.games where id = (select id from g where mode = 'compete')),
  'bea22222-2222-2222-2222-222222222222/2',
  'compete: the club line names the winner and the length of her chain');

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select letterboxed._write_statuses(id, p_update_status_changed_at => false) from g;
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
select letterboxed._write_statuses((select id from g where mode = 'coop'), p_update_status_changed_at => false);
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'a rebuild drops a stale key from every status');

select * from finish();
rollback;
