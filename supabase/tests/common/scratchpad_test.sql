-- cs-unmet

begin;
set search_path = common, public, extensions;
select plan(13);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

-- A club (ada, bea, cade) + a game with ada & bea as players. The game row
-- is inserted directly (the scratchpad is a common feature; no game schema
-- needed) — crosswords_coop is just a registered gametype to satisfy the FK.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.create_club('SP Club', array['ada', 'bea', 'cade']) as club_handle \gset
reset role;

insert into common.games (club_handle, gametype, created_by, title, setup)
values (:'club_handle', 'crosswords_coop',
        'ada11111-1111-1111-1111-111111111111', 'Scratchpad game', '{}'::jsonb)
returning id as game_id \gset
insert into common.game_players (game_id, user_id) values
  (:'game_id', 'ada11111-1111-1111-1111-111111111111'),
  (:'game_id', 'bea22222-2222-2222-2222-222222222222');

-- ── Shared pad (owner null): any player writes; version bumps ─────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- The version rides in `data` because the CALLER acts on it: it keeps the
-- highest one seen, so an out-of-order debounced flush cannot roll the pad back.
select pg_temp.envelope_is(
  common.set_scratchpad(:'game_id'::uuid, null::uuid, 'ada was here'),
  '{"type": "ok", "data": {"result": "saved", "version": 0}}'::jsonb,
  'first shared-pad write answers ok/saved at version 0');

select pg_temp.envelope_is(
  common.set_scratchpad(:'game_id'::uuid, null::uuid, 'edited'),
  '{"type": "ok", "data": {"result": "saved", "version": 1}}'::jsonb,
  'second shared-pad write bumps the version to 1');
reset role;

select is(
  (select body from common.game_scratchpads where game_id = :'game_id' and owner_id is null),
  'edited', 'shared pad body persists');

-- bea (another player) can also write the shared pad.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  common.set_scratchpad(:'game_id'::uuid, null::uuid, 'bea too'),
  '{"type": "ok", "data": {"result": "saved"}}'::jsonb,
  'any player can write the shared pad');
reset role;

-- ── Private pads (owner = self) ──────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  common.set_scratchpad(:'game_id'::uuid, 'ada11111-1111-1111-1111-111111111111'::uuid, 'ada private'),
  '{"type": "ok", "data": {"result": "saved"}}'::jsonb,
  'a player can write their own private pad');

-- ada cannot write bea's private pad.
-- A BUG:, not a refusal — the FE sends its own id or null and offers no control
-- that produces a third value, so reaching this means we let it through.
select pg_temp.envelope_is(
  common.set_scratchpad(:'game_id'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid, 'sneaky'),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN304",
    "message": "BUG: a scratchpad write named someone else''s pad"}'::jsonb,
  'cannot write another player''s private pad');
reset role;

-- bea writes her own private pad (for the RLS test below).
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select common.set_scratchpad(:'game_id'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid, 'bea private');
reset role;

-- Non-player cannot write.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  common.set_scratchpad(:'game_id'::uuid, null::uuid, 'nope'),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN253",
    "message": "You are not in this game"}'::jsonb,
  'a non-player cannot write the scratchpad');
reset role;

-- ── RLS: shared + own private visible; other's private hidden ────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from common.game_scratchpads
     where game_id = :'game_id' and owner_id is null),
  1, 'ada sees the shared pad');
select is(
  (select count(*)::int from common.game_scratchpads
     where game_id = :'game_id' and owner_id = 'ada11111-1111-1111-1111-111111111111'),
  1, 'ada sees her own private pad');
select is(
  (select count(*)::int from common.game_scratchpads
     where game_id = :'game_id' and owner_id = 'bea22222-2222-2222-2222-222222222222'),
  0, 'ada does NOT see bea''s private pad (RLS)');
reset role;

-- Non-player sees nothing at all.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from common.game_scratchpads where game_id = :'game_id'),
  0, 'a non-player sees no scratchpads');
reset role;

-- Over-length body is rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- Also a BUG:: the textarea carries maxLength={10000}, so over the cap means
-- the cap was bypassed rather than a player typing too much.
select pg_temp.envelope_is(
  common.set_scratchpad(:'game_id'::uuid, null::uuid, repeat('x', 10001)),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN306",
    "message": "BUG: a scratchpad write exceeded the 10000-character cap"}'::jsonb,
  'a body over 10000 chars is rejected');
reset role;

-- ── The RACE: the game ended before the debounced flush landed ───────
-- The one loss this system can actually inflict on a player, and the only
-- not-ok here that is nobody's fault: writes are debounced, so a note typed in
-- the last window arrives after the game is over. It reads as a `race`, which
-- is what stops it wearing a fault's red.
update common.games set play_state = 'won' where id = :'game_id';
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  common.set_scratchpad(:'game_id'::uuid, null::uuid, 'typed as it ended'),
  '{"type": "not-ok", "severity": "race", "dbcode": "PN305",
    "message": "The game ended before that note saved."}'::jsonb,
  'a flush landing after the game ended is a race, not a fault');
reset role;

select * from finish();
rollback;
