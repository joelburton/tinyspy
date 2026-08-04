-- ============================================================
-- Test: strands CONCEDE — a drop-out is OUT, in both directions
-- ============================================================
-- Two halves of one rule:
--
--   **A conceder can't keep playing.** The FE freezes the board on myConceded,
--   but the server is the gate: a submit in flight when the concede commits, or
--   a stale second tab, must be refused — otherwise a conceder could complete
--   the win condition and be recorded the winner (the connections regression
--   this guard is copied from).
--
--   **A conceder can't win.** The forfeit ruling: conceding removes you from
--   the ranking even if a solved row exists for you (solve-then-concede is the
--   odd corner — nonsensical, but reachable by RPC, so the finisher decides).
--   And when EVERYONE concedes, the loss says so: outcome 'conceded'.
--
-- Personas: ada + bea (+ cade for the three-player guard scenario).

begin;

set search_path = strands, common, public, extensions;

select plan(13);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Forfeit club', array['ada','bea','cade']) as handle;
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;
select pg_temp.strands_hint_words();

-- ============================================================
-- (1)–(3) THE GUARD: a conceder gets no more moves
-- ============================================================
-- Three players, so bea's concede leaves a live race behind it.

create temp table g_guard on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix), 5, 1, 4),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid], 'compete');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.concede((select id from g_guard));

select throws_ok(
  format($$ select strands.submit_path(%L::uuid, %L::jsonb) $$,
         (select id from g_guard), pg_temp.strands_row_path(0)::text),
  'P0001', 'you have conceded',
  'a conceded player''s trace is refused — she is out of the race'
);

select throws_ok(
  format($$ select strands.spend_hint(%L::uuid) $$, (select id from g_guard)),
  'P0001', 'you have conceded',
  'and so is her hint spend'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from g_guard)),
  'playing',
  'one concede among three leaves the race running'
);

-- ============================================================
-- (4)–(9) THE FORFEIT: a solved-then-conceded player is ranked OUT
-- ============================================================
-- ada solves on 0 hints… then concedes. bea solves on 1 hint. Without the
-- forfeit rule ada's 0 would win from outside the race.

-- (Created as a persona, not postgres: a temp table made under `reset role`
-- is owned by postgres and unreadable once we act as a player again.)
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_forfeit on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix), 5, 1, 4),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');

select strands.submit_path((select id from g_forfeit), pg_temp.strands_row_path(r))
  from generate_series(0, 7) r;
select strands.concede((select id from g_forfeit));

select is(
  (select play_state from common.games where id = (select id from g_forfeit)),
  'playing',
  'ada''s post-solve concede doesn''t end the game — bea is still racing'
);

-- bea earns and spends a hint (cost 1), giving her a WORSE hint count than
-- ada's — then the mid-race privacy check, then she finishes.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.submit_path((select id from g_forfeit), pg_temp.strands_prefix_path(1, 4));
select strands.spend_hint((select id from g_forfeit));

-- The revealed word is part of bea's answer: mid-race, a rival sees her
-- active_hint_coords as NULL even though the row itself carries them.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select active_hint_coords from strands.players_state
    where game_id = (select id from g_forfeit)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  null,
  'a rival''s active hint is hidden mid-race'
);
reset role;
select isnt(
  (select active_hint_coords from strands.players
    where game_id = (select id from g_forfeit)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  null,
  '…even though the row itself carries the coords (so the null above is the shield, not absence)'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.submit_path((select id from g_forfeit), pg_temp.strands_row_path(r))
  from generate_series(0, 7) r;

select is(
  (select play_state from common.games where id = (select id from g_forfeit)),
  'won_compete',
  'bea finishing ends the game — ada, conceded, no longer counts as racing'
);

select is(
  (select result from common.game_players
    where game_id = (select id from g_forfeit)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '{"won": true}'::jsonb,
  'bea WINS on 1 hint — the only solver still IN the race'
);

select is(
  (select result from common.game_players
    where game_id = (select id from g_forfeit)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '{"won": false}'::jsonb,
  'ada''s 0-hint solve is forfeited by her concede'
);

select is(
  (select status->>'best_hints' from common.games where id = (select id from g_forfeit)),
  '1',
  'and best_hints is the best IN-RACE count, not the forfeited one'
);

-- ============================================================
-- (10)–(12) EVERYONE OUT: the loss names the way it happened
-- ============================================================

create temp table g_all on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix), 5, 1, 4),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select strands.concede((select id from g_all));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.concede((select id from g_all));

select is(
  (select play_state from common.games where id = (select id from g_all)),
  'lost_compete',
  'the last concede ends the game as a collective loss'
);
select is(
  (select status->>'outcome' from common.games where id = (select id from g_all)),
  'conceded',
  '…whose outcome says everyone gave up (not "unsolved" — nobody played it out)'
);
select is(
  (select bool_and(result = '{"won": false}'::jsonb) from common.game_players
    where game_id = (select id from g_all)),
  true,
  'and nobody won'
);

select * from finish();
rollback;
