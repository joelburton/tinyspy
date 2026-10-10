-- cs-unmet

-- ============================================================
-- Test: the game's end — wordsy._finish
-- ============================================================
-- Whole games on the planted table (setup.psql → ws_play_round), ada first
-- every round and so the Fastest: two players, so nobody ever holds No Flip.
--   1. seven rounds end the game: resource_exhausted / rounds_played, ended
--      by nobody when the clock ran out
--   2. a total is the best five word scores plus every bonus
--   3. ranked by total; a tie shares rank 1 and both win
--   4. a player who scored nothing is not ranked
--   5. a conceder keeps their rounds and is not ranked
--   6. summary_data's winnerTotal and nRoundsPlayed
--   7. in `no-timer` the last player to submit ends it
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(16);

\ir ../_shared/setup.psql
\ir setup.psql

create function pg_temp.player(p_gid uuid, p_name text) returns jsonb
language sql as $$
  select p from common.games g, jsonb_array_elements(g.game_data -> 'players') p
   where g.id = p_gid and p ->> 'username' = p_name
$$;

-- ─── (1, 2, 4, 6) Two players: best five plus bonuses ───
-- ada scores 2 3 4 5 6 6 6 and bea nothing, so ada, the Fastest, ties or
-- beats her one opponent every round: +2 +2 +2 +3 +3 +3 +4 = 19. The best
-- five are 6 6 6 5 4 = 27, the 2 and the 3 crossed out: 46.
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.a', pg_temp.ws_game(array['ada', 'bea'])::text, true);
select pg_temp.ws_play_round(current_setting('t.a')::uuid, array['ada', 'bea'], array[s, 0])
  from unnest(array[2, 3, 4, 5, 6, 6, 6]) s;
reset role;

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || ' by ' || coalesce(game_ended_by_user_id::text, 'nobody')
     from common.games where id = current_setting('t.a')::uuid),
  'resource_exhausted/rounds_played by nobody',
  'the seventh round''s end ends the game; the clock ran out, so nobody ended it'
);
select is((pg_temp.player(current_setting('t.a')::uuid, 'ada') ->> 'total')::int, 46,
  'the total is the best five word scores plus every bonus');
select is(pg_temp.player(current_setting('t.a')::uuid, 'ada') -> 'roundScores',
  '[4, 5, 6, 8, 9, 9, 10]'::jsonb, 'roundScores is each round''s score plus its bonus');
select is(pg_temp.player(current_setting('t.a')::uuid, 'ada') ->> 'outcome', 'won', 'ada wins');
select is(pg_temp.player(current_setting('t.a')::uuid, 'bea') ->> 'finalRanking', null,
  'a player who scored nothing is not ranked');
select is(pg_temp.player(current_setting('t.a')::uuid, 'bea') ->> 'outcome', 'lost', '… and lost');
select is(
  (select summary_data -> 'winnerTotal' from common.games where id = current_setting('t.a')::uuid),
  '46'::jsonb,
  'summary_data says the winning total'
);
select is(
  (select summary_data -> 'nRoundsPlayed' from common.games where id = current_setting('t.a')::uuid),
  '7'::jsonb,
  '… and the seven rounds played'
);
select is(
  (select kind from common.timers where game_id = current_setting('t.a')::uuid),
  'none',
  'the clock is put away at the end'
);

-- ─── (3) A tie ───
-- ada scores 6 every round; bea 4 4 0 0 8 8 8. Rounds 1–4 bea is at or below
-- the Fastest, so ada takes +2 +2 +2 +3: 30 + 9 = 39. Rounds 5–7 bea beats
-- her for +2 +2 +3, on a best five of 8 8 8 4 4: 32 + 7 = 39.
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.t', pg_temp.ws_game(array['ada', 'bea'])::text, true);
select pg_temp.ws_play_round(current_setting('t.t')::uuid, array['ada', 'bea'], array[6, s])
  from unnest(array[4, 4, 0, 0, 8, 8, 8]) s;
reset role;

select is(
  (select jsonb_agg(p ->> 'username' || ' ' || (p ->> 'total') || ' ' || (p ->> 'finalRanking') || ' ' || (p ->> 'outcome') order by o)
     from common.games g, jsonb_array_elements(g.game_data -> 'players') with ordinality as x(p, o)
    where g.id = current_setting('t.t')::uuid),
  '["ada 39 1 won", "bea 39 1 won"]'::jsonb,
  'a tie on total shares rank 1, and both win'
);
select is(
  (select summary_data -> 'winnerTotal' from common.games where id = current_setting('t.t')::uuid),
  '39'::jsonb,
  'winnerTotal is the total the winners share'
);

-- ─── (5) A conceder ───
-- Three players; cade plays round 1 (beating the Fastest for 6 + 1) and
-- concedes as round 2 opens. Then ada 5 against bea 6 every round.
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.c', pg_temp.ws_game(array['ada', 'bea', 'cade'])::text, true);
select pg_temp.ws_play_round(current_setting('t.c')::uuid, array['ada', 'bea', 'cade'], array[5, 6, 6]);
select pg_temp.as_user(pg_temp.ws_uid('cade'));
select wordsy.concede(current_setting('t.c')::uuid);
select pg_temp.ws_play_round(current_setting('t.c')::uuid, array['ada', 'bea', 'cade'], array[5, 6, null])
  from generate_series(2, 7);
reset role;

select is(
  (select count(*)::int from wordsy.events
    where game_id = current_setting('t.c')::uuid and user_id = pg_temp.ws_uid('cade')),
  1,
  'a conceder keeps the round they played, and has no row after'
);
select is(pg_temp.player(current_setting('t.c')::uuid, 'cade') ->> 'finalRanking', null,
  '… and is not ranked');
select is(
  (select jsonb_agg((p ->> 'username') || ' ' || (p ->> 'finalRanking') order by o)
     from common.games g, jsonb_array_elements(g.game_data -> 'players') with ordinality as x(p, o)
    where g.id = current_setting('t.c')::uuid and p ->> 'finalRanking' is not null),
  '["ada 2", "bea 1"]'::jsonb,
  'the others are ranked without them'
);

-- ─── (7) no-timer ───
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.n', pg_temp.ws_game(array['ada', 'bea'], 'no-timer')::text, true);
select pg_temp.ws_play_round(current_setting('t.n')::uuid, array['ada', 'bea'], array[5, 4])
  from generate_series(1, 7);
reset role;

select is(
  (select game_ended_by_user_id from common.games where id = current_setting('t.n')::uuid),
  pg_temp.ws_uid('bea'),
  'in no-timer the last player to submit ends the game'
);
select is(
  (select ended_at is not null from common.games where id = current_setting('t.n')::uuid),
  true,
  '… after seven rounds'
);

select * from finish();
rollback;
