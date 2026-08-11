-- ============================================================
-- Test: strands terminals — the win, the manual stop, the replay
-- ============================================================
--
-- The win condition is where the tiling invariant becomes a rule the code
-- relies on: "every theme word found" and "every cell consumed" are the same
-- statement, because the hidden words cover all 48 cells exactly. submit_path
-- counts words (the cheaper half of that identity), and test (2) checks the
-- other half actually holds — every cell of the board is spent at the win.
--
-- Terminal vocabulary follows the shared roster (docs/states.md): a coop win is
-- `won`, and the manual stop is `ended` and NEUTRAL — the friends agreed to
-- stop, so nobody won and nobody lost. strands registers hides_solution = true,
-- so end_game deliberately does NOT reveal the answer on a manual stop; the
-- players ask for it with the shared reveal control. Test (7) pins that
-- asymmetry, which is easy to get backwards.

begin;

set search_path = strands, common, public, extensions;

select plan(15);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;

create temp table game on commit drop as
select id from strands.create_game(
  (select handle from club), pg_temp.strands_setup((select puzzle_id from fix)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');

-- ============================================================
-- (1)–(5) Finding every word wins
-- ============================================================
-- Seven of the eight rows first, so the LAST one is what terminalizes — a test
-- that found them in one statement couldn't tell "the win fires on the final
-- word" from "the win fires whenever the count is checked".

select strands.submit_path((select id from game), pg_temp.strands_row_path(r))
  from generate_series(0, 6) r;

select is(
  (select play_state from common.games where id = (select id from game)),
  'playing',
  'seven of eight words found — still playing'
);

create temp table final on commit drop as
select strands.submit_path((select id from game), pg_temp.strands_row_path(7)) as payload;

select is(
  (select payload->>'terminal' from final),
  'true',
  'the eighth word reports the game terminal'
);

select is(
  (select play_state from common.games where id = (select id from game)),
  'won',
  'coop reaches `won` — the shared roster vocabulary, not a game-specific word'
);

select is(
  (select status->>'outcome' from common.games where id = (select id from game)),
  'solved',
  'status.outcome carries strands'' own word for the cause'
);

-- The other half of the tiling identity: counting words was a proxy for
-- consuming the board, and here the proxy is checked against the real thing.
select is(
  (select count(distinct (e->>0) || ',' || (e->>1))
     from strands.events g, lateral jsonb_array_elements(g.path) e
    where g.game_id = (select id from game) and g.result in ('theme','spangram')),
  48::bigint,
  'winning consumed ALL 48 cells — the tiling invariant, checked end to end'
);

-- ============================================================
-- (6)–(7) A win reveals; per-player results are recorded
-- ============================================================

select is(
  (select solution_revealed from common.games where id = (select id from game)),
  true,
  'a win reveals the solution — you produced it to get here'
);

select is(
  (select result from common.game_players
    where game_id = (select id from game)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '{"won": true}'::jsonb,
  'coop wins together — the player who did not trace the last word also won'
);

-- ============================================================
-- (8)–(11) The manual stop is neutral, and does NOT reveal
-- ============================================================

create temp table game2 on commit drop as
select id from strands.create_game(
  (select handle from club), pg_temp.strands_setup((select puzzle_id from fix)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');

select strands.end_game((select id from game2));

select is(
  (select play_state from common.games where id = (select id from game2)),
  'ended',
  'the manual stop is `ended` — not a loss'
);

select is(
  (select status->>'outcome' from common.games where id = (select id from game2)),
  'manual',
  'and says so'
);

select is(
  (select result from common.game_players
    where game_id = (select id from game2)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '{"won": false}'::jsonb,
  'nobody won a game that was simply stopped'
);

-- hides_solution = true, so stopping does NOT hand over the answer. The
-- players ask for it explicitly (common.reveal_solution) if they want it.
select is(
  (select solution_revealed from common.games where id = (select id from game2)),
  false,
  'a manual stop does NOT reveal — strands hides its solution (hides_solution)'
);

select throws_ok(
  format($$ select strands.end_game(%L) $$, (select id from game2)),
  'P0001',
  'game-not-in-play|',
  'ending twice raises — idempotency the FE swallows, as elsewhere'
);

-- ============================================================
-- (12)–(14) Replay wipes the board, the log, and the hint state
-- ============================================================

select strands.replay_board((select id from game));

select is(
  (select count(*) from strands.events where game_id = (select id from game)),
  0::bigint,
  'replay clears the guess log — and with it the found words, which live in it'
);

select is(
  (select play_state || ':' || is_terminal::text || ':' || solution_revealed::text
     from common.games where id = (select id from game)),
  'playing:false:false',
  'replay un-terminals the game AND re-hides the solution'
);

select is(
  (select solution from strands.games_state where id = (select id from game)),
  null,
  'so the answer is a secret again — the point of running a board back'
);

select * from finish();
rollback;
