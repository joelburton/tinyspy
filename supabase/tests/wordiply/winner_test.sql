-- ============================================================
-- Test: wordiply compete winner resolution (_finish_compete comparator)
-- ============================================================
--
-- The compete winner is a LEXICOGRAPHIC comparator (there is no scalar
-- "final score"):
--   1. higher length_score wins  (length_score = round(100*longest/max))
--   2. tie → higher letter_count wins  (letter_count = sum of guess lengths)
--   3. still tied AND timed → earlier finish wins  (min max(created_at))
--   4. still tied (untimed, or timed-and-simultaneous) → co-winners
-- Terminal state 'won_compete'; common.game_players.result->>'won' true for
-- every winner. status.winner_user_id names the winner when there is exactly
-- ONE, and is null on co-winners (the FE then reads its own won flag).
--
-- All guesses are synthetic strings containing 'ar', longer than the base
-- (trusting-commit — no dictionary). With max_word_length 7:
--   length_score(7)=100, (5)=71, (4)=57, (3)=43.
--
-- Auto-terminal note: a compete game ends the instant EVERY non-conceded
-- player has spent 5 guesses. So the "each spends 5" scenarios resolve
-- automatically on the last guess. The timed-tiebreak scenario deliberately
-- has each player spend only 4 (so it stays playing), controls created_at
-- directly, then fires submit_timeout to resolve on current scores.

begin;

set search_path = wordiply, common, public, extensions;

select plan(9);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Compete club', array['ada','bea']) as handle;

-- ============================================================
-- (1) Higher length_score wins
-- ============================================================
-- ada's longest is 7 (score 100); bea's longest is 5 (score 71). Each
-- spends 5 → the 10th total guess auto-terminates with ada the winner.

create temp table g1 on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
);

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
  (select play_state from common.games where id = (select id from g1)),
  'won_compete',
  'higher length_score: both spend 5 → play_state won_compete'
);

select is(
  (select (status->>'winner_user_id')::uuid from common.games where id = (select id from g1)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'higher length_score: ada (longest 7) is the winner'
);

select is(
  (
    select (result->>'won')::boolean from common.game_players
     where game_id = (select id from g1)
       and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid
  ),
  true,
  'higher length_score: winner''s game_players.result = {won: true}'
);

select is(
  (
    select (result->>'won')::boolean from common.game_players
     where game_id = (select id from g1)
       and user_id = 'bea22222-2222-2222-2222-222222222222'::uuid
  ),
  false,
  'higher length_score: loser''s game_players.result = {won: false}'
);

-- ============================================================
-- (2) Tiebreak: equal length_score → higher letter_count wins
-- ============================================================
-- Both longest 5 (score 71 tie). ada plays five 5-letter words (25 letters);
-- bea plays one 5-letter + four 3-letter (17 letters). ada wins on letters.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
);

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
  (select (status->>'winner_user_id')::uuid from common.games where id = (select id from g2)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'letter_count tiebreak: equal length_score → ada (more total letters) wins'
);

-- ============================================================
-- (3) Timed tiebreak: equal length_score AND letter_count → earlier finish
-- ============================================================
-- A TIMED game. Both play four identical-length guesses (5,4,4,4) → equal
-- length_score AND letter_count. We then set ada's guesses earlier than
-- bea's (now() is transaction-constant, so we control created_at directly),
-- and fire submit_timeout — the comparator's timed branch breaks the tie by
-- earliest finish (min of each player's max(created_at)) → ada wins.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup_timed(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
);

-- ada: 5,4,4,4 (only four → not auto-terminal).
select wordiply.submit_guess((select id from g3), 'arxxx');
select wordiply.submit_guess((select id from g3), 'arxx');
select wordiply.submit_guess((select id from g3), 'arwx');
select wordiply.submit_guess((select id from g3), 'arvx');

-- bea: identical lengths 5,4,4,4 → equal length_score + letter_count.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess((select id from g3), 'arbbb');
select wordiply.submit_guess((select id from g3), 'arbb');
select wordiply.submit_guess((select id from g3), 'arcb');
select wordiply.submit_guess((select id from g3), 'ardb');

-- Make ada finish EARLIER (her max created_at < bea's).
reset role;
update wordiply.guesses set created_at = now() - interval '10 seconds'
 where game_id = (select id from g3)
   and user_id = 'ada11111-1111-1111-1111-111111111111';
update wordiply.guesses set created_at = now() - interval '5 seconds'
 where game_id = (select id from g3)
   and user_id = 'bea22222-2222-2222-2222-222222222222';

-- The countdown expires → submit_timeout resolves the comparator.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordiply.submit_timeout((select id from g3));

reset role;
select is(
  (select (status->>'winner_user_id')::uuid from common.games where id = (select id from g3)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'timed tiebreak: equal length_score AND letter_count → earlier finisher (ada) wins'
);

-- ============================================================
-- (4) Co-winners: fully equal AND untimed → both won
-- ============================================================
-- Untimed game; both play identical-length guess sets → equal length_score
-- AND letter_count. With no timer, step 3 (earlier finish) doesn't apply, so
-- both are co-winners. Both spend 5 → auto-terminal.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g4 on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
);

-- ada: 5,4,4,4,4.
select wordiply.submit_guess((select id from g4), 'arxxx');
select wordiply.submit_guess((select id from g4), 'arxx');
select wordiply.submit_guess((select id from g4), 'arwx');
select wordiply.submit_guess((select id from g4), 'arvx');
select wordiply.submit_guess((select id from g4), 'arux');

-- bea: identical lengths 5,4,4,4,4.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess((select id from g4), 'arbbb');
select wordiply.submit_guess((select id from g4), 'arbb');
select wordiply.submit_guess((select id from g4), 'arcb');
select wordiply.submit_guess((select id from g4), 'ardb');
select wordiply.submit_guess((select id from g4), 'areb');

reset role;
select is(
  (
    select count(*) from common.game_players
     where game_id = (select id from g4)
       and (result->>'won')::boolean
  ),
  2::bigint,
  'co-winners: fully equal + untimed → BOTH players marked won'
);

select is(
  (select status->>'winner_user_id' from common.games where id = (select id from g4)),
  null::text,
  'co-winners: winner_user_id is null (no single winner to name)'
);

-- ============================================================
-- (5) submit_timeout compete resolves the comparator on current scores
-- ============================================================
-- Verified structurally by (3), but assert the leading player wins outright
-- on a plain timeout (no tie): ada leads with a 7-letter guess, bea has none.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g5 on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup_timed(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
);
select wordiply.submit_guess((select id from g5), 'arxxxxx');  -- ada leads, longest 7
select wordiply.submit_timeout((select id from g5));

reset role;
select is(
  (select (status->>'winner_user_id')::uuid from common.games where id = (select id from g5)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'submit_timeout compete: the leader on current scores (ada) wins'
);

-- ============================================================
select * from finish();
rollback;
