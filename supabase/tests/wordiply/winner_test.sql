-- cs-unmet

-- ============================================================
-- Test: wordiply compete ranking (_finish_compete)
-- ============================================================
--
-- The ranking is LEXICOGRAPHIC (there is no scalar "final score"), over
-- every player who didn't concede and scored:
--   1. higher length_score  (length_score = round(100*longest/max))
--   2. tie → higher n_letters  (n_letters = sum of guess lengths)
--   3. still tied → the earlier last accepted word, timed or not
-- Ranked 1 is `won`, ranked lower is `near`; a player left unranked lost.
-- summary_data names the winner and their length score.
--
-- All guesses are synthetic strings containing 'ar', longer than the base
-- (trusting-commit — no dictionary). With max_word_len 7:
--   length_score(7)=100, (5)=71, (4)=57, (3)=43.
--
-- Ending note: a compete game ends the instant nobody is left racing — every
-- player has spent 5 guesses or conceded. So the "each spends 5" scenarios
-- end on the last guess, which is the act that ends them. `now()` is fixed
-- for the whole transaction, so where the last-word tiebreak decides, the
-- test sets created_at directly.

begin;

set search_path = wordiply, common, public, extensions;

select plan(21);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Compete club', array['ada','bea']) as handle;

-- ============================================================
-- (1) Higher length_score wins
-- ============================================================
-- ada's longest is 7 (score 100); bea's longest is 5 (score 71). Each
-- spends 5 → the 10th total guess auto-terminates with ada the winner.

create temp table g1 on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;

-- ada: longest 7.
select wordiply.submit_guess((select id from g1), 'arxxxxx');  -- 7
select wordiply.submit_guess((select id from g1), 'arxxx');    -- 5
select wordiply.submit_guess((select id from g1), 'arxx');     -- 4
select wordiply.submit_guess((select id from g1), 'arx');      -- 3
select wordiply.submit_guess((select id from g1), 'araa');     -- 4

-- bea: longest 5.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess((select id from g1), 'arbbb');    -- 5
select wordiply.submit_guess((select id from g1), 'arbb');     -- 4
select wordiply.submit_guess((select id from g1), 'arb');      -- 3
select wordiply.submit_guess((select id from g1), 'arcc');     -- 4
select wordiply.submit_guess((select id from g1), 'arc');      -- 3

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g1)),
  'resource_exhausted/complete/won',
  'higher length_score: both spend 5 → the last fifth word ends it, won'
);

select is(
  (select game_ended_by_user_id from common.games where id = (select id from g1)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'higher length_score: bea''s fifth word, the last act, ended the game'
);

select is(
  (select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g1)),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  'higher length_score: ada (longest 7) is the winner'
);

select is(
  (select (summary_data->>'winnerLengthScore')::int from common.games where id = (select id from g1)),
  100,
  'higher length_score: summary_data carries the winner''s length score'
);

select is(
  (
    select final_ranking || '/' || outcome from common.game_players
     where game_id = (select id from g1)
       and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid
  ),
  '1/won',
  'higher length_score: the winner is ranked 1, won'
);

select is(
  (
    select final_ranking || '/' || outcome from common.game_players
     where game_id = (select id from g1)
       and user_id = 'bea22222-2222-2222-2222-222222222222'::uuid
  ),
  '2/near',
  'higher length_score: the runner-up is ranked 2, near'
);

-- Once the game has ended, each racer's own scores show on their player.
select is(
  (select (p->>'lengthScore')::int || '/' || (p->>'nLetters')
     from jsonb_array_elements((select game_data->'players' from common.games where id = (select id from g1))) p
    where p->>'id' = 'bea22222-2222-2222-2222-222222222222'),
  '71/19',
  'higher length_score: bea''s game_data player shows her own scores once ended'
);

-- ============================================================
-- (2) Tiebreak: equal length_score → higher n_letters wins
-- ============================================================
-- Both longest 5 (score 71 tie). ada plays five 5-letter words (25 letters);
-- bea plays one 5-letter + four 3-letter (17 letters). ada wins on letters.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;

-- ada: five 5-letter guesses → 25 letters, longest 5.
select wordiply.submit_guess((select id from g2), 'arxxx');
select wordiply.submit_guess((select id from g2), 'aryyy');
select wordiply.submit_guess((select id from g2), 'arzzz');
select wordiply.submit_guess((select id from g2), 'arwww');
select wordiply.submit_guess((select id from g2), 'arvvv');

-- bea: 5,3,3,3,3 → 17 letters, longest 5 (same score, fewer letters).
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess((select id from g2), 'arbbb');
select wordiply.submit_guess((select id from g2), 'arb');
select wordiply.submit_guess((select id from g2), 'arc');
select wordiply.submit_guess((select id from g2), 'ard');
select wordiply.submit_guess((select id from g2), 'are');

reset role;
select is(
  (select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g2)),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  'n_letters tiebreak: equal length_score → ada (more total letters) wins'
);

-- ============================================================
-- (3) Tiebreak on the clock: equal length_score AND n_letters
-- ============================================================
-- A TIMED game. Both play four identical-length guesses (5,4,4,4) → equal
-- length_score AND n_letters. We then set ada's guesses earlier than
-- bea's (now() is transaction-constant, so we control created_at directly),
-- and fire submit_timeout — the earlier last word breaks the tie → ada wins.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup_timed(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;

-- ada: 5,4,4,4 (only four → her race is still on).
select wordiply.submit_guess((select id from g3), 'arxxx');
select wordiply.submit_guess((select id from g3), 'arxx');
select wordiply.submit_guess((select id from g3), 'arwx');
select wordiply.submit_guess((select id from g3), 'arvx');

-- bea: identical lengths 5,4,4,4 → equal length_score + n_letters.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess((select id from g3), 'arbbb');
select wordiply.submit_guess((select id from g3), 'arbb');
select wordiply.submit_guess((select id from g3), 'arcb');
select wordiply.submit_guess((select id from g3), 'ardb');

-- Make ada finish EARLIER (her max created_at < bea's).
reset role;
update wordiply.events set created_at = now() - interval '10 seconds'
 where game_id = (select id from g3)
   and user_id = 'ada11111-1111-1111-1111-111111111111';
update wordiply.events set created_at = now() - interval '5 seconds'
 where game_id = (select id from g3)
   and user_id = 'bea22222-2222-2222-2222-222222222222';

-- The countdown expires → submit_timeout ranks the race as it stands.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordiply.submit_timeout((select id from g3));

reset role;
select is(
  (select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g3)),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  'timed tiebreak: equal length_score AND n_letters → earlier finisher (ada) wins'
);

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/'
          || coalesce(game_ended_by_user_id::text, 'nobody')
     from common.games where id = (select id from g3)),
  'timeout/timeout/nobody',
  'compete timeout: timeout/timeout, ended by nobody'
);

select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from g3)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '2/near',
  'timed tiebreak: the later finisher is ranked 2, near'
);

-- ============================================================
-- (4) Untimed tie: the earlier last word still decides
-- ============================================================
-- Untimed game; both play identical-length guess sets → equal length_score
-- AND n_letters. The earlier last word decides in every race, so there
-- are no co-winners. ada plays her five, her words are dated back, then
-- bea's fifth — the last act — ends the race with ada first.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g4 on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;

-- ada: 5,4,4,4,4.
select wordiply.submit_guess((select id from g4), 'arxxx');
select wordiply.submit_guess((select id from g4), 'arxx');
select wordiply.submit_guess((select id from g4), 'arwx');
select wordiply.submit_guess((select id from g4), 'arvx');
select wordiply.submit_guess((select id from g4), 'arux');

-- bea: identical lengths 5,4,4,4 so far.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess((select id from g4), 'arbbb');
select wordiply.submit_guess((select id from g4), 'arbb');
select wordiply.submit_guess((select id from g4), 'arcb');
select wordiply.submit_guess((select id from g4), 'ardb');

-- ada finished earlier.
reset role;
update wordiply.events set created_at = now() - interval '10 seconds'
 where game_id = (select id from g4)
   and user_id = 'ada11111-1111-1111-1111-111111111111';

-- bea's fifth (4 letters) ties the scores and ends the race.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess((select id from g4), 'areb');

reset role;
select is(
  (
    select array_agg(final_ranking || '/' || outcome order by user_id)
      from common.game_players
     where game_id = (select id from g4)
  ),
  array['1/won', '2/near'],
  'untimed tie: the earlier last word (ada) is ranked 1, bea 2 — no co-winners'
);

select is(
  (select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g4)),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  'untimed tie: summary_data ranks ada first, alone'
);

-- ============================================================
-- (5) submit_timeout compete ranks the race on current scores
-- ============================================================
-- Verified structurally by (3), but assert the leading player wins outright
-- on a plain timeout (no tie): ada leads with a 7-letter guess, bea has none.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g5 on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup_timed(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;
select wordiply.submit_guess((select id from g5), 'arxxxxx');  -- ada leads, longest 7
select wordiply.submit_timeout((select id from g5));

reset role;
select is(
  (select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g5)),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  'submit_timeout compete: the leader on current scores (ada) wins'
);

-- bea scored nothing, so she is not ranked at all.
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from g5)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'unranked/lost',
  'submit_timeout compete: a player who scored nothing is unranked, lost'
);

-- ============================================================
-- (6) A timed race NOBODY played: nobody ranked → a collective loss
-- ============================================================
-- With every player on 0, ranking them all would crown everyone winner of a
-- game nobody touched. The floor in _finish_compete (length_score > 0) ranks
-- nobody instead, so the game is lost: the table had a reachable end (spend
-- your five guesses) and reached none of it.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g6 on commit drop as
  select (wordiply.create_game((select handle from club),
    '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    'compete', pg_temp.wordiply_board())->'data'->>'id')::uuid as id;
select wordiply.submit_timeout((select id from g6));
reset role;
select is((select game_ended_reason || '/' || game_ended_outcome from common.games where id = (select id from g6)),
  'timeout/lost', 'nobody guessed: the clock crowns no one — collective loss');
select is((select count(*)::int from common.game_players
            where game_id = (select id from g6) and final_ranking is not null),
  0, 'nobody guessed: no player is ranked');
select is((select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g6)),
  '[]'::jsonb, 'nobody guessed: nobody ranked first');

-- ============================================================
-- (7) REJECTS MUST NOT REACH ANY SCORE
-- ============================================================
-- The regression the `valid` column exists to avoid, and the one that would
-- fail SILENTLY: a missed `where valid` anywhere in the ranking would let a
-- rejected word's length inflate longest / n_letters, or let a reject count
-- toward the five guesses. So interleave rejects — including one LONGER
-- than every accepted word, which would flip the winner if it leaked.
--
-- bea's accepted longest is 5 (score 71); ada's is 4 (57). But ada throws in
-- 'arzzzzz' (7 letters) which the FE says isn't a word: if it scored, ada
-- would win on length_score AND n_letters.

-- as_user BEFORE the create: a temp table is owned by whoever creates it, and
-- the reads below run as ada/bea — create it as postgres and they are denied.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g7 on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordiply.submit_guess((select id from g7), 'arzzzzz', false);  -- 7, NOT a word
select wordiply.submit_guess((select id from g7), 'zzzz', false);     -- missing_base
select wordiply.submit_guess((select id from g7), 'ar', false);       -- too_short
select wordiply.submit_guess((select id from g7), 'arxx');            -- 4  valid
select wordiply.submit_guess((select id from g7), 'arxy');            -- 4  valid
select wordiply.submit_guess((select id from g7), 'arxz');            -- 4  valid
select wordiply.submit_guess((select id from g7), 'arwx');            -- 4  valid
select wordiply.submit_guess((select id from g7), 'arwy');            -- 4  valid

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess((select id from g7), 'arbbb');   -- 5 valid
select wordiply.submit_guess((select id from g7), 'arbb');    -- 4
select wordiply.submit_guess((select id from g7), 'arb');     -- 3
select wordiply.submit_guess((select id from g7), 'arcc');    -- 4
select wordiply.submit_guess((select id from g7), 'arc');     -- 3

reset role;
-- ada's three rejects did NOT count toward her five, so the game ended only
-- once both had five ACCEPTED guesses.
select is(
  (select game_ended_reason || '/' || game_ended_outcome from common.games where id = (select id from g7)),
  'resource_exhausted/won',
  'rejects: the game still ends on five ACCEPTED guesses each'
);
select is(
  (select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g7)),
  '["bea22222-2222-2222-2222-222222222222"]'::jsonb,
  'rejects: a 7-letter REJECTED word does not win ada the game'
);
-- And the rows are all there — the log kept them, the score ignored them.
select is(
  (select count(*) from wordiply.events
    where game_id = (select id from g7) and not valid),
  3::bigint,
  'rejects: all three are still in the event log'
);

-- ============================================================
select * from finish();
rollback;
