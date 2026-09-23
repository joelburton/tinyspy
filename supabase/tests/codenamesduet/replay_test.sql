-- cs-met-codenamesduet

-- ============================================================
-- Test: codenamesduet.replay_board(target_game)
-- ============================================================
-- A restart is a MULLIGAN: the same board, played again by players who keep
-- whatever they learned of the key cards. What's pinned here is that shape:
--   1. the key cards and the 25 words SURVIVE (it's the same board);
--   2. every reveal, neutral flag and event is wiped;
--   3. the turn budget is re-read from setup (turns_remaining has been
--      decremented all game, so the row can't say what it was) and seat A
--      clues again;
--   4. it works mid-game AND at terminal — no play_state guard, it's a
--      restart — and a non-player is rejected;
--   5. a game deleted under it is the shared race (PN485).
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Duet rp', array['ada', 'bea']) as handle;

create temp table g1 on commit drop as
select (codenamesduet.create_game(
  (select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;

-- Snapshot the board + key cards: a restart must not touch either.
create temp table before_state on commit drop as
select key_card_a, key_card_b from codenamesduet.games where id = (select id from g1);
create temp table before_words on commit drop as
select position, word from codenamesduet.words where game_id = (select id from g1);

-- ─── Play a turn: a clue, then a guess ───
select codenamesduet.submit_clue((select id from g1), 'OCEAN', 2);
reset role;
-- Whoever isn't clueing guesses; ada clues first, so bea guesses.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select codenamesduet.submit_guess((select id from g1), 0);
reset role;

select isnt(
  (select count(*) from codenamesduet.events where game_id = (select id from g1) and kind = 'clue'),
  0::bigint, 'precondition — a clue was given');
select isnt(
  (select count(*) from codenamesduet.events where game_id = (select id from g1) and kind = 'guess'),
  0::bigint, 'precondition — a guess was made');

-- ─── Run it back, mid-game ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format($$ select codenamesduet.replay_board(%L::uuid) $$, (select id from g1)),
  'any player may restart a game that is still in progress');
reset role;

select is(
  (select count(*) from codenamesduet.events where game_id = (select id from g1) and kind = 'clue'),
  0::bigint, 'restart → the clue log is wiped');
select is(
  (select count(*) from codenamesduet.events where game_id = (select id from g1) and kind = 'guess'),
  0::bigint, 'restart → the guess log is wiped');
select is(
  (select count(*) from codenamesduet.words
    where game_id = (select id from g1)
      and (revealed_as is not null or neutral_a or neutral_b)),
  0::bigint, 'restart → every tile is unrevealed and un-neutraled again');
select is(
  (select turns_remaining || '/' || turn_number || '/' || current_clue_giver
     from codenamesduet.games where id = (select id from g1)),
  '9/1/A', 'restart → the turn budget, counter and clue-giver are back to the start');

-- The MULLIGAN property: same board, same key cards.
select is(
  (select count(*) from codenamesduet.words w
     join before_words b on b.position = w.position and b.word = w.word
    where w.game_id = (select id from g1)),
  25::bigint, 'restart → the same 25 words (it is the SAME board)');
select is(
  (select count(*) from codenamesduet.games g
     join before_state b on b.key_card_a = g.key_card_a and b.key_card_b = g.key_card_b
    where g.id = (select id from g1)),
  1::bigint, 'restart → the key cards are unchanged — a mulligan, not a fresh puzzle');

-- ─── Terminal, and non-players ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select codenamesduet.end_game((select id from g1));
select lives_ok(
  format($$ select codenamesduet.replay_board(%L::uuid) $$, (select id from g1)),
  'a finished game can be restarted too — the whole point of the feature');
reset role;

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  codenamesduet.replay_board((select id from g1)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot restart');
reset role;

-- ─── A game a friend just deleted ───
delete from common.games where id = (select id from g1);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  codenamesduet.replay_board((select id from g1)),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'restarting a deleted game is the shared race (PN485)');
reset role;

select * from finish();
rollback;
