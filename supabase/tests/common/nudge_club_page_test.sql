-- cs-unmet

-- ============================================================
-- Test: common._nudge_club_page — one `changed` Broadcast per game per move
-- ============================================================
--
-- The triggers on common.games send `changed` to `club-games:<handle>` on an
-- insert, on the first write of a transaction (the one that changes
-- `updated_at`) and on a delete. `realtime.send` inserts into
-- realtime.messages, so a nudge is a row there.
--
-- A pgTAP file is ONE transaction, so `now()` never moves inside it, and a row
-- created here already holds this transaction's `updated_at`. A case that
-- needs "written by an earlier transaction" first ages the row with triggers
-- off, as nudge_game_page_test does.

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

-- The nudges sent to this club's room so far.
create function pg_temp.nudges() returns int
language sql as $$
  select count(*)::int from realtime.messages
   where topic = 'club-games:' || (select handle from club)
     and event = 'changed';
$$;

create function pg_temp.create_game() returns uuid
language sql as $$
  select common._create_game(
    (select handle from club),
    'connections_coop',
    'coop',
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    'test-title',
    '{"timer": {"kind": "none"}}'::jsonb,
    null
  );
$$;

-- Every game of the club as an earlier transaction left it: `updated_at` in
-- the past, written with triggers off so neither the stamp nor a nudge fires.
create function pg_temp.age_the_games() returns void
language plpgsql as $$
begin
  alter table common.games disable trigger games_stamp_updated_at;
  alter table common.games disable trigger games_nudge_game_page_on_update;
  alter table common.games disable trigger games_nudge_club_page_on_update;
  update common.games set updated_at = now() - interval '1 hour'
   where club_handle = (select handle from club);
  alter table common.games enable trigger games_stamp_updated_at;
  alter table common.games enable trigger games_nudge_game_page_on_update;
  alter table common.games enable trigger games_nudge_club_page_on_update;
end;
$$;

create temp table seen on commit drop as select pg_temp.nudges() as n;

-- ============================================================
-- A new game nudges once: the insert, and not the builder's update after it
-- ============================================================

select set_config('test.game_id', pg_temp.create_game()::text, true);

select is(
  pg_temp.nudges() - (select n from seen),
  1,
  'club nudge: creating a game sends one changed'
);

select is(
  (select private from realtime.messages
    where topic = 'club-games:' || (select handle from club) and event = 'changed'
    order by inserted_at desc limit 1),
  false,
  'club nudge: sent on a public topic, which the page joins without a token check'
);

-- ============================================================
-- A move that writes the row twice nudges once
-- ============================================================

update seen set n = pg_temp.nudges();
select pg_temp.age_the_games();
update common.games set title = 'first' where id = current_setting('test.game_id')::uuid;
update common.games set title = 'second' where id = current_setting('test.game_id')::uuid;

select is(
  pg_temp.nudges() - (select n from seen),
  1,
  'club nudge: two writes in one transaction send one changed'
);

-- ============================================================
-- A second game nudges for itself and for the game it vacates
-- ============================================================

update seen set n = pg_temp.nudges();
select pg_temp.age_the_games();
select set_config('test.game_id', pg_temp.create_game()::text, true);

select is(
  pg_temp.nudges() - (select n from seen),
  2,
  'club nudge: a new game that vacates the current one sends two'
);

-- ============================================================
-- A write that leaves updated_at as it is sends nothing
-- ============================================================

update seen set n = pg_temp.nudges();
update common.games set title = 'third' where id = current_setting('test.game_id')::uuid;

select is(
  pg_temp.nudges() - (select n from seen),
  0,
  'club nudge: a write after the transaction''s first sends nothing'
);

-- ============================================================
-- A delete nudges, so the list re-reads without it
-- ============================================================

update seen set n = pg_temp.nudges();
delete from common.games where id = current_setting('test.game_id')::uuid;

select is(
  pg_temp.nudges() - (select n from seen),
  1,
  'club nudge: a delete sends changed'
);

-- ============================================================
select * from finish();
rollback;
