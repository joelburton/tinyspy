-- cs-blessed-codenamesduet

-- ============================================================
-- Test: winning by finding all 15 agents
-- ============================================================
--
-- The win check lives at the end of submit_guess: after a green
-- reveal, count the total greens; if it's ≥ 15, end the game
-- reached_goal/'solved', won, and clear the clue-giver.
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
-- fires only on the 15th reveal — not the 14th — and that the win
-- records both players as winners and the one turn spent.
--
-- See `create_game_test.sql` for the pgTAP primer.
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(7);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- Create the club + game (single create_game seats both members)
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada','bea']) as handle;
create temp table g on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;

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
-- Turn 2: Bea (now clue-giver) clues, and Ada reveals Bea's unique greens.
-- ============================================================
-- These are positions where Ada's view is *not* green but Bea's
-- view is green — i.e., the 5 N/G + 1 A/G cells from the rulebook
-- table. That's exactly 6 positions.
--
-- Per Duet's "clue-giver's view labels the reveal" rule, when Bea
-- gives a clue and Ada guesses, the reveal uses Bea's view —
-- which is 'G' for all 6 of these cells.
--
-- The 14th green leaves the game being played; the 15th ends it, won.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select submit_clue((select id from g), 'TARGETS', 6);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- Reveal the first 5 of Bea's unique greens (14 total revealed so far).
do $$
declare
  bob_unique int[];
  p int;
begin
  -- Positions where Ada's view != G but Bea's view = G, read off
  -- the two key columns on codenamesduet.games (key_card_a, key_card_b).
  with a as (
    select t.label as la, t.ord
    from codenamesduet.games g,
         jsonb_array_elements_text(g.key_card_a) with ordinality as t(label, ord)
    where g.game_id = (select id from g)
  ),
  b as (
    select t.label as lb, t.ord
    from codenamesduet.games g,
         jsonb_array_elements_text(g.key_card_b) with ordinality as t(label, ord)
    where g.game_id = (select id from g)
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
  (select ended_at from common.games where id = (select id from g)),
  null,
  'the game goes on after only 14 of 15 greens'
);

-- The 15th and final reveal. The answer is NAMED for the ending it caused —
-- `won`, not `agent` — and inside the same RPC call the win check ends the
-- game.
select pg_temp.envelope_is(
  submit_guess(
    (select id from g),
    (select (a.ord - 1)::int
     from codenamesduet.games g,
          jsonb_array_elements_text(g.key_card_a) with ordinality as a(label, ord),
          jsonb_array_elements_text(g.key_card_b) with ordinality as b(label, ord)
     where g.game_id = (select id from g)
       and a.ord = b.ord
       and a.label <> 'G' and b.label = 'G'
       and not exists (
         select 1 from codenamesduet.words w
         where w.game_id = (select id from g)
           and w.position = (a.ord - 1)::int
           and w.revealed_as is not null
       )
     limit 1)
  ),
  '{"type":"ok","outcome":null,"data":{"result":"won","reason":"solved","revealed":"G",
    "found_agents_count":15}}'::jsonb,
  'the 15th green reveal answers ok/won, reason solved'
);

-- (4) The game ends won, by the guesser who found the 15th.
select is(
  (select array[game_ended_outcome, game_ended_reason, game_ended_reason_detail,
                game_ended_by_user_id::text]
     from common.games where id = (select id from g)),
  array['won', 'reached_goal', 'solved', 'ada11111-1111-1111-1111-111111111111'],
  'finding the 15th agent ends the game won, reached_goal / solved, by the guesser'
);

-- (5) …and the club line records that 15th agent: the builder runs after the
-- ending, from the words, so the final count is the full fifteen.
select is(
  (select (clubpage_info->>'found_agents_count')::int from common.games where id = (select id from g)),
  15,
  'the winning reveal records the 15th agent on the club line'
);

-- (6) A coop win is both players' — each ranked 1, won, and solved.
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g) and final_ranking = 1 and outcome = 'won'
      and solved_at is not null),
  2::bigint,
  'the win ranks BOTH players 1, won, and solved'
);

-- (7) …and the turns spent: the budget less what is left. Turn 1 ended on
-- bea's pass; turn 2 is the one the win came in, and a win spends nothing —
-- so one turn of nine.
select is(
  (select max_turns - greatest(max_turns - turn_number + 1, 0) from codenamesduet.games where game_id = (select id from g)),
  1,
  'a guess that ends the game leaves the turns used at budget − the turns left (1 of 9)'
);

-- ============================================================
select * from finish();
rollback;
