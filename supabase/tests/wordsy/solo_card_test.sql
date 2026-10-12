-- cs-unmet

-- ============================================================
-- Test: the solo card, walked — wordsy._reveal_coop_round
-- ============================================================
-- One player, ada, on the planted table (setup.psql → ws_coop_round), one
-- word a round, the card as Joel transcribed it (src/wordsy/doc.md → The solo
-- card (coop)):
--   1. 15 before the clock on band 1 earns the higher bonus; under 20 moves
--      the timer down
--   2. 15 on band 2 earns the lower bonus; down again, to 3
--   3. 14 earns nothing; under 20 on band 3 marks a penalty and sets it to 2
--   4. the clock running out ends nothing, and a late 23 earns nothing; 20 or
--      more without a bonus leaves the timer
--   5. 23 before the clock on band 2 earns the lower bonus; 20 or more with a
--      bonus moves the timer up
--   6. 20 on band 1 earns the higher bonus (rounds 4–6: 3); the timer cannot
--      go above 1
--   7. a late 20 earns nothing and stays; the seventh round ends the game
--   8. the total is the best five plus the bonuses less 2 a penalty, and the
--      title follows it; the page's events mark the one round that took the
--      penalty
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(13);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.g', pg_temp.ws_coop_game(array['ada'])::text, true);
create function pg_temp.g() returns uuid language sql as
  $$ select current_setting('t.g')::uuid $$;

-- The round's reveal row and the card after it, in one line.
create function pg_temp.step(p_score int, p_late boolean default false) returns text
language plpgsql as $$
declare e wordsy.events;
begin
  e := pg_temp.ws_coop_round(pg_temp.g(), 'ada', p_score, p_late);
  return format('round %s: %s pts, bonus %s, beat clock %s, on band %s → %s',
                e.num, e.score, e.bonus, e.beat_clock, e.band, pg_temp.ws_card(pg_temp.g()));
end;
$$;

select is(pg_temp.step(15), 'round 1: 15 pts, bonus 2, beat clock t, on band 1 → band 2 · penalties 0',
  '15 before the clock on band 1: the higher bonus; under 20 moves the timer down');
select is(pg_temp.step(15), 'round 2: 15 pts, bonus 1, beat clock t, on band 2 → band 3 · penalties 0',
  '15 on band 2: the lower bonus; down again');
select is(pg_temp.step(14), 'round 3: 14 pts, bonus 0, beat clock t, on band 3 → band 2 · penalties 1',
  '14 earns nothing; under 20 on band 3 is a penalty, and the timer goes to 2');

select pg_temp.envelope_is(
  pg_temp.ws_buzz(pg_temp.g()),
  '{"type":"ok","data":{"result":"expired"}}'::jsonb,
  'round 4: the clock runs out and the round goes on'
);
select is(pg_temp.step(23, p_late => true), 'round 4: 23 pts, bonus 0, beat clock f, on band 2 → band 2 · penalties 1',
  '… a late 23 earns nothing; 20 or more without a bonus leaves the timer');
select is(pg_temp.step(23), 'round 5: 23 pts, bonus 2, beat clock t, on band 2 → band 1 · penalties 1',
  '23 before the clock on band 2: the lower bonus (rounds 4–6: 2); 20 or more with a bonus moves the timer up');
select is(pg_temp.step(20), 'round 6: 20 pts, bonus 3, beat clock t, on band 1 → band 1 · penalties 1',
  '20 on band 1: the higher bonus (rounds 4–6: 3); the timer cannot go above 1');
select is(pg_temp.step(20, p_late => true), 'round 7: 20 pts, bonus 0, beat clock f, on band 1 → band 1 · penalties 1',
  'a late 20 earns nothing and stays');

-- ─── (8) The end ───
reset role;
select is(
  (select ended_at is not null from common.games where id = pg_temp.g()),
  true,
  'the seventh round ends the game'
);
-- Scores 15 15 14 23 23 20 20: the best five 23 23 20 20 15 = 101; bonuses
-- 2 + 1 + 0 + 0 + 2 + 3 + 0 = 8; one penalty: 101 + 8 − 2 = 107.
select is(
  (select game_data -> 'team' from common.games where id = pg_temp.g()),
  '{"total": 107, "nBonuses": 4, "roundScores": [17, 16, 14, 23, 25, 23, 20],
    "band": 1, "nPenalties": 1, "title": "Wordsmith"}'::jsonb,
  'the team: best five plus bonuses less 2 a penalty, 107, a Wordsmith'
);
select is(
  (select p ->> 'total' || ' ' || (p ->> 'finalRanking') || ' ' || (p ->> 'outcome')
     from common.games g, jsonb_array_elements(g.game_data -> 'players') p where g.id = pg_temp.g()),
  '107 1 won',
  '… and the player carries the team''s total, ranked first, won'
);
select is(
  (select summary_data -> 'team' from common.games where id = pg_temp.g()),
  '{"total": 107, "band": 1, "nPenalties": 1, "title": "Wordsmith"}'::jsonb,
  'the summary''s team: the total, the card, the title'
);

select is(
  (select jsonb_agg(e -> 'penalty' order by (e ->> 'num')::int)
     from jsonb_array_elements((select game_data -> 'events' from common.games where id = pg_temp.g())) e),
  '[false, false, true, false, false, false, false]'::jsonb,
  'the page''s events mark round 3, the one that took the penalty'
);

select * from finish();
rollback;
