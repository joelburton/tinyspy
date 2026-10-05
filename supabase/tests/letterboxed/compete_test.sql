-- cs-unmet

-- ============================================================
-- Test: letterboxed compete — first to cover the twelve wins
-- ============================================================
-- The compete WIN path through submit_word (gameplay_test covers each
-- racer's own chain, concede_timeout_test the timeout; this file is the race
-- actually being won). Compete ends on the FIRST solve — the bar is "cover the
-- twelve within the cap", and being first past it is the whole race. Covers:
--   1. covering all twelve ends the game reached_goal / solved, won
--   2. the ending names the solver, and the summary carries the winner and
--      their chain's length (it renders on its own — no follow-up query)
--   3. per-player results: the winner ranked 1 and solved, the rival
--      unranked and lost
--   4. each racer in the page blob carries their own chain's length
--   5. the ended game's blob carries the winner's chain for the post-mortem
--   6. no further moves once it is over

begin;

set search_path = letterboxed, common, public, extensions;

select plan(8);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Race club', array['ada','bea']) as handle;

create temp table g on commit drop as
select (letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.lb_board()
)->'data'->>'id')::uuid as id;

-- bea gets one word in; ada runs the two-word solution and wins.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.submit_word((select id from g), 'adg');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select letterboxed.submit_word((select id from g), 'adgjbehk');
select letterboxed.submit_word((select id from g), 'kcfil');

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g)),
  'reached_goal/solved/won',
  'first to cover the twelve ends the race'
);
select is(
  (select game_ended_by_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'the ending names the solver'
);
select is(
  (select (summary_data->'ending'->>'winner') || '/' || (summary_data->>'nWinnerWords')
     from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111/2',
  'the summary carries the winner and their chain length (no follow-up query)'
);
select is(
  (select final_ranking || '/' || outcome || '/' || (solved_at is not null)::text
     from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won/true',
  'the winner is ranked 1, won, and solved'
);
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'unranked/lost',
  'the rival is unranked and lost'
);
select is(
  array[(pg_temp.lb_player((select id from g), 'ada11111-1111-1111-1111-111111111111') ->> 'nWordsUsed'),
        (pg_temp.lb_player((select id from g), 'bea22222-2222-2222-2222-222222222222') ->> 'nWordsUsed')],
  array['2', '1'],
  'each racer carries their own chain length'
);

-- ── The post-mortem ─────────────────────────────────────────
-- Once the game ends, the hook stops withholding a rival's chain, so the
-- blob must carry it for the post-mortem to show how it was won.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  pg_temp.lb_chain((select id from g), 'ada11111-1111-1111-1111-111111111111'),
  array['adgjbehk', 'kcfil'],
  'the ended game''s blob carries the winner''s chain'
);

select pg_temp.envelope_is(
  letterboxed.submit_word((select id from g), 'gjb'),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'no further moves once it is over'
);

select * from finish();
rollback;
