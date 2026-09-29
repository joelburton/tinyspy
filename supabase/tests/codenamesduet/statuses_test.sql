-- cs-unmet

-- ============================================================
-- Test: codenamesduet._write_statuses — the page's copies of the game
-- ============================================================
-- A status has one shape per game and every key is always present, null when
-- it has no value (plans/common-tables.md → The statuses), so this checks the
-- exact key set of game_status, player_status and clubpage_info at the start,
-- mid-game and at the end — which is what catches a key still written after
-- it was dropped. Then the values that matter, that a hint rewrites them like
-- every move, and the one rule about dates: only a call that says so moves
-- status_changed_at.
-- ============================================================

begin;
set search_path = codenamesduet, common, public, extensions;
\ir ../_shared/setup.psql

select plan(13);

create temp table want (status text primary key, keys text[]) on commit drop;
insert into want values
  ('game_status',   array['found_agents_count', 'max_turns', 'turn_number', 'turns_remaining']),
  ('player_status', '{}'),
  ('clubpage_info', array['found_agents_count', 'turns_remaining']);
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

-- The first board position labeled `p_on_a` on seat A's key and `p_on_b` on
-- seat B's.
create function pg_temp.cell(p_game_id uuid, p_on_a text, p_on_b text) returns int
language sql as $$
  select (ord - 1)::int
    from codenamesduet.games gm,
         jsonb_array_elements_text(gm.key_card_a) with ordinality as a(label, ord)
   where gm.game_id = p_game_id and a.label = p_on_a
     and gm.key_card_b ->> (ord - 1)::int = p_on_b
   limit 1
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Duet statuses', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select (codenamesduet.create_game(
  (select handle from club),
  jsonb_build_object('turns', 9,
                     'first_clue_giver_user_id', 'ada11111-1111-1111-1111-111111111111',
                     'timer', jsonb_build_object('kind', 'none')),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
)->'data'->>'id')::uuid as id;

-- ── At the start ──
select is(pg_temp.shapes_ok((select id from g)), 'ok',
  'every status has its full key set at the start');
select is(
  (select game_status from common.games where id = (select id from g)),
  '{"found_agents_count": 0, "turn_number": 1, "turns_remaining": 9, "max_turns": 9}'::jsonb,
  'game_status starts at no agents, turn 1 of 9');
select is(
  (select clubpage_info from common.games where id = (select id from g)),
  '{"found_agents_count": 0, "turns_remaining": 9}'::jsonb,
  'the club line starts at no agents and 9 turns left');

-- ── Mid-game: ada clues; bea finds an agent, then hits a bystander ──
select codenamesduet.submit_clue((select id from g), 'ONE', 1);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select codenamesduet.submit_guess((select id from g), pg_temp.cell((select id from g), 'G', 'N'));
select codenamesduet.submit_guess((select id from g), pg_temp.cell((select id from g), 'N', 'N'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g)), 'ok',
  'every status has its full key set mid-game');
select is(
  (select game_status from common.games where id = (select id from g)),
  '{"found_agents_count": 1, "turn_number": 2, "turns_remaining": 8, "max_turns": 9}'::jsonb,
  'game_status follows the agent found and the turn the bystander ended');
select is(
  (select clubpage_info from common.games where id = (select id from g)),
  '{"found_agents_count": 1, "turns_remaining": 8}'::jsonb,
  'the club line follows them too');

-- ── A hint rewrites the statuses, which is how the partner hears of it ──
update common.games set status_changed_at = '2026-01-01' where id = (select id from g);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select codenamesduet.log_hint((select id from g));
reset role;
select set_config('request.jwt.claims', '', true);

select isnt(
  (select status_changed_at from common.games where id = (select id from g)),
  '2026-01-01'::timestamptz,
  'a hint rewrites the statuses');

-- ── At the end: bea clues, ada turns over bea's assassin ──
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select codenamesduet.submit_clue((select id from g), 'TWO', 1);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select codenamesduet.submit_guess((select id from g), pg_temp.cell((select id from g), 'N', 'A'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select game_ended_reason_detail from common.games where id = (select id from g)),
  'assassin',
  'precondition: the assassin ended the game');
select is(pg_temp.shapes_ok((select id from g)), 'ok',
  'every status has its full key set at the end');
select is(
  (select clubpage_info from common.games where id = (select id from g)),
  '{"found_agents_count": 1, "turns_remaining": 8}'::jsonb,
  'the club line keeps the agents found and the turns left at the end');

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id = (select id from g);
select codenamesduet._write_statuses((select id from g), p_update_status_changed_at => false);
select is(
  (select status_changed_at from common.games where id = (select id from g)),
  '2026-01-01'::timestamptz,
  'a rebuild (false) leaves status_changed_at alone');

-- A rebuild assigns, never merges: a key planted in a status does not survive.
update common.games set game_status = game_status || '{"stale": 1}'::jsonb
 where id = (select id from g);
select isnt(pg_temp.shapes_ok((select id from g)), 'ok',
  'precondition: the key-set check sees the planted key');
select codenamesduet._write_statuses((select id from g), p_update_status_changed_at => false);
select is(pg_temp.shapes_ok((select id from g)), 'ok',
  'a rebuild drops a stale key from every status');

select * from finish();
rollback;
