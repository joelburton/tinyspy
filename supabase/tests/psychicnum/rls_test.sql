-- ============================================================
-- Test: RLS + the reveal_target gate
-- ============================================================
--
-- Three users: ada + bea play in a club; dee is signed in
-- but outside. We check:
--   - dee's SELECTs against psychicnum tables return zero rows
--   - dee's mutating RPCs throw
--   - reveal_target rejects while the game is still active
--     (even for members — the secret is hidden until end of game)
--   - reveal_target returns the target after game end
--   - reveal_target rejects non-members
--
-- The column-level grant on `target` is checked separately in
-- create_game_test.sql (test #8 there).
--
-- See ../tinyspy/create_game_test.sql for the pgTAP primer.
-- ============================================================

begin;

set search_path = psychicnum, common, public, extensions;

select plan(9);

\ir ../_shared/setup.psql

-- ada creates a 2-member club (ada+bea); dee is signed in
-- but outside it.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('test club', array['ada','bea']);
create temp table g on commit drop as
select * from psychicnum.create_game((select id from club), '{"guesses": 7}'::jsonb);

-- A wrong guess from ada gives us a guesses row for the RLS
-- read tests below.
reset role;
update psychicnum.games set target = 7 where id = (select id from g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g), 1);

-- ============================================================
-- Positive baseline: ada CAN see her own game and guess
-- ============================================================

select is(
  (select count(*) from psychicnum.games where id = (select id from g)),
  1::bigint,
  'sanity: ada (a club member) sees her own game'
);
select is(
  (select count(*) from psychicnum.guesses where game_id = (select id from g)),
  1::bigint,
  'sanity: ada sees the guess she just made'
);

-- ============================================================
-- Dee (outsider) sees nothing
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*) from psychicnum.games where id = (select id from g)),
  0::bigint,
  'dee cannot SELECT a psychicnum.games row for a club she is outside'
);
select is(
  (select count(*) from psychicnum.guesses where game_id = (select id from g)),
  0::bigint,
  'dee cannot SELECT psychicnum.guesses rows for a club she is outside'
);

-- ============================================================
-- Dee's mutating RPCs throw
-- ============================================================

select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 7) $$, (select id from g)),
  '42501',
  'not a member of this club',
  'dee cannot call submit_guess on a game she is outside'
);

select throws_ok(
  format($$ select psychicnum.reveal_target(%L::uuid) $$, (select id from g)),
  '42501',
  'not a member of this club',
  'dee cannot call reveal_target on a game she is outside'
);

-- ============================================================
-- reveal_target gate: rejected while active, even for members
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select psychicnum.reveal_target(%L::uuid) $$, (select id from g)),
  'P0001',
  'game is still active',
  'reveal_target rejects while the game is still active (members included)'
);

-- ============================================================
-- After game end, reveal_target works
-- ============================================================
-- Ada guesses 7 → win, status flips to 'won', target stays = 7.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g), 7);

select is(
  psychicnum.reveal_target((select id from g)),
  7,
  'reveal_target returns the target after the game ends'
);

-- Bea (the other member) can also reveal — not caller-only.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  psychicnum.reveal_target((select id from g)),
  7,
  'reveal_target works for any club member after game end, not just the caller'
);

-- ============================================================
select * from finish();
rollback;
