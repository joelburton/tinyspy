-- cs-unmet

-- ============================================================
-- Test: common._concede(p_game_id)
-- ============================================================
-- The shared part of a player's drop-out, which every game's own concede
-- calls. Concede is a real loss for the conceder but does NOT end the game
-- while others still race; once EVERY player has conceded it ends the game
-- as a collective loss.
-- Covers:
--   1. Concede ends JUST the caller (player_ended_at, reason and detail
--      'conceded', outcome lost at once); the game goes on while others race
--   2. Idempotency: a second concede by the same player is the
--      PN483 race (`common._raise_already_conceded`)
--   3. A middle concede keeps the game going (one racer left)
--   4. The LAST player conceding ends the game as a COLLECTIVE loss
--      (reason conceded/'conceded', outcome lost, ended by that player,
--      every player unranked and lost)
--   5. Non-players rejected; conceding a finished game is the PN486
--      race (`common._raise_game_over`)
--   6. A solo game ends the same way on its one concession
--   7. A player who has already ended another way cannot concede (PN508)
--
-- Uses common._create_game directly (concede is gametype-agnostic — it
-- only reads game_players + common.games.ended_at), so this test
-- doesn't couple to any one game's create_game. `_concede` returns the
-- caller's id and RAISES a refusal (the game's own concede turns it into
-- an envelope), so `pg_temp.concede_envelope` does that turning here.
-- ============================================================

begin;

set search_path = common, public, extensions;

select plan(18);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

-- Set JWT claims WITHOUT switching role away from postgres — keeps
-- execute privilege on common._create_game, which is revoked from
-- `authenticated` (see games_test.sql for the same trick).
create function pg_temp.as_jwt_only(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
end;
$$;

-- `_concede` as the caller in the jwt, answered the way a game's concede
-- answers: ok, or the raise turned into its envelope. Runs as postgres, since
-- `_concede` is not granted to `authenticated`.
create function pg_temp.concede_envelope(game uuid) returns jsonb
language plpgsql as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  perform common._concede(game);
  return common._ok_envelope(jsonb_build_object('result', 'conceded'));
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

-- 3-member club so we can watch two players drop out before the third.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada', 'bea', 'cade']) as handle;

reset role;
select set_config('request.jwt.claims', '', true);

-- A 3-player game. create_game is revoked from `authenticated`, so create it
-- as_jwt_only (postgres role + ada's jwt); `_concede` is too, so every
-- concede below runs the same way.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config(
  'test.game_id',
  (common._create_game(
    (select handle from club),
    'spellingbee_compete',
    'compete',
    array[
      'ada11111-1111-1111-1111-111111111111'::uuid,
      'bea22222-2222-2222-2222-222222222222'::uuid,
      'cade3333-3333-3333-3333-333333333333'::uuid
    ],
    'test-title',
    '{"timer": {"kind": "none"}}'::jsonb,
    null
  ))::text,
  true
);

-- ─── (1) ada concedes; bea + cade still race ───
select lives_ok(
  format($$ select common._concede(%L) $$, current_setting('test.game_id')),
  'a player can concede'
);
select is(
  (select player_ended_reason from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'conceded',
  'the conceder has ended, by conceding'
);
select isnt(
  (select player_ended_at from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  null,
  'player_ended_at is stamped'
);
-- A concession is one of the ways a player ends (docs/win-lose.md → Where a
-- player stands); the detail is the game's own word, 'conceded' here.
select is(
  (select player_ended_reason_detail from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'conceded',
  'the conceder''s ending detail is conceded'
);
-- A concession is a loss the moment it is made (docs/win-lose.md →
-- `outcome-at-player-end`), not only once the game ends.
select is(
  (select outcome from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'lost',
  'the conceder is lost at once'
);
select is(
  (select player_ended_at from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  null,
  'a still-racing player has NOT ended'
);
select is(
  (select ended_at from common.games where id = current_setting('test.game_id')::uuid),
  null,
  'the game stays in progress while others race'
);

-- ─── (2) Idempotency: ada can't concede twice ───
select pg_temp.envelope_is(
  pg_temp.concede_envelope(current_setting('test.game_id')::uuid),
  '{"type":"not-ok","severity":"race","dbcode":"PN483",
    "message":"Already conceded","outcome":null}'::jsonb,
  'conceding twice is rejected');

-- ─── (3) bea concedes; cade alone is still active ───
select pg_temp.as_jwt_only('bea22222-2222-2222-2222-222222222222');
select common._concede(current_setting('test.game_id')::uuid);
select is(
  (select ended_at from common.games where id = current_setting('test.game_id')::uuid),
  null,
  'still in progress with one racer (cade) left'
);

-- ─── (4) cade (the last active player) concedes → collective loss ───
select pg_temp.as_jwt_only('cade3333-3333-3333-3333-333333333333');
select common._concede(current_setting('test.game_id')::uuid);
select set_config('request.jwt.claims', '', true);
select isnt(
  (select ended_at from common.games where id = current_setting('test.game_id')::uuid),
  null,
  'the last concede ends the game'
);
select is(
  (select game_ended_outcome from common.games where id = current_setting('test.game_id')::uuid),
  'lost',
  'everyone conceding is a collective loss'
);
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_by_user_id::text
     from common.games where id = current_setting('test.game_id')::uuid),
  'conceded/conceded/cade3333-3333-3333-3333-333333333333',
  'the reason is conceded (distinct from a win / timeout), ended by the last conceder'
);
select is(
  (select count(*) from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and final_ranking is null and outcome = 'lost'),
  3::bigint,
  'every player is unranked and lost'
);

-- ─── (5) Non-player rejected; finished game rejected ───
select pg_temp.as_jwt_only('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  pg_temp.concede_envelope(current_setting('test.game_id')::uuid),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot concede');
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  pg_temp.concede_envelope(current_setting('test.game_id')::uuid),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over","outcome":null}'::jsonb,
  'conceding a finished game is rejected');

-- ─── (6) A solo game: its one concession is the last ───
-- bananagrams is a race with no coop half; a solo game's only player
-- conceding is everyone conceding, so it ends the same collective loss.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config(
  'test.solo_id',
  (common._create_game(
    (select handle from club),
    'bananagrams',
    'compete',
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'solo-title',
    '{"timer": {"kind": "none"}}'::jsonb,
    null
  ))::text,
  true
);
select common._concede(current_setting('test.solo_id')::uuid);
select set_config('request.jwt.claims', '', true);
select is(
  (select game_ended_reason || '/' || game_ended_outcome
     from common.games where id = current_setting('test.solo_id')::uuid),
  'conceded/lost',
  'a solo game ends conceded, lost, on its one concession'
);

-- ─── (7) A player who is already out cannot concede ───
-- Ended without conceding: finished, eliminated, or out of budget. There is
-- nothing to concede — a loss is already a loss, and a finisher would only
-- throw away a win they may hold. The frontend hides Concede there, so a
-- concede that reaches here lost a race with the roster's subscription.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config(
  'test.out_id',
  (common._create_game(
    (select handle from club),
    'spellingbee_compete',
    'compete',
    array[
      'ada11111-1111-1111-1111-111111111111'::uuid,
      'bea22222-2222-2222-2222-222222222222'::uuid
    ],
    'out-title',
    '{"timer": {"kind": "none"}}'::jsonb,
    null
  ))::text,
  true
);
select common._set_player_ended(
  current_setting('test.out_id')::uuid, 'ada11111-1111-1111-1111-111111111111',
  'resource_exhausted', 'exhausted', 'lost');

select pg_temp.envelope_is(
  pg_temp.concede_envelope(current_setting('test.out_id')::uuid),
  '{"type":"not-ok","severity":"race","dbcode":"PN508",
    "message":"Already out","outcome":null}'::jsonb,
  'a player who is already out cannot concede');
select set_config('request.jwt.claims', '', true);
select is(
  (select player_ended_reason from common.game_players
    where game_id = current_setting('test.out_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'resource_exhausted',
  'and keeps her own ending, not a concession'
);

select * from finish();
rollback;
