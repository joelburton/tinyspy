-- ============================================================
-- Test: setgame turn-order (opt-in turn-by-turn coop)
-- ============================================================
-- The per-game wiring for the common turn primitive: create_game seats the
-- rotation when setup.coop_style='turns', and submit_set gates on
-- _require_turn + advances on an accepted, non-terminal claim.
--
-- The rule this pins is setgame's own, and it is about HINTS as much as
-- claims: **a turn is one successful claim.** Asking for a hint happens on
-- your turn and does NOT pass it, so a stuck player can climb the whole
-- ladder — one card, two, then three, which claims — and only then hand over.
-- If a hint advanced the turn, that player would be handed a ring they are no
-- longer allowed to use, which is the opposite of help.
--
-- Covers:
--   1. create_game seats the pointer on the chosen first player
--   2. an out-of-turn claim is rejected
--   3. an accepted claim advances the pointer
--   4. an out-of-turn HINT is rejected (it charges shared state)
--   5. an in-turn hint is accepted and does NOT advance
--   6. a rejected claim (cards that aren't a set) does NOT advance
--   7. free-for-all leaves the pointer null and both RPCs ungated
--
-- Every move is derived from whatever board the shuffle dealt (see setup.psql)
-- rather than from a fixture, so this asserts the rule, not one lucky deal.
-- ============================================================

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(13);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Set turns', array['ada', 'bea']) as handle;

-- ── TURN GAME — ada first ──
create temp table g on commit drop as
select * from setgame.create_game(
  (select handle from club),
  jsonb_build_object(
    'timer', jsonb_build_object('kind', 'none'),
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

-- (2) bea claiming out of turn is rejected — before anything is scored.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select setgame.submit_set(%L::uuid, pg_temp.sg_live(%L)) $$,
         (select id from g), (select id from g)),
  'P0001', 'not-your-turn|',
  'turns: the non-current player cannot claim'
);
reset role;
select is(
  (select sum(sets_found)::int from setgame.players where game_id = (select id from g)),
  0, 'turns: the refused claim scored nothing'
);

-- (3) An out-of-turn HINT is refused too. A hint costs the TABLE a point on a
--     counter everyone reads, so it is a move, not a private convenience.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select setgame.record_hint(%L::uuid, (pg_temp.sg_live(%L))[1:1]) $$,
         (select id from g), (select id from g)),
  'P0001', 'not-your-turn|',
  'turns: the non-current player cannot cash a hint'
);

-- (4) ada, whose turn it is, asks for a hint. Accepted — and the turn STAYS,
--     because a hint is not the end of a turn. This is the ladder: she can ask
--     twice more, and the third ask hands her the set to claim.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format($$ select setgame.record_hint(%L::uuid, (pg_temp.sg_live(%L))[1:2]) $$,
         (select id from g), (select id from g)),
  'turns: the current player may cash a hint'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: a hint does NOT pass the turn'
);
select is(
  (select hints_used from setgame.players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1, 'turns: the hint was charged to the asker'
);

-- (5) A claim that ISN'T a set is refused, and the turn stays with ada — a bad
--     move must not cost the turn, or a misclick would be a penalty.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select setgame.submit_set(%L::uuid, pg_temp.sg_not_a_set(%L)) $$,
         (select id from g), (select id from g)),
  'P0001', 'not-a-set|',
  'turns: three cards that are not a set are refused'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: a refused claim does NOT pass the turn'
);

-- (6) ada claims a real set — accepted, and the turn goes to bea.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format($$ select setgame.submit_set(%L::uuid, pg_temp.sg_live(%L)) $$,
         (select id from g), (select id from g)),
  'turns: the current player''s claim is accepted'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: an accepted claim advances the pointer to bea'
);

-- ── FREE-FOR-ALL GAME — the pointer stays null and nothing is gated ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gf on commit drop as
select * from setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from gf)),
  null::uuid,
  'free-for-all: create_game leaves the pointer null'
);

-- Either player may move at any time — bea goes first here precisely because
-- ada created the game.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format($$ select setgame.submit_set(%L::uuid, pg_temp.sg_live(%L)) $$,
         (select id from gf), (select id from gf)),
  'free-for-all: anyone may claim, ungated'
);

select * from finish();
rollback;
