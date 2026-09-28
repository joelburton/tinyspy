-- cs-blessed-psychicnum

-- ============================================================
-- Test: psychicnum.submit_guess + request_hint / request_spoiler + submit_timeout
-- ============================================================
--
-- The computer hides THREE secret WORDS among the board words;
-- players win by finding all three. Covers coop AND compete.
--
-- We pin a known board + secrets with a postgres-role UPDATE after
-- create_game (the RPC samples them randomly). The board words are
-- deliberately NON-words (a `z`-prefixed NATO alphabet), so they're
-- guaranteed absent from common.words — that's what makes the request_hint
-- "No hint available" fallback fire deterministically. A real word would
-- carry a clue and defeat that assertion (e.g. "bravo" → "paid assassin").
-- The board:
--   words   = zalpha zbravo zcharlie zdelta zecho zfoxtrot zgolf zhotel
--   secrets = zalpha zbravo zcharlie
-- so zdelta..zhotel are guessable-but-wrong, and a word NOT on the
-- board (e.g. 'zzulu') exercises the board-word guard.
--
-- Every envelope is asserted to carry NO outcome, which is half of one rule:
-- an RPC answers with the FACT (`result`) and the frontend decides
-- what a fact reads as, in one place (src/psychicnum/lib/answer.ts). The other
-- half is that file's own test. An outcome reappearing here is the rule
-- breaking, which is why the null is asserted rather than the key ignored.
--
-- Coop assertions:
--   - a word not on the board is rejected
--   - wrong guess counts up EVERYONE's budget, result 'miss'
--   - finding a secret (not the last) is result 'hit', with
--     `found_all` false — the game continues, and it bumps the caller's
--     players.found_secrets_count
--   - re-guessing a taken word (game-wide) is rejected
--   - request_hint logs a kind='hint' row with the secret's CLUE (or the
--     "No hint available" fallback); request_spoiler logs a kind='spoiler' row
--     with the answer WORD; neither spends budget or finds the secret
--   - finding the LAST secret carries `found_all` true and ends the game
--     reached_goal/won, every teammate ranked 1 and solved
--   - the last-budget wrong guess → resource_exhausted/lost
--   - submit_timeout → timeout/lost
--
-- Compete assertions:
--   - wrong guess counts up ONLY the caller's budget
--   - finding all three (caller's own) carries `found_all` true, and the
--     caller alone is ranked 1 and won
--   - game ends for everyone on the win, even those with budget left
--   - all-exhausted → resource_exhausted/lost, and a spent budget ends
--     that player (`player_ended_at`, reason resource_exhausted) so the
--     presence-pause stops waiting on that racer
--
-- A deleted game: a guess, a hint and a spoiler into a game a friend just
-- deleted are each the shared race (PN485), not a fault.

begin;

set search_path = psychicnum, common, public, extensions;

select plan(45);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada','bea']) as handle;

-- ============================================================
-- COOP — find all three to win
-- ============================================================

create temp table coop_g on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 5, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
)->'data'->>'id')::uuid as id;
reset role;
update psychicnum.games
   set words = array['zalpha','zbravo','zcharlie','zdelta','zecho','zfoxtrot','zgolf','zhotel'],
       secrets = array['zalpha','zbravo','zcharlie']
 where game_id = (select id from coop_g);

-- (1) A word not on the board is rejected
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from coop_g), 'zzulu'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN268",
    "message":"BUG: guess that is not on the board"}'::jsonb,
  'coop: a word not on the board is rejected'
);

-- (2) Non-player rejected
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from coop_g), 'zdelta'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'coop: non-player submit_guess rejected'
);

-- (3) ada submits wrong (zdelta): count up EVERY player's budget
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from coop_g), 'zdelta'),
  '{"type":"ok","outcome":null,
    "data":{"result":"miss","found_all":false}}'::jsonb,
  'coop: a wrong guess is result miss, and carries no outcome'
);

reset role;
select is(
  (select array_agg(guesses_used order by user_id) from psychicnum.players
    where game_id = (select id from coop_g)),
  array[1, 1],
  'coop: wrong guess counts up EVERY player (0→1 of 5 for both)'
);

-- (4) ada finds a secret (zalpha): a hit with found_all false, game continues
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from coop_g), 'zalpha'),
  '{"type":"ok","outcome":null,
    "data":{"result":"hit","found_all":false}}'::jsonb,
  'coop: finding a secret (not the last) is a hit, found_all false'
);

reset role;
select is(
  (select ended_at from common.games where id = (select id from coop_g)),
  null,
  'coop: one secret found keeps the game going'
);

-- (5) ada's found_secrets_count bumped to 1
select is(
  (select found_secrets_count from psychicnum.players
    where game_id = (select id from coop_g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1,
  'coop: a correct guess bumps the caller''s found_secrets_count'
);

-- (6) re-guessing a taken word (game-wide in coop) is rejected
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from coop_g), 'zalpha'),
  '{"type":"not-ok","dbcode":"PN497","severity":"race",
    "message":"Already guessed"}'::jsonb,
  'coop: re-guessing a word another player took is refused'
);

-- (7) request_hint answers with the secret's CLUE (common.words.hint), or the
-- "No hint available" fallback when it has none — and NAMES which, so nothing
-- has to recognize the fallback by its prose. Our pinned secrets are fake (not
-- in common.words), so `no-hint` fires. (The real-clue path is exercised in
-- its own block below.)
select pg_temp.envelope_is(
  psychicnum.request_hint((select id from coop_g)),
  '{"type":"ok","outcome":null,
    "data":{"result":"no-hint","hint":"No hint available"}}'::jsonb,
  'coop: request_hint answers no-hint for a word with no clue'
);

-- (8) the hint is logged as a kind='hint' row...
reset role;
select is(
  (select count(*)::int from psychicnum.events
    where game_id = (select id from coop_g) and kind = 'hint'),
  1,
  'coop: request_hint logs a kind=hint row'
);

-- (9) request_spoiler returns an unfound secret WORD (the answer)...
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  psychicnum.request_spoiler((select id from coop_g)),
  '{"type":"ok","outcome":null,"data":{"result":"spoiler"}}'::jsonb,
  'coop: request_spoiler answers ok/spoiler'
);
-- The WORD it spoiled is one of the two still unfound — asserted separately,
-- because which one it picks is random and only its membership is a rule.
select ok(
  (select word from psychicnum.events
    where game_id = (select id from coop_g) and kind = 'spoiler'
    order by id desc limit 1) = any(array['zbravo','zcharlie']),
  'coop: request_spoiler hands over an as-yet-unfound secret word'
);

-- (10) ...logged as a kind='spoiler' row (and it does NOT find the secret —
-- bea still guesses zbravo + zcharlie below to win)
reset role;
select is(
  (select count(*)::int from psychicnum.events
    where game_id = (select id from coop_g) and kind = 'spoiler'),
  1,
  'coop: request_spoiler logs a kind=spoiler row'
);

-- (10b) `took_turn` — the fact the log records about every row: did this
-- event use up one of the actor's goes? Here that is an accepted guess and
-- nothing else. Nothing in psychicnum READS the column (the per-player budget
-- counters do that); it is what a later "who took fewer turns" comparison
-- counts, and it has to be right at write time or it never will be.
select is(
  (select array_agg(distinct kind order by kind) from psychicnum.events
    where game_id = (select id from coop_g) and took_turn),
  array['guess'],
  'coop: took_turn is true on guesses, and on neither the hint nor the spoiler'
);

-- (11) neither the hint nor the spoiler spent any budget (still 2 used each:
-- one wrong + one find)
select is(
  (select array_agg(guesses_used order by user_id) from psychicnum.players
    where game_id = (select id from coop_g)),
  array[2, 2],
  'coop: request_hint / request_spoiler do not spend the budget'
);

-- (12) bea finds zbravo, then zcharlie (the last) → team wins
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from coop_g), 'zbravo');
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from coop_g), 'zcharlie'),
  '{"type":"ok","outcome":null,
    "data":{"result":"hit","found_all":true}}'::jsonb,
  'coop: finding the last secret returns won'
);

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from coop_g)),
  'reached_goal/solved/won',
  'coop: finding all three ends the game reached_goal, won'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from coop_g) and final_ranking = 1 and outcome = 'won'
      and solved_at is not null),
  2,
  'coop: every teammate is ranked 1, won, and solved on the team win'
);

-- (13) submit_guess on a finished game is rejected
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from coop_g), 'zecho'),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'coop: submit_guess on an ended game rejected'
);

-- ============================================================
-- COOP loss — exhaust the budget without finding all three
-- ============================================================

create temp table coop_loss on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 3, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
)->'data'->>'id')::uuid as id;
reset role;
update psychicnum.games
   set words = array['zalpha','zbravo','zcharlie','zdelta','zecho','zfoxtrot','zgolf','zhotel'],
       secrets = array['zalpha','zbravo','zcharlie']
 where game_id = (select id from coop_loss);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from coop_loss), 'zdelta');
select psychicnum.submit_guess((select id from coop_loss), 'zecho');

-- After 2 wrong, both player budgets at 1, the game still going.
reset role;
select is(
  (select ended_at from common.games where id = (select id from coop_loss)),
  null,
  'coop: 2 wrong guesses keeps the game going'
);

-- 3rd wrong → team loses. The envelope is the CALLER'S result on their own
-- guess (a miss, `lost`), not the game's fate — the loss reaches the FE by
-- realtime.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from coop_loss), 'zfoxtrot'),
  '{"type":"ok","outcome":null,
    "data":{"result":"miss","found_all":false}}'::jsonb,
  'coop: the budget-exhausting wrong guess is still a miss'
);

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from coop_loss)),
  'resource_exhausted/exhausted/lost',
  'coop: 3rd wrong ends the game out of guesses, lost'
);

-- ── The budget-exhausting CORRECT guess ──
-- The same loss, reached by a guess that DID find a secret. The envelope is
-- the caller's own result, so it says `hit` even though the game ends on it:
-- a loss word here would flash a red "Wrong" for a beat before the
-- verdict landed. The game still ends: one of three found.
-- (as_user BEFORE the create: a temp table is owned by whoever creates it, and
-- the reads below run as ada — create it as postgres and they're denied.)
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table coop_loss_hit on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 3, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
)->'data'->>'id')::uuid as id;
reset role;
update psychicnum.games
   set words = array['zalpha','zbravo','zcharlie','zdelta','zecho','zfoxtrot','zgolf','zhotel'],
       secrets = array['zalpha','zbravo','zcharlie']
 where game_id = (select id from coop_loss_hit);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from coop_loss_hit), 'zdelta');
select psychicnum.submit_guess((select id from coop_loss_hit), 'zecho');
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from coop_loss_hit), 'zalpha'),
  '{"type":"ok","outcome":null,
    "data":{"result":"hit","found_all":false}}'::jsonb,
  'coop: the budget-exhausting CORRECT guess still says hit, not a loss value'
);

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from coop_loss_hit)),
  'lost',
  'coop: a correct guess that empties the budget still ends the game'
);

-- The club line's tally must INCLUDE this last find: the builder runs after
-- the ending, from the players' rows, so the final readout says 1/3.
select is(
  (select clubpage_info->>'found_secrets_count'
     from common.games where id = (select id from coop_loss_hit)),
  '1',
  'coop: the exhausting correct guess is counted in the final tally'
);

-- ============================================================
-- COMPETE — each racer must find all three themselves
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table comp_g on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 3, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
)->'data'->>'id')::uuid as id;
reset role;
update psychicnum.games
   set words = array['zalpha','zbravo','zcharlie','zdelta','zecho','zfoxtrot','zgolf','zhotel'],
       secrets = array['zalpha','zbravo','zcharlie']
 where game_id = (select id from comp_g);

-- (1) ada submits wrong (zdelta): count up ONLY ada's budget
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from comp_g), 'zdelta');

reset role;
select is(
  (select array_agg(guesses_used order by user_id) from psychicnum.players
    where game_id = (select id from comp_g)),
  array[1, 0],
  'compete: wrong guess counts up ONLY caller (ada→1, bea stays at 0)'
);

-- (2) bea finds all three on her own → wins
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from comp_g), 'zalpha'),
  '{"type":"ok","outcome":null,
    "data":{"result":"hit","found_all":false}}'::jsonb,
  'compete: finding a secret (not the last) is a hit, found_all false'
);
select psychicnum.submit_guess((select id from comp_g), 'zbravo');
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from comp_g), 'zcharlie'),
  '{"type":"ok","outcome":null,
    "data":{"result":"hit","found_all":true}}'::jsonb,
  'compete: finding the last secret returns won'
);

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_outcome || '/' || game_ended_by_user_id
     from common.games where id = (select id from comp_g)),
  'reached_goal/won/bea22222-2222-2222-2222-222222222222',
  'compete: completing the set ends the game won, by the finder'
);

select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from comp_g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '1/won',
  'compete: the finder is ranked 1 and won'
);

select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from comp_g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'unranked/lost',
  'compete: a racer short of the goal is unranked and lost'
);

-- (3) ada (with budget remaining=2) cannot guess after bea won
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from comp_g), 'zalpha'),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'compete: game ends for everyone on the win, even those with budget left'
);

-- ============================================================
-- COMPETE loss — both exhaust without completing the set
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table comp_loss on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 3, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
)->'data'->>'id')::uuid as id;
reset role;
update psychicnum.games
   set words = array['zalpha','zbravo','zcharlie','zdelta','zecho','zfoxtrot','zgolf','zhotel'],
       secrets = array['zalpha','zbravo','zcharlie']
 where game_id = (select id from comp_loss);

-- ada exhausts on wrong guesses (the already-guessed guard is per-caller in
-- compete, so bea reusing the same words below is fine).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from comp_loss), 'zdelta');
select psychicnum.submit_guess((select id from comp_loss), 'zecho');
select psychicnum.submit_guess((select id from comp_loss), 'zfoxtrot');

-- ada now at 0 budget; trying to guess again raises.
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from comp_loss), 'zgolf'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN272",
    "message":"No guesses left"}'::jsonb,
  'compete: caller with 0 budget cannot submit'
);

-- bea still has 3 — game continues.
reset role;
select is(
  (select ended_at from common.games where id = (select id from comp_loss)),
  null,
  'compete: game still going while opponents have budget'
);

-- …and the common roster hears that ada has ended, which is what keeps ada's
-- closed tab from pausing the game for bea. Not `conceded`: ada played it out.
select is(
  (select player_ended_reason || '/' || player_ended_reason_detail from common.game_players
    where game_id = (select id from comp_loss)
      and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid),
  'resource_exhausted/exhausted',
  'compete: a spent budget ends the player out of guesses, not conceded'
);

select is(
  (select player_ended_at from common.game_players
    where game_id = (select id from comp_loss)
      and user_id = 'bea22222-2222-2222-2222-222222222222'::uuid),
  null,
  'compete: a racer with budget left has not ended'
);

-- bea exhausts too. The last wrong guess (total_remaining → 0) ends it.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from comp_loss), 'zdelta');
select psychicnum.submit_guess((select id from comp_loss), 'zecho');
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from comp_loss), 'zgolf'),
  '{"type":"ok","outcome":null,
    "data":{"result":"miss","found_all":false}}'::jsonb,
  'compete: the all-exhausting wrong guess is still a miss'
);

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_outcome from common.games where id = (select id from comp_loss)),
  'resource_exhausted/lost',
  'compete: all-exhausted ends the game out of guesses, lost'
);

-- ============================================================
-- request_hint — the real-clue path
-- ============================================================
-- The asserts above use fake secrets (no dictionary entry), so they exercise
-- the "No hint available" fallback. Here we pin the board to REAL words that
-- HAVE a clue and confirm request_hint returns an actual clue.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- Five real, clean, 5-letter words that each have a clue (deterministic order).
create temp table hinted on commit drop as
  select array_agg(word order by word) as words
    from (
      select word from common.words
       where hint is not null and len = 5 and slur = 0 and crude = 0
         and american and not slang
       order by word
       limit 5
    ) s;

create temp table hint_g on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 5, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
)->'data'->>'id')::uuid as id;
reset role;
-- Board = the 5 hinted words; secrets = the first 3 (all have clues).
update psychicnum.games
   set words = (select words from hinted),
       secrets = (select words[1:3] from hinted)
 where game_id = (select id from hint_g);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select ok(
  (psychicnum.request_hint((select id from hint_g)) -> 'data' ->> 'hint') in (
    select hint from common.words
     where word in (select unnest(words[1:3]) from hinted)
  ),
  'request_hint returns the actual clue for a word that has one'
);
-- …and NAMES it as the clue case, which is the whole difference from the
-- fallback above: same shape, different `result`.
select pg_temp.envelope_is(
  psychicnum.request_hint((select id from hint_g)),
  '{"type":"ok","outcome":null,"data":{"result":"hint"}}'::jsonb,
  'request_hint answers ok/hint when the word has a clue'
);

-- ============================================================
-- Timeout
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table coop_to on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 7, "word_count": 8, "band": 3, "timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
)->'data'->>'id')::uuid as id;

select lives_ok(
  format($$ select psychicnum.submit_timeout(%L::uuid) $$, (select id from coop_to)),
  'coop: submit_timeout accepts on playing game'
);

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_outcome
          || '/' || coalesce(game_ended_by_user_id::text, 'nobody')
     from common.games where id = (select id from coop_to)),
  'timeout/lost/nobody',
  'coop: submit_timeout ends the game lost, ended by nobody in a free-for-all'
);

-- ============================================================
-- A game a friend deleted
-- ============================================================
-- The delete takes the game's rows and every membership together, so each
-- move into it answers the shared race rather than a fault or "You are not in
-- this game" (docs/envelopes.md → a missing game row is PN485).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gone_g on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 5, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
)->'data'->>'id')::uuid as id;
reset role;
delete from common.games where id = (select id from gone_g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from gone_g), 'zalpha'),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'submit_guess into a deleted game is the shared race (PN485)'
);

select pg_temp.envelope_is(
  psychicnum.request_hint((select id from gone_g)),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'request_hint on a deleted game is the shared race (PN485)'
);

select pg_temp.envelope_is(
  psychicnum.request_spoiler((select id from gone_g)),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'request_spoiler on a deleted game is the shared race (PN485)'
);

-- ============================================================
select * from finish();
rollback;
