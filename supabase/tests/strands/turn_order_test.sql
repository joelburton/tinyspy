-- ============================================================
-- Test: strands turn-order (opt-in turn-by-turn coop)
-- ============================================================
-- The per-game wiring for the common turn primitive. strands' rule: the turn
-- advances only on an ACCEPTED move (theme / spangram / hint_word) — a soft
-- reject (too short, unknown, already counted) is a misfire, not a turn.
-- Covers:
--   1. create_game seats the pointer on the chosen first player
--   2. an out-of-turn trace is rejected ('not your turn')
--   3. a soft reject does NOT advance the pointer
--   4. an accepted theme word advances it
--   5. an accepted hint word advances it back
--   6. free-for-all coop leaves the pointer null (ungated)
--   7. compete leaves the pointer null — everyone races at once
-- ============================================================

begin;
set search_path = strands, common, public, extensions;

select plan(8);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Turns club', array['ada','bea']) as handle;
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;
select pg_temp.strands_hint_words();

-- ── TURN GAME — ada first ──
create temp table g on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix), 5, 3, 4)
    || jsonb_build_object(
         'coop_style', 'turns',
         'first_turn_user_id', 'ada11111-1111-1111-1111-111111111111'::text),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

-- (1) Pointer seated on ada.
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: create_game seats the pointer on the chosen first player'
);

-- (2) bea tracing out of turn is rejected.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select strands.submit_path(%L::uuid, %L::jsonb) $$,
         (select id from g), pg_temp.strands_row_path(0)::text),
  'P0001', 'not your turn',
  'turns: the non-current player is rejected'
);

-- (3) A soft reject is a misfire, not a turn: ada's too-short trace is logged
-- but the pointer stays on her.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select strands.submit_path((select id from g), pg_temp.strands_prefix_path(0, 2)))->>'result',
  'too_short',
  'turns: a two-letter trace soft-rejects'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: a soft reject does NOT advance the pointer'
);

-- (4) An accepted theme word advances to bea.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select strands.submit_path((select id from g), pg_temp.strands_row_path(0));
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: an accepted theme word advances the pointer'
);

-- (5) An accepted HINT word is a move too — it advances back to ada.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.submit_path((select id from g), pg_temp.strands_prefix_path(1, 4));
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: an accepted hint word advances the pointer too'
);

-- ── (6) FREE-FOR-ALL — no pointer, no gate ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_free on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g_free)),
  null,
  'free-for-all: the pointer stays null — _require_turn is a no-op'
);

-- ── (7) COMPETE — never rotates, even if the setup smuggles coop_style in ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_race on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix))
    || jsonb_build_object(
         'coop_style', 'turns',
         'first_turn_user_id', 'ada11111-1111-1111-1111-111111111111'::text),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete');
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g_race)),
  null,
  'compete: the pointer stays null — everyone races at once'
);

select * from finish();
rollback;
