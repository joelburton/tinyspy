-- ============================================================
-- Test: start_game key card distribution
-- ============================================================
--
-- The hardest piece of game-logic correctness in this codebase is
-- inside start_game: it has to produce a key card whose joint
-- distribution exactly matches the Duet rulebook table
-- (G/G:3, G/N:5, G/A:1, N/G:5, N/N:7, N/A:1, A/G:1, A/N:1, A/A:1).
--
-- This file:
--   1. Runs the full create → join → start flow.
--   2. Checks the resulting games row.
--   3. Verifies the per-seat totals and the joint distribution.
--
-- See `lobby_test.sql` for the pgTAP / auth-simulation primer.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = tinyspy, common, public, extensions;

select plan(7);

-- ============================================================
-- Fixtures
-- ============================================================

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@test.local', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@test.local', now(), now(), now());

create function pg_temp.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ============================================================
-- Drive a complete lobby → start flow
-- ============================================================
-- create_game uses tinyspy.word_pool, which the seed migration populates with 389
-- Duet words on `supabase db reset`. We rely on that — if you run the
-- test without first running db reset, word_pool will be empty and
-- start_game will fail.

-- Alice creates.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table created on commit drop as select * from create_game();

-- Bob joins.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select join_game((select join_code from created));

-- Alice starts.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$ select start_game((select id from created)) $$,
  'start_game succeeds with two seated players and a populated word_pool'
);

-- ============================================================
-- Game-row assertions
-- ============================================================

select is(
  (select status from games where id = (select id from created)),
  'active',
  'status flips from lobby to active'
);

select is(
  (select current_clue_giver from games where id = (select id from created)),
  'A',
  'A is the first clue-giver'
);

select is(
  (select turns_remaining from games where id = (select id from created)),
  9,
  'turns_remaining starts at 9 (per Duet rules)'
);

-- 25 word rows written, all unrevealed.
select is(
  (select count(*) from words
   where game_id = (select id from created) and revealed_as is null),
  25::bigint,
  '25 word rows inserted with revealed_as null'
);

-- ============================================================
-- Per-seat label totals
-- ============================================================
-- Each side of the key card must have exactly 9 green / 13 neutral
-- / 3 assassin. `results_eq(query1, values_query, description)`
-- checks that two row sets are equal, in order. We build the
-- expected set inline with VALUES.

select results_eq(
  $$ select label, count(*)::int from (
       select jsonb_array_elements_text(key_card) as label
       from game_players
       where game_id = (select id from created) and seat = 'A'
     ) sub group by 1 order by 1 $$,
  $$ values ('A'::text, 3), ('G'::text, 9), ('N'::text, 13) $$,
  'seat A view has 3 assassins, 9 greens, 13 neutrals'
);

-- ============================================================
-- Joint distribution
-- ============================================================
-- For each board position we look at both players' labels and
-- count how often each (A_label, B_label) pair occurs. The result
-- must match the rulebook table cell-for-cell.
--
-- `with ordinality` is the standard way to enumerate set-returning
-- function results — without it we'd have to fight with row_number()
-- (it's computed before the SRF expands and you get cross-products).

select results_eq(
  $$
    with
      a as (
        select t.label, t.ord
        from game_players gp,
             jsonb_array_elements_text(gp.key_card) with ordinality as t(label, ord)
        where gp.game_id = (select id from created) and gp.seat = 'A'
      ),
      b as (
        select t.label, t.ord
        from game_players gp,
             jsonb_array_elements_text(gp.key_card) with ordinality as t(label, ord)
        where gp.game_id = (select id from created) and gp.seat = 'B'
      )
    select a.label || '/' || b.label as cell, count(*)::int
    from a join b using (ord)
    group by 1 order by 1
  $$,
  $$
    values ('A/A'::text, 1), ('A/G', 1), ('A/N', 1),
           ('G/A',       1), ('G/G', 3), ('G/N', 5),
           ('N/A',       1), ('N/G', 5), ('N/N', 7)
  $$,
  'joint key card distribution matches the Duet rulebook table exactly'
);

-- ============================================================
-- Wrap-up
-- ============================================================
select * from finish();
rollback;
