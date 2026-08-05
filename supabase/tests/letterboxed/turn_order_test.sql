-- ============================================================
-- Test: letterboxed turn-order (opt-in turn-by-turn coop)
-- ============================================================
-- The per-game wiring for the common turn primitive. letterboxed's rules:
--   - submit_word and undo_word BOTH advance the pointer — the undo costing
--     your turn is what makes the chain mean something (a free undo would let
--     one player churn), and it gives the mode its best dynamic: undoing
--     doesn't help YOU, the next player inherits the better position.
--   - clear_chain is refused outright in turn coop: if both actions cost one
--     turn, clearing four words would be strictly cheaper per word than
--     undoing one, inverting the pricing undo establishes.
--   - a REJECTED submit is a misfire, not a turn.
-- Covers:
--   1. create_game seats the pointer on the chosen first player
--   2. an out-of-turn submit is rejected ('not your turn')
--   3. a rejected word does NOT advance the pointer
--   4. an accepted word advances it
--   5. UNDO advances it too — the undo costs the undoer's turn
--   6. clear_chain is refused in turn coop
--   7. free-for-all coop leaves the pointer null (ungated)

begin;

set search_path = letterboxed, common, public, extensions;

select plan(10);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Turns club', array['ada','bea']) as handle;

-- ── The turn game — ada first ───────────────────────────────
create temp table g on commit drop as
select * from letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup_turns('ada11111-1111-1111-1111-111111111111'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.lb_board()
);

-- (1) Pointer seated on ada.
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: create_game seats the pointer on the chosen first player'
);

-- (2) bea submitting out of turn is rejected.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format('select letterboxed.submit_word(%L, %L)', (select id from g), 'adg'),
  'P0001',
  'not your turn',
  'turns: the non-current player is rejected'
);

-- (3) A rejected word is a misfire, not a turn: the pointer stays on ada.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format('select letterboxed.submit_word(%L, %L)', (select id from g), 'zzz'),
  'P0001',
  'ZZZ cannot be played on this board',
  'turns: an unplayable word is refused'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: a rejection does NOT advance the pointer'
);

-- (4) An accepted word advances to bea.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select letterboxed.submit_word((select id from g), 'adg');
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: an accepted word hands the turn on'
);

-- (5) UNDO COSTS THE TURN: bea takes ada's word back and the pointer moves
-- on to ada — the retreat was bea's move.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.undo_word((select id from g));
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: an undo advances the pointer too — it costs the undoer''s turn'
);
select ok(
  (select chain = '{}' from letterboxed.players_state
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'turns: the undo really popped the word'
);

-- (6) clear_chain is not available in turn coop.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format('select letterboxed.clear_chain(%L)', (select id from g)),
  'P0001',
  'clear is not available in turn-by-turn co-op — undo instead',
  'turns: clear is refused (it would undercut undo''s per-turn pricing)'
);

-- ── (7) Free-for-all coop: no pointer, no gate ──────────────
create temp table gf on commit drop as
select * from letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.lb_board()
);

reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from gf)),
  null,
  'free-for-all: the pointer stays null'
);

-- …so anyone may move at any time.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format('select letterboxed.submit_word(%L, %L)', (select id from gf), 'adg'),
  'free-for-all: any player may move (the turn gate is inert)'
);

select * from finish();
rollback;
