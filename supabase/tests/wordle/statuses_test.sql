-- cs-unmet

-- ============================================================
-- Test: wordle._write_statuses — the page's copies of the game
-- ============================================================
-- A status has one shape per game and every key is always present, null when
-- it has no value (plans/common-tables.md → The statuses), so this checks the
-- exact key set of game_status, player_status and clubpage_info at the start,
-- mid-game and at the end, in both modes — which is what catches a key still
-- written after it was dropped. Then the values that matter, and the one rule
-- about dates: only a call that says so moves status_changed_at.
-- ============================================================

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(21);

create temp table want (status text primary key, keys text[]) on commit drop;
insert into want values
  ('game_status',   array['max_guesses']),
  ('player_status', array['guesses_used', 'player_ended_reason', 'tie_broken_by_clock']),
  ('clubpage_info', array['answer_band', 'guesses_used', 'max_guesses',
                          'winner_guesses_count', 'winner_user_id']);
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
select pg_temp.create_club('Wordle statuses', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (wordle.create_game(
  (select handle from club),
  pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;

-- A legal wrong guess for each game: whichever of two common words isn't its
-- answer.
reset role;
create temp table w on commit drop as
select g.mode, wg.target::text as target,
       case when wg.target::text = 'crane' then 'slate' else 'crane' end as wrong
  from g join wordle.games wg on wg.game_id = g.id;
grant select on w, g to authenticated;

-- ── At the start ──
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the start');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the start');
select is(
  (select clubpage_info from common.games where id = (select id from g where mode = 'coop')),
  '{"guesses_used": 0, "max_guesses": 5, "answer_band": 0,
    "winner_user_id": null, "winner_guesses_count": null}'::jsonb,
  'coop: the club line starts at 0/5, with the setup''s answer band');

-- ── Mid-game ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess((select id from g where mode = 'coop'), (select wrong from w where mode = 'coop'));
select wordle.submit_guess((select id from g where mode = 'compete'), (select wrong from w where mode = 'compete'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set mid-game');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set mid-game');
select is(
  (select array_agg((player_status->>'guesses_used')::int order by user_id)
     from common.game_players where game_id = (select id from g where mode = 'coop')),
  array[1, 1],
  'coop: every player''s status has the team''s used count');
select is(
  (select array_agg((player_status->>'guesses_used')::int order by user_id)
     from common.game_players where game_id = (select id from g where mode = 'compete')),
  array[1, 0],
  'compete: each racer''s status has their own used count');
select is(
  (select clubpage_info->'guesses_used' from common.games
    where id = (select id from g where mode = 'compete')),
  'null'::jsonb,
  'compete: the club line carries no progress');

-- ── At the end: ada solves the race on her second guess, bea concedes ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess((select id from g where mode = 'compete'), (select target from w where mode = 'compete'));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.concede((select id from g where mode = 'compete'));
select wordle.stop_game((select id from g where mode = 'coop'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the end');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the end');
select is(
  (select (clubpage_info->>'winner_user_id') || '/' || (clubpage_info->>'winner_guesses_count')
     from common.games where id = (select id from g where mode = 'compete')),
  'ada11111-1111-1111-1111-111111111111/2',
  'compete: the club line names the winner and her count');
select is(
  (select array_agg(player_status->>'player_ended_reason' order by user_id)
     from common.game_players where game_id = (select id from g where mode = 'compete')),
  array['reached_goal', 'conceded'],
  'compete: each racer''s status says how they ended, for the strip');
select is(
  (select array_agg((player_status->>'tie_broken_by_clock')::boolean order by user_id)
     from common.game_players where game_id = (select id from g where mode = 'compete')),
  array[false, false],
  'compete: a winner nobody matched, and a conceder, were not placed by the clock');
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g where mode = 'coop')
      and player_status->'tie_broken_by_clock' = 'null'::jsonb),
  2,
  'coop: tie_broken_by_clock is null, there being no winner to tie');

-- ── A tie: ada and bea both solve in one guess, bea later; cade in two ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table tie on commit drop as
select (wordle.create_game(
  pg_temp.create_club('Wordle tie', array['ada', 'bea', 'cade']),
  pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete'
)->'data'->>'id')::uuid as id;
reset role;
create temp table tie_w on commit drop as
select wg.target::text as target,
       case when wg.target::text = 'crane' then 'slate' else 'crane' end as wrong
  from tie join wordle.games wg on wg.game_id = tie.id;
grant select on tie, tie_w to authenticated;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess((select id from tie), (select target from tie_w));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.submit_guess((select id from tie), (select target from tie_w));
reset role;
-- One transaction has one now(), so the later solve is set by hand.
update common.game_players set solved_at = now() + interval '1 minute'
 where game_id = (select id from tie) and user_id = 'bea22222-2222-2222-2222-222222222222';
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select wordle.submit_guess((select id from tie), (select wrong from tie_w));
select wordle.submit_guess((select id from tie), (select target from tie_w));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select array_agg((player_status->>'tie_broken_by_clock')::boolean order by user_id)
     from common.game_players where game_id = (select id from tie)),
  array[true, true, false],
  'compete tie: the winner and the solver on her count were placed by the clock; the solver on more guesses was not');

-- ── No tie: ada solves in one guess and cade in two; bea concedes on ada's
-- count without solving ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table no_tie on commit drop as
select (wordle.create_game(
  (select club_handle from common.games where id = (select id from tie)),
  pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete'
)->'data'->>'id')::uuid as id;
reset role;
create temp table no_tie_w on commit drop as
select wg.target::text as target,
       case when wg.target::text = 'crane' then 'slate' else 'crane' end as wrong
  from no_tie join wordle.games wg on wg.game_id = no_tie.id;
grant select on no_tie, no_tie_w to authenticated;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess((select id from no_tie), (select target from no_tie_w));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.submit_guess((select id from no_tie), (select wrong from no_tie_w));
select wordle.concede((select id from no_tie));
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select wordle.submit_guess((select id from no_tie), (select wrong from no_tie_w));
select wordle.submit_guess((select id from no_tie), (select target from no_tie_w));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select array_agg((player_status->>'tie_broken_by_clock')::boolean order by user_id)
     from common.game_players where game_id = (select id from no_tie)),
  array[false, false, false],
  'compete, no tie: solvers on different counts, and a conceder on the winner''s count, were not placed by the clock');

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select wordle._write_statuses(id, p_update_status_changed_at => false) from g;
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and status_changed_at = '2026-01-01'),
  2,
  'a rebuild (false) leaves status_changed_at alone');
select wordle._write_statuses((select id from g where mode = 'coop'), p_update_status_changed_at => true);
select is(
  (select status_changed_at from common.games where id = (select id from g where mode = 'coop')),
  now(),
  'an activity call (true) stamps status_changed_at');

-- A rebuild assigns, never merges: a key planted in a status does not survive.
update common.games set game_status = game_status || '{"stale": 1}'::jsonb,
                        clubpage_info = clubpage_info || '{"stale": 1}'::jsonb
 where id = (select id from g where mode = 'coop');
update common.game_players set player_status = player_status || '{"stale": 1}'::jsonb
 where game_id = (select id from g where mode = 'coop');
select isnt(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'precondition: the key-set check sees the planted key');
select wordle._write_statuses((select id from g where mode = 'coop'), p_update_status_changed_at => false);
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'a rebuild drops a stale key from every status');

-- Restart writes the statuses fresh.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.replay_board((select id from g where mode = 'compete'));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g where mode = 'compete')
      and player_status = '{"guesses_used": 0, "player_ended_reason": null,
                            "tie_broken_by_clock": null}'::jsonb),
  2,
  'a Restart writes every player''s status fresh');

select * from finish();
rollback;
