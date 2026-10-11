-- cs-unmet

-- ============================================================
-- Test: the deal — wordsy._deal_tile and _deal_round
-- ============================================================
-- Each case plants a deck (setup.psql → ws_plant) so the deal is known:
--   1. round 1 deals slots 8 down to 1: the planted table comes out as planted
--   2. a third copy of a letter is skipped, and the next card takes the slot
--   3. a third rare card is skipped, red and blue together
--   4. a skipped card is not discarded: it is dealt when it fits
--   5. a new round slides slots 1–4 into 5–8 and deals 1–4
--   6. a run of sixteen blocked cards is walked past, and the deal goes on
--   7. every table of a played game keeps the rules of two
--   8. Restart replays the same seven tables
-- Card numbers: B 1–4, C 5–8, D 9–12, G 13–16, L 17–20, M 21–24, N 25–28,
-- P 29–32, R 33–36, S 37–40, T 41–44, F 45–46, H 47–48, K 49–50, V 51–52,
-- W 53–54, Y 55–56, J 57, Q 58, X 59, Z 60.
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(10);

\ir ../_shared/setup.psql
\ir setup.psql

create function pg_temp.tiles(p_gid uuid, p_num int) returns smallint[]
language sql as $$
  select tiles from wordsy.rounds where game_id = p_gid and num = p_num
$$;

-- Play one round out: ada submits a word of vowels (worth 0), the clock runs
-- out, and unless the game is over both press Start.
create function pg_temp.play_round(p_gid uuid, p_n int) returns void
language plpgsql as $$
begin
  perform pg_temp.ws_submit(p_gid, 'ada', pg_temp.ws_word(0, p_n));
  perform pg_temp.ws_buzz(p_gid);
  perform set_config('role', 'postgres', true);
  if (select ended_at from common.games where id = p_gid) is null then
    perform pg_temp.ws_start_all(p_gid);
  end if;
end;
$$;

-- ─── (1) The planted table ───
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.g', pg_temp.ws_game(array['ada', 'bea'])::text, true);
reset role;
select is(
  pg_temp.tiles(current_setting('t.g')::uuid, 1),
  pg_temp.ws_table(),
  'round 1 deals deck[1] into slot 8 down to deck[8] into slot 1'
);

-- ─── (2, 4, 5) A third B skipped, dealt next round; the slide ───
select pg_temp.ws_plant(current_setting('t.g')::uuid, array[1, 2, 3, 5, 9, 13, 17, 21, 25]::smallint[]);
reset role;
select is(
  pg_temp.tiles(current_setting('t.g')::uuid, 1),
  array[25, 21, 17, 13, 9, 5, 2, 1]::smallint[],
  'a third B is skipped and the next card takes its slot'
);
select ok(
  (select 3::smallint <> all(drawn) from wordsy.games where game_id = current_setting('t.g')::uuid),
  '… and the skipped B is not drawn'
);
select pg_temp.play_round(current_setting('t.g')::uuid, 1);
select is(
  (pg_temp.tiles(current_setting('t.g')::uuid, 2))[5:8],
  array[25, 21, 17, 13]::smallint[],
  'round 2 slides slots 1–4 into 5–8'
);
select is(
  (pg_temp.tiles(current_setting('t.g')::uuid, 2))[4],
  3::smallint,
  'the skipped B is dealt first once the Bs have left the table'
);

-- ─── (3) A third rare skipped ───
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.r', pg_temp.ws_game(array['ada', 'bea'])::text, true);
select pg_temp.ws_plant(current_setting('t.r')::uuid,
  array[45, 47, 57, 1, 5, 9, 13, 17, 21]::smallint[]);
reset role;
select is(
  pg_temp.tiles(current_setting('t.r')::uuid, 1),
  array[21, 17, 13, 9, 5, 1, 47, 45]::smallint[],
  'a third rare card is skipped, a blue after two reds'
);

-- ─── (6) A run of blocked cards ───
-- Round 1 puts B B F H in slots 1–4, so round 2's table holds two Bs and two
-- rares while it deals: B3, B4 and every other rare — sixteen cards — come
-- next in the deck, and all are walked past to G13.
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.b', pg_temp.ws_game(array['ada', 'bea'])::text, true);
select pg_temp.ws_plant(current_setting('t.b')::uuid,
  array[10, 9, 6, 5, 47, 45, 2, 1, 3, 4, 46]::smallint[]
  || array(select n::smallint from generate_series(48, 60) n)
  || array[13]::smallint[]);
reset role;
select pg_temp.play_round(current_setting('t.b')::uuid, 1);
select is(
  pg_temp.tiles(current_setting('t.b')::uuid, 2),
  array[11, 8, 7, 13, 1, 2, 45, 47]::smallint[],
  'sixteen blocked cards are walked past, and the round still deals'
);

-- ─── (7, 8) Seven tables, kept and replayed ───
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.p', pg_temp.ws_game(array['ada', 'bea'])::text, true);
-- The rest of the deck ascending: B1–B4 in a row, every letter's four
-- together, so the rules of two refuse a card at nearly every deal.
select pg_temp.ws_plant(current_setting('t.p')::uuid, '{}'::smallint[]);
reset role;
select pg_temp.play_round(current_setting('t.p')::uuid, n) from generate_series(1, 7) n;

create temp table first_play on commit drop as
select num, tiles from wordsy.rounds where game_id = current_setting('t.p')::uuid;

select is(
  (select count(*)::int from first_play f
    where (select max(c) from (select count(*) c from unnest(f.tiles) t
                                group by wordsy._tile_letter(t)) x) > 2
       or (select count(*) from unnest(f.tiles) t where wordsy._tile_bonus(t) > 0) > 2),
  0,
  'all seven tables keep the rules of two'
);
select is(
  (select ended_at is not null from common.games where id = current_setting('t.p')::uuid),
  true,
  'seven rounds end the game'
);

select pg_temp.as_user(pg_temp.ws_uid('bea'));
select wordsy.replay_board(current_setting('t.p')::uuid);
reset role;
select pg_temp.play_round(current_setting('t.p')::uuid, n) from generate_series(1, 7) n;
select is(
  (select array_agg(tiles order by num) from wordsy.rounds where game_id = current_setting('t.p')::uuid),
  (select array_agg(tiles order by num) from first_play),
  'Restart replays the same seven tables'
);

select * from finish();
rollback;
