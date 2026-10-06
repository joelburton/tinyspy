-- cs-unmet

-- ============================================================
-- Test: compete — ranking on sets found, ties, and the conceded rule
-- ============================================================
-- setgame compete is a BEST game with a COLLECTIVE finish: nobody finishes
-- alone, the deck running dry ends it for everyone, and the ranking is sets
-- found with no speed tiebreak. The three things worth pinning are that the
-- leader wins, that a tie leaves co-winners rather than picking one, and that
-- conceding forfeits the win without erasing what you took.

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(13);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Set race', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

reset role;
select is(
  (select title from common.games where id = (select id from g)),
  '#' || upper(left((select id from g)::text, 6)),
  'compete titles the same way — a handle, not a score');

-- ── ada takes the whole deck ─────────────────────────────────────────
create temp table played on commit drop as
select pg_temp.sg_play_out(
  (select id from g), array['ada11111-1111-1111-1111-111111111111'::uuid]) as claims;

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g)),
  'resource_exhausted/cleared/won', 'the deck running out ends the race');
select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won', 'the player with the most sets wins');
select is(
  (select summary_data->'winnerIds' from common.games where id = (select id from g)),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  'a single winner is the summary''s one winner');
select is(
  (select game_ended_by_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'the claim that cleared the table ended the game');
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'unranked/lost', 'the player who claimed nothing is unranked and lost');
select is(
  (select count(*)::int
     from common.games, jsonb_array_elements(game_data->'players') p
    where id = (select id from g) and p->'nSetsFound' is not null),
  2, 'every player carries a count, scorer or not');
select is(
  (select (summary_data->>'nWinnerSets')::int from common.games where id = (select id from g)),
  (select claims::int from played),
  'the winner''s count is every set taken');

-- ── A tie leaves CO-WINNERS ──────────────────────────────────────────
-- One claim each, then the clock. No speed tiebreak exists, so both win.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (setgame.create_game(
  (select handle from club), '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select setgame.submit_set((select id from g2), pg_temp.sg_live((select id from g2)));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select setgame.submit_set((select id from g2), pg_temp.sg_live((select id from g2)));
select setgame.submit_timeout((select id from g2));

reset role;
select is(
  (select jsonb_array_length(summary_data->'winnerIds') from common.games where id = (select id from g2)),
  2, 'a tie lists both winners — picking one would tell the other they lost');
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g2) and final_ranking = 1 and outcome = 'won'),
  2, 'both tied players are ranked 1, won');
select is(
  (select (summary_data->>'winnerIds') || '/' || (summary_data->>'nWinnerSets')
     from common.games where id = (select id from g2)),
  '["ada11111-1111-1111-1111-111111111111", "bea22222-2222-2222-2222-222222222222"]/1',
  'the summary lists both tied winners and the count they share');

-- ── Conceding forfeits the win but keeps the count ───────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select (setgame.create_game(
  (select handle from club), '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

-- ada gets two, then drops out; bea takes one and is the only racer left.
select setgame.submit_set((select id from g3), pg_temp.sg_live((select id from g3)));
select setgame.submit_set((select id from g3), pg_temp.sg_live((select id from g3)));
select setgame.concede((select id from g3));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select setgame.submit_set((select id from g3), pg_temp.sg_live((select id from g3)));
select setgame.submit_timeout((select id from g3));

reset role;
select is(
  (select summary_data->'winnerIds' from common.games where id = (select id from g3)),
  '["bea22222-2222-2222-2222-222222222222"]'::jsonb,
  'the conceder does not win, even holding more sets');
select is(
  (select n_sets_found from setgame.players
    where game_id = (select id from g3)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  2, 'the conceder keeps the sets she took — she just cannot be crowned');

select * from finish();
rollback;
