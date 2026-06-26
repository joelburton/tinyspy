-- ============================================================
-- Test: scrabble.exchange_tiles + scrabble.pass_turn
-- ============================================================
-- Exchange returns tiles to the bag, reshuffles, redraws the same count
-- (needs bag ≥ 7). Pass forfeits a compete turn. Both bump version + the
-- scoreless counter (compete) and advance the turn; coop has no pass.

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(10);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select common.create_club('Exchange', array['ada', 'bea']) as handle;
reset role;

-- ─── Exchange: bag-≥7 gate ───────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gco on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"difficulty": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');
reset role;
select pg_temp.sc_coop((select id from gco), array['A','B','C','D','E','F','G'],
  array['H','I','J']);  -- only 3 in the bag

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok($$
  select scrabble.exchange_tiles((select id from gco), 0, array['A','B'])
$$, 'P0001', null, 'exchange is rejected when the bag holds < 7 tiles');
reset role;

-- ─── Exchange: happy path (coop) ─────────────────────────
select pg_temp.sc_bag((select id from gco),
  array['H','I','J','K','L','M','N','O','P','Q']);  -- 10 in the bag

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table rex on commit drop as
  select scrabble.exchange_tiles((select id from gco), 0, array['A','B']) as res;
reset role;
select is((select res->>'result' from rex), 'exchanged', 'a valid exchange succeeds');
select is((select jsonb_array_length(res->'drawn') from rex), 2,
  'two tiles are drawn to replace the two returned');
select is((select array_length(shared_rack, 1) from scrabble.games where id = (select id from gco)),
  7, 'the rack is still 7 tiles after the swap');
select is((select array_length(bag, 1) from scrabble.games where id = (select id from gco)),
  10, 'the bag count is unchanged (2 returned, 2 drawn)');
select is((select version from scrabble.games where id = (select id from gco)), 1,
  'exchange bumps version');
select is((select kind || ':' || tile_count from scrabble.plays
           where game_id = (select id from gco)), 'exchange:2',
  'the exchange is logged with its tile count');

-- ─── Pass (compete) advances the turn + scoreless count ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gcp on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"difficulty": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');
reset role;
select pg_temp.sc_turn((select id from gcp), 'ada11111-1111-1111-1111-111111111111');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.pass_turn((select id from gcp), 0);
reset role;
select is((select consecutive_scoreless from scrabble.games where id = (select id from gcp)), 1,
  'pass bumps the scoreless counter');
select is((select current_user_id from scrabble.games where id = (select id from gcp)),
  'bea22222-2222-2222-2222-222222222222', 'pass advances the turn');

-- ─── Coop has no pass ────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok($$
  select scrabble.pass_turn((select id from gco), 1)
$$, 'P0001', null, 'passing is rejected in coop (no turns)');

select * from finish();
rollback;
