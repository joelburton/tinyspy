-- ============================================================
-- Test: winning by finding all 15 agents
-- ============================================================
--
-- The win check lives at the end of submit_guess: after a green
-- reveal, count the total greens; if it's ≥ 15, set status = won
-- and clear the clue-giver.
--
-- Of the 15 unique green agents, 9 are visible on Alice's side
-- and 9 are visible on Bob's side (with 3 overlapping G/G cells).
-- So in any given game:
--   - Alice's 9 view-greens can be revealed when Alice gives a clue
--     (3 G/G + 5 G/N + 1 G/A on her view).
--   - The remaining 6 (5 N/G + 1 A/G on her view) are Bob's unique
--     greens, revealable only when Bob gives a clue.
--
-- We drive that exact sequence with PL/pgSQL loops over the
-- positions found by `find_position_set` and assert the win check
-- fires only on the 15th reveal — not the 14th.
--
-- See `lobby_test.sql` for the pgTAP primer.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(4);

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
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Return all positions where a seat's view has the given label. The
-- positional unnest with ordinality avoids the row_number-vs-SRF trap.
create function pg_temp.find_position_set(g uuid, s text, target text) returns int[]
language sql as $$
  select array_agg((ord - 1)::int order by ord)
  from public.game_players gp,
       jsonb_array_elements_text(gp.key_card) with ordinality as t(label, ord)
  where gp.game_id = g and gp.seat = s and t.label = target;
$$;

-- ============================================================
-- Create + join + start
-- ============================================================

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table g on commit drop as select * from create_game();

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select join_game((select join_code from g));

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select start_game((select id from g));

-- ============================================================
-- Turn 1: Alice gives a clue, Bob reveals all 9 of Alice's
-- view-greens, then passes to end the turn.
-- ============================================================

select submit_clue((select id from g), 'EVERYTHING', 9);

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$
declare
  positions int[];
  p int;
begin
  positions := pg_temp.find_position_set(
    (select id from g),
    'A',  -- Alice's view (she's the clue-giver this turn)
    'G'
  );
  foreach p in array positions loop
    perform submit_guess((select id from g), p);
  end loop;
  -- End the turn without burning further attempts on non-greens.
  perform pass_turn((select id from g));
end $$;

-- ============================================================
-- Turn 2: Bob (now clue-giver) reveals his unique greens.
-- ============================================================
-- These are positions where Alice's view is *not* green but Bob's
-- view is green — i.e., the 5 N/G + 1 A/G cells from the rulebook
-- table. That's exactly 6 positions.
--
-- Per Duet's "clue-giver's view labels the reveal" rule, when Bob
-- gives a clue and Alice guesses, the reveal uses Bob's view —
-- which is 'G' for all 6 of these cells.
--
-- The 14th green keeps status='active'; the 15th flips it to 'won'.

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select submit_clue((select id from g), 'TARGETS', 6);

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');

-- Reveal the first 5 of Bob's unique greens (14 total revealed so far).
do $$
declare
  bob_unique int[];
  p int;
begin
  -- Positions where Alice's view != G but Bob's view = G.
  with a as (
    select t.label as la, t.ord
    from public.game_players gp,
         jsonb_array_elements_text(gp.key_card) with ordinality as t(label, ord)
    where gp.game_id = (select id from g) and gp.seat = 'A'
  ),
  b as (
    select t.label as lb, t.ord
    from public.game_players gp,
         jsonb_array_elements_text(gp.key_card) with ordinality as t(label, ord)
    where gp.game_id = (select id from g) and gp.seat = 'B'
  )
  select array_agg((a.ord - 1)::int order by a.ord)
    into bob_unique
    from a join b using (ord)
    where a.la <> 'G' and b.lb = 'G';

  -- Reveal 5 of the 6 to get to 14 total greens (9 from turn 1 + 5 here).
  for i in 1..5 loop
    perform submit_guess((select id from g), bob_unique[i]);
  end loop;
end $$;

-- (1) and (2): 14 greens revealed, game NOT yet won.
select is(
  (select count(*) from words
   where game_id = (select id from g) and revealed_as = 'G'),
  14::bigint,
  '14 greens have been revealed (sanity)'
);
select is(
  (select status from games where id = (select id from g)),
  'active',
  'status stays active after only 14 of 15 greens'
);

-- The 15th and final reveal. submit_guess returns 'G', and inside the
-- same RPC call the win check flips status.
select is(
  submit_guess(
    (select id from g),
    (select (a.ord - 1)::int
     from public.game_players gpa,
          jsonb_array_elements_text(gpa.key_card) with ordinality as a(label, ord),
          public.game_players gpb,
          jsonb_array_elements_text(gpb.key_card) with ordinality as b(label, ord)
     where gpa.game_id = (select id from g) and gpa.seat = 'A'
       and gpb.game_id = (select id from g) and gpb.seat = 'B'
       and a.ord = b.ord
       and a.label <> 'G' and b.label = 'G'
       and not exists (
         select 1 from public.words w
         where w.game_id = (select id from g)
           and w.position = (a.ord - 1)::int
           and w.revealed_as is not null
       )
     limit 1)
  ),
  'G',
  'the 15th green reveal returns G'
);

-- (4) Status flips to won.
select is(
  (select status from games where id = (select id from g)),
  'won',
  'finding the 15th agent sets status = won'
);

-- ============================================================
select * from finish();
rollback;
