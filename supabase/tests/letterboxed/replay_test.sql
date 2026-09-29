-- cs-unmet

-- ============================================================
-- Test: letterboxed.replay_board — same twelve letters, empty chain
-- ============================================================
-- The cheapest replay on the roster (the board is immutable data), but it
-- still owns five resets a regression could quietly drop:
--   chains + hints_used + solved_at → back to zero,
--   the events log                  → deleted (the fold has nothing to replay),
--   the turn pointer                → rewound to seat 0 (the original opener),
--   common.games                    → the ending cleared (_reset_game).
-- Plus the roster-wide access rule: a club member who is NOT a player of this
-- game cannot restart it (PN253 — the replay convention every game follows).

begin;

set search_path = letterboxed, common, public, extensions;

select plan(10);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Replay club', array['ada','bea','cade']) as handle;

-- A TURN game (ada first) so the pointer rewind is exercised too; cade is in
-- the club but NOT in the game.
create temp table g on commit drop as
select (letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup_turns('ada11111-1111-1111-1111-111111111111'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.lb_board()
)->'data'->>'id')::uuid as id;

-- Play it to the WIN, with a hint taken along the way (so every counter the
-- replay must reset is genuinely non-zero first).
-- The one call this suite makes to it, so the rung's envelope is pinned here.
-- `"outcome":null` is written out on purpose: `envelope_is` is containment, so
-- an expected envelope that simply omits the key would pass whatever the server
-- put there. The FE has already shown the hint in its own pill; this answer only
-- says the log agrees, so it carries no word.
select pg_temp.envelope_is(
  letterboxed.log_hint_or_spoiler((select id from g), 'kcfil', 'hint'),
  '{"type":"ok","outcome":null,"data":{"result":"logged","kind":"hint","word":"kcfil"}}'::jsonb,
  'a logged hint echoes the row it wrote and carries no outcome');
select letterboxed.submit_word((select id from g), 'adgjbehk');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.submit_word((select id from g), 'kcfil');

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g)),
  'won',
  'sanity: the board is covered and the game won'
);
-- ── The access rule ─────────────────────────────────────────
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select pg_temp.envelope_is(
  letterboxed.replay_board((select id from g)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a club member who is not a player cannot restart the game');

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
  (select ended_at from common.games where id = (select id from g)),
  null,
  'replay puts the game back in play'
);
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g)
      and (solved_at is not null or final_ranking is not null or outcome is not null)),
  0,
  '…and clears every player''s solve and result (_reset_game''s job)'
);
-- The builder assigns the club line whole, so it states its own zeroes rather
-- than inheriting the finished game's readouts.
select is(
  (select clubpage_info->>'letters_covered_count' from common.games where id = (select id from g)),
  '0',
  'the fresh club line states its own zero coverage'
);

select * from finish();
rollback;
