-- ============================================================
-- Test: record_hint — the tally and the log row, not the hint
-- ============================================================
-- The hint itself is computed on the client and never stored: the board is
-- face-up, so there is nothing to look up and no private column to mask. What
-- the server does is charge the asker and write the EVENT, so the turn log can
-- show who asked for what.
--
-- Which means the cards arrive FROM the client, and are checked — not against
-- cheating (a hint costs nothing, and the trust model answers that anyway) but
-- to keep a nonsense row out of a log people read.

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(11);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Set hints', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

reset role;
select is(
  (select sum(hints_used)::int from setgame.players where game_id = (select id from g)),
  0, 'nobody has asked yet');

-- ── One card: taken as given, since a single card cannot be wrong ────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format($$ select setgame.record_hint(%L, (pg_temp.sg_live(%L))[1:1]) $$,
         (select id from g), (select id from g)),
  'a one-card hint is recorded');

reset role;
select is(
  (select hints_used from setgame.players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1, 'the asker is charged');
select is(
  (select hints_used from setgame.players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  0, '…and only the asker — the tally is per player so the log can say WHO');
select is(
  (select kind from setgame.events where game_id = (select id from g) order by id desc limit 1),
  'hint', 'the ask lands in the log beside the claims');
-- Asserted as an IDENTITY, not against the number 12. A hint changes no cards,
-- so the row's snapshot must BE the live board — which is both a stronger claim
-- and a stable one. Twelve was a lucky-deal assumption: create_game runs the
-- deal-three rule before anyone sees the table, so about one opening in
-- twenty-nine (the ~3.4% of shuffles whose first twelve hold no set) starts at
-- fifteen, and this failed on exactly those runs.
select is(
  (select board_after from setgame.events
    where game_id = (select id from g) order by id desc limit 1),
  (select board from setgame.games where id = (select id from g)),
  'a hint row carries the board too, so the history viewer can show it');

-- ── The checks on client-supplied cards ──────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select setgame.record_hint(%L, array[]::smallint[]) $$, (select id from g)),
  'P0001', 'bad-hint|', 'an empty hint is refused');

select throws_ok(
  format($$ select setgame.record_hint(%L,
            array[(select c from generate_series(0,80) c
                    where not (c = any(pg_temp.sg_board(%L))) limit 1)]::smallint[]) $$,
         (select id from g), (select id from g)),
  'P0001', 'bad-hint|', 'a card that is not on the board is refused');

select throws_ok(
  format($$ select setgame.record_hint(%L, pg_temp.sg_not_a_set(%L)) $$,
         (select id from g), (select id from g)),
  'P0001', 'bad-hint|', 'three cards that are not a set are refused');

select lives_ok(
  format($$ select setgame.record_hint(%L, pg_temp.sg_live(%L)) $$,
         (select id from g), (select id from g)),
  'a genuine three-card set is recorded');

-- ── Compete: banned ─────────────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gr on commit drop as
select * from setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete');

select throws_ok(
  format($$ select setgame.record_hint(%L, (pg_temp.sg_live(%L))[1:1]) $$,
         (select id from gr), (select id from gr)),
  'P0001', 'hint-in-compete|',
  'a hint in a race would be a win button, so there are none');

select * from finish();
rollback;
