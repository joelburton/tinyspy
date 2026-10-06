-- cs-unmet

-- ============================================================
-- Test: setgame.submit_set (coop) — the move, its rejections, the refill
-- ============================================================
-- The opening board is legal by construction, a real set is accepted, and the
-- three ways a claim can be refused each raise their own error key. The
-- refill assertions are the interesting half: a claim replaces tiles IN PLACE,
-- so every tile a player was already looking at keeps its slot. Last, a claim
-- into a game a friend just deleted is the shared race.

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(21);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Set coop', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;

-- ── The opening board ───────────────────────────────────────────────
-- The INVARIANT, not the number twelve. create_game runs the deal rule before
-- anyone sees the table, so a shuffle whose first twelve hold no set opens at
-- FIFTEEN — measured at 2.9% of 3000 shuffles through the real `_deal_to_playable`.
-- Asserting 12 therefore failed about one run in thirty-four, which is exactly
-- often enough to be dismissed as "the suite is flaky" and never chased.
select ok(
  cardinality(pg_temp.sg_board((select id from g))) >= 12
    and cardinality(pg_temp.sg_board((select id from g))) % 3 = 0,
  'the opening board is at least the floor, dealt in threes');
select isnt(
  pg_temp.sg_live((select id from g)), null,
  'the opening board always holds a set — create_game runs the deal rule first');
-- The accounting identity, not a lucky number: every tile is in the deck, on
-- the table, or claimed. Asserting `69` would assume the opening deal stopped
-- at twelve, which it does not when the first twelve happen to hold no set —
-- about 3% of games, i.e. a test that fails once a month for a good reason.
select is(
  (pg_temp.sg_tiles_in_deck((select id from g)) + cardinality(pg_temp.sg_board((select id from g)))),
  81, 'every tile is either in the deck or on the table');
-- The title is a HANDLE, not a readout: the game's own short id, so it can be
-- quoted to another player or searched for. It never changes.
select is(
  (select title from common.games where id = (select id from g)),
  '#' || upper(left((select id from g)::text, 6)),
  'the title is the game''s own short id');

-- ── Rejections ──────────────────────────────────────────────────────
select pg_temp.envelope_is(
  setgame.submit_set((select id from g), pg_temp.sg_not_a_set((select id from g))),
  '{"type":"not-ok","severity":"fault","dbcode":"PN278",
    "message":"BUG: bad set"}'::jsonb,
  'three tiles that are not a set are refused');

select pg_temp.envelope_is(
  setgame.submit_set((select id from g), array[1111,1112]::smallint[]),
  '{"type":"not-ok","severity":"fault","dbcode":"PN276",
    "message":"BUG: claim that was not three different tiles"}'::jsonb,
  'a claim of two tiles is refused');

select pg_temp.envelope_is(
  setgame.submit_set(
    (select id from g),
    array[(pg_temp.sg_live((select id from g)))[1],
          (pg_temp.sg_live((select id from g)))[1],
          (pg_temp.sg_live((select id from g)))[2]]::smallint[]),
  '{"type":"not-ok","severity":"fault","dbcode":"PN276",
    "message":"BUG: claim that was not three different tiles"}'::jsonb,
  'the same tile three times is refused, not read as a set');

-- A tile that is nowhere on the board — the shape of the contention refusal.
select pg_temp.envelope_is(
  setgame.submit_set(
    (select id from g),
    array[(pg_temp.sg_live((select id from g)))[1],
          (pg_temp.sg_live((select id from g)))[2],
          (select t from pg_temp.sg_every_tile() t
            where not (t = any(pg_temp.sg_board((select id from g)))) limit 1)]::smallint[]),
  '{"type":"not-ok","severity":"race","dbcode":"PN277",
    "message":"Someone got there first"}'::jsonb,
  'a tile that has left the board is refused');

-- ── A real claim ────────────────────────────────────────────────────
create temp table before_claim on commit drop as
select pg_temp.sg_board((select id from g)) as board,
       pg_temp.sg_live((select id from g)) as taken;

-- The answer names its case and carries no outcome: what a claim reads as is
-- the frontend's (src/setgame/lib/answer.ts).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table claimed on commit drop as
select setgame.submit_set((select id from g), (select taken from before_claim)) as res;
select is((select res->'data'->>'result' from claimed), 'claimed', 'a genuine set is accepted');
select is((select res->>'outcome' from claimed), null, 'a claim answers no outcome');

reset role;
select is(
  (select tiles from setgame.events where kind = 'claim' and game_id = (select id from g)),
  (select taken from before_claim), 'the claim is logged with the tiles taken');
select is(
  (select n_sets_found from setgame.players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1, 'the claimer''s count goes up');
select is(
  (select n_sets_found from setgame.players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  0, 'the other player''s count does not');
select is(
  (select title from common.games where id = (select id from g)),
  '#' || upper(left((select id from g)::text, 6)),
  '…and a claim does not rewrite it — a handle you cannot rely on is no handle');

-- ── The refill, which is where the in-place rule shows ───────────────
-- Same invariant after a claim, and deal-dependent for the same reason in the
-- other direction: if the twelve left behind hold no set, the rule deals three
-- more and the board is fifteen.
select ok(
  cardinality(pg_temp.sg_board((select id from g))) >= 12
    and cardinality(pg_temp.sg_board((select id from g))) % 3 = 0,
  'the board is topped back up to at least the floor');
select is(
  (pg_temp.sg_tiles_in_deck((select id from g)) + cardinality(pg_temp.sg_board((select id from g))))
    + 3 * (select count(*)::int from setgame.events
            where kind = 'claim' and game_id = (select id from g)),
  81, 'the identity still holds after a claim: deck + table + claimed = 81');
select ok(
  not (pg_temp.sg_board((select id from g)) && (select taken from before_claim)),
  'none of the claimed tiles is still on the board');

-- THE point of the in-place refill: every tile that was not claimed is still
-- in the slot it was in. If the board closed up instead, all nine would have
-- shifted and this would fail.
select is(
  (select count(*)::int
     from before_claim bc,
          generate_series(1, 12) i,
          lateral (select pg_temp.sg_board((select id from g)) as tiles) now
    where bc.board[i] = any(bc.taken)      -- this slot was refilled
       or bc.board[i] = now.tiles[i]),     -- …or it did not move
  12, 'every unclaimed tile kept its slot — a claim never shifts the board');

select is(
  (select count(*)::int from setgame.events where kind = 'claim' and game_id = (select id from g)),
  1, 'exactly one claim is on the log');

-- A claim is the move, so it spends one of the claimer's goes. (The hint's
-- other half of this rule is in hint_test.sql, where the hint row is.)
select is(
  (select took_turn from setgame.events
    where game_id = (select id from g) order by id desc limit 1),
  true, 'a claim spends a turn');

-- ── A claim into a game a friend just deleted ──
-- The delete takes the game's rows and every membership together, so this is
-- the shared race rather than a fault, or "You are not in this game"
-- (docs/envelopes.md → a missing game row is PN485).
reset role;
delete from common.games where id = (select id from g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  setgame.submit_set((select id from g), array[1111,1112,1113]::smallint[]),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'submit_set into a deleted game is the shared race, not a fault'
);

select * from finish();
rollback;
