-- ============================================================
-- Test: letterboxed compete — first to cover the twelve wins
-- ============================================================
-- The compete WIN path through submit_word (gameplay_test covers compete's
-- masking, concede_timeout_test its timeout; this file is the race actually
-- being won). Compete ends on the FIRST solve — the bar is "cover the twelve
-- within the cap", and being first past it is the whole race. Covers:
--   1. covering all twelve ends the game as won_compete
--   2. the blob carries winner_id + the CACHED winner_username (the club
--      listing renders the blob on its own — no follow-up query)
--   3. per-player results: the winner won, the rival lost
--   4. the terminal leaderboard lists both racers
--   5. a rival's chain, hidden all race, is READABLE at terminal
--   6. no further moves once it is over

begin;

set search_path = letterboxed, common, public, extensions;

select plan(8);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Race club', array['ada','bea']) as handle;

create temp table g on commit drop as
select * from letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.lb_board()
);

-- bea gets one word in; ada runs the two-word solution and wins.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.submit_word((select id from g), 'adg');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select letterboxed.submit_word((select id from g), 'adgjbehk');
select letterboxed.submit_word((select id from g), 'kcfil');

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'won_compete',
  'first to cover the twelve ends the race'
);
select is(
  (select status->>'winner_id' from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111',
  'the blob names the winner'
);
select is(
  (select status->>'winner_username' from common.games where id = (select id from g)),
  (select username from common.profiles
    where user_id = 'ada11111-1111-1111-1111-111111111111'),
  'the winner''s username is CACHED into the blob (no follow-up query)'
);
select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true,
  'the winner''s result row says won'
);
select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  false,
  'the rival''s says lost'
);
select is(
  (select jsonb_array_length(status->'leaderboard') from common.games
    where id = (select id from g)),
  2,
  'the terminal leaderboard lists both racers'
);

-- ── The race-privacy seal opens ─────────────────────────────
-- All race long bea saw NULL for ada's chain (gameplay_test pins that);
-- at terminal the mask lifts so the post-mortem can show how it was won.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select chain from letterboxed.players_state
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  array['adgjbehk', 'kcfil'],
  'a rival''s chain becomes readable once the race is over'
);

select throws_ok(
  format('select letterboxed.submit_word(%L, %L)', (select id from g), 'gjb'),
  'P0001',
  'already-ended|',
  'no further moves once it is over'
);

select * from finish();
rollback;
