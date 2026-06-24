-- ============================================================
-- Test: stackdown.reveal_next_word (the board-verification cheat)
-- ============================================================
-- Returns the next solution word the caller still has to clear, tracking
-- the words cleared so far (coop = shared). Gated like a move: game
-- player only, in-progress only. Defeats the hidden-solution invariant
-- on purpose — it's a playtest/verification aid.

begin;
set search_path = stackdown, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(6);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Stack coop', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from stackdown.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

-- ── At the start, the next word is the first solution word ──────────
select is(
  (select stackdown.reveal_next_word((select id from g))),
  'TWIXT', 'reveal at the start → the first word (TWIXT)');

-- ── A non-player can't peek ─────────────────────────────────────────
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select throws_ok(
  format($$ select stackdown.reveal_next_word(%L) $$, (select id from g)),
  '42501', 'not playing this game',
  'a non-player cannot reveal');

-- ── After clearing the first word, reveal advances ──────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select stackdown.submit_word((select id from g), pg_temp.sd_seq(1)); -- TWIXT
select is(
  (select stackdown.reveal_next_word((select id from g))),
  'QUASH', 'after TWIXT → the next word is QUASH');

-- Coop is shared: bea's reveal sees the same advanced position.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select stackdown.reveal_next_word((select id from g))),
  'QUASH', 'coop: the other player sees the same next word');

-- ── Clear the rest; once all six are gone, reveal is NULL ───────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select stackdown.submit_word((select id from g), pg_temp.sd_seq(2));
select stackdown.submit_word((select id from g), pg_temp.sd_seq(3));
select stackdown.submit_word((select id from g), pg_temp.sd_seq(4));
select stackdown.submit_word((select id from g), pg_temp.sd_seq(5));
select stackdown.submit_word((select id from g), pg_temp.sd_seq(6));

-- The game is terminal now, so reveal is rejected (not in progress) —
-- the post-game reveal lives in games_state.solution instead.
select throws_ok(
  format($$ select stackdown.reveal_next_word(%L) $$, (select id from g)),
  'P0001', 'game is not in progress',
  'once the board is cleared the game is terminal → reveal is closed');

-- And the solution is now openly revealed via games_state.
select is(
  (select solution[6] from stackdown.games_state where id = (select id from g)),
  'WARTY', 'post-terminal: the full solution is readable via games_state');

select * from finish();
rollback;
