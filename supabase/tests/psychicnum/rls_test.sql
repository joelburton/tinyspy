-- ============================================================
-- Test: RLS + the reveal_target gate
-- ============================================================
--
-- Three users: alice + bob play in a club; carol is signed in
-- but outside. We check:
--   - carol's SELECTs against psychicnum tables return zero rows
--   - carol's mutating RPCs throw
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

-- ============================================================
-- Fixtures
-- ============================================================

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@test.local', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@test.local',   now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'carol@test.local', now(), now(), now());

create function pg_temp.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- alice creates a 2-member club (alice+bob); carol is signed in
-- but outside it.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('test club', array['alice','bob']);
create temp table g on commit drop as
select * from psychicnum.create_game((select id from club));

-- A wrong guess from alice gives us a guesses row for the RLS
-- read tests below.
reset role;
update psychicnum.games set target = 7 where id = (select id from g);
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g), 1);

-- ============================================================
-- Positive baseline: alice CAN see her own game and guess
-- ============================================================

select is(
  (select count(*) from psychicnum.games where id = (select id from g)),
  1::bigint,
  'sanity: alice (a club member) sees her own game'
);
select is(
  (select count(*) from psychicnum.guesses where game_id = (select id from g)),
  1::bigint,
  'sanity: alice sees the guess she just made'
);

-- ============================================================
-- Carol (outsider) sees nothing
-- ============================================================

select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select is(
  (select count(*) from psychicnum.games where id = (select id from g)),
  0::bigint,
  'carol cannot SELECT a psychicnum.games row for a club she is outside'
);
select is(
  (select count(*) from psychicnum.guesses where game_id = (select id from g)),
  0::bigint,
  'carol cannot SELECT psychicnum.guesses rows for a club she is outside'
);

-- ============================================================
-- Carol's mutating RPCs throw
-- ============================================================

select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 7) $$, (select id from g)),
  '42501',
  'not a member of this club',
  'carol cannot call submit_guess on a game she is outside'
);

select throws_ok(
  format($$ select psychicnum.reveal_target(%L::uuid) $$, (select id from g)),
  '42501',
  'not a member of this club',
  'carol cannot call reveal_target on a game she is outside'
);

-- ============================================================
-- reveal_target gate: rejected while active, even for members
-- ============================================================

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select psychicnum.reveal_target(%L::uuid) $$, (select id from g)),
  'P0001',
  'game is still active',
  'reveal_target rejects while the game is still active (members included)'
);

-- ============================================================
-- After game end, reveal_target works
-- ============================================================
-- Alice guesses 7 → win, status flips to 'won', target stays = 7.

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g), 7);

select is(
  psychicnum.reveal_target((select id from g)),
  7,
  'reveal_target returns the target after the game ends'
);

-- Bob (the other member) can also reveal — not caller-only.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select is(
  psychicnum.reveal_target((select id from g)),
  7,
  'reveal_target works for any club member after game end, not just the caller'
);

-- ============================================================
select * from finish();
rollback;
