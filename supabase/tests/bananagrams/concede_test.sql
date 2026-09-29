-- cs-unmet

-- ============================================================
-- Test: bananagrams.concede(target_game)
-- ============================================================
-- A player drops out of the race. bananagrams is compete, so conceding
-- is a real loss for the conceder — but it does NOT end the game while
-- others still race.
-- Covers:
--   1. Concede ends JUST the caller (player_ended_reason 'conceded'); the
--      game goes on while another player is still active
--   2. Idempotency: a second concede by the same player is the PN483 race
--   3. The conceder is unranked and lost when the game ends
--      (here: the remaining player peels out and wins)
--   4. Last active player conceding ends the game as a COLLECTIVE
--      loss (conceded/conceded, lost, nobody ranked)
--   5. Solo (N = 1) concede ends the game as a loss immediately
--   6. Non-players rejected; conceding a finished game rejected
-- ============================================================

begin;

set search_path = bananagrams, common, public, extensions;

select plan(14);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada', 'bea']) as handle;

-- 2-player game. bunch = 144 − 42 = 102.
create temp table g1 on commit drop as
select (bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
)->'data'->>'id')::uuid as id;

-- ─── (1) ada concedes; bea is still active, so the game continues ───
select lives_ok(
  format($$ select bananagrams.concede(%L) $$, (select id from g1)),
  'a player can concede'
);
select is(
  (select player_ended_reason from common.game_players
    where game_id = (select id from g1)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'conceded',
  'the conceder has ended, by conceding'
);
select is(
  (select player_ended_at from common.game_players
    where game_id = (select id from g1)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  null,
  'the other player has NOT ended'
);
select is(
  (select ended_at from common.games where id = (select id from g1)),
  null,
  'the game stays in progress while someone is still racing'
);

-- ─── (2) Idempotency: ada can't concede twice ───
select pg_temp.envelope_is(
  bananagrams.concede((select id from g1)),
  '{"type":"not-ok","severity":"race","dbcode":"PN483",
    "message":"Already conceded"}'::jsonb,
  'conceding twice is rejected');

-- ─── (3) bea (the only active player) empties her hand and peels out ───
-- The bunch (102) can still refill 1 active player, so drain it first to
-- force the win path.
reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.games set bunch = '' where game_id = (select id from g1);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select bananagrams.save_player_board(
  (select id from g1),
  (select tiles || repeat('.', 25 * 25 - length(tiles))
     from bananagrams.player_boards
    where game_id = (select id from g1)
      and user_id = 'bea22222-2222-2222-2222-222222222222')
);
select bananagrams.peel((select id from g1));

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from g1)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '1/won',
  'the remaining racer wins by peeling out'
);
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from g1)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'unranked/lost',
  'the conceder is unranked and lost when the game ends'
);

-- ─── (4) Last active player conceding ends the game (collective loss) ───
-- Fresh 2-player game; ada concedes, then bea (the last one) concedes.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
)->'data'->>'id')::uuid as id;
select bananagrams.concede((select id from g2)); -- ada out, bea still active
select is(
  (select ended_at from common.games where id = (select id from g2)),
  null,
  'game still playing after the first of two concedes'
);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select bananagrams.concede((select id from g2)); -- the LAST active player

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select game_ended_outcome from common.games where id = (select id from g2)),
  'lost',
  'the last concede ends the game as a collective loss'
);
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g2)),
  'conceded/conceded',
  'the reason is conceded (distinct from timeout / a win)'
);
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g2) and final_ranking is not null),
  0,
  'no winner when everyone conceded: nobody is ranked'
);

-- ─── (5) Solo game: conceding ends it immediately (N = 1, no one left) ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select (bananagrams.create_game(
  '=ada',
  '{"hand_size": 15, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]
)->'data'->>'id')::uuid as id;
select bananagrams.concede((select id from g3));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select game_ended_reason || '/' || game_ended_outcome from common.games where id = (select id from g3)),
  'conceded/lost',
  'a solo concede ends the game as a loss immediately'
);

-- ─── (6) Non-player cannot concede ───
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  bananagrams.concede((select id from g1)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot concede');

-- Conceding a finished game is rejected (g1 already won).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  bananagrams.concede((select id from g1)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'conceding a finished game is rejected');

select * from finish();
rollback;
