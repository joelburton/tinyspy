-- cs-unmet

-- ============================================================
-- Test: record_hint — the tally and the log row, not the hint
-- ============================================================
-- The hint itself is computed on the client and never stored: the board is
-- face-up, so there is nothing to look up and no private column to mask. What
-- the server does is charge the asker and write the EVENT, so the event log can
-- show who asked for what.
--
-- Which means the tiles arrive FROM the client, and are checked — not against
-- cheating (a hint costs nothing, and the trust model answers that anyway) but
-- to keep a nonsense row out of a log people read.
--
-- Last: a hint asked of a game a friend just deleted is the shared race.

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(13);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Set hints', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;

reset role;
select is(
  (select sum(n_hints_used)::int from setgame.players where game_id = (select id from g)),
  0, 'nobody has asked yet');

-- ── One tile: taken as given, since a single tile cannot be wrong ────
-- Asserted as an ENVELOPE, not merely `lives_ok`: the frontend's accept branch
-- tests `data.result`, and nothing was holding that value to the contract —
-- "it didn't raise" is true of an answer with no payload at all.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  setgame.record_hint((select id from g), (pg_temp.sg_live((select id from g)))[1:1]),
  '{"type":"ok","outcome":null,"data":{"result":"recorded","n_hints_used":1}}'::jsonb,
  'a one-tile hint is recorded, and the answer names itself');
-- `"outcome":null` is written out on purpose: `envelope_is` is containment, so
-- an expected envelope that simply omits the key would pass whatever the server
-- put there. Asking for a hint shows itself, in the ring the client already
-- drew, so this envelope deliberately carries no word.

reset role;
select is(
  (select n_hints_used from setgame.players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1, 'the asker is charged');
select is(
  (select n_hints_used from setgame.players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  0, '…and only the asker — the tally is per player so the log can say WHO');
select is(
  (select kind from setgame.events where game_id = (select id from g) order by id desc limit 1),
  'hint', 'the ask lands in the log beside the claims');
-- A hint is part of the asker's turn rather than one of its own — which is why
-- record_hint is gated by _require_turn and yet never advances. Asking three
-- times is how a stuck player finishes their own turn, not a way to spend
-- someone else's.
select is(
  (select took_turn from setgame.events
    where game_id = (select id from g) order by id desc limit 1),
  false, 'a hint spends no turn');
-- Asserted as an IDENTITY, not against the number 12. A hint changes no tiles,
-- so the row's snapshot must BE the live board — which is both a stronger claim
-- and a stable one. Twelve was a lucky-deal assumption: create_game runs the
-- deal-three rule before anyone sees the table, so about one opening in
-- twenty-nine (the ~3.4% of shuffles whose first twelve hold no set) starts at
-- fifteen, and this failed on exactly those runs.
select is(
  (select board_after from setgame.events
    where game_id = (select id from g) order by id desc limit 1),
  (select board from setgame.games where game_id = (select id from g)),
  'a hint row carries the board too, so the history viewer can show it');

-- ── The checks on client-supplied tiles ──────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  setgame.record_hint((select id from g), array[]::smallint[]),
  '{"type":"not-ok","severity":"fault","dbcode":"PN282",
    "message":"BUG: hint that was not one to three tiles"}'::jsonb,
  'an empty hint is refused');

select pg_temp.envelope_is(
  setgame.record_hint(
    (select id from g),
    array[(select t from pg_temp.sg_every_tile() t
            where not (t = any(pg_temp.sg_board((select id from g)))) limit 1)]::smallint[]),
  '{"type":"not-ok","severity":"fault","dbcode":"PN283",
    "message":"BUG: hint naming a tile that is not on the board"}'::jsonb,
  'a tile that is not on the board is refused');

select pg_temp.envelope_is(
  setgame.record_hint((select id from g), pg_temp.sg_not_a_set((select id from g))),
  '{"type":"not-ok","severity":"fault","dbcode":"PN284",
    "message":"BUG: three-tile hint that is not a set"}'::jsonb,
  'three tiles that are not a set are refused');

select lives_ok(
  format($$ select setgame.record_hint(%L, pg_temp.sg_live(%L)) $$,
         (select id from g), (select id from g)),
  'a genuine three-tile set is recorded');

-- ── Compete: banned ─────────────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gr on commit drop as
select (setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

select pg_temp.envelope_is(
  setgame.record_hint((select id from gr), (pg_temp.sg_live((select id from gr)))[1:1]),
  '{"type":"not-ok","severity":"fault","dbcode":"PN280",
    "message":"BUG: hint request in a race"}'::jsonb,
  'a hint in a race would be a win button, so there are none');

-- ── A hint asked of a game a friend just deleted ──
-- The delete takes the game's rows and every membership together, so this is
-- the shared race rather than a fault, or "You are not in this game"
-- (docs/envelopes.md → a missing game row is PN485).
reset role;
delete from common.games where id = (select id from g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  setgame.record_hint((select id from g), array[1111]::smallint[]),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'record_hint into a deleted game is the shared race, not a fault'
);

select * from finish();
rollback;
