-- cs-blessed-spellingbee

-- ============================================================
-- Test: spellingbee.replay_board (restart this board from scratch)
-- ============================================================
-- The Restart action — a menu row all game, a button at the end. Clears the
-- found-words log (the game's only working state), clears the ending,
-- rewrites the statuses as create_game seeds them, and zeroes the shared
-- clock. The frozen board (letters + word lists + target) survives. Any game
-- player may call it, mid-game or after the end; a non-player is rejected.

begin;
set search_path = spellingbee, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(14);

-- ── Coop: find words, manual-end, then replay → fully reset ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Bee replay', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select (spellingbee.create_game(
  (select handle from club), pg_temp.spellingbee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id;

-- Two finds ('bead' from the fixture required list; the pangram) + a manual
-- end → found rows, a non-zero score, and an ended game: what replay undoes.
select spellingbee.submit_word((select id from g1), 'bead', 1, false, false);
select spellingbee.submit_word((select id from g1), 'abcdefg', 17, true, false);
select spellingbee.stop_game((select id from g1));

reset role;
select isnt(
  (select ended_at from common.games where id = (select id from g1)),
  null, 'precondition — the stopped game has ended');
-- Age the shared clock so the replay's clock-zeroing is observable.
update common.timers set ticks = 99 where game_id = (select id from g1);
-- Backdate the statuses' date, to see the replay rewrite them.
update common.games set status_changed_at = now() - interval '1 hour'
 where id = (select id from g1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select spellingbee.replay_board((select id from g1));
reset role;

select is(
  (select status_changed_at from common.games where id = (select id from g1)),
  now(),
  'replay → the statuses are rewritten, which is what wakes every client (a DELETE may not)');

select is(
  (select ended_at from common.games where id = (select id from g1)),
  null, 'replay → the game is no longer ended');
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g1)
      and (player_ended_at is not null or outcome is not null)),
  0, 'replay → every player''s ending is cleared');
select is(
  (select count(*) from spellingbee.found_words where game_id = (select id from g1)),
  0::bigint, 'replay → the found-words log is cleared');
select is(
  (select clubpage_info->>'found_words_score' from common.games where id = (select id from g1)),
  '0', 'replay → clubpage_info.found_words_score reset to 0');
select is(
  (select common._rank_idx((clubpage_info->>'found_words_score')::int,
                           (clubpage_info->>'required_words_score')::int)
     from common.games where id = (select id from g1)),
  0, 'replay → the team rank is back to 0');
select is(
  (select ticks from common.timers where game_id = (select id from g1)),
  0, 'replay → the shared clock is zeroed (a timed game restarts full)');
select is(
  (select outer_letters from spellingbee.games where game_id = (select id from g1))::text,
  'abcdfg', 'replay → the frozen board survives (same letters, run it back)');

-- ── Compete: the rewritten statuses carry the frozen target_rank ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup() || '{"target_rank": 3}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id;
select spellingbee.submit_word((select id from g2), 'bead', 1, false, false);
select spellingbee.replay_board((select id from g2));
reset role;
select is(
  (select clubpage_info->>'target_rank' from common.games where id = (select id from g2)),
  '3', 'compete replay → target_rank survives in the fresh club line');

-- ── Coop: the rewritten statuses carry the frozen target_rank too ──
-- It matters because the club-list label reads the target from the club line:
-- lose it and a replayed game stops advertising what it's aiming at.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select (spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup() || '{"target_rank": 4}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id;
select spellingbee.replay_board((select id from g3));
reset role;
select is(
  (select clubpage_info->>'target_rank' from common.games where id = (select id from g3)),
  '4', 'coop replay → target_rank survives in the fresh club line');
select is(
  (select jsonb_typeof(clubpage_info->'found_words_score') from common.games where id = (select id from g3)),
  'number', 'coop replay → the club line is the coop shape (a team score)');

-- ── Coop with NO target: the key is present and null, not missing ──
-- `target_rank` absent and `target_rank: null` mean the same thing to the FE,
-- but only one of them survives a jsonb round trip unchanged — pin it.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g4 on commit drop as
select (spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup() || '{"target_rank": null}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop',
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id;
select spellingbee.replay_board((select id from g4));
reset role;
select is(
  (select clubpage_info->'target_rank' from common.games where id = (select id from g4)),
  'null'::jsonb, 'coop replay (no target) → target_rank stays present and null, not invented');

-- ── Non-player rejected ─────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
-- PN253 = common._require_game_player's refusal.
select pg_temp.envelope_is(
  spellingbee.replay_board((select id from g1)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot replay the board');

select * from finish();
rollback;
