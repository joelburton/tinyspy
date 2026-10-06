-- cs-unmet

-- ============================================================
-- Test: common._nudge_game_page — one `changed` Broadcast per move
-- ============================================================
--
-- The triggers on common.games send `changed` to `game:<id>` on the first
-- write of a transaction (the one that changes `updated_at`) and on a delete.
-- `realtime.send` inserts into realtime.messages, so a nudge is a row there.
--
-- A pgTAP file is ONE transaction, so `now()` never moves inside it, and a row
-- created here already holds this transaction's `updated_at`. Each case first
-- ages the row's `updated_at` with triggers off, which stands in for "written
-- by an earlier transaction".

begin;

set search_path = common, public, extensions;

select plan(6);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada and Bea', array['ada','bea']) as handle;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', 'ada11111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true);
select set_config(
  'test.game_id',
  common._create_game(
    (select handle from club),
    'connections_coop',
    'coop',
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    'test-title',
    '{"timer": {"kind": "none"}}'::jsonb,
    null
  )::text,
  true
);

-- The row as an earlier transaction left it: `updated_at` in the past, written
-- with triggers off so neither the stamp nor the nudge fires.
create function pg_temp.age_the_game() returns void
language plpgsql as $$
begin
  alter table common.games disable trigger games_stamp_updated_at;
  alter table common.games disable trigger games_nudge_game_page_on_update;
  update common.games set updated_at = now() - interval '1 hour'
   where id = current_setting('test.game_id')::uuid;
  alter table common.games enable trigger games_stamp_updated_at;
  alter table common.games enable trigger games_nudge_game_page_on_update;
end;
$$;

-- The nudges sent to this game's room so far.
create function pg_temp.nudges() returns int
language sql as $$
  select count(*)::int from realtime.messages
   where topic = 'game:' || current_setting('test.game_id')
     and event = 'changed';
$$;

create temp table seen on commit drop as select pg_temp.nudges() as n;

-- ============================================================
-- A move that writes the row twice nudges once
-- ============================================================

select pg_temp.age_the_game();
update common.games set title = 'first' where id = current_setting('test.game_id')::uuid;
update common.games set title = 'second' where id = current_setting('test.game_id')::uuid;

select is(
  pg_temp.nudges() - (select n from seen),
  1,
  'nudge: two writes in one transaction send one changed'
);

select is(
  (select private from realtime.messages
    where topic = 'game:' || current_setting('test.game_id') and event = 'changed'
    order by inserted_at desc limit 1),
  false,
  'nudge: sent on a public topic, which the page joins without a token check'
);

select is(
  (select extension from realtime.messages
    where topic = 'game:' || current_setting('test.game_id') and event = 'changed'
    order by inserted_at desc limit 1),
  'broadcast',
  'nudge: sent as a Broadcast'
);

-- ============================================================
-- The next transaction's first write nudges again
-- ============================================================

update seen set n = pg_temp.nudges();
select pg_temp.age_the_game();
update common.games set title = 'third' where id = current_setting('test.game_id')::uuid;

select is(
  pg_temp.nudges() - (select n from seen),
  1,
  'nudge: a later transaction''s first write sends another'
);

-- ============================================================
-- A write that leaves updated_at as it is sends nothing
-- ============================================================

update seen set n = pg_temp.nudges();
update common.games set title = 'fourth' where id = current_setting('test.game_id')::uuid;

select is(
  pg_temp.nudges() - (select n from seen),
  0,
  'nudge: a write after the transaction''s first sends nothing'
);

-- ============================================================
-- A delete nudges, so the page re-reads and finds no game
-- ============================================================

update seen set n = pg_temp.nudges();
delete from common.games where id = current_setting('test.game_id')::uuid;

select is(
  pg_temp.nudges() - (select n from seen),
  1,
  'nudge: a delete sends changed'
);

-- ============================================================
select * from finish();
rollback;
