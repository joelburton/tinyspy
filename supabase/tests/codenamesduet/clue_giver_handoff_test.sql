-- ============================================================
-- Test: clue-giver hand-off when one seat's agents are all found
-- ============================================================
--
-- Duet rulebook: "If all 9 words that you see as green have been
-- covered by agent cards, tell your partner that he or she has no
-- words left to guess. Your partner will be the one who gives clues
-- on all remaining turns."
--
-- So the clue-giver does NOT strictly alternate once a seat is done:
-- a seat with no unfound agents gives no more clues, and every
-- remaining turn goes to the partner. `_end_turn` enforces this by
-- only handing the clue to the alternation candidate when that seat
-- still has an unfound 'G'; otherwise the current giver keeps it.
--
-- We force a seat "done" by directly marking its green cells as
-- globally contacted (`words.revealed_as = 'G'`) — the same state a
-- run of real guesses would produce — then end turns via `pass_turn`
-- (no need to hunt for an unrevealed neutral cell) and watch who the
-- clue lands on.
--
-- The normal alternating swap (both seats still have agents) is
-- covered in `game_loop_test.sql`; here g2's first turn re-confirms it
-- as a control before the depleted-seat case.
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(7);

\ir ../_shared/setup.psql
\ir setup.psql

-- Ada creates the club; both games seat ada as first clue-giver (seat A),
-- bea as seat B.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada','bea']) as handle;

-- ============================================================
-- Game 1: partner (seat B) is done → seat A keeps every clue
-- ============================================================
create temp table g1 on commit drop as
select * from codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players());

-- Contact all 9 of seat B's agents up front, so B has nothing left to
-- be clued for. (Direct UPDATE — no RPC — so no win check fires; the
-- global green total is only 9 of the 15 needed.) Writes to codenamesduet.*
-- tables aren't granted to `authenticated`, so drop back to the test
-- role for the poke, then resume as a player — same trick as
-- sudden_death_test.sql.
reset role;
update codenamesduet.words
   set revealed_as = 'G'
 where game_id = (select id from g1)
   and position = any(pg_temp.find_position_set((select id from g1), 'B', 'G'));

-- Turn 1: Ada (A) clues, Bea (B) passes → turn ends. The alternation
-- candidate is B, but B is done, so the clue must stay with A.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select submit_clue((select id from g1), 'ONE', 1);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pass_turn((select id from g1));

select is(
  (select current_clue_giver from games where id = (select id from g1)),
  'A',
  'partner (B) done → clue-giver stays A instead of swapping to B'
);
select is(
  (select turn_number from games where id = (select id from g1)),
  2,
  'the turn still advances (a turn was spent, the turn ended)'
);
select is(
  (select turns_remaining from games where id = (select id from g1)),
  8,
  'pass still spends a turn even when the clue-giver is unchanged'
);

-- Turn 2: it is STILL Ada's turn. She clues again, Bea passes again —
-- the clue keeps coming back to A for every remaining turn.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select submit_clue((select id from g1), 'TWO', 1);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pass_turn((select id from g1));

select is(
  (select current_clue_giver from games where id = (select id from g1)),
  'A',
  'still A on the next turn — a done partner never gets the clue back'
);
select is(
  (select turn_number from games where id = (select id from g1)),
  3,
  'turn number keeps advancing across the repeated A turns'
);

-- ============================================================
-- Game 2: control swap, then seat A goes done → seat B keeps the clue
-- ============================================================
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players());

-- Turn 1 (control): both seats still have agents, so the clue swaps
-- A → B exactly like a normal turn end.
select submit_clue((select id from g2), 'CTRL', 1);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pass_turn((select id from g2));

select is(
  (select current_clue_giver from games where id = (select id from g2)),
  'B',
  'control: with both seats live, the clue still swaps A → B normally'
);

-- Now contact all of seat A's agents. B is the clue-giver; the
-- alternation candidate (A) is done, so the clue must stay with B.
reset role;
update codenamesduet.words
   set revealed_as = 'G'
 where game_id = (select id from g2)
   and position = any(pg_temp.find_position_set((select id from g2), 'A', 'G'));

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select submit_clue((select id from g2), 'KEEP', 1);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pass_turn((select id from g2));

select is(
  (select current_clue_giver from games where id = (select id from g2)),
  'B',
  'partner (A) done → clue-giver stays B instead of swapping back to A'
);

-- ============================================================
select * from finish();
rollback;
