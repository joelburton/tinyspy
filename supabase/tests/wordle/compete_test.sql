-- cs-blessed-wordle

-- ============================================================
-- Test: wordle compete — independent boards, opponent hidden,
--        fewest-guesses winner
-- ============================================================
-- Compete: same hidden target, independent guess sequences. What a racer may
-- see of a rival mid-race is the hook's rule (src/wordle/hooks/useGame.ts),
-- not a policy's: every club member reads every row. The game ends once
-- every player is done; every solver is ranked by fewest guesses, then the
-- earlier solve — `now()` is constant inside a test transaction, so the
-- tie-break case sets one `solved_at` by hand.

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(21);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordle vs', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

reset role;
create temp table tgt on commit drop as
select target::text as w from wordle.games where game_id = (select id from g);
-- Two distinct valid non-target words for bea's wrong guesses.
create temp table vals on commit drop as
select word, row_number() over (order by word) as rn
  from common.words
 where len = 5 and difficulty <= 4 and word <> (select w from tgt)
 limit 2;
-- Grant the postgres-owned temp tables to the personas (authenticated).
grant select on tgt to authenticated;
grant select on vals to authenticated;

-- ── ada solves on her first guess ───────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table a_solve on commit drop as
select wordle.submit_guess((select id from g), (select w from tgt)) as res;
select is((select (res->'data'->>'result') from a_solve), 'correct',
  'ada solves on her first guess');
select is((select (res->'data'->>'game_ended')::boolean from a_solve), false,
  'the game has NOT ended yet — bea is still playing');

-- The solver is DONE while bea plays her board out, and the common roster has
-- to hear it: ada's closed tab must not pause the game for bea. Her ending is
-- the solve, not a concession — ada may be about to win this race.
reset role;
select is(
  (select player_ended_reason || '/' || player_ended_reason_detail
     from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid
      and player_ended_at is not null and solved_at is not null),
  'reached_goal/solved',
  'compete: a solve ends the solver, reached_goal/solved'
);
select is(
  (select player_ended_at from common.game_players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'::uuid),
  null,
  'compete: a racer still guessing has not ended'
);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- ada guesses again, having already solved. A FAULT, not a race: the race is
-- still live (bea is playing), so the game-ended guard doesn't catch her — and
-- it is her OWN row, with the board locked until that row lands, so getting
-- here means a broken client or a stale second tab. Coop never reaches this
-- line at all: solving ends the game there.
select pg_temp.envelope_is(
  wordle.submit_guess((select id from g), (select word from vals where rn = 1)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN257",
    "message":"Already solved"}'::jsonb,
  'compete: guessing after your own solve is a fault'
);

reset role;
select is(
  (select n_guesses_used from wordle.players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1, 'ada used 1 guess');
select is(
  (select n_guesses_used from wordle.players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  0, 'bea board untouched (independent boards in compete)');

-- ── Opponent visibility mid-game (as bea) ───────────────────
-- An opponent's guesses are their strategy, and a racer must not see them
-- mid-race — but the client never reads this table. The game_data blob carries
-- every row, and the hook withholds a rival's; that rule is pinned in
-- src/wordle/hooks/useGame.test.ts.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from wordle.events
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1::bigint,
  'mid-game: bea reads ada''s row — the policy is the club''s, the seat rule is the hook''s');
-- …and the club-list title must not do the leaking for her: common.games.title
-- is readable club-wide (bea reads it here as herself, which is the point),
-- so compete keeps the placeholder for the whole race rather than publishing
-- whoever guessed last.
select is(
  (select title from common.games where id = (select id from g)),
  'New compete',
  'compete: a mid-race guess never lands in the club-wide title');
-- …and the summary carries no guess counter either. The count is coop's
-- alone for the same leak reason, so in compete the key is always present and
-- always null — a counter here would name somebody's progress on the club card.
reset role;
select is(
  (select summary_data->'team' from common.games where id = (select id from g)),
  'null'::jsonb,
  'compete: the summary has no team, so no count');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

-- ── bea solves in 3 guesses (so ada wins on fewest) ─────────
select wordle.submit_guess((select id from g), (select word from vals where rn = 1));
select wordle.submit_guess((select id from g), (select word from vals where rn = 2));
create temp table b_solve on commit drop as
select wordle.submit_guess((select id from g), (select w from tgt)) as res;

select is((select (res->'data'->>'game_ended')::boolean from b_solve), true,
  'once every player is done, the game has ended');

reset role;
-- The last racer's act is the game's reason: bea's solve.
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g)),
  'reached_goal/solved/won',
  'the last racer solving ends the race reached_goal, won');
select is(
  (select game_ended_by_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'the last racer to finish ended the game');
select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won', 'ada ranked 1 — fewest guesses (1 vs 3)');
select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '2/near', 'bea solved too, so she is ranked 2, near');

-- ── After the end: the opponent guesses are now revealed ────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from wordle.events
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1::bigint,
  'after the end: ada''s guesses are revealed to bea');
-- The race is over, so compete's title drops its placeholder and reads the
-- latest guess — bea's solve, so the answer.
select is(
  (select title from common.games where id = (select id from g)),
  (select upper(w) from tgt),
  'compete: the finished race titles the game with its latest guess, the solve');
select is(
  (select game_data->'puzzle'->>'target' from common.games where id = (select id from g)),
  (select w from tgt),
  'after the end: the target is revealed');
-- The WINNER's own count, named at the end — the number the club-list label
-- prints ("Won by ada · 1 guess"). ada solved on her first guess.
select is(
  (select (summary_data->>'nWinnerGuesses')::int from common.games where id = (select id from g)),
  1, 'the summary names the winner''s guess count');

-- ── The tie-break: same count, the earlier solve wins ───────
-- Both solve on the first guess. ada's `solved_at` is pushed a minute into the
-- future before bea solves, so bea's `now()` is the earlier of the two and the
-- count alone cannot pick a winner.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;
reset role;
create temp table tgt2 on commit drop as
select target::text as w from wordle.games where game_id = (select id from g2);
grant select on tgt2 to authenticated;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess((select id from g2), (select w from tgt2));
reset role;
update common.game_players set solved_at = now() + interval '1 minute'
 where game_id = (select id from g2)
   and user_id = 'ada11111-1111-1111-1111-111111111111';
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.submit_guess((select id from g2), (select w from tgt2));
reset role;
select is(
  (select array_agg(final_ranking || '/' || outcome order by user_id)
     from common.game_players where game_id = (select id from g2)),
  array['2/near', '1/won'], 'tie on guesses: the race still ranks one player first');
select is(
  (select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g2)),
  '["bea22222-2222-2222-2222-222222222222"]'::jsonb,
  'tie on guesses: the earlier solved_at wins, not the first to call');

select * from finish();
rollback;
