-- ============================================================
-- Test: sudden death rules
-- ============================================================
--
-- Sudden death triggers when the last timer token is spent and
-- agents remain. We don't play through nine real turns to drain
-- the timer here — that's tested implicitly by game_loop_test
-- (which verifies tokens decrement on turn end). This file
-- forces the game into sudden_death directly and then exercises
-- the rules that apply there:
--
--   1. submit_clue is rejected (no more clues in sudden death)
--   2. submit_guess works for either player (no turn enforcement)
--   3. a green reveal keeps the game going
--   4. ANY non-green reveal ends the game in lost_clock
--
-- For the reveal label, sudden_death uses the *partner's* view
-- (the seat opposite the guesser). So when alice guesses, we
-- look up positions on bob's key view to find a "green for alice
-- to hit" or "neutral for alice to hit".
--
-- See `lobby_test.sql` for the pgTAP primer.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(5);

-- ============================================================
-- Fixtures
-- ============================================================

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@test.local', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@test.local', now(), now(), now());

create function pg_temp.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.find_position(g uuid, s text, target text) returns int
language sql as $$
  select (ord - 1)::int
  from public.game_players gp,
       jsonb_array_elements_text(gp.key_card) with ordinality as t(label, ord)
  where gp.game_id = g and gp.seat = s and t.label = target
  limit 1;
$$;

-- ============================================================
-- Set up an active game and force-flip it to sudden_death
-- ============================================================

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table g on commit drop as select * from create_game();

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select join_game((select join_code from g));

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select start_game((select id from g));

-- Force the game into sudden_death. We swap back to the superuser
-- because the `games` table has no UPDATE policy/grant for the
-- authenticated role — all real state changes go through RPCs. Tests
-- can write directly because they run as postgres by default.
reset role;
update games set status = 'sudden_death', turns_remaining = 0, current_clue_giver = null
  where id = (select id from g);

-- ============================================================
-- (1) submit_clue is rejected in sudden death
-- ============================================================
-- The RPC guards on status='active' and raises P0001 otherwise.

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$ select submit_clue((select id from g), 'CLUE', 1) $$,
  'P0001',
  'clues only allowed during active play',
  'submit_clue is rejected when status = sudden_death'
);

-- ============================================================
-- (2) and (3) — green guess works, game stays in sudden_death
-- ============================================================
-- Alice guesses; the reveal uses bob's view. We look up a 'G' on bob's
-- side and submit it.

select is(
  submit_guess(
    (select id from g),
    pg_temp.find_position((select id from g), 'B', 'G')
  ),
  'G',
  'green reveal in sudden death returns G'
);

select is(
  (select status from games where id = (select id from g)),
  'sudden_death',
  'status stays sudden_death after a green reveal'
);

-- ============================================================
-- (4) and (5) — any non-green ends the game in lost_clock
-- ============================================================
-- A neutral on the partner's view is enough.

select is(
  submit_guess(
    (select id from g),
    pg_temp.find_position((select id from g), 'B', 'N')
  ),
  'N',
  'neutral reveal in sudden death returns N'
);

select is(
  (select status from games where id = (select id from g)),
  'lost_clock',
  'a non-green reveal in sudden death sets status = lost_clock'
);

-- ============================================================
select * from finish();
rollback;
