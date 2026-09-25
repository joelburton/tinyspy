-- cs-unmet

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
--   **A finisher can't concede.** Once you have solved you are out of the race
--   (locally terminal), and conceding then could only throw away a win you may
--   hold, so the server refuses it (PN508) and your solve stays ranked.
--   And when EVERYONE concedes, the loss says so: outcome 'conceded'.
--
-- Personas: ada + bea (+ cade for the three-player guard scenario).

begin;

set search_path = strands, common, public, extensions;

select plan(13);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Forfeit club', array['ada','bea','cade']) as handle;
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;
select pg_temp.strands_hint_words();

-- ============================================================
-- (1)–(3) THE GUARD: a conceder gets no more moves
-- ============================================================
-- Three players, so bea's concede leaves a live race behind it.

create temp table g_guard on commit drop as
select (strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix), 5, 1, 4),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid], 'compete')->'data'->>'id')::uuid as id;

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.concede((select id from g_guard));

select pg_temp.envelope_is(
  strands.submit_path((select id from g_guard), pg_temp.strands_row_path(0)),
  '{"type":"not-ok","severity":"race","dbcode":"PN420",
    "message":"Already conceded"}'::jsonb,
  'a conceded player''s trace is refused — she is out of the race'
);

select pg_temp.envelope_is(
  strands.spend_hint((select id from g_guard)),
  '{"type":"not-ok","severity":"race","dbcode":"PN430",
    "message":"Already conceded"}'::jsonb,
  'and so is her hint spend'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from g_guard)),
  'playing',
  'one concede among three leaves the race running'
);

-- ============================================================
-- (4)–(9) A FINISHER STAYS RANKED: her concede is refused
-- ============================================================
-- ada solves on 0 hints… then tries to concede, and is refused. bea solves on
-- 1 hint. ada's 0 wins.

-- (Created as a persona, not postgres: a temp table made under `reset role`
-- is owned by postgres and unreadable once we act as a player again.)
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_forfeit on commit drop as
select (strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix), 5, 1, 4),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;

select strands.submit_path((select id from g_forfeit), pg_temp.strands_row_path(r))
  from generate_series(0, 7) r;

select pg_temp.envelope_is(
  strands.concede((select id from g_forfeit)),
  '{"type":"not-ok","severity":"race","dbcode":"PN508",
    "message":"Already out"}'::jsonb,
  'ada''s post-solve concede is refused — she is already out, with a solve'
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
  'bea finishing ends the game — the last racer still solving'
);

select is(
  (select result from common.game_players
    where game_id = (select id from g_forfeit)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '{"won": true}'::jsonb,
  'ada WINS on 0 hints — her refused concede left her solve ranked'
);

select is(
  (select result from common.game_players
    where game_id = (select id from g_forfeit)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '{"won": false}'::jsonb,
  'bea''s 1-hint solve loses to it'
);

select is(
  (select status->>'best_hints' from common.games where id = (select id from g_forfeit)),
  '0',
  'and best_hints is ada''s 0'
);

-- ============================================================
-- (10)–(12) EVERYONE OUT: the loss names the way it happened
-- ============================================================

create temp table g_all on commit drop as
select (strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix), 5, 1, 4),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;

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
  (select status->>'reason' from common.games where id = (select id from g_all)),
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
