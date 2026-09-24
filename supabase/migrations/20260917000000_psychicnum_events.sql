-- cs-blessed-psychicnum

-- ============================================================
-- psychicnum.guesses → psychicnum.events
-- ============================================================
-- The log table takes the shape every game's log is moving to: named
-- `events`, keyed by a `bigint identity` whose order IS the order of play,
-- with `kind`, `took_turn` and `created_at` beside the game's own payload.
-- supabase/tests/common/events_skeleton_test.sql is the assertion.
--
-- Five changes in one migration, because they are one change to one table:
--
--   the NAME      guesses → events, with the constraints and index that were
--                 named after it, and the old policy dropped. A table called
--                 `events` whose key is `guesses_pkey` reads wrong forever —
--                 and the repeatable half's `drop policy if exists
--                 events_select` would leave the old `guesses_select` alive
--                 underneath the new one, quietly widening what is visible.
--   the KEY       uuid → bigint identity. Nothing references a log row's id
--                 (the log is a leaf), so replacing the key costs nothing
--                 but the renumbering below.
--   the KIND      `reveal` → `spoiler`. `reveal` means showing the whole
--                 solution when a game is over; handing over one secret
--                 mid-game is a spoiler, which is what the frontend has
--                 called it since the two were told apart.
--   `took_turn`   did this event use up one of the actor's goes? Here that
--                 is an accepted guess and nothing else: a hint and a
--                 spoiler cost budget in neither mode.
--   `created_at`  `guessed_at` read well when every row was a guess.
--
-- RENAMED, NOT RECREATED. `alter table … rename` keeps every row, every
-- index, and — the load-bearing part — the table's membership in the
-- `supabase_realtime` publication, which Postgres tracks by OID. A
-- recreate-and-copy would drop out of the publication and the game would go
-- quiet with nothing failing (docs/supabase.md → The publication invariant).

-- What the table held before any of this, to check the work against at the
-- bottom. A temp table rather than variables: the checks are far from here.
create temporary table _psychicnum_before on commit drop as
  select count(*)                                  as rows,
         count(*) filter (where kind = 'guess')    as guesses,
         count(*) filter (where kind = 'hint')     as hints,
         count(*) filter (where kind = 'reveal')   as spoilers
    from psychicnum.guesses;

-- ── the name ────────────────────────────────────────────────
alter table psychicnum.guesses rename to events;
alter table psychicnum.events rename constraint guesses_game_id_fkey to events_game_id_fkey;
alter table psychicnum.events rename constraint guesses_user_id_fkey to events_user_id_fkey;
-- DROPPED, not renamed, and this is the rule for every migration: a migration
-- may only touch what migrations own. A policy belongs to the repeatable half
-- (supabase/sql/psychicnum.sql), which is not applied when the schema is built
-- from migrations alone — a local `db reset`, or the shadow database `db-drift`
-- builds — so `alter policy … rename` would fail there while succeeding on a
-- database that has been deployed to. The repeatable half creates
-- `events_select` right after; what it cannot do is remove a policy under the
-- old name, which is why this line is here at all.
drop policy if exists guesses_select on psychicnum.events;

-- ── created_at ──────────────────────────────────────────────
alter table psychicnum.events rename column guessed_at to created_at;

-- ── the kind: spoiler, and no default ───────────────────────
-- A kind is mandatory at every insert, so it must not be acquirable by
-- omission: a defaulted `kind` is how a row ends up saying something nobody
-- wrote.
--
-- The old constraint comes off FIRST — it does not know the word `spoiler`,
-- so the update below cannot run underneath it — and the new one goes on
-- LAST, where adding it validates every existing row and so doubles as the
-- check that nothing was left saying `reveal`.
alter table psychicnum.events drop constraint guesses_kind_check;
update psychicnum.events set kind = 'spoiler' where kind = 'reveal';
alter table psychicnum.events alter column kind drop default;
alter table psychicnum.events add constraint events_kind_check
  check (kind in ('guess', 'hint', 'spoiler'));

-- ── the key: uuid → bigint identity ─────────────────────────
-- Numbered EXPLICITLY, in the order the rows were written. An identity
-- column added to an existing table numbers rows in SCAN order, which for
-- an insert-only table usually matches — and "usually" is not something a
-- log's whole meaning should rest on.
--
-- `(created_at, id)` is the order: the timestamp first, the old uuid only
-- to break a tie between two rows written in the same instant. That
-- tie-break is arbitrary — a uuid carries no order — but it is stable, and
-- two psychicnum rows in one instant would have to come from two RPCs
-- landing on the same microsecond.
alter table psychicnum.events add column new_id bigint;

update psychicnum.events t
   set new_id = r.rn
  from (select id, row_number() over (order by created_at, id) as rn
          from psychicnum.events) r
 where r.id = t.id;

do $$
declare n bigint; distinct_n bigint; out_of_order bigint;
begin
  select count(*), count(distinct new_id) into n, distinct_n from psychicnum.events;
  if distinct_n <> n or exists (select 1 from psychicnum.events where new_id is null) then
    raise exception 'psychicnum.events: the new key is not one dense number per row (% rows, % distinct)', n, distinct_n;
  end if;
  select count(*) into out_of_order
    from (select new_id, row_number() over (order by created_at, id) as rn
            from psychicnum.events) x
   where x.new_id <> x.rn;
  if out_of_order > 0 then
    raise exception 'psychicnum.events: % row(s) numbered out of the order they were written', out_of_order;
  end if;
end $$;

alter table psychicnum.events alter column new_id set not null;
alter table psychicnum.events drop constraint guesses_pkey;
alter table psychicnum.events drop column id;
alter table psychicnum.events rename column new_id to id;
alter table psychicnum.events alter column id add generated always as identity;
alter table psychicnum.events add primary key (id);
-- `is_called = false`, so the next row takes max+1 — and 1 on an empty
-- table, which is what a local `db reset` hands this migration.
select setval(pg_get_serial_sequence('psychicnum.events', 'id'),
              coalesce((select max(id) from psychicnum.events), 0) + 1,
              false);

-- ── took_turn ───────────────────────────────────────────────
-- Added nullable and filled deliberately, rather than `not null default
-- false`: a column that cannot be null cannot show which rows the backfill
-- missed, and "false" is a real answer here, not an absence.
--
-- An accepted guess is a turn in BOTH modes. Nothing about this is
-- conditional on a rotation running — free-for-all and compete games spend
-- a go just as much as a turn-by-turn one does; the rotation is only what
-- some games then do about it.
alter table psychicnum.events add column took_turn boolean;
update psychicnum.events set took_turn = (kind = 'guess');
alter table psychicnum.events alter column took_turn set not null;
alter table psychicnum.events alter column took_turn set default false;

-- ── the read index ──────────────────────────────────────────
-- Every read of this log is "this game's rows, in order". The old
-- (game_id) index is a prefix of the new one, so it can only cost writes.
drop index psychicnum.psychicnum_guesses_game_id_idx;
create index psychicnum_events_game_id_id_idx on psychicnum.events (game_id, id);

-- ── did it all land? ────────────────────────────────────────
do $$
declare b record; a record;
begin
  select * into b from _psychicnum_before;
  select count(*)                                as rows,
         count(*) filter (where kind = 'guess')   as guesses,
         count(*) filter (where kind = 'hint')    as hints,
         count(*) filter (where kind = 'spoiler') as spoilers
    into a from psychicnum.events;

  if a.rows <> b.rows then
    raise exception 'psychicnum.events: % rows before, % after', b.rows, a.rows;
  end if;
  if a.guesses <> b.guesses or a.hints <> b.hints or a.spoilers <> b.spoilers then
    raise exception 'psychicnum.events: kinds changed (% / % / % → % / % / %)',
      b.guesses, b.hints, b.spoilers, a.guesses, a.hints, a.spoilers;
  end if;
  if exists (select 1 from psychicnum.events where took_turn <> (kind = 'guess')) then
    raise exception 'psychicnum.events: took_turn is not exactly the accepted guesses';
  end if;
end $$;
