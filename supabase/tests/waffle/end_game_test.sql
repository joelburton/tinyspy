-- ============================================================
-- Test: waffle.end_game (manual stop)
-- ============================================================
-- The friends' explicit "we're done" button. Available in BOTH modes.
-- Unlike submit_swap / submit_timeout, end_game is a NEUTRAL terminal:
-- it writes the uniform play_state='ended' (not waffle's intrinsic
-- won/lost verdicts), records every player {"won": false}, and stamps
-- status.outcome='manual'. is_terminal flips true (so the FE reveals
-- the solution). Idempotent on the play_state check (a second click
-- raises P0001). Non-players are rejected by common.require_game_player.

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(11);

-- ── Coop: manual end → ended, no winner ─────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club1 on commit drop as
select common.create_club('Waffle eg1', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select * from waffle.create_game(
  (select handle from club1), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board()
);

select waffle.end_game((select id from g1));

reset role;
select is(
  (select play_state from common.games where id = (select id from g1)),
  'ended',
  'coop: manual end → play_state=ended');
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  true,
  'coop: manual end → is_terminal=true (reveals the solution)');
select is(
  (select status->>'outcome' from common.games where id = (select id from g1)),
  'manual',
  'coop: status.outcome=manual');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g1)
      and result = '{"won": false}'::jsonb),
  2::bigint,
  'coop: both players recorded {"won": false}');

-- Idempotent: a second end_game raises (already terminal).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select waffle.end_game(%L::uuid) $$, (select id from g1)),
  'P0001', NULL, 'coop: a second end on a finished game raises (idempotent)');

-- ── Compete: manual end → ended, no winner ──────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club2 on commit drop as
select common.create_club('Waffle eg2', array['ada', 'bea']) as handle;
create temp table g2 on commit drop as
select * from waffle.create_game(
  (select handle from club2), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.waffle_board()
);

select waffle.end_game((select id from g2));

reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'ended',
  'compete: manual end → play_state=ended');
select is(
  (select is_terminal from common.games where id = (select id from g2)),
  true,
  'compete: manual end → is_terminal=true');
select is(
  (select status->>'outcome' from common.games where id = (select id from g2)),
  'manual',
  'compete: status.outcome=manual');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g2)
      and result = '{"won": false}'::jsonb),
  2::bigint,
  'compete: both players recorded {"won": false} (no winner)');

-- Idempotent: a second end_game raises (already terminal).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select waffle.end_game(%L::uuid) $$, (select id from g2)),
  'P0001', NULL, 'compete: a second end on a finished game raises (idempotent)');

-- ── Non-player rejected ─────────────────────────────────────
-- dee is not a member/player of g2 → require_game_player rejects.
-- (Use a fresh playing game so the rejection isn't masked by the
-- already-terminal P0001 above.)
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club3 on commit drop as
select common.create_club('Waffle eg3', array['ada', 'bea']) as handle;
create temp table g3 on commit drop as
select * from waffle.create_game(
  (select handle from club3), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board()
);

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select waffle.end_game(%L::uuid) $$, (select id from g3)),
  NULL, NULL, 'a non-player cannot end the game');

select * from finish();
rollback;
