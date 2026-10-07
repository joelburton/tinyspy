-- cs-unmet

-- ============================================================
-- Test: wordiply endings (stop_game / submit_timeout / replay_board /
--        concede)
-- ============================================================
--
-- Covers the endings other than submit_guess's own (coop's fifth word is in
-- gameplay_test, the race's ranking in winner_test):
--   1. Coop stop_game → stopped/stopped, neutral, nobody ranked, ended by the
--      caller; the team's scores in summary_data. A second Stop, and a guess
--      after the end, are the game-over race.
--   2. Coop submit_timeout → timeout/timeout, lost, nobody ranked; a
--      free-for-all game's timeout is ended by nobody.
--   3. replay_board wipes the events, clears the ending, rebuilds the
--      page blobs.
--   4. Concede (compete): the caller ends, conceded; the last racer's
--      concede ends the game conceded/conceded as a collective loss. Coop
--      refuses a concede.
--   5. Concede when every OTHER player has already spent all 5 guesses: the
--      concede is the last act, so it ends the race — conceded/conceded,
--      the finisher ranked first. A player who has spent five has nothing to
--      concede.
--   6. The fifth word as the last act: once the other racer has conceded,
--      a racer's fifth word ends the race resource_exhausted/complete.
--   7. Compete stop_game: neutral for everyone but a conceder, who lost.
--
-- Guesses are synthetic strings containing 'ar', longer than the base
-- (trusting-commit). max_word_len 7 → lengthScore(7)=100.

begin;

set search_path = wordiply, common, public, extensions;

select plan(42);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;

-- ============================================================
-- (1) Coop stop_game → stopped, neutral, team scores
-- ============================================================

create temp table end_g on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;

-- Two guesses (longest 7) so the ended summary carries real scores.
select wordiply.submit_guess((select id from end_g), 'arxxxxx');  -- 7
select wordiply.submit_guess((select id from end_g), 'arxx');     -- 4

select pg_temp.envelope_is(
  wordiply.stop_game((select id from end_g)),
  '{"type":"ok","data":{"result":"ended"}}'::jsonb,
  'coop stop_game answers ended');

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from end_g)),
  'stopped/stopped/neutral',
  'coop stop_game: the game ends stopped/stopped, neutral'
);

select is(
  (select game_ended_by_user_id from common.games where id = (select id from end_g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'coop stop_game: ada, who stopped it, ended the game'
);

select is(
  (select array_agg(coalesce(final_ranking::text, 'unranked') || '/' || outcome order by user_id)
     from common.game_players where game_id = (select id from end_g)),
  array['unranked/neutral', 'unranked/neutral'],
  'coop stop_game: nobody ranked, every player neutral'
);

select is(
  (select (summary_data->'team'->>'lengthScore')::int from common.games where id = (select id from end_g)),
  100,
  'coop stop_game: summary_data.team.lengthScore = team longest (7) / max (7) = 100'
);

select is(
  (select (summary_data->'team'->>'nLetters')::int from common.games where id = (select id from end_g)),
  11,                                       -- 7 + 4
  'coop stop_game: summary_data.team.nLetters = sum of the team''s guess lengths'
);

select is(
  (select (summary_data->'team'->>'nGuessesUsed')::int from common.games where id = (select id from end_g)),
  2,
  'coop stop_game: summary_data.team.nGuessesUsed = the team''s count'
);

-- A second Stop is the game-over race (the FE swallows it).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordiply.stop_game((select id from end_g)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'coop stop_game: a second call is the game-over race');

select pg_temp.envelope_is(
  wordiply.submit_guess((select id from end_g), 'arzzz'),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'a guess after the game has ended is the game-over race');

-- ============================================================
-- (2) Coop submit_timeout → timeout, lost
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table to_g on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup_timed(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;
select wordiply.submit_guess((select id from to_g), 'arxxx');   -- 5
select pg_temp.envelope_is(
  wordiply.submit_timeout((select id from to_g)),
  '{"type":"ok","data":{"result":"ended"}}'::jsonb,
  'coop submit_timeout answers ended');

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from to_g)),
  'timeout/timeout/lost',
  'coop submit_timeout: the clock is a coop loss (didn''t finish in time)'
);

select is(
  (select game_ended_by_user_id from common.games where id = (select id from to_g)),
  null,
  'coop submit_timeout: free-for-all has no turn holder, so nobody ended it'
);

select is(
  (select array_agg(coalesce(final_ranking::text, 'unranked') || '/' || outcome order by user_id)
     from common.game_players where game_id = (select id from to_g)),
  array['unranked/lost', 'unranked/lost'],
  'coop submit_timeout: nobody ranked, every player lost'
);

-- Every player races to call it; the second finds the game ended.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  wordiply.submit_timeout((select id from to_g)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486"}'::jsonb,
  'coop submit_timeout: a second call is the game-over race');

-- ============================================================
-- (3) replay_board wipes the events, clears the ending
-- ============================================================
-- Reuse end_g (ended, has 2 guesses). Replay must clear the events log,
-- clear the ending, and rebuild the zeroed coop blobs.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordiply.replay_board((select id from end_g));

reset role;
select is(
  (select ended_at from common.games where id = (select id from end_g)),
  null,
  'replay_board: ended_at cleared, the game is playing'
);

select is(
  (select count(*) from wordiply.events where game_id = (select id from end_g)),
  0::bigint,
  'replay_board: the events log is wiped'
);

select is(
  (select (summary_data->'team'->>'nGuessesUsed')::int from common.games where id = (select id from end_g)),
  0,
  'replay_board: summary_data rebuilt at zero (team.nGuessesUsed = 0)'
);

-- The frozen board survives (same base — run it back).
select is(
  (select base from wordiply.games where game_id = (select id from end_g)),
  'ar',
  'replay_board: the frozen board survives (same base)'
);

-- ============================================================
-- (4) Concede (compete): the conceder ends; the last concede ends the game
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table con_g on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;

-- ada concedes → she has ended, the game continues (bea still races).
select pg_temp.envelope_is(
  wordiply.concede((select id from con_g)),
  '{"type":"ok","data":{"result":"conceded"}}'::jsonb,
  'concede answers conceded');
reset role;
select is(
  (
    select player_ended_reason || '/' || player_ended_reason_detail from common.game_players
     where game_id = (select id from con_g)
       and user_id = 'ada11111-1111-1111-1111-111111111111'
  ),
  'conceded/conceded',
  'concede: the conceder has ended, by conceding'
);
select is(
  (select ended_at from common.games where id = (select id from con_g)),
  null,
  'concede: the game continues while bea still races'
);
select is(
  (select p->'ending'->>'reason'
     from jsonb_array_elements((select game_data->'players' from common.games where id = (select id from con_g))) p
    where p->>'id' = 'ada11111-1111-1111-1111-111111111111'),
  'conceded',
  'concede: the conceder''s game_data player says conceded'
);

-- A second concede by the same player is the already-conceded race.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordiply.concede((select id from con_g)),
  '{"type":"not-ok","severity":"race","dbcode":"PN483",
    "message":"Already conceded"}'::jsonb,
  'concede: a second concede is refused');

-- bea (the last racer) concedes → the game ends as a collective loss.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.concede((select id from con_g));
reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from con_g)),
  'conceded/conceded/lost',
  'concede: the last racer conceding ends the game conceded, a collective loss'
);
select is(
  (select game_ended_by_user_id from common.games where id = (select id from con_g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'concede: bea, the last to concede, ended the game'
);
select is(
  (select array_agg(coalesce(final_ranking::text, 'unranked') || '/' || outcome order by user_id)
     from common.game_players where game_id = (select id from con_g)),
  array['unranked/lost', 'unranked/lost'],
  'concede: everyone conceded, so nobody is ranked and everyone lost'
);

-- Coop is a team: it ends through the shared Stop, never a concede.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table coop_con on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;
select pg_temp.envelope_is(
  wordiply.concede((select id from coop_con)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN484",
    "message":"BUG: a concede in a coop game"}'::jsonb,
  'concede: a coop game refuses a concede');

-- ============================================================
-- (5) Concede when the other player has already spent all five
-- ============================================================
-- ada spends all 5 guesses — her race ends, the game plays on because bea
-- has guesses left. bea then concedes: nobody is left racing, so her
-- concession is the act that ends the race, and ada is ranked first.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table done_g on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;

-- ada spends all 5 guesses (distinct, each contains 'ar', longest 7 → 100%).
select wordiply.submit_guess((select id from done_g), 'arxxxxx');  -- 7
select wordiply.submit_guess((select id from done_g), 'arxxxx');   -- 6
select wordiply.submit_guess((select id from done_g), 'arxxx');    -- 5
select wordiply.submit_guess((select id from done_g), 'arxx');     -- 4
select wordiply.submit_guess((select id from done_g), 'arx');      -- 3

-- Still playing: bea hasn't spent her guesses yet.
reset role;
select is(
  (select ended_at from common.games where id = (select id from done_g)),
  null,
  'concede-after-finish: game still playing while bea has < 5 guesses'
);

-- ada's race is over while bea's continues, and the common roster has to
-- hear it: ada's closed tab must not pause the game for bea. Not `conceded` —
-- ada played all five out, and goes on to win this one.
select is(
  (select player_ended_reason || '/' || player_ended_reason_detail from common.game_players
    where game_id = (select id from done_g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid),
  'resource_exhausted/complete',
  'a spent fifth guess ends the racer resource_exhausted/complete, not conceded'
);
select is(
  (select player_ended_at from common.game_players
    where game_id = (select id from done_g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'::uuid),
  null,
  'a player with guesses left has not ended'
);

-- ada has ended already, so there is nothing left for her to concede.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordiply.concede((select id from done_g)),
  '{"type":"not-ok","severity":"race","dbcode":"PN508",
    "message":"Already out"}'::jsonb,
  'a player who spent five cannot concede');

-- ...and has no guesses left.
select pg_temp.envelope_is(
  wordiply.submit_guess((select id from done_g), 'arzz'),
  '{"type":"not-ok","severity":"race","dbcode":"PN366"}'::jsonb,
  'a player who spent five cannot guess again');

-- bea concedes → nobody is left racing, so the race ends here.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.concede((select id from done_g));
reset role;

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from done_g)),
  'conceded/conceded/won',
  'concede-after-finish: the concede ends the race, and there is a winner'
);

select is(
  (select game_ended_by_user_id from common.games where id = (select id from done_g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'concede-after-finish: bea''s concession is the act that ended it'
);

select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from done_g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won',
  'concede-after-finish: ada (the lone finisher) is ranked first and won'
);

select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from done_g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'unranked/lost',
  'concede-after-finish: the conceder is unranked and lost'
);

select is(
  (select pg_temp.winner_ids(summary_data)::text || '/' || (summary_data->>'winnerLengthScore')
     from common.games where id = (select id from done_g)),
  '["ada11111-1111-1111-1111-111111111111"]/100',
  'concede-after-finish: summary_data names ada and her length score'
);

-- ============================================================
-- (6) The fifth word as the last act
-- ============================================================
-- bea concedes first; ada plays on. Her fifth word leaves nobody racing, so
-- it is the act that ends the race.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table fifth_g on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.concede((select id from fifth_g));

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordiply.submit_guess((select id from fifth_g), 'arxxx');
select wordiply.submit_guess((select id from fifth_g), 'arxx');
select wordiply.submit_guess((select id from fifth_g), 'arxy');
select wordiply.submit_guess((select id from fifth_g), 'arxz');
create temp table fifth_ret on commit drop as
select wordiply.submit_guess((select id from fifth_g), 'arxw') as ret;

select isnt(
  (select ended_at from common.games where id = (select id from fifth_g)),
  null,
  'fifth word as last act: the game has ended'
);

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from fifth_g)),
  'resource_exhausted/complete/won',
  'fifth word as last act: the race ends resource_exhausted/complete, won'
);

select is(
  (select game_ended_by_user_id from common.games where id = (select id from fifth_g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'fifth word as last act: ada, who played it, ended the game'
);

-- ============================================================
-- (7) Compete stop_game: neutral, except for a conceder
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table stop_c on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;
select wordiply.submit_guess((select id from stop_c), 'arxxxxx');
select wordiply.concede((select id from stop_c));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.stop_game((select id from stop_c));
reset role;

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from stop_c)),
  'stopped/stopped/neutral',
  'compete stop_game: stopped/stopped, neutral'
);

select is(
  (select array_agg(coalesce(final_ranking::text, 'unranked') || '/' || outcome order by user_id)
     from common.game_players where game_id = (select id from stop_c)),
  array['unranked/lost', 'unranked/neutral', 'unranked/neutral'],
  'compete stop_game: nobody ranked; ada (conceded) lost, the others neutral'
);

-- ============================================================
select * from finish();
rollback;
