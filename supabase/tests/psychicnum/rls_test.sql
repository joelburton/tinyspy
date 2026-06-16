-- ============================================================
-- Test: RLS + the games_state view (target reveal gate)
-- ============================================================
--
-- Three users: ada + bea play in a club; dee is signed in
-- but outside. We check:
--   - dee's SELECTs against psychicnum tables return zero rows
--     (RLS, both the raw table and the games_state view)
--   - dee's mutating RPCs throw
--   - games_state hides target while play_state='playing' (even for
--     members — the secret is hidden until end of game)
--   - games_state surfaces target after game end
--   - games_state surfaces target for any club member, not just
--     the caller who finished the game
--
-- The column-level grant on `target` (the storage-layer protection
-- that makes the raw table unreadable for that column) is checked
-- separately in create_game_test.sql.
--
-- See ../tinyspy/create_game_test.sql for the pgTAP primer.
-- ============================================================

begin;

set search_path = psychicnum, common, public, extensions;

select plan(10);

\ir ../_shared/setup.psql

-- ada creates a 2-member club (ada+bea); dee is signed in
-- but outside it.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('test club', array['ada','bea']);
create temp table g on commit drop as
select * from psychicnum.create_game((select id from club), '{"guesses": 7, "timer": {"kind": "none"}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]);

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
-- Dee (outsider) sees nothing — through the raw table OR the view
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
-- The games_state view inherits RLS from the underlying table —
-- non-member sees zero rows just like a direct SELECT would.
select is(
  (select count(*) from psychicnum.games_state where id = (select id from g)),
  0::bigint,
  'dee cannot SELECT games_state rows for a club she is outside (RLS via underlying table)'
);

-- ============================================================
-- Dee's mutating RPCs throw
-- ============================================================

select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 7) $$, (select id from g)),
  '42501',
  'not playing this game',
  'dee cannot call submit_guess on a game she didn''t play (via require_game_player)'
);

-- ============================================================
-- games_state.target gate: NULL while playing, even for members
-- ============================================================
-- The CASE expression in the view returns NULL when play_state =
-- 'playing', regardless of who's looking. This is the
-- (previously RPC-enforced) terminal-only gate, now declarative.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select target from psychicnum.games_state where id = (select id from g)),
  null::int,
  'games_state.target is NULL while play_state=playing (member can see the row but not the secret)'
);

-- ============================================================
-- After game end, games_state.target is the real value
-- ============================================================
-- Ada guesses 7 → win, play_state flips to 'won', target = 7.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g), 7);

select is(
  (select target from psychicnum.games_state where id = (select id from g)),
  7,
  'games_state.target surfaces the real value once play_state is terminal'
);

-- Bea (the other member) sees it too — not caller-only.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select target from psychicnum.games_state where id = (select id from g)),
  7,
  'games_state.target visible to any club member post-terminal, not just the caller'
);

-- Dee (still outside) sees no row at all, so target is moot.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*) from psychicnum.games_state where id = (select id from g)),
  0::bigint,
  'dee STILL sees no row in games_state after the game ends (RLS unchanged by terminal play_state)'
);

-- ============================================================
select * from finish();
rollback;
