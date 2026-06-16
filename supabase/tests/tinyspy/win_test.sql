-- ============================================================
-- Test: winning by finding all 15 agents
-- ============================================================
--
-- The win check lives at the end of submit_guess: after a green
-- reveal, count the total greens; if it's ≥ 15, set status = won
-- and clear the clue-giver.
--
-- Of the 15 unique green agents, 9 are visible on Ada's side
-- and 9 are visible on Bea's side (with 3 overlapping G/G cells).
-- So in any given game:
--   - Ada's 9 view-greens can be revealed when Ada gives a clue
--     (3 G/G + 5 G/N + 1 G/A on her view).
--   - The remaining 6 (5 N/G + 1 A/G on her view) are Bea's unique
--     greens, revealable only when Bea gives a clue.
--
-- We drive that exact sequence with PL/pgSQL loops over the
-- positions found by `find_position_set` and assert the win check
-- fires only on the 15th reveal — not the 14th.
--
-- See `create_game_test.sql` for the pgTAP primer.
-- ============================================================

begin;

set search_path = tinyspy, common, public, extensions;

select plan(4);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Create the club + game (single create_game seats both members)
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('test club', array['ada','bea']);
create temp table g on commit drop as
select * from tinyspy.create_game((select id from club), pg_temp.tinyspy_setup(), pg_temp.tinyspy_players());

-- ============================================================
-- Turn 1: Ada gives a clue, Bea reveals all 9 of Ada's
-- view-greens, then passes to end the turn.
-- ============================================================

select submit_clue((select id from g), 'EVERYTHING', 9);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
do $$
declare
  positions int[];
  p int;
begin
  positions := pg_temp.find_position_set(
    (select id from g),
    'A',  -- Ada's view (she's the clue-giver this turn)
    'G'
  );
  foreach p in array positions loop
    perform submit_guess((select id from g), p);
  end loop;
  -- End the turn without burning further attempts on non-greens.
  perform pass_turn((select id from g));
end $$;

-- ============================================================
-- Turn 2: Bea (now clue-giver) reveals his unique greens.
-- ============================================================
-- These are positions where Ada's view is *not* green but Bea's
-- view is green — i.e., the 5 N/G + 1 A/G cells from the rulebook
-- table. That's exactly 6 positions.
--
-- Per Duet's "clue-giver's view labels the reveal" rule, when Bea
-- gives a clue and Ada guesses, the reveal uses Bea's view —
-- which is 'G' for all 6 of these cells.
--
-- The 14th green keeps status='active'; the 15th flips it to 'won'.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select submit_clue((select id from g), 'TARGETS', 6);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- Reveal the first 5 of Bea's unique greens (14 total revealed so far).
do $$
declare
  bob_unique int[];
  p int;
begin
  -- Positions where Ada's view != G but Bea's view = G. Both
  -- key views are now columns on tinyspy.games (key_card_a,
  -- key_card_b), not rows in a side table.
  with a as (
    select t.label as la, t.ord
    from tinyspy.games g,
         jsonb_array_elements_text(g.key_card_a) with ordinality as t(label, ord)
    where g.id = (select id from g)
  ),
  b as (
    select t.label as lb, t.ord
    from tinyspy.games g,
         jsonb_array_elements_text(g.key_card_b) with ordinality as t(label, ord)
    where g.id = (select id from g)
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
     from tinyspy.games g,
          jsonb_array_elements_text(g.key_card_a) with ordinality as a(label, ord),
          jsonb_array_elements_text(g.key_card_b) with ordinality as b(label, ord)
     where g.id = (select id from g)
       and a.ord = b.ord
       and a.label <> 'G' and b.label = 'G'
       and not exists (
         select 1 from tinyspy.words w
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
