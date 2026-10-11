-- cs-unmet

-- ============================================================
-- Test: the coop game's end — wordsy._finish in coop, wordsy._title_for
-- ============================================================
-- Whole games on the planted table (setup.psql → ws_coop_round).
--   1. the titles at their thresholds: 90 Wordprentice, 100 Wordsmith, 110
--      Wordspert, 120 Wordmaster; none under 90
--   2. a solo game under 90 is a loss: the reason pair, ended by the last
--      writer, the player unranked and lost, no title, the penalties counted
--   3. a team of two wins together: both ranked first, each carrying the
--      team's total, the title in both blobs, winnerTotal the team's
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(10);

\ir ../_shared/setup.psql
\ir setup.psql

-- ─── (1) The titles ───
select is(
  (select array_agg(wordsy._title_for(t) order by t)
     from unnest(array[89, 90, 99, 100, 109, 110, 119, 120]) t),
  array[null, 'Wordprentice', 'Wordprentice', 'Wordsmith', 'Wordsmith', 'Wordspert', 'Wordspert', 'Wordmaster'],
  'the titles at 90, 100, 110 and 120; none at 89'
);

-- ─── (2) A loss ───
-- Seven words worth 5: never a bonus, and the timer falls off the card three
-- times (1 → 2 → 3, a penalty and 2 → 3, a penalty and 2 → 3, a penalty and
-- 2). The best five are 25, less 6: 19.
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.l', pg_temp.ws_coop_game(array['ada'])::text, true);
select pg_temp.ws_coop_round(current_setting('t.l')::uuid, 'ada', 5) from generate_series(1, 7);
reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || ' ' || game_ended_outcome
          || ' by ' || (select username from common.profiles where user_id = game_ended_by_user_id)
     from common.games where id = current_setting('t.l')::uuid),
  'resource_exhausted/rounds_played lost by ada',
  'under 90 after seven rounds is a loss, ended by the last writer'
);
select is(
  (select game_data -> 'team' from common.games where id = current_setting('t.l')::uuid),
  '{"total": 19, "nBonuses": 0, "roundScores": [5, 5, 5, 5, 5, 5, 5],
    "band": 2, "nPenalties": 3, "title": null}'::jsonb,
  'the team: 25 less three penalties, no title'
);
select is(
  (select coalesce(p ->> 'finalRanking', 'unranked') || ' ' || (p ->> 'outcome')
     from common.games g, jsonb_array_elements(g.game_data -> 'players') p
    where g.id = current_setting('t.l')::uuid),
  'unranked lost',
  '… the player unranked and lost'
);
select is(
  (select summary_data -> 'team' from common.games where id = current_setting('t.l')::uuid),
  '{"total": 19, "band": 2, "nPenalties": 3, "title": null}'::jsonb,
  '… and the summary says so'
);

-- ─── (3) A team's win ───
-- ada and bea take turns writing 23 before the clock: on band 1 every round,
-- the higher bonus each time, +2 +2 +2 +3 +3 +3 +4 = 19; the best five 115:
-- 134, a Wordmaster.
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.w', pg_temp.ws_coop_game(array['ada', 'bea'])::text, true);
select pg_temp.ws_coop_round(current_setting('t.w')::uuid, case when n % 2 = 1 then 'ada' else 'bea' end, 23)
  from generate_series(1, 7) n;
reset role;
select is(
  (select game_ended_outcome from common.games where id = current_setting('t.w')::uuid),
  'won',
  'ninety or more wins'
);
select is(
  (select jsonb_agg(p ->> 'username' || ' ' || (p ->> 'total') || ' ' || (p ->> 'finalRanking') || ' ' || (p ->> 'outcome') order by o)
     from common.games g, jsonb_array_elements(g.game_data -> 'players') with ordinality as x(p, o)
    where g.id = current_setting('t.w')::uuid),
  '["ada 134 1 won", "bea 134 1 won"]'::jsonb,
  '… the team together: both ranked first, each carrying the team''s total'
);
select is(
  (select game_data -> 'team' from common.games where id = current_setting('t.w')::uuid),
  '{"total": 134, "nBonuses": 7, "roundScores": [25, 25, 25, 26, 26, 26, 27],
    "band": 1, "nPenalties": 0, "title": "Wordmaster"}'::jsonb,
  'the team: the words of both, the bonuses, the title'
);
select is(
  (select summary_data -> 'team' ->> 'title' || ' ' || (summary_data -> 'winnerTotal')
     from common.games where id = current_setting('t.w')::uuid),
  'Wordmaster 134',
  '… the summary''s title and winnerTotal'
);
select is(
  (select count(*)::int from wordsy.events e
    where e.game_id = current_setting('t.w')::uuid and e.user_id = pg_temp.ws_uid('bea')),
  3,
  'each word is logged under its writer'
);

select * from finish();
rollback;
