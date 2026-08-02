-- ============================================================
-- Test: wordiply turn-order (opt-in turn-by-turn coop)
-- ============================================================
-- The per-game wiring for the common turn primitive: create_game seats
-- the rotation when setup.coop_style='turns', and submit_guess gates on
-- _require_turn + advances on an accepted, non-terminal guess.
-- Covers:
--   1. create_game seats the pointer on the chosen first player
--   2. an out-of-turn guess is rejected ('not your turn')
--   3. an accepted guess advances the pointer
--   4. a soft-rejected guess (duplicate) does NOT advance
--   5. free-for-all (no coop_style) leaves the pointer null and ungated
--   6. THE TURN-COST SPLIT (2026-08-02): a STRUCTURAL reject (missing_base /
--      too_short) is a rules error and DOES end the caller's turn; a
--      dictionary miss (not_a_word) does NOT — the shipped word list may be
--      at fault, or it's a typo, and taxing a reach for a long word is
--      backwards in a game whose whole incentive is reaching.
--
-- Base is 'ar'; any longer word containing it is accepted (trusting-commit).
-- ============================================================

begin;
set search_path = wordiply, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(15);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Wordiply turns', array['ada', 'bea']) as handle;

-- ── TURN GAME — ada first ──
create temp table g on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup()
    || jsonb_build_object(
         'coop_style', 'turns',
         'first_turn_user_id', 'ada11111-1111-1111-1111-111111111111'::text),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
);

-- (1) Pointer seated on ada.
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: create_game seats the pointer on the chosen first player'
);

-- (2) bea guessing out of turn is rejected.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select wordiply.submit_guess(%L::uuid, 'arxxxxx') $$, (select id from g)),
  'P0001', 'not your turn',
  'turns: the non-current player is rejected'
);

-- (3) ada (current) submits a valid guess — accepted, advances.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordiply.submit_guess((select id from g), 'arxxxxx')->>'ok',
  'true',
  'turns: the current player''s guess is accepted'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: an accepted guess advances the pointer to bea'
);

-- (4) SOFT-REJECT does NOT advance: it's bea's turn; bea re-guesses ada's
-- word (a shared-board duplicate → soft reject). The pointer stays bea's.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  wordiply.submit_guess((select id from g), 'arxxxxx')->>'reason',
  'duplicate',
  'turns: a duplicate is soft-rejected'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: a soft-rejected guess does NOT advance the turn'
);

-- bea then makes a fresh valid guess → advances back to ada.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess((select id from g), 'arffff');
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: bea''s fresh guess wraps the turn back to ada'
);

-- ── (6) The turn-cost split ─────────────────────────────────
-- It's ada's turn. A word missing the base is a RULES error: logged, and it
-- costs her the go.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordiply.submit_guess((select id from g), 'zzzz')->>'reason',
  'missing_base',
  'turns: a word without the base is rejected'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: a STRUCTURAL reject ends the caller''s turn'
);

-- Now bea submits a word the FE says isn't in the list. Logged, but her turn
-- survives — this is the half that must NOT cost a go.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  wordiply.submit_guess((select id from g), 'arqqqqq', false)->>'reason',
  'not_a_word',
  'turns: the FE''s dictionary verdict is recorded as not_a_word'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: a DICTIONARY miss does NOT end the turn'
);

-- Neither reject spent budget: the board still holds only the accepted pair.
select is(
  (select count(*) from wordiply.guesses where game_id = (select id from g) and valid),
  2::bigint,
  'turns: neither reject spent a guess'
);

-- ── FREE-FOR-ALL (no coop_style) — pointer null, ungated ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ffa on commit drop as
select * from wordiply.create_game(
  (select handle from club), pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from ffa)),
  null,
  'free-for-all: create_game leaves the pointer null'
);
-- bea guesses first (would be out of turn in a turn game) — no gate.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  wordiply.submit_guess((select id from ffa), 'arxxxxx')->>'ok',
  'true',
  'free-for-all: any player may guess in any order'
);


-- ── REPLAY rewinds the pointer to the opener ────────────────
-- The turn game `g` above was seated on ada. Move the pointer off her the way
-- an accepted move does (proven above — done directly here so this assertion
-- doesn't depend on finding another valid word), then replay: the fresh board
-- must start with the ORIGINAL opener holding the turn, not whoever moved last.
reset role;
update common.games
   set current_turn_user_id = 'bea22222-2222-2222-2222-222222222222'::uuid
 where id = (select id from g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordiply.replay_board((select id from g));
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: replay rewinds the turn to the first-seated player'
);

select * from finish();
rollback;
