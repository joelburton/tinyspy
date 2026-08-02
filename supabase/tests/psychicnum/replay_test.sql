-- ============================================================
-- Test: psychicnum.replay_board (restart this board from scratch)
-- ============================================================
-- The "Replay board" menu item / terminal-row Restart. Resets the working
-- state on the SAME game row — the frozen puzzle (words / secrets / mode)
-- stays, everything the players did is wiped. Both modes reset ALL players.
-- Available from a finished game OR mid-game; any game player may call it; a
-- non-player is rejected.
--
-- Two psychicnum-specific things pinned here:
--   - the guess budget is restored from `setup->>'guesses'`, NOT from the
--     players rows (which have been decremented all game and can't say what
--     the budget was);
--   - turn-order coop rewinds the pointer to the player seated first.
--
-- Same non-word board as gameplay_test (a `z`-prefixed NATO alphabet), pinned
-- with a postgres-role UPDATE after create_game since the RPC samples randomly.

begin;

set search_path = psychicnum, common, public, extensions;

select plan(14);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Psychic rp', array['ada','bea']) as handle;

-- ── Coop: lose on budget, then replay → fully reset ─────────
create temp table g1 on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 3, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);
reset role;
update psychicnum.games
   set words = array['zalpha','zbravo','zcharlie','zdelta','zecho','zfoxtrot','zgolf','zhotel'],
       secrets = array['zalpha','zbravo','zcharlie']
 where id = (select id from g1);

-- One right, then two wrong → the shared budget (3) is spent → coop loss.
-- (EVERY guess spends budget, correct or not.) That leaves guess rows,
-- found_secrets_count = 1, a zeroed budget and a terminal game: the full state a
-- replay must undo.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g1), 'zalpha');
select psychicnum.submit_guess((select id from g1), 'zdelta');
select psychicnum.submit_guess((select id from g1), 'zecho');
reset role;

select ok((select is_terminal from common.games where id = (select id from g1)),
  'coop: precondition — the out-of-budget game is terminal');
select is((select count(*) from psychicnum.guesses where game_id = (select id from g1)),
  3::bigint, 'coop: precondition — three guesses are logged');

update common.timers set ticks = 99 where game_id = (select id from g1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.replay_board((select id from g1));
reset role;

select is((select play_state from common.games where id = (select id from g1)),
  'playing', 'coop: replay → play_state back to playing');
select ok((select not is_terminal from common.games where id = (select id from g1)),
  'coop: replay → is_terminal cleared');
select is((select count(*) from psychicnum.guesses where game_id = (select id from g1)),
  0::bigint, 'coop: replay → the guess log is cleared');
select is(
  (select count(*) from psychicnum.players
    where game_id = (select id from g1) and guesses_remaining = 3 and found_secrets_count = 0),
  2::bigint, 'coop: replay → both players back to the full budget, nothing found');
select is(
  (select (status->>'guesses_remaining')::int from common.games where id = (select id from g1)),
  3, 'coop: replay → status shows the shared budget again');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g1) and result is null and not conceded),
  2::bigint, 'coop: replay → per-player results + concede cleared');
select is((select ticks from common.timers where game_id = (select id from g1)),
  0, 'coop: replay → the shared clock is zeroed');

-- ── Compete: status sums the per-player budgets ─────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 3, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);
reset role;
update psychicnum.games
   set words = array['zalpha','zbravo','zcharlie','zdelta','zecho','zfoxtrot','zgolf','zhotel'],
       secrets = array['zalpha','zbravo','zcharlie']
 where id = (select id from g2);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g2), 'zdelta');
select psychicnum.concede((select id from g2));
reset role;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.concede((select id from g2));
reset role;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.replay_board((select id from g2));
reset role;

select ok((select not is_terminal from common.games where id = (select id from g2)),
  'compete: replay → is_terminal cleared');
select is(
  (select (status->>'guesses_remaining')::int from common.games where id = (select id from g2)),
  6, 'compete: replay → status sums both players'' restored budgets');

-- ── Turn-order coop rewinds to the first-seated player ──────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  jsonb_build_object('guesses', 3, 'word_count', 8, 'difficulty', 3,
                     'timer', jsonb_build_object('kind', 'none'),
                     'coop_style', 'turns',
                     'first_turn_user_id', 'ada11111-1111-1111-1111-111111111111'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);
reset role;
update psychicnum.games
   set words = array['zalpha','zbravo','zcharlie','zdelta','zecho','zfoxtrot','zgolf','zhotel'],
       secrets = array['zalpha','zbravo','zcharlie']
 where id = (select id from g3);

-- ada guesses → the turn advances to bea; replay must bring it back to ada.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g3), 'zdelta');
reset role;
select is((select current_turn_user_id from common.games where id = (select id from g3)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'coop turns: precondition — a guess advanced the turn to bea');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.replay_board((select id from g3));
reset role;

select is((select current_turn_user_id from common.games where id = (select id from g3)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'coop turns: replay → the turn rewinds to the first-seated player');

-- ── Non-player rejected ─────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
-- 42501 = common.require_game_player's 'not playing this game'.
select throws_ok(
  format($$ select psychicnum.replay_board(%L::uuid) $$, (select id from g1)),
  '42501', NULL, 'a non-player cannot replay the board');

select * from finish();
rollback;
