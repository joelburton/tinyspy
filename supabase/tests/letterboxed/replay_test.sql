-- ============================================================
-- Test: letterboxed.replay_board — same twelve letters, empty chain
-- ============================================================
-- The cheapest replay on the roster (the board is immutable data), but it
-- still owns five resets a regression could quietly drop:
--   chains + hints_used + solved  → back to zero,
--   the events log                → deleted (the fold has nothing to replay),
--   the turn pointer              → rewound to seat 0 (the original opener),
--   common.games                  → playing / not terminal (reset_game),
--   solution_revealed             → cleared, so a replayed board is a genuine
--                                   second try, not one with the answer shown.
-- Plus the roster-wide access rule: a club member who is NOT a player of this
-- game cannot restart it (42501 — the nine-game replay convention).

begin;

set search_path = letterboxed, common, public, extensions;

select plan(11);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Replay club', array['ada','bea','cade']) as handle;

-- A TURN game (ada first) so the pointer rewind is exercised too; cade is in
-- the club but NOT in the game.
create temp table g on commit drop as
select * from letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup_turns('ada11111-1111-1111-1111-111111111111'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.lb_board()
);

-- Play it to the WIN, with a hint taken along the way (so every counter the
-- replay must reset is genuinely non-zero first).
select letterboxed.log_help((select id from g), 'kcfil', 'hint');
select letterboxed.submit_word((select id from g), 'adgjbehk');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.submit_word((select id from g), 'kcfil');

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'won',
  'sanity: the board is covered and the game won'
);
select ok(
  (select solution_revealed from common.games where id = (select id from g)),
  'sanity: a win auto-reveals the seeded solution'
);

-- ── The access rule ─────────────────────────────────────────
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select throws_ok(
  format('select letterboxed.replay_board(%L)', (select id from g)),
  '42501',
  'not playing this game',
  'a club member who is not a player cannot restart the game'
);

-- ── The reset ───────────────────────────────────────────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.replay_board((select id from g));

reset role;
select ok(
  (select bool_and(chain = '{}') from letterboxed.players
    where game_id = (select id from g)),
  'replay empties every chain'
);
select is(
  (select sum(hints_used)::int from letterboxed.players
    where game_id = (select id from g)),
  0,
  'replay zeroes hints_used'
);
select is(
  (select count(*)::int from letterboxed.events where game_id = (select id from g)),
  0,
  'replay deletes the log — the history fold starts from nothing'
);
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'replay rewinds the turn pointer to the original opener (seat 0)'
);
select is(
  (select play_state from common.games where id = (select id from g)),
  'playing',
  'replay puts the game back in play'
);
select ok(
  (select not is_terminal from common.games where id = (select id from g)),
  '…and clears the terminal flag (reset_game''s job)'
);
select ok(
  (select not solution_revealed from common.games where id = (select id from g)),
  'replay re-hides the solution — a second try, not an open-book one'
);
-- reset_game ASSIGNS status (no merge), so the fresh blob must state its own
-- zeroes rather than inherit the finished game's readouts.
select is(
  (select status->>'letters_covered' from common.games where id = (select id from g)),
  '0',
  'the fresh status blob states its own zero coverage'
);

select * from finish();
rollback;
