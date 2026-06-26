-- ============================================================
-- Test: codenamesduet.end_game — manual stop
-- ============================================================
--
-- The friends' explicit "we're done here" button. Any current game
-- player can fire it from any active state (playing / sudden_death);
-- it writes a NEUTRAL terminal (play_state='ended',
-- status.outcome='manual') with every player {won:false} — stopping
-- on purpose is a valid outcome, not a loss. Same lock / auth /
-- active-state gate / Realtime-touch shape as submit_timeout.
--
-- Coverage:
--   - happy path from playing: play_state → ended, is_terminal=true,
--     status.outcome='manual', both players' result = {won:false}
--   - idempotency: a second call on the now-terminal game is rejected
--   - require_game_player: a non-player is rejected
--
-- See ../codenamesduet/create_game_test.sql for the pgTAP primer and
-- ./submit_timeout_test.sql for the sibling timer-driven terminal.
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(8);

\ir ../_shared/setup.psql
\ir setup.psql

-- 2-member club; ada + bea are seated. dee is signed in but
-- outside the club / not playing the game.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

-- ============================================================
-- (1) Happy path: playing → ended via end_game
-- ============================================================

create temp table g on commit drop as
select * from codenamesduet.create_game(
  (select handle from club),
  pg_temp.codenamesduet_setup(9),
  pg_temp.codenamesduet_players()
);

select lives_ok(
  format(
    $$ select codenamesduet.end_game(%L::uuid) $$,
    (select id from g)
  ),
  'end_game: playing game accepts the call'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'ended',
  'end_game: flips play_state to ended'
);

-- end_game marks the common.games row terminal.
select is(
  (select is_terminal from common.games where id = (select id from g)),
  true,
  'end_game: end_game sets is_terminal=true on the common header'
);

-- Status outcome carried through to common.games.
select is(
  (select status->>'outcome' from common.games
    where id = (select id from g)),
  'manual',
  'end_game: status.outcome = manual'
);

-- Cooperative game: nobody wins a manually-stopped game. Both
-- seated players get {won:false}.
select is(
  (select result from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '{"won": false}'::jsonb,
  'end_game: ada result = {won:false}'
);
select is(
  (select result from common.game_players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '{"won": false}'::jsonb,
  'end_game: bea result = {won:false}'
);

-- ============================================================
-- (2) Idempotency — second call rejected
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format(
    $$ select codenamesduet.end_game(%L::uuid) $$,
    (select id from g)
  ),
  'P0001',
  'game is not in progress',
  'end_game: rejects on already-terminal games'
);

-- ============================================================
-- (3) Non-player rejected (require_game_player gate)
-- ============================================================
-- dee is signed in but isn't in common.game_players for this game —
-- the player roster is frozen at create_game time. Use a fresh game
-- so the active-state guard doesn't fire first.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from codenamesduet.create_game(
  (select handle from club),
  pg_temp.codenamesduet_setup(9),
  pg_temp.codenamesduet_players()
);

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select codenamesduet.end_game(%L::uuid) $$,
    (select id from g2)
  ),
  '42501',
  'not playing this game',
  'end_game: non-player rejected via require_game_player'
);

-- ============================================================
select * from finish();
rollback;
