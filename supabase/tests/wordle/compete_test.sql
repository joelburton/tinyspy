-- cs-met-wordle

-- ============================================================
-- Test: wordle compete — independent boards, opponent hidden,
--        fewest-guesses winner
-- ============================================================
-- Compete: same hidden target, independent guess sequences. Players
-- don't see each other's guesses until the game ends. The game ends
-- once every player is done; winner = fewest guesses, then the earlier
-- solve — `now()` is constant inside a test transaction, so the tie-break
-- case sets one `solved_at` by hand.

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(20);

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
select target::text as w from wordle.games where id = (select id from g);
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
select is((select (res->'data'->>'terminal')::boolean from a_solve), false,
  'game is NOT terminal yet — bea is still playing');

-- The solver is DONE while bea plays her board out, and the common roster has
-- to hear it: ada's closed tab must not pause the game for bea. Not
-- `conceded` — ada may be about to win this race.
reset role;
select is(
  (select array[locally_terminal, conceded] from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid),
  array[true, false],
  'compete: a solve sets locally_terminal, not conceded'
);
select is(
  (select locally_terminal from common.game_players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'::uuid),
  false,
  'compete: a racer still guessing is not locally terminal'
);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- ada guesses again, having already solved. A FAULT, not a race: the race is
-- still live (bea is playing), so the play_state guard doesn't catch her — and
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
  (select guesses_used from wordle.players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1, 'ada used 1 guess');
select is(
  (select guesses_used from wordle.players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  0, 'bea board untouched (independent boards in compete)');

-- ── Opponent visibility mid-game (as bea) ───────────────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from wordle.events
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  0::bigint,
  'mid-game: bea cannot see ada''s guesses (RLS hides them)');
-- …and the club-list title must not do the leaking for her: common.games.title
-- is readable club-wide (bea reads it here as herself, which is the point),
-- so compete keeps the placeholder for the whole race rather than publishing
-- whoever guessed last.
select is(
  (select title from common.games where id = (select id from g)),
  'New compete',
  'compete: a mid-race guess never lands in the club-wide title');
-- …and the club-wide STATUS carries no guess counter either. The update is
-- coop-only for the same leak reason, so a counter seeded here would sit at a
-- permanent "0 guesses" on the club card — including on a game someone had
-- just WON in three. Absent is honest.
reset role;
select ok(
  (select not (status ? 'guesses_used') from common.games where id = (select id from g)),
  'compete: no guesses_used on the status — absent, not a stale 0');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

-- ── bea solves in 3 guesses (so ada wins on fewest) ─────────
select wordle.submit_guess((select id from g), (select word from vals where rn = 1));
select wordle.submit_guess((select id from g), (select word from vals where rn = 2));
create temp table b_solve on commit drop as
select wordle.submit_guess((select id from g), (select w from tgt)) as res;

select is((select (res->'data'->>'terminal')::boolean from b_solve), true,
  'once every player is done → terminal');

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'won_compete',
  'a winner emerged → won_compete');
select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'ada won — fewest guesses (1 vs 3)');
select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  false, 'bea did not win');

-- ── Post-terminal: the opponent guesses are now revealed ────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from wordle.events
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1::bigint,
  'post-terminal: ada''s guesses are revealed to bea');
-- The race is over, so the title can finally say what the word was.
select is(
  (select title from common.games where id = (select id from g)),
  (select upper(w) from tgt),
  'compete: the finished race titles the game with the answer');
select is(
  (select target from wordle.games_state where id = (select id from g))::text,
  (select w from tgt),
  'post-terminal: the target is revealed');
-- The WINNER's own count, named at terminal — the number the club-list label
-- prints ("Won by ada · 1 guess"). ada solved on her first guess.
select is(
  (select (status->>'winner_guesses')::int from common.games where id = (select id from g)),
  1, 'the terminal status names the winner''s guess count');

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
select target::text as w from wordle.games where id = (select id from g2);
grant select on tgt2 to authenticated;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess((select id from g2), (select w from tgt2));
reset role;
update wordle.players set solved_at = now() + interval '1 minute'
 where game_id = (select id from g2)
   and user_id = 'ada11111-1111-1111-1111-111111111111';
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.submit_guess((select id from g2), (select w from tgt2));
reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'won_compete', 'tie on guesses: the race still has a winner');
select is(
  (select (status->>'winner_user_id')::uuid from common.games where id = (select id from g2)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'tie on guesses: the earlier solved_at wins, not the first to call');

select * from finish();
rollback;
