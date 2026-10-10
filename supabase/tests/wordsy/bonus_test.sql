-- cs-unmet

-- ============================================================
-- Test: the round's bonuses — wordsy._end_round
-- ============================================================
-- Each case is one round on the planted table: ada submits first and is the
-- Fastest, the others submit words worth the scores given, the clock runs
-- out, and the case reads every player's bonus off the reveal.
--
--   1. the table by round: beat the Fastest +1 / +2 / +3, the Fastest tying
--      or beating enough opponents +2 / +3 / +4, for rounds 1–3 / 4–6 / 7
--   2. beating is strict: a tie with the Fastest earns nothing
--   3. "enough opponents" is min(3, opponents), at 2, 3, 4, 5 and 6 players,
--      each count one short and exactly there (plans/wordsy.md, decision 10)
--   4. a player who conceded is not an opponent
--   5. No Flip leaves once two players are still playing (decision 19)
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(22);

\ir ../_shared/setup.psql
\ir setup.psql

-- One round: `p_names[1]` (ada) submits first, each player a word worth
-- `p_scores[i]`; the conceders concede; the clock runs out. Answers each
-- player's bonus in seat order, 'ada+0 bea+1'. The round is planted as round
-- `p_num` before anyone submits.
create function pg_temp.bonus_round(
  p_names     text[],
  p_scores    int[],
  p_num       int default 1,
  p_conceders text[] default '{}'
) returns text
language plpgsql as $$
declare
  v_gid uuid := pg_temp.ws_game(p_names);
  v_i   int;
  v_who text;
  v_out text;
begin
  perform set_config('role', 'postgres', true);
  update wordsy.rounds set num = p_num where game_id = v_gid and num = 1;
  for v_i in 1 .. cardinality(p_names) loop
    perform pg_temp.ws_submit(v_gid, p_names[v_i], pg_temp.ws_word(p_scores[v_i], v_i));
  end loop;
  foreach v_who in array p_conceders loop
    perform pg_temp.as_user(pg_temp.ws_uid(v_who));
    perform wordsy.concede(v_gid);
  end loop;
  perform pg_temp.ws_buzz(v_gid);
  perform set_config('role', 'postgres', true);
  select string_agg(p.username || '+' || e.bonus, ' ' order by e.id) into v_out
    from wordsy.events e join common.profiles p on p.user_id = e.user_id
   where e.game_id = v_gid and e.num = p_num;
  perform set_config('t.last', v_gid::text, true);
  return v_out;
end;
$$;

-- ─── (1, 2) The table by round, at two players ───
select is(pg_temp.bonus_round(array['ada', 'bea'], array[5, 6], 1), 'ada+0 bea+1',
  'round 1: beating the Fastest is +1');
select is(pg_temp.bonus_round(array['ada', 'bea'], array[5, 5], 1), 'ada+2 bea+0',
  'round 1: the Fastest tying their one opponent is +2; the tie beats nobody');
select is(pg_temp.bonus_round(array['ada', 'bea'], array[5, 5], 3), 'ada+2 bea+0',
  'round 3 is still +2');
select is(pg_temp.bonus_round(array['ada', 'bea'], array[5, 6], 4), 'ada+0 bea+2',
  'round 4: beating the Fastest is +2');
select is(pg_temp.bonus_round(array['ada', 'bea'], array[5, 4], 4), 'ada+3 bea+0',
  'round 4: the Fastest beating their opponent is +3');
select is(pg_temp.bonus_round(array['ada', 'bea'], array[5, 6], 6), 'ada+0 bea+2',
  'round 6 is still +2');
select is(pg_temp.bonus_round(array['ada', 'bea'], array[5, 6], 7), 'ada+0 bea+3',
  'round 7: beating the Fastest is +3');
select is(pg_temp.bonus_round(array['ada', 'bea'], array[5, 5], 7), 'ada+4 bea+0',
  'round 7: the Fastest tying is +4');
select is(pg_temp.bonus_round(array['ada', 'bea'], array[0, 0], 1), 'ada+2 bea+0',
  'two zeros: the Fastest ties');

-- ─── (3) Enough opponents ───
select is(pg_temp.bonus_round(array['ada', 'bea', 'cade'], array[5, 5, 6]),
  'ada+0 bea+0 cade+1', 'three players: the Fastest needs both opponents, one short');
select is(pg_temp.bonus_round(array['ada', 'bea', 'cade'], array[5, 5, 4]),
  'ada+2 bea+0 cade+0', 'three players: both tied or beaten');
select is(pg_temp.bonus_round(array['ada', 'bea', 'cade', 'dee'], array[5, 4, 5, 6]),
  'ada+0 bea+0 cade+0 dee+1', 'four players: all three needed, one short');
select is(pg_temp.bonus_round(array['ada', 'bea', 'cade', 'dee'], array[5, 4, 5, 5]),
  'ada+2 bea+0 cade+0 dee+0', 'four players: all three tied or beaten');
select is(pg_temp.bonus_round(array['ada', 'bea', 'cade', 'dee', 'eda'], array[5, 6, 6, 5, 4]),
  'ada+0 bea+1 cade+1 dee+0 eda+0', 'five players: three of four needed, one short');
select is(pg_temp.bonus_round(array['ada', 'bea', 'cade', 'dee', 'eda'], array[5, 6, 5, 5, 4]),
  'ada+2 bea+1 cade+0 dee+0 eda+0', 'five players: three of four, and a beater''s bonus beside it');
select is(pg_temp.bonus_round(array['ada', 'abe-bot', 'bea', 'cade', 'dee', 'eda'], array[5, 6, 6, 6, 5, 4]),
  'abe-bot+1 ada+0 bea+1 cade+1 dee+0 eda+0', 'six players: three of five needed, one short');
select is(pg_temp.bonus_round(array['ada', 'abe-bot', 'bea', 'cade', 'dee', 'eda'], array[5, 6, 6, 5, 5, 0]),
  'abe-bot+1 ada+2 bea+1 cade+0 dee+0 eda+0', 'six players: three of five');

-- ─── (4) A conceder is no opponent ───
select is(pg_temp.bonus_round(array['ada', 'bea', 'cade', 'dee'], array[5, 4, 5, 6], 1, array['dee']),
  'ada+2 bea+0 cade+0', 'dee conceded: two opponents left, both at or below, and dee has no row');

-- ─── (5) No Flip ───
select pg_temp.bonus_round(array['ada', 'bea', 'cade'], array[5, 4, 3]);
select is(
  (select no_flip_user_id from wordsy.rounds where game_id = current_setting('t.last')::uuid and num = 2),
  pg_temp.ws_uid('ada'),
  'three still playing: the Fastest takes No Flip'
);
select pg_temp.bonus_round(array['ada', 'bea', 'cade'], array[5, 4, 3], 1, array['cade']);
select is(
  (select no_flip_user_id from wordsy.rounds where game_id = current_setting('t.last')::uuid and num = 2),
  null,
  'two still playing: No Flip leaves the game'
);
select pg_temp.bonus_round(array['ada', 'bea'], array[5, 4]);
select is(
  (select no_flip_user_id from wordsy.rounds where game_id = current_setting('t.last')::uuid and num = 2),
  null,
  'a two-player game never has it'
);

-- The holder may start the clock once a concede leaves two still playing.
select pg_temp.bonus_round(array['ada', 'bea', 'cade'], array[5, 4, 3]);
select pg_temp.as_user(pg_temp.ws_uid('cade'));
select wordsy.concede(current_setting('t.last')::uuid);
select is(
  pg_temp.ws_submit(current_setting('t.last')::uuid, 'ada', 'eee') -> 'data' ->> 'result',
  'submitted',
  'the holder may start the clock once a concede leaves two still playing'
);

select * from finish();
rollback;
