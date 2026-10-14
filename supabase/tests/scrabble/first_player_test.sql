-- cs-unmet

-- ============================================================
-- Test: compete scrabble's first player (setup.first_turn_user_id)
-- ============================================================
-- The setup may name who opens a compete game: any seated player, a bot
-- included. Naming nobody opens on a random player, drawn again each game and
-- each Restart; naming someone opens on them, Restart included. Someone who
-- isn't seated is refused.

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(7);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select pg_temp.create_club('Openers', array['ada', 'bea']) as handle;
reset role;

-- The bots create_game seats: the first ai_members by username.
select user_id as bot1 from common.profiles where ai_member order by username limit 1 \gset
select user_id as bot2 from common.profiles where ai_member order by username offset 1 limit 1 \gset

-- A compete game for ada and bea plus one bot, with this setup.
create function pg_temp.race(p_setup jsonb)
returns jsonb language plpgsql as $$
declare v_res jsonb;
begin
  perform pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
  v_res := scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb
      || p_setup,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');
  reset role;
  return v_res;
end;
$$;

create function pg_temp.opener(p_game_id uuid) returns uuid language sql as $$
  select current_turn_user_id from common.games where id = p_game_id;
$$;

create function pg_temp.restart(p_game_id uuid) returns void language plpgsql as $$
begin
  perform pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
  perform scrabble.replay_board(p_game_id);
  reset role;
end;
$$;

-- ─── A named person opens, and opens again after a Restart ───
create temp table g_bea on commit drop as
  select (pg_temp.race('{"first_turn_user_id": "bea22222-2222-2222-2222-222222222222"}')
    ->'data'->>'id')::uuid as id;
select is(pg_temp.opener((select id from g_bea)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'the setup''s first player opens');
-- Ten Restarts, so a random draw can't pass for the pick by luck.
create temp table bea_openers (id uuid) on commit drop;
do $$
begin
  for i in 1..10 loop
    perform pg_temp.restart((select id from g_bea));
    insert into bea_openers select pg_temp.opener((select id from g_bea));
  end loop;
end;
$$;
select is(
  (select array_agg(distinct id) from bea_openers),
  array['bea22222-2222-2222-2222-222222222222'::uuid],
  'every Restart opens on the setup''s first player again');
select is(
  (select setup->>'first_turn_user_id' from common.games where id = (select id from g_bea)),
  'bea22222-2222-2222-2222-222222222222',
  'the game keeps the pick, so New game opens on the same player');

-- ─── A bot may be named ───
select is(
  pg_temp.opener((pg_temp.race(jsonb_build_object('first_turn_user_id', :'bot1'))
    ->'data'->>'id')::uuid),
  :'bot1'::uuid,
  'a seated bot may open');

-- ─── Someone not seated is refused ───
select pg_temp.envelope_is(
  pg_temp.race(jsonb_build_object('first_turn_user_id', :'bot2')),
  '{"type":"not-ok","severity":"fault","dbcode":"PN086",
    "message":"BUG: first player who is not in the game"}'::jsonb,
  'a bot the game did not seat cannot open');

-- ─── Naming nobody draws, each Restart again ───
create temp table g_any on commit drop as
  select (pg_temp.race('{}')->'data'->>'id')::uuid as id;
select ok(
  (select setup ? 'first_turn_user_id' from common.games where id = (select id from g_any))
    is false,
  'a random opener stores no pick, so New game draws again');
create temp table openers (id uuid) on commit drop;
do $$
begin
  for i in 1..30 loop
    perform pg_temp.restart((select id from g_any));
    insert into openers select pg_temp.opener((select id from g_any));
  end loop;
end;
$$;
select ok((select count(distinct id) from openers) > 1,
  'with no pick, Restart draws the opener afresh');

select * from finish();
rollback;
