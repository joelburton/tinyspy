-- cs-blessed-connections

-- ============================================================
-- Test: a player's ending while the game plays on
--       (common._set_player_ended + common._reset_game)
-- ============================================================
-- common.game_players.player_ended_at says "this player is DONE, the
-- game is not". The presence-pause roster is the players with no
-- player_ended_at, so a racer who was eliminated, spent their budget,
-- or finished ahead of the others stops holding the game open for
-- everyone still playing. Covers:
--   1. The helper ends JUST that player, with the reason and outcome
--      the game passed — a solve is not a concession, and a solver
--      marked "conceded" instead would forfeit the win
--   2. It does not end the game
--   3. Idempotent, keeping the first ending: the calling branch never
--      has to ask whether it already fired
--   4. common._reset_game clears it, so Restart puts everyone back
--      in the race
--
-- Each gametype's OWN test proves it calls the helper at the right
-- moment (connections' fourth mistake, psychicnum's spent budget,
-- a solve in wordle / waffle / strands, wordiply's fifth guess);
-- this file is the helper itself.
--
-- Uses common._create_game directly — the helper is gametype-agnostic.
-- See common/concede_test.sql for the pgTAP / auth-simulation primer.
-- ============================================================

begin;

set search_path = common, public, extensions;

select plan(8);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

-- Set JWT claims WITHOUT switching role away from postgres — keeps execute
-- privilege on common._create_game, which is revoked from `authenticated`.
create function pg_temp.as_jwt_only(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
end;
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada', 'bea']) as handle;

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config(
  'test.game_id',
  (common._create_game(
    (select handle from club),
    'spellingbee_compete',
    'compete',
    array[
      'ada11111-1111-1111-1111-111111111111'::uuid,
      'bea22222-2222-2222-2222-222222222222'::uuid
    ],
    'test-title',
    '{"timer": {"kind": "none"}}'::jsonb,
    null
  ))::text,
  true
);
reset role;
select set_config('request.jwt.claims', '', true);

-- ─── (1) Nobody starts out done ───
select is(
  (select count(*) from common.game_players
    where game_id = current_setting('test.game_id')::uuid and player_ended_at is not null),
  0::bigint,
  'a fresh game has nobody ended'
);

-- ─── (2) The helper ends one player, and only that player ───
select lives_ok(
  format($$ select common._set_player_ended(%L, 'ada11111-1111-1111-1111-111111111111',
                                            'reached_goal', 'solved', 'neutral') $$,
         current_setting('test.game_id')),
  'the helper runs'
);
-- The distinction the reason exists for: in wordle, waffle and strands the
-- first player to end is the one who SOLVED, and a conceder forfeits any win.
select is(
  (select player_ended_reason || '/' || player_ended_reason_detail
     from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'
      and player_ended_at is not null),
  'reached_goal/solved',
  'the finished player has ended, with the reason passed — not conceded'
);
select is(
  (select outcome from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'neutral',
  'with the outcome the caller judged'
);
select is(
  (select player_ended_at from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  null,
  'the player still going has not'
);

-- ─── (3) One player done does not end the game ───
select is(
  (select ended_at from common.games where id = current_setting('test.game_id')::uuid),
  null,
  'the game plays on'
);

-- ─── (4) Idempotent, keeping the first ending ───
select common._set_player_ended(current_setting('test.game_id')::uuid,
  'ada11111-1111-1111-1111-111111111111', 'resource_exhausted', 'exhausted', 'lost');
select is(
  (select player_ended_reason || '/' || outcome from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'reached_goal/neutral',
  'ending a player twice keeps the first ending and its outcome'
);

-- ─── (5) A restart puts everyone back in the race ───
select common._reset_game(current_setting('test.game_id')::uuid);
select is(
  (select count(*) from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and (player_ended_at is not null or player_ended_reason is not null
           or outcome is not null)),
  0::bigint,
  'reset_game clears every player''s ending and outcome'
);

-- ============================================================
select * from finish();
rollback;
