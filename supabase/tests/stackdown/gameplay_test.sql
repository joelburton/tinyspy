-- ============================================================
-- Test: stackdown.submit_word (coop) — reachability, invalid, full solve
-- ============================================================
-- Coop: one shared board, any player advances it. Unreachable tiles are
-- rejected hard; a reachable non-word is a soft "invalid" (logged, not
-- removed); six accepted words clear the board and win, revealing the
-- solution.

begin;
set search_path = stackdown, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(10);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Stack coop', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from stackdown.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

-- ── Unreachable tiles (BROOK can't be reached at the start) ─────────
select throws_ok(
  format($$ select stackdown.submit_word(%L, array[21,4,11,6,2]) $$, (select id from g)),
  'P0001', 'tiles are not reachable in that order',
  'submitting unreachable tiles is rejected');

-- ── A reachable non-word → invalid (logged, no advance) ─────────────
create temp table inv on commit drop as
select stackdown.submit_word((select id from g), pg_temp.sd_invalid()) as res;
select is((select res->>'result' from inv), 'invalid', 'a reachable non-word → invalid');
select is((select res->>'word' from inv), 'TAOOK', 'invalid submission echoes the word');

reset role;
select is(
  (select count(*)::int from stackdown.submissions
    where game_id = (select id from g) and not valid),
  1, 'the invalid attempt is logged (valid = false)');
select is(
  (select found_count from stackdown.players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  0, 'an invalid attempt does not advance found_count');

-- ── First valid word ────────────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select stackdown.submit_word((select id from g), pg_temp.sd_seq(1))->>'result'),
  'accepted', 'TWIXT → accepted');

-- ── Play out the remaining five; the sixth ends the game ─────────────
select stackdown.submit_word((select id from g), pg_temp.sd_seq(2));
select stackdown.submit_word((select id from g), pg_temp.sd_seq(3));
select stackdown.submit_word((select id from g), pg_temp.sd_seq(4));
select stackdown.submit_word((select id from g), pg_temp.sd_seq(5));
create temp table w6 on commit drop as
select stackdown.submit_word((select id from g), pg_temp.sd_seq(6)) as res;
select is((select (res->>'terminal')::boolean from w6), true,
  'the sixth accepted word is terminal');

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'won', 'coop: all six found → play_state won');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g) and (result->>'won')::boolean),
  2::bigint, 'both players recorded as won');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select array_length(solution, 1) from stackdown.games_state where id = (select id from g)),
  6, 'post-terminal: the solution (six words) is revealed');

select * from finish();
rollback;
